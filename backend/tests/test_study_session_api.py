import uuid
from datetime import UTC, datetime, timedelta

from .conftest import auth_headers, make_token

START_URL = "/api/v1/sessions/start"
LIST_URL = "/api/v1/sessions"

DEFAULT_DEADLINE = datetime(2026, 8, 1, 12, 0, tzinfo=UTC)


def _create_task(client, headers=None, **overrides):
    headers = headers or auth_headers()
    payload = {
        "title": "Read Chapter 3",
        "type": "Assignment",
        "deadline": DEFAULT_DEADLINE.isoformat(),
        "priority": "Medium",
    }
    payload.update(overrides)
    return client.post("/api/v1/tasks", json=payload, headers=headers).json()["id"]


def _start(client, headers=None, **body):
    headers = headers or auth_headers()
    return client.post(START_URL, json=body, headers=headers)


def _pause_url(session_id):
    return f"/api/v1/sessions/{session_id}/pause"


def _resume_url(session_id):
    return f"/api/v1/sessions/{session_id}/resume"


def _finish_url(session_id):
    return f"/api/v1/sessions/{session_id}/finish"


def _intruder_headers():
    return {"Authorization": f"Bearer {make_token(uuid.uuid4(), 'intruder@example.com')}"}


# --- authentication ---


def test_start_requires_auth(client):
    response = client.post(START_URL, json={})
    assert response.status_code == 401


def test_pause_requires_auth(client):
    response = client.patch(_pause_url(uuid.uuid4()))
    assert response.status_code == 401


def test_resume_requires_auth(client):
    response = client.patch(_resume_url(uuid.uuid4()))
    assert response.status_code == 401


def test_finish_requires_auth(client):
    response = client.patch(_finish_url(uuid.uuid4()))
    assert response.status_code == 401


def test_list_requires_auth(client):
    response = client.get(LIST_URL)
    assert response.status_code == 401


# --- start: body shapes ---


def test_start_accepts_no_body(client):
    headers = auth_headers()
    response = client.post(START_URL, headers=headers)
    assert response.status_code == 201
    assert response.json()["task_id"] is None


def test_start_accepts_empty_object(client):
    response = _start(client)
    assert response.status_code == 201
    assert response.json()["task_id"] is None


def test_start_accepts_task_id(client):
    headers = auth_headers()
    task_id = _create_task(client, headers)
    response = _start(client, headers, task_id=task_id)
    assert response.status_code == 201
    body = response.json()
    assert body["task_id"] == task_id
    assert body["task"]["id"] == task_id
    assert body["status"] == "Active"
    assert body["active_duration_seconds"] == 0
    assert body["break_taken"] is False


def test_start_rejects_extra_field(client):
    response = _start(client, bogus="x")
    assert response.status_code == 422


def test_start_rejects_unknown_task_id(client):
    response = _start(client, task_id=str(uuid.uuid4()))
    assert response.status_code == 422
    assert response.json()["error"]["field"] == "task_id"


def test_start_rejects_other_users_task_id(client):
    owner_headers = auth_headers(email="owner@example.com")
    task_id = _create_task(client, owner_headers)

    response = _start(client, _intruder_headers(), task_id=task_id)
    assert response.status_code == 422
    assert response.json()["error"]["field"] == "task_id"


def test_start_rejects_second_unfinished_session(client):
    headers = auth_headers()
    _start(client, headers)
    response = _start(client, headers)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CONFLICT"


def test_start_response_datetimes_are_timezone_aware(client):
    body = _start(client).json()
    assert datetime.fromisoformat(body["started_at"]).tzinfo is not None
    assert datetime.fromisoformat(body["created_at"]).tzinfo is not None
    assert datetime.fromisoformat(body["updated_at"]).tzinfo is not None


# --- next_break_eligible_at (Checkpoint 9A) ---
# Real HTTP routes use wall-clock `datetime.now(UTC)`, not an injectable
# fixed time, so these assert tz-awareness and reasonable non-flaky
# bounds rather than exact instants — same established pattern as
# test_effective_active_duration_is_non_negative_and_reasonable above.


def test_start_response_next_break_eligible_at_is_utc_aware_and_in_future(client):
    body = _start(client).json()
    value = datetime.fromisoformat(body["next_break_eligible_at"])
    assert value.tzinfo is not None
    now = datetime.now(UTC)
    assert now < value <= now + timedelta(seconds=3000 + 60)


def test_resume_response_next_break_eligible_at_is_utc_aware_and_in_future(client):
    headers = auth_headers()
    session_id = _start(client, headers).json()["id"]
    client.patch(_pause_url(session_id), headers=headers)
    body = client.patch(_resume_url(session_id), headers=headers).json()

    value = datetime.fromisoformat(body["next_break_eligible_at"])
    assert value.tzinfo is not None
    now = datetime.now(UTC)
    assert now < value <= now + timedelta(seconds=3000 + 60)


