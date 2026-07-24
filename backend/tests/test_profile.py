import uuid

from .conftest import auth_headers, make_token


def test_get_profile_requires_auth(client):
    response = client.get("/api/v1/profile")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_invalid_token_rejected(client):
    response = client.get("/api/v1/profile", headers={"Authorization": "Bearer not-a-real-token"})
    assert response.status_code == 401


def test_get_profile_auto_creates_with_default_timezone(client):
    response = client.get("/api/v1/profile", headers=auth_headers(email="student@example.com"))
    assert response.status_code == 200
    body = response.json()
    assert body["timezone"] == "UTC"
    assert body["display_name"] == "student"


def test_patch_profile_updates_timezone_and_display_name(client):
    headers = auth_headers()
    response = client.patch(
        "/api/v1/profile",
        json={"display_name": "Rejwana", "timezone": "Asia/Dhaka"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["display_name"] == "Rejwana"
    assert body["timezone"] == "Asia/Dhaka"


def test_patch_profile_rejects_invalid_timezone(client):
    response = client.patch(
        "/api/v1/profile", json={"timezone": "Not/ARealZone"}, headers=auth_headers()
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_patch_profile_rejects_blank_display_name(client):
    response = client.patch(
        "/api/v1/profile", json={"display_name": "   "}, headers=auth_headers()
    )
    assert response.status_code == 422


def test_two_account_isolation(client):
    user_a, user_b = uuid.uuid4(), uuid.uuid4()
    headers_a = {"Authorization": f"Bearer {make_token(user_a, 'alice@example.com')}"}
    headers_b = {"Authorization": f"Bearer {make_token(user_b, 'bob@example.com')}"}

    client.patch("/api/v1/profile", json={"display_name": "Alice Only"}, headers=headers_a)

    response_b = client.get("/api/v1/profile", headers=headers_b)
    assert response_b.status_code == 200
    assert response_b.json()["id"] == str(user_b)
    assert response_b.json()["display_name"] != "Alice Only"

    response_a = client.get("/api/v1/profile", headers=headers_a)
    assert response_a.json()["id"] == str(user_a)
    assert response_a.json()["display_name"] == "Alice Only"
