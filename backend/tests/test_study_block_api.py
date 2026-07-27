import uuid
from datetime import UTC, datetime, timedelta

from sqlmodel import Session

from app.models.study_block import StudyBlock

from .conftest import auth_headers, make_token

DEFAULT_START = datetime(2026, 8, 1, 9, 0, tzinfo=UTC)
DEFAULT_END = datetime(2026, 8, 1, 10, 0, tzinfo=UTC)


def _assert_aware_utc_instant(iso_str: str, expected: datetime) -> None:
    """Proves the response value is genuinely timezone-aware (carries an
    explicit UTC offset in the ISO string, even over the SQLite test
    path where the ORM round-trip itself comes back naive) AND represents
    the correct instant — not merely "close enough" if naive. A mobile
    client could misinterpret a naive datetime as local time, so an
    offset-less string here is a real defect, not just a string-format
    nuisance."""
    parsed = datetime.fromisoformat(iso_str)
    assert parsed.tzinfo is not None, f"{iso_str!r} is not timezone-aware"
    assert parsed.utcoffset() is not None
    assert parsed.astimezone(UTC) == expected


def _create_task(client, headers=None, **overrides):
    headers = headers or auth_headers()
    payload = {
        "title": "Read Chapter 3",
        "type": "Assignment",
        "deadline": DEFAULT_END.isoformat(),
        "priority": "Medium",
    }
    payload.update(overrides)
    return client.post("/api/v1/tasks", json=payload, headers=headers).json()["id"]


def _create_block(client, headers=None, **overrides):
    headers = headers or auth_headers()
    payload = {"starts_at": DEFAULT_START.isoformat(), "ends_at": DEFAULT_END.isoformat()}
    payload.update(overrides)
    return client.post("/api/v1/study-blocks", json=payload, headers=headers)


def _intruder_headers():
    return {"Authorization": f"Bearer {make_token(uuid.uuid4(), 'intruder@example.com')}"}


# --- authentication ---


def test_create_study_block_requires_auth(client):
    response = client.post(
        "/api/v1/study-blocks",
        json={"starts_at": DEFAULT_START.isoformat(), "ends_at": DEFAULT_END.isoformat()},
    )
    assert response.status_code == 401


def test_patch_study_block_requires_auth(client):
    response = client.patch(
        f"/api/v1/study-blocks/{uuid.uuid4()}", json={"ends_at": DEFAULT_END.isoformat()}
    )
    assert response.status_code == 401


def test_delete_study_block_requires_auth(client):
    response = client.delete(f"/api/v1/study-blocks/{uuid.uuid4()}")
    assert response.status_code == 401


# --- create ---


def test_create_study_block_success_without_task(client):
    response = _create_block(client)
    assert response.status_code == 201
    body = response.json()
    assert body["task_id"] is None
    assert body["task"] is None
    _assert_aware_utc_instant(body["starts_at"], DEFAULT_START)
    _assert_aware_utc_instant(body["ends_at"], DEFAULT_END)


def test_create_study_block_response_created_and_updated_at_are_timezone_aware(client):
    response = _create_block(client)
    assert response.status_code == 201
    body = response.json()
    # created_at/updated_at are server-generated at insert time — only
    # tz-awareness is checked here, not a specific expected instant.
    assert datetime.fromisoformat(body["created_at"]).tzinfo is not None
    assert datetime.fromisoformat(body["updated_at"]).tzinfo is not None


def test_create_study_block_with_owned_task_success(client):
    headers = auth_headers()
    task_id = _create_task(client, headers)
    response = _create_block(client, headers, task_id=task_id)
    assert response.status_code == 201
    body = response.json()
    assert body["task_id"] == task_id
    assert body["task"]["id"] == task_id
    assert body["task"]["title"] == "Read Chapter 3"
    assert body["task"]["subject"] is None
    _assert_aware_utc_instant(body["task"]["deadline"], DEFAULT_END)


