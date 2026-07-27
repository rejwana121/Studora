"""HTTP-level tests for POST /sessions/{id}/break — Phase 5 Checkpoint 6.

Threshold-crossing precision (2999/3000/3001-second boundaries, repeated
cycles) is proven at the service level in
test_study_session_break_service.py using injected fixed times — a real
wall-clock wait of 50+ minutes is not practical here. These tests instead
seed accrued duration directly at the database level (the `engine`
fixture backing `client`) to reach the threshold instantly, then verify
the route's request/response contract, status transitions, ownership,
and error handling end-to-end through the real HTTP stack.
"""
import uuid
from datetime import UTC, datetime

from sqlmodel import Session, select

from app.models.study_session import StudySession
from app.models.study_session_break import StudySessionBreak
from app.services.study_session import BREAK_THRESHOLD_SECONDS

from .conftest import auth_headers, make_token

START_URL = "/api/v1/sessions/start"
LIST_URL = "/api/v1/sessions"


def _break_url(session_id):
    return f"/api/v1/sessions/{session_id}/break"


def _intruder_headers():
    return {"Authorization": f"Bearer {make_token(uuid.uuid4(), 'intruder@example.com')}"}


def _start(client, headers=None):
    headers = headers or auth_headers()
    return client.post(START_URL, headers=headers).json()


def _seed_accrued_duration(
    engine, session_id: uuid.UUID, *, active_duration_seconds: int, active_segment_started_at
):
    with Session(engine) as session:
        row = session.get(StudySession, session_id)
        row.active_duration_seconds = active_duration_seconds
        row.active_segment_started_at = active_segment_started_at
        session.add(row)
        session.commit()


# --- authentication ---


def test_break_requires_auth(client):
    response = client.post(_break_url(uuid.uuid4()), json={"action": "TakeBreak"})
    assert response.status_code == 401


# --- ownership ---


def test_break_nonexistent_session_returns_404(client):
    response = client.post(
        _break_url(uuid.uuid4()), json={"action": "TakeBreak"}, headers=auth_headers()
    )
    assert response.status_code == 404


def test_break_other_users_session_returns_404(client):
    owner_headers = auth_headers(email="owner@example.com")
    session_id = _start(client, owner_headers)["id"]

    response = client.post(
        _break_url(session_id), json={"action": "TakeBreak"}, headers=_intruder_headers()
    )
    assert response.status_code == 404


# --- request body validation ---


def test_break_rejects_unknown_action(client):
    headers = auth_headers()
    session_id = _start(client, headers)["id"]
    response = client.post(_break_url(session_id), json={"action": "Cancel"}, headers=headers)
    assert response.status_code == 422


def test_break_rejects_dismiss_with_duration(client):
    headers = auth_headers()
    session_id = _start(client, headers)["id"]
    response = client.post(
        _break_url(session_id),
        json={"action": "Dismiss", "duration_minutes": 10},
        headers=headers,
    )
    assert response.status_code == 422


def test_break_rejects_missing_action(client):
    headers = auth_headers()
    session_id = _start(client, headers)["id"]
    response = client.post(_break_url(session_id), json={}, headers=headers)
    assert response.status_code == 422


def test_break_rejects_unknown_field(client):
    headers = auth_headers()
    session_id = _start(client, headers)["id"]
    response = client.post(
        _break_url(session_id), json={"action": "TakeBreak", "bogus": "x"}, headers=headers
    )
    assert response.status_code == 422


# --- conflict: non-Active session ---


def test_break_on_paused_session_returns_409(client):
    headers = auth_headers()
    session_id = _start(client, headers)["id"]
    client.patch(f"/api/v1/sessions/{session_id}/pause", headers=headers)

    response = client.post(_break_url(session_id), json={"action": "TakeBreak"}, headers=headers)
    assert response.status_code == 409


def test_break_on_finished_session_returns_409(client):
    headers = auth_headers()
    session_id = _start(client, headers)["id"]
    client.patch(f"/api/v1/sessions/{session_id}/finish", headers=headers)

    response = client.post(_break_url(session_id), json={"action": "Snooze"}, headers=headers)
    assert response.status_code == 409


# --- TakeBreak: response shape and session transition ---


def test_take_break_returns_201_composite_body(client, engine):
    headers = auth_headers()
    session_id = _start(client, headers)["id"]
    _seed_accrued_duration(
        engine,
        uuid.UUID(session_id),
        active_duration_seconds=0,
        active_segment_started_at=datetime.now(UTC),
    )

    response = client.post(_break_url(session_id), json={"action": "TakeBreak"}, headers=headers)
    assert response.status_code == 201
    body = response.json()
    assert body["session"]["id"] == session_id
    assert body["session"]["status"] == "Paused"
    assert body["session"]["break_taken"] is True
    assert body["session"]["break_eligible"] is False
    assert "active_duration_seconds_at_last_break" not in body["session"]
    assert body["break_event"]["session_id"] == session_id
    assert body["break_event"]["action"] == "TakeBreak"
    assert "user_id" not in body["break_event"]


