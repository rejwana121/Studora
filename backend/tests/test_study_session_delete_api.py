import uuid

from .conftest import auth_headers, make_token

START_URL = "/api/v1/sessions/start"
LIST_URL = "/api/v1/sessions"


def _start(client, headers=None, **body):
    headers = headers or auth_headers()
    return client.post(START_URL, json=body, headers=headers)


def _pause_url(session_id):
    return f"/api/v1/sessions/{session_id}/pause"


def _finish_url(session_id):
    return f"/api/v1/sessions/{session_id}/finish"


def _delete_url(session_id):
    return f"/api/v1/sessions/{session_id}"


def _intruder_headers():
    return {"Authorization": f"Bearer {make_token(uuid.uuid4(), 'intruder@example.com')}"}


def _start_and_finish(client, headers):
    session_id = _start(client, headers).json()["id"]
    client.patch(_finish_url(session_id), headers=headers)
    return session_id


# --- authentication ---


def test_delete_requires_auth(client):
    response = client.delete(_delete_url(uuid.uuid4()))
    assert response.status_code == 401


# --- happy path ---


def test_delete_removes_own_completed_session(client):
    headers = auth_headers()
    session_id = _start_and_finish(client, headers)

    response = client.delete(_delete_url(session_id), headers=headers)
    assert response.status_code == 204

    follow_up = client.get(LIST_URL, headers=headers)
    assert follow_up.status_code == 200
    assert all(row["id"] != session_id for row in follow_up.json())


def test_delete_does_not_affect_other_sessions(client):
    """Two-account isolation is covered separately below — this is the
    same-account isolation half: deleting one of the owner's own finished
    sessions must never touch any other row, theirs or anyone else's."""
    headers = auth_headers()
    kept_session_id = _start_and_finish(client, headers)
    removed_session_id = _start_and_finish(client, headers)

    response = client.delete(_delete_url(removed_session_id), headers=headers)
    assert response.status_code == 204

    follow_up = client.get(LIST_URL, headers=headers)
    remaining_ids = {row["id"] for row in follow_up.json()}
    assert kept_session_id in remaining_ids
    assert removed_session_id not in remaining_ids


# --- ownership / two-account isolation ---


def test_delete_nonexistent_session_returns_404(client):
    response = client.delete(_delete_url(uuid.uuid4()), headers=auth_headers())
    assert response.status_code == 404


def test_delete_other_users_session_returns_404(client):
    owner_headers = auth_headers(email="owner@example.com")
    session_id = _start_and_finish(client, owner_headers)

    response = client.delete(_delete_url(session_id), headers=_intruder_headers())
    assert response.status_code == 404

    # Never actually deleted — still visible to its real owner.
    follow_up = client.get(LIST_URL, headers=owner_headers)
    assert any(row["id"] == session_id for row in follow_up.json())


def test_delete_other_users_session_leaves_intruders_own_sessions_untouched(client):
    owner_headers = auth_headers(email="owner@example.com")
    owner_session_id = _start_and_finish(client, owner_headers)

    intruder_headers = _intruder_headers()
    intruder_session_id = _start_and_finish(client, intruder_headers)

    response = client.delete(_delete_url(owner_session_id), headers=intruder_headers)
    assert response.status_code == 404

    # The intruder's own (unrelated) session is completely unaffected.
    follow_up = client.get(LIST_URL, headers=intruder_headers)
    assert any(row["id"] == intruder_session_id for row in follow_up.json())


# --- state validation: only a Finished session may be removed ---


def test_delete_active_session_returns_409(client):
    headers = auth_headers()
    session_id = _start(client, headers).json()["id"]

    response = client.delete(_delete_url(session_id), headers=headers)
    assert response.status_code == 409

    # Never deleted — still present and still Active.
    follow_up = client.get(LIST_URL, headers=headers)
    row = next(r for r in follow_up.json() if r["id"] == session_id)
    assert row["status"] == "Active"


def test_delete_paused_session_returns_409(client):
    headers = auth_headers()
    session_id = _start(client, headers).json()["id"]
    client.patch(_pause_url(session_id), headers=headers)

    response = client.delete(_delete_url(session_id), headers=headers)
    assert response.status_code == 409

    follow_up = client.get(LIST_URL, headers=headers)
    row = next(r for r in follow_up.json() if r["id"] == session_id)
    assert row["status"] == "Paused"
