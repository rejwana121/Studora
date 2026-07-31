import uuid
from datetime import UTC, datetime

from app.main import app
from app.services.workload.constants import ENGINE_VERSION, RECOMMENDATION_ENGINE_VERSION

from .conftest import auth_headers, make_token

URL = "/api/v1/workload/current"

DEFAULT_DEADLINE = datetime(2026, 8, 1, 12, 0, tzinfo=UTC)

# Exact WorkloadCurrentResponse shape: EvaluationResult's own 11 fields
# (app.schemas.workload.EvaluationResult) plus the 3 Batch 4 additions
# (app.schemas.workload_api.WorkloadCurrentResponse) -- no more, no less.
EXPECTED_KEYS = {
    "raw_score",
    "ungated_level",
    "level",
    "gate_applied",
    "gate_explanation",
    "strong_signal_count",
    "confidence",
    "factors",
    "relevant_task_ids",
    "evaluated_at",
    "engine_version",
    "insufficient_data",
    "recommendations",
    "recommendation_engine_version",
}


def _create_task(client, headers=None, **overrides):
    headers = headers or auth_headers()
    payload = {
        "title": "Read Chapter 3",
        "type": "Assignment",
        "deadline": DEFAULT_DEADLINE.isoformat(),
        "priority": "Medium",
    }
    payload.update(overrides)
    return client.post("/api/v1/tasks", json=payload, headers=headers)


# --- route registration/reachability ---


def test_workload_current_route_is_registered():
    schema = app.openapi()
    assert "get" in schema["paths"][URL]


# --- authentication ---


def test_get_current_workload_requires_auth(client):
    response = client.get(URL)
    assert response.status_code == 401


# --- authenticated happy path ---


def test_get_current_workload_authenticated_happy_path(client):
    headers = auth_headers()
    _create_task(client, headers)

    response = client.get(URL, headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["insufficient_data"] is False
    assert body["level"] in {"Low", "Moderate", "High", "Critical"}
    assert body["engine_version"] == ENGINE_VERSION
    assert body["recommendation_engine_version"] == RECOMMENDATION_ENGINE_VERSION


# --- zero-evidence insufficient_data ---


def test_get_current_workload_zero_evidence_is_insufficient_data(client):
    response = client.get(URL, headers=auth_headers())

    assert response.status_code == 200
    body = response.json()
    assert body["insufficient_data"] is True
    assert body["recommendations"] == []
    assert body["raw_score"] == 0
    assert body["level"] == "Low"


# --- exact response shape ---


def test_get_current_workload_response_shape(client):
    headers = auth_headers()
    _create_task(client, headers)

    response = client.get(URL, headers=headers)

    assert set(response.json().keys()) == EXPECTED_KEYS


# --- ownership isolation ---


def test_get_current_workload_ownership_isolation(client):
    owner_id = uuid.uuid4()
    intruder_id = uuid.uuid4()
    owner_headers = auth_headers(user_id=owner_id, email="owner@example.com")
    intruder_headers = {
        "Authorization": f"Bearer {make_token(intruder_id, 'intruder@example.com')}"
    }

    _create_task(client, owner_headers)

    response = client.get(URL, headers=intruder_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["insufficient_data"] is True
    assert body["relevant_task_ids"] == []
    assert body["recommendations"] == []
