from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

ALLOWED_ORIGIN = "http://localhost:8081"
UNKNOWN_ORIGIN = "https://evil.example.com"

PREFLIGHT_HEADERS = {
    "Origin": ALLOWED_ORIGIN,
    "Access-Control-Request-Method": "GET",
    "Access-Control-Request-Headers": "authorization,content-type",
}


def test_preflight_from_allowed_origin_succeeds() -> None:
    response = client.options("/api/v1/tasks/today", headers=PREFLIGHT_HEADERS)
    assert response.status_code == 200


def test_preflight_response_echoes_matching_allow_origin() -> None:
    response = client.options("/api/v1/tasks/today", headers=PREFLIGHT_HEADERS)
    assert response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN


def test_preflight_allows_authorization_and_content_type() -> None:
    response = client.options("/api/v1/tasks/today", headers=PREFLIGHT_HEADERS)
    allow_headers = response.headers["access-control-allow-headers"].lower()
    assert "authorization" in allow_headers
    assert "content-type" in allow_headers


def test_preflight_allows_required_methods() -> None:
    response = client.options("/api/v1/tasks/today", headers=PREFLIGHT_HEADERS)
    allow_methods = response.headers["access-control-allow-methods"]
    for method in ("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"):
        assert method in allow_methods


def test_preflight_from_unknown_origin_gets_no_allow_origin_header() -> None:
    headers = {**PREFLIGHT_HEADERS, "Origin": UNKNOWN_ORIGIN}
    response = client.options("/api/v1/tasks/today", headers=headers)
    assert "access-control-allow-origin" not in response.headers


def test_health_still_returns_ok() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