def test_pause_response_next_break_eligible_at_is_null(client):
    headers = auth_headers()
    session_id = _start(client, headers).json()["id"]
    body = client.patch(_pause_url(session_id), headers=headers).json()
    assert body["next_break_eligible_at"] is None


def test_finish_response_next_break_eligible_at_is_null(client):
    headers = auth_headers()
    session_id = _start(client, headers).json()["id"]
    body = client.patch(_finish_url(session_id), headers=headers).json()
    assert body["next_break_eligible_at"] is None


def test_list_fresh_readback_recomputes_next_break_eligible_at(client):
    # Proves GET /sessions computes this field fresh server-side on every
    # call — no reliance on anything a prior client response might have
    # remembered (there is none here; this is a brand-new client call).
    headers = auth_headers()
    session_id = _start(client, headers).json()["id"]

    response = client.get(LIST_URL, params={"status": "Active"}, headers=headers)
    body = next(s for s in response.json() if s["id"] == session_id)
    value = datetime.fromisoformat(body["next_break_eligible_at"])
    assert value.tzinfo is not None
    now = datetime.now(UTC)
    assert now < value <= now + timedelta(seconds=3000 + 60)


# --- action routes: body shapes ---


def test_pause_accepts_no_body(client):
    headers = auth_headers()
    session_id = _start(client, headers).json()["id"]
    response = client.patch(_pause_url(session_id), headers=headers)
    assert response.status_code == 200
    assert response.json()["status"] == "Paused"


def test_pause_accepts_empty_object(client):
    headers = auth_headers()
    session_id = _start(client, headers).json()["id"]
    response = client.patch(_pause_url(session_id), json={}, headers=headers)
    assert response.status_code == 200


def test_resume_accepts_no_body(client):
    headers = auth_headers()
    session_id = _start(client, headers).json()["id"]
    client.patch(_pause_url(session_id), headers=headers)
    response = client.patch(_resume_url(session_id), headers=headers)
    assert response.status_code == 200
    assert response.json()["status"] == "Active"


def test_finish_accepts_no_body(client):
    headers = auth_headers()
    session_id = _start(client, headers).json()["id"]
    response = client.patch(_finish_url(session_id), headers=headers)
    assert response.status_code == 200
    assert response.json()["status"] == "Finished"


def test_action_rejects_unexpected_field(client):
    headers = auth_headers()
    session_id = _start(client, headers).json()["id"]
    response = client.patch(
        _pause_url(session_id), json={"status": "Finished"}, headers=headers
    )
    assert response.status_code == 422


# --- transitions / idempotency ---


def test_pause_while_paused_returns_200_unchanged(client):
    headers = auth_headers()
    session_id = _start(client, headers).json()["id"]
    first = client.patch(_pause_url(session_id), headers=headers).json()
    second = client.patch(_pause_url(session_id), headers=headers).json()
    assert second["status"] == "Paused"
    assert second["updated_at"] == first["updated_at"]


def test_resume_while_active_returns_200_unchanged(client):
    headers = auth_headers()
    started = _start(client, headers).json()
    response = client.patch(_resume_url(started["id"]), headers=headers)
    assert response.status_code == 200
    assert response.json()["status"] == "Active"
    assert response.json()["updated_at"] == started["updated_at"]


def test_finish_while_finished_returns_200_unchanged(client):
    headers = auth_headers()
    session_id = _start(client, headers).json()["id"]
    first = client.patch(_finish_url(session_id), headers=headers).json()
    second = client.patch(_finish_url(session_id), headers=headers).json()
    assert second["status"] == "Finished"
    assert second["ended_at"] == first["ended_at"]
    assert second["updated_at"] == first["updated_at"]


def test_pause_finished_session_returns_409(client):
    headers = auth_headers()
    session_id = _start(client, headers).json()["id"]
    client.patch(_finish_url(session_id), headers=headers)
    response = client.patch(_pause_url(session_id), headers=headers)
    assert response.status_code == 409


def test_resume_finished_session_returns_409(client):
    headers = auth_headers()
    session_id = _start(client, headers).json()["id"]
    client.patch(_finish_url(session_id), headers=headers)
    response = client.patch(_resume_url(session_id), headers=headers)
    assert response.status_code == 409


def test_finish_after_pause_and_resume_succeeds(client):
    headers = auth_headers()
    session_id = _start(client, headers).json()["id"]
    client.patch(_pause_url(session_id), headers=headers)
    client.patch(_resume_url(session_id), headers=headers)
    response = client.patch(_finish_url(session_id), headers=headers)
    assert response.status_code == 200
    assert response.json()["status"] == "Finished"


# --- ownership ---


def test_pause_nonexistent_session_returns_404(client):
    response = client.patch(_pause_url(uuid.uuid4()), headers=auth_headers())
    assert response.status_code == 404


def test_pause_other_users_session_returns_404(client):
    owner_headers = auth_headers(email="owner@example.com")
    session_id = _start(client, owner_headers).json()["id"]

    response = client.patch(_pause_url(session_id), headers=_intruder_headers())
    assert response.status_code == 404