def test_create_study_block_with_task_and_archived_subject_shows_snapshot(client):
    headers = auth_headers()
    subject_id = client.post(
        "/api/v1/subjects", json={"name": "Physics", "color_token": "teal"}, headers=headers
    ).json()["id"]
    task_id = _create_task(client, headers, subject_id=subject_id)
    client.patch(f"/api/v1/subjects/{subject_id}", json={"archived": True}, headers=headers)

    response = _create_block(client, headers, task_id=task_id)
    assert response.status_code == 201
    body = response.json()
    assert body["task"]["subject"]["id"] == subject_id
    assert body["task"]["subject"]["archived"] is True


def test_create_rejects_unknown_task_id(client):
    response = _create_block(client, task_id=str(uuid.uuid4()))
    assert response.status_code == 422
    assert response.json()["error"]["field"] == "task_id"


def test_create_rejects_other_users_task_id(client):
    owner_headers = auth_headers(email="owner@example.com")
    task_id = _create_task(client, owner_headers)

    response = _create_block(client, _intruder_headers(), task_id=task_id)
    assert response.status_code == 422
    assert response.json()["error"]["field"] == "task_id"


def test_create_rejects_ends_at_not_after_starts_at(client):
    response = _create_block(
        client, starts_at=DEFAULT_END.isoformat(), ends_at=DEFAULT_START.isoformat()
    )
    assert response.status_code == 422


def test_create_rejects_naive_starts_at(client):
    response = _create_block(client, starts_at=datetime(2026, 8, 1, 9, 0).isoformat())
    assert response.status_code == 422


def test_create_rejects_extra_field(client):
    response = _create_block(client, bogus="x")
    assert response.status_code == 422


# --- ownership: 404 for missing/cross-user ---


def test_patch_nonexistent_study_block_returns_404(client):
    response = client.patch(
        f"/api/v1/study-blocks/{uuid.uuid4()}",
        json={"ends_at": DEFAULT_END.isoformat()},
        headers=auth_headers(),
    )
    assert response.status_code == 404


def test_patch_other_users_study_block_returns_404(client):
    owner_headers = auth_headers(email="owner@example.com")
    block_id = _create_block(client, owner_headers).json()["id"]

    response = client.patch(
        f"/api/v1/study-blocks/{block_id}",
        json={"ends_at": (DEFAULT_END + timedelta(hours=1)).isoformat()},
        headers=_intruder_headers(),
    )
    assert response.status_code == 404


def test_delete_nonexistent_study_block_returns_404(client):
    response = client.delete(f"/api/v1/study-blocks/{uuid.uuid4()}", headers=auth_headers())
    assert response.status_code == 404


def test_delete_other_users_study_block_returns_404(client):
    owner_headers = auth_headers(email="owner@example.com")
    block_id = _create_block(client, owner_headers).json()["id"]

    response = client.delete(f"/api/v1/study-blocks/{block_id}", headers=_intruder_headers())
    assert response.status_code == 404


# --- PATCH: empty body / explicit nulls (schema-level, re-verified via route) ---


def test_patch_rejects_empty_body(client):
    headers = auth_headers()
    block_id = _create_block(client, headers).json()["id"]
    response = client.patch(f"/api/v1/study-blocks/{block_id}", json={}, headers=headers)
    assert response.status_code == 422


def test_patch_rejects_explicit_null_starts_at(client):
    headers = auth_headers()
    block_id = _create_block(client, headers).json()["id"]
    response = client.patch(
        f"/api/v1/study-blocks/{block_id}", json={"starts_at": None}, headers=headers
    )
    assert response.status_code == 422


def test_patch_allows_explicit_null_task_id_to_unlink(client):
    headers = auth_headers()
    task_id = _create_task(client, headers)
    block_id = _create_block(client, headers, task_id=task_id).json()["id"]

    response = client.patch(
        f"/api/v1/study-blocks/{block_id}", json={"task_id": None}, headers=headers
    )
    assert response.status_code == 200
    assert response.json()["task_id"] is None
    assert response.json()["task"] is None


# --- PATCH: relink ---


def test_patch_relink_to_valid_owned_task(client):
    headers = auth_headers()
    task_id = _create_task(client, headers)
    block_id = _create_block(client, headers).json()["id"]

    response = client.patch(
        f"/api/v1/study-blocks/{block_id}", json={"task_id": task_id}, headers=headers
    )
    assert response.status_code == 200
    assert response.json()["task_id"] == task_id


