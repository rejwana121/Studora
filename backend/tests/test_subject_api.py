import uuid

import pytest

from .conftest import auth_headers, make_token


def _create(client, headers=None, **overrides):
    headers = headers or auth_headers()
    payload = {"name": "Physics", "color_token": "teal"}
    payload.update(overrides)
    return client.post("/api/v1/subjects", json=payload, headers=headers)


# --- authentication ---


def test_get_subjects_requires_auth(client):
    response = client.get("/api/v1/subjects")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_post_subject_requires_auth(client):
    response = client.post("/api/v1/subjects", json={"name": "Physics", "color_token": "teal"})
    assert response.status_code == 401


def test_patch_subject_requires_auth(client):
    response = client.patch(f"/api/v1/subjects/{uuid.uuid4()}", json={"name": "New"})
    assert response.status_code == 401


# --- create ---


def test_create_subject_success(client):
    response = _create(client)
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Physics"
    assert body["color_token"] == "teal"
    assert body["archived_at"] is None
    assert "id" in body
    assert "created_at" in body
    assert "updated_at" in body


def test_create_rejects_blank_name(client):
    response = _create(client, name="   ")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_create_rejects_invalid_color_token(client):
    response = _create(client, color_token="blue")
    assert response.status_code == 422


def test_create_rejects_extra_field(client):
    response = _create(client, bogus="x")
    assert response.status_code == 422


# --- list ---


def test_list_excludes_archived_by_default(client):
    headers = auth_headers()
    active_id = _create(client, headers, name="Active").json()["id"]
    archived_id = _create(client, headers, name="Archived").json()["id"]
    client.patch(f"/api/v1/subjects/{archived_id}", json={"archived": True}, headers=headers)

    response = client.get("/api/v1/subjects", headers=headers)
    assert response.status_code == 200
    ids = {s["id"] for s in response.json()}
    assert active_id in ids
    assert archived_id not in ids


def test_list_include_archived_true_includes_all(client):
    headers = auth_headers()
    active_id = _create(client, headers, name="Active").json()["id"]
    archived_id = _create(client, headers, name="Archived").json()["id"]
    client.patch(f"/api/v1/subjects/{archived_id}", json={"archived": True}, headers=headers)

    response = client.get("/api/v1/subjects", params={"include_archived": True}, headers=headers)
    assert response.status_code == 200
    ids = {s["id"] for s in response.json()}
    assert active_id in ids
    assert archived_id in ids


def test_list_pagination_limit_and_offset(client):
    headers = auth_headers()
    for i in range(5):
        _create(client, headers, name=f"Subject {i}")

    # Canonical order for this data/query, fetched unpaginated — ties in
    # created_at (sub-millisecond creates) break on id, so this is the
    # ground truth to compare pages against rather than assumed insertion
    # order.
    full = client.get(
        "/api/v1/subjects", params={"limit": 100, "offset": 0}, headers=headers
    ).json()
    full_ids = [s["id"] for s in full]
    assert len(full_ids) == 5

    first_page = client.get(
        "/api/v1/subjects", params={"limit": 2, "offset": 0}, headers=headers
    ).json()
    second_page = client.get(
        "/api/v1/subjects", params={"limit": 2, "offset": 2}, headers=headers
    ).json()

    assert [s["id"] for s in first_page] == full_ids[0:2]
    assert [s["id"] for s in second_page] == full_ids[2:4]


def test_list_only_returns_own_subjects(client):
    user_a, user_b = uuid.uuid4(), uuid.uuid4()
    headers_a = {"Authorization": f"Bearer {make_token(user_a, 'alice@example.com')}"}
    headers_b = {"Authorization": f"Bearer {make_token(user_b, 'bob@example.com')}"}

    _create(client, headers_a, name="Alice's Subject")
    _create(client, headers_b, name="Bob's Subject")

    response_a = client.get("/api/v1/subjects", headers=headers_a)
    names_a = {s["name"] for s in response_a.json()}
    assert names_a == {"Alice's Subject"}

    response_b = client.get("/api/v1/subjects", headers=headers_b)
    names_b = {s["name"] for s in response_b.json()}
    assert names_b == {"Bob's Subject"}


# --- patch: basic edits ---