def test_take_break_with_duration_minutes_is_recorded(client):
    headers = auth_headers()
    session_id = _start(client, headers)["id"]
    response = client.post(
        _break_url(session_id),
        json={"action": "TakeBreak", "duration_minutes": 10},
        headers=headers,
    )
    assert response.status_code == 201
    assert response.json()["break_event"]["duration_minutes"] == 10


# --- Snooze/Dismiss: session stays Active ---


def test_snooze_leaves_session_active(client):
    headers = auth_headers()
    session_id = _start(client, headers)["id"]
    response = client.post(
        _break_url(session_id),
        json={"action": "Snooze", "duration_minutes": 10},
        headers=headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["session"]["status"] == "Active"
    assert body["session"]["break_taken"] is False


def test_dismiss_leaves_session_active(client):
    headers = auth_headers()
    session_id = _start(client, headers)["id"]
    response = client.post(_break_url(session_id), json={"action": "Dismiss"}, headers=headers)
    assert response.status_code == 201
    assert response.json()["session"]["status"] == "Active"


# --- suppression window surfaced immediately, including on other routes ---


def test_snooze_response_reports_break_eligible_false_when_over_threshold(client, engine):
    headers = auth_headers()
    session_id = _start(client, headers)["id"]
    _seed_accrued_duration(
        engine,
        uuid.UUID(session_id),
        active_duration_seconds=BREAK_THRESHOLD_SECONDS,
        active_segment_started_at=datetime.now(UTC),
    )

    response = client.post(
        _break_url(session_id),
        json={"action": "Snooze", "duration_minutes": 10},
        headers=headers,
    )
    assert response.status_code == 201
    assert response.json()["session"]["break_eligible"] is False


def test_list_after_dismiss_reports_break_eligible_false_within_suppression(client, engine):
    headers = auth_headers()
    session_id = _start(client, headers)["id"]
    _seed_accrued_duration(
        engine,
        uuid.UUID(session_id),
        active_duration_seconds=BREAK_THRESHOLD_SECONDS,
        active_segment_started_at=datetime.now(UTC),
    )
    client.post(_break_url(session_id), json={"action": "Dismiss"}, headers=headers)

    response = client.get(LIST_URL, params={"status": "Active"}, headers=headers)
    body = next(s for s in response.json() if s["id"] == session_id)
    assert body["break_eligible"] is False


def test_resume_after_snooze_still_suppressed(client, engine):
    headers = auth_headers()
    session_id = _start(client, headers)["id"]
    _seed_accrued_duration(
        engine,
        uuid.UUID(session_id),
        active_duration_seconds=BREAK_THRESHOLD_SECONDS,
        active_segment_started_at=datetime.now(UTC),
    )
    client.post(
        _break_url(session_id),
        json={"action": "Snooze", "duration_minutes": 10},
        headers=headers,
    )

    client.patch(f"/api/v1/sessions/{session_id}/pause", headers=headers)
    response = client.patch(f"/api/v1/sessions/{session_id}/resume", headers=headers)
    assert response.status_code == 200
    assert response.json()["break_eligible"] is False


# --- UTC-aware datetimes: strict assertions on both nested objects ---


def test_break_response_datetimes_are_timezone_aware(client):
    headers = auth_headers()
    session_id = _start(client, headers)["id"]
    response = client.post(_break_url(session_id), json={"action": "Dismiss"}, headers=headers)
    body = response.json()
    assert datetime.fromisoformat(body["session"]["started_at"]).tzinfo is not None
    assert datetime.fromisoformat(body["session"]["updated_at"]).tzinfo is not None
    assert datetime.fromisoformat(body["break_event"]["prompted_at"]).tzinfo is not None


# --- multiple break events allowed; full history preserved ---


def test_multiple_break_actions_all_recorded(client, engine):
    headers = auth_headers()
    session_id = _start(client, headers)["id"]
    client.post(_break_url(session_id), json={"action": "Snooze"}, headers=headers)
    client.post(_break_url(session_id), json={"action": "Dismiss"}, headers=headers)

    with Session(engine) as session:
        rows = session.exec(
            select(StudySessionBreak).where(
                StudySessionBreak.session_id == uuid.UUID(session_id)
            )
        ).all()
    assert len(rows) == 2
    assert {r.action for r in rows} == {"Snooze", "Dismiss"}