def test_patch_relink_to_foreign_task_rejected(client):
    owner_headers = auth_headers(email="owner@example.com")
    block_id = _create_block(client, owner_headers).json()["id"]
    intruder_headers = _intruder_headers()
    foreign_task_id = _create_task(client, intruder_headers)

    response = client.patch(
        f"/api/v1/study-blocks/{block_id}",
        json={"task_id": foreign_task_id},
        headers=owner_headers,
    )
    assert response.status_code == 422
    assert response.json()["error"]["field"] == "task_id"


# --- PATCH: partial starts_at/ends_at validated against the effective final pair ---


def test_patch_only_starts_at_rejected_when_after_stored_ends_at(client):
    headers = auth_headers()
    block_id = _create_block(client, headers).json()["id"]

    response = client.patch(
        f"/api/v1/study-blocks/{block_id}",
        json={"starts_at": (DEFAULT_END + timedelta(hours=1)).isoformat()},
        headers=headers,
    )
    assert response.status_code == 422


def test_patch_only_ends_at_rejected_when_before_stored_starts_at(client):
    headers = auth_headers()
    block_id = _create_block(client, headers).json()["id"]

    response = client.patch(
        f"/api/v1/study-blocks/{block_id}",
        json={"ends_at": (DEFAULT_START - timedelta(hours=1)).isoformat()},
        headers=headers,
    )
    assert response.status_code == 422


def test_patch_only_starts_at_accepted_when_still_before_stored_ends_at(client):
    headers = auth_headers()
    block_id = _create_block(client, headers).json()["id"]
    new_start = DEFAULT_START + timedelta(minutes=15)

    response = client.patch(
        f"/api/v1/study-blocks/{block_id}",
        json={"starts_at": new_start.isoformat()},
        headers=headers,
    )
    assert response.status_code == 200
    _assert_aware_utc_instant(response.json()["starts_at"], new_start)
    _assert_aware_utc_instant(response.json()["ends_at"], DEFAULT_END)


# --- PATCH: strict idempotency ---


def test_patch_resubmitting_identical_value_does_not_change_updated_at(client):
    headers = auth_headers()
    created = _create_block(client, headers).json()
    block_id = created["id"]
    original_updated_at = created["updated_at"]

    response = client.patch(
        f"/api/v1/study-blocks/{block_id}",
        json={"starts_at": DEFAULT_START.isoformat()},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["updated_at"] == original_updated_at


def test_patch_changing_value_bumps_updated_at(client):
    headers = auth_headers()
    created = _create_block(client, headers).json()
    block_id = created["id"]
    original_updated_at = created["updated_at"]
    new_start = DEFAULT_START + timedelta(minutes=15)

    response = client.patch(
        f"/api/v1/study-blocks/{block_id}",
        json={"starts_at": new_start.isoformat()},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["updated_at"] != original_updated_at


# --- DELETE ---


def test_delete_study_block_returns_204(client):
    headers = auth_headers()
    block_id = _create_block(client, headers).json()["id"]

    response = client.delete(f"/api/v1/study-blocks/{block_id}", headers=headers)
    assert response.status_code == 204


def test_redelete_study_block_returns_404(client):
    headers = auth_headers()
    block_id = _create_block(client, headers).json()["id"]

    client.delete(f"/api/v1/study-blocks/{block_id}", headers=headers)
    second = client.delete(f"/api/v1/study-blocks/{block_id}", headers=headers)
    assert second.status_code == 404


# --- task deletion detaches (ON DELETE SET NULL), never deletes, the block ---


def test_deleting_linked_task_detaches_study_block(client, engine):
    owner_id = uuid.uuid4()
    headers = auth_headers(user_id=owner_id)
    task_id = _create_task(client, headers)
    block_id = _create_block(client, headers, task_id=task_id).json()["id"]

    response = client.delete(f"/api/v1/tasks/{task_id}", headers=headers)
    assert response.status_code == 204

    with Session(engine) as session:
        block = session.get(StudyBlock, uuid.UUID(block_id))
        assert block is not None
        assert block.task_id is None