def test_resume_other_users_session_returns_404(client):
    owner_headers = auth_headers(email="owner@example.com")
    session_id = _start(client, owner_headers).json()["id"]
    client.patch(_pause_url(session_id), headers=owner_headers)

    response = client.patch(_resume_url(session_id), headers=_intruder_headers())
    assert response.status_code == 404


def test_finish_other_users_session_returns_404(client):
    owner_headers = auth_headers(email="owner@example.com")
    session_id = _start(client, owner_headers).json()["id"]

    response = client.patch(_finish_url(session_id), headers=_intruder_headers())
    assert response.status_code == 404


# --- history: filters / pagination / ordering / isolation ---


def test_list_returns_empty_list_when_none_exist(client):
    response = client.get(LIST_URL, headers=auth_headers())
    assert response.status_code == 200
    assert response.json() == []


def test_list_includes_active_session_by_default(client):
    headers = auth_headers()
    session_id = _start(client, headers).json()["id"]
    response = client.get(LIST_URL, headers=headers)
    assert response.status_code == 200
    ids = {s["id"] for s in response.json()}
    assert session_id in ids


def test_list_filters_by_status(client):
    headers = auth_headers()
    session_id = _start(client, headers).json()["id"]
    client.patch(_finish_url(session_id), headers=headers)

    response = client.get(LIST_URL, params={"status": "Finished"}, headers=headers)
    assert response.status_code == 200
    assert [s["id"] for s in response.json()] == [session_id]

    response_active = client.get(LIST_URL, params={"status": "Active"}, headers=headers)
    assert response_active.json() == []


def test_list_rejects_unknown_query_param(client):
    response = client.get(LIST_URL, params={"bogus": "x"}, headers=auth_headers())
    assert response.status_code == 422


def test_list_default_limit_is_20(client):
    headers = auth_headers()
    for _ in range(25):
        session_id = _start(client, headers).json()["id"]
        client.patch(_finish_url(session_id), headers=headers)

    response = client.get(LIST_URL, headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 20


def test_list_pagination_offset(client):
    headers = auth_headers()
    ids_in_creation_order = []
    for _ in range(3):
        session_id = _start(client, headers).json()["id"]
        client.patch(_finish_url(session_id), headers=headers)
        ids_in_creation_order.append(session_id)

    all_sessions = client.get(LIST_URL, headers=headers).json()
    assert len(all_sessions) == 3

    offset_response = client.get(LIST_URL, params={"offset": 1, "limit": 1}, headers=headers)
    assert offset_response.status_code == 200
    assert len(offset_response.json()) == 1
    assert offset_response.json()[0]["id"] == all_sessions[1]["id"]


def test_list_orders_by_started_at_desc(client):
    headers = auth_headers()
    session_id = _start(client, headers).json()["id"]
    client.patch(_finish_url(session_id), headers=headers)

    response = client.get(LIST_URL, headers=headers)
    started_ats = [s["started_at"] for s in response.json()]
    assert started_ats == sorted(started_ats, reverse=True)


def test_list_only_returns_own_sessions(client):
    owner_headers = auth_headers(email="owner@example.com")
    _start(client, owner_headers)

    response = client.get(LIST_URL, headers=_intruder_headers())
    assert response.status_code == 200
    assert response.json() == []


# --- linked-task / archived-subject snapshot ---


def test_session_response_includes_archived_subject_snapshot(client):
    headers = auth_headers()
    subject_id = client.post(
        "/api/v1/subjects", json={"name": "Physics", "color_token": "teal"}, headers=headers
    ).json()["id"]
    task_id = _create_task(client, headers, subject_id=subject_id)
    client.patch(f"/api/v1/subjects/{subject_id}", json={"archived": True}, headers=headers)

    response = _start(client, headers, task_id=task_id)
    assert response.status_code == 201
    body = response.json()
    assert body["task"]["subject"]["id"] == subject_id
    assert body["task"]["subject"]["archived"] is True


def test_finished_session_in_history_includes_task_snapshot(client):
    headers = auth_headers()
    task_id = _create_task(client, headers)
    session_id = _start(client, headers, task_id=task_id).json()["id"]
    client.patch(_finish_url(session_id), headers=headers)

    response = client.get(LIST_URL, headers=headers)
    matching = next(s for s in response.json() if s["id"] == session_id)
    assert matching["task"]["id"] == task_id
    assert matching["task"]["title"] == "Read Chapter 3"


# --- accumulated duration across a real pause/resume cycle (wall-clock, non-flaky bounds) ---


def test_effective_active_duration_is_non_negative_and_reasonable(client):
    headers = auth_headers()
    session_id = _start(client, headers).json()["id"]

    response = client.get(LIST_URL, params={"status": "Active"}, headers=headers)
    body = next(s for s in response.json() if s["id"] == session_id)
    assert body["active_duration_seconds"] >= 0
    assert body["active_duration_seconds"] < 60