def test_patch_updates_name_and_color_token(client):
    headers = auth_headers()
    subject_id = _create(client, headers).json()["id"]

    response = client.patch(
        f"/api/v1/subjects/{subject_id}",
        json={"name": "Chemistry", "color_token": "coral"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Chemistry"
    assert body["color_token"] == "coral"


def test_patch_rejects_blank_name(client):
    headers = auth_headers()
    subject_id = _create(client, headers).json()["id"]
    response = client.patch(
        f"/api/v1/subjects/{subject_id}", json={"name": "   "}, headers=headers
    )
    assert response.status_code == 422


def test_patch_rejects_invalid_color_token(client):
    headers = auth_headers()
    subject_id = _create(client, headers).json()["id"]
    response = client.patch(
        f"/api/v1/subjects/{subject_id}", json={"color_token": "blue"}, headers=headers
    )
    assert response.status_code == 422


def test_patch_nonexistent_id_returns_404(client):
    response = client.patch(
        f"/api/v1/subjects/{uuid.uuid4()}", json={"name": "New"}, headers=auth_headers()
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_patch_other_users_subject_returns_404(client):
    owner_headers = auth_headers(email="owner@example.com")
    other_headers = {
        "Authorization": f"Bearer {make_token(uuid.uuid4(), 'intruder@example.com')}"
    }
    subject_id = _create(client, owner_headers).json()["id"]

    response = client.patch(
        f"/api/v1/subjects/{subject_id}", json={"name": "Hijacked"}, headers=other_headers
    )
    assert response.status_code == 404


# --- patch: empty body / explicit null rejection ---


def test_patch_rejects_empty_body(client):
    headers = auth_headers()
    subject_id = _create(client, headers).json()["id"]
    response = client.patch(f"/api/v1/subjects/{subject_id}", json={}, headers=headers)
    assert response.status_code == 422


@pytest.mark.parametrize("field", ["name", "color_token", "archived"])
def test_patch_rejects_explicit_null(client, field):
    headers = auth_headers()
    subject_id = _create(client, headers).json()["id"]
    response = client.patch(
        f"/api/v1/subjects/{subject_id}", json={field: None}, headers=headers
    )
    assert response.status_code == 422


# --- patch: archive / unarchive, including idempotence ---


def test_patch_archives_sets_archived_at(client):
    headers = auth_headers()
    subject_id = _create(client, headers).json()["id"]
    response = client.patch(
        f"/api/v1/subjects/{subject_id}", json={"archived": True}, headers=headers
    )
    assert response.status_code == 200
    assert response.json()["archived_at"] is not None


def test_patch_unarchives_clears_archived_at(client):
    headers = auth_headers()
    subject_id = _create(client, headers).json()["id"]
    client.patch(f"/api/v1/subjects/{subject_id}", json={"archived": True}, headers=headers)

    response = client.patch(
        f"/api/v1/subjects/{subject_id}", json={"archived": False}, headers=headers
    )
    assert response.status_code == 200
    assert response.json()["archived_at"] is None


def test_patch_archive_is_idempotent_preserves_timestamp(client):
    headers = auth_headers()
    subject_id = _create(client, headers).json()["id"]

    first = client.patch(
        f"/api/v1/subjects/{subject_id}", json={"archived": True}, headers=headers
    )
    assert first.status_code == 200
    first_archived_at = first.json()["archived_at"]
    assert first_archived_at is not None

    second = client.patch(
        f"/api/v1/subjects/{subject_id}", json={"archived": True}, headers=headers
    )
    assert second.status_code == 200
    assert second.json()["archived_at"] == first_archived_at


def test_patch_unarchive_is_idempotent_remains_null(client):
    headers = auth_headers()
    subject_id = _create(client, headers).json()["id"]
    client.patch(f"/api/v1/subjects/{subject_id}", json={"archived": True}, headers=headers)

    first = client.patch(
        f"/api/v1/subjects/{subject_id}", json={"archived": False}, headers=headers
    )
    assert first.status_code == 200
    assert first.json()["archived_at"] is None

    second = client.patch(
        f"/api/v1/subjects/{subject_id}", json={"archived": False}, headers=headers
    )
    assert second.status_code == 200
    assert second.json()["archived_at"] is None
