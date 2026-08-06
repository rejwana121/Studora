import uuid
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

from .conftest import auth_headers, make_token

_BACKEND_ROOT = Path(__file__).resolve().parents[1]


def test_avatar_path_migration_is_single_linear_head():
    """Static check of the revision graph only — parses alembic/versions,
    never opens a DB connection, so this is safe in any environment."""
    config = Config(str(_BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(_BACKEND_ROOT / "alembic"))
    script = ScriptDirectory.from_config(config)

    heads = script.get_heads()
    assert len(heads) == 1, f"expected a single linear head, found {heads}"
    assert heads[0] == "24c9c3d60fad"

    new_revision = script.get_revision("24c9c3d60fad")
    assert new_revision.down_revision == "f4f62fa18d0d"

    module = new_revision.module
    assert callable(module.upgrade)
    assert callable(module.downgrade)


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
    assert body["avatar_path"] is None


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


def test_patch_profile_accepts_own_avatar_path(client):
    user_id = uuid.uuid4()
    headers = auth_headers(user_id=user_id)
    expected_path = f"{user_id}/avatar"

    response = client.patch(
        "/api/v1/profile", json={"avatar_path": expected_path}, headers=headers
    )
    assert response.status_code == 200
    assert response.json()["avatar_path"] == expected_path

    get_response = client.get("/api/v1/profile", headers=headers)
    assert get_response.json()["avatar_path"] == expected_path


def test_patch_profile_accepts_null_avatar_path_for_removal(client):
    user_id = uuid.uuid4()
    headers = auth_headers(user_id=user_id)
    client.patch(
        "/api/v1/profile", json={"avatar_path": f"{user_id}/avatar"}, headers=headers
    )

    response = client.patch("/api/v1/profile", json={"avatar_path": None}, headers=headers)
    assert response.status_code == 200
    assert response.json()["avatar_path"] is None


def test_patch_profile_rejects_another_users_avatar_path(client):
    own_id = uuid.uuid4()
    other_id = uuid.uuid4()
    headers = auth_headers(user_id=own_id)

    response = client.patch(
        "/api/v1/profile", json={"avatar_path": f"{other_id}/avatar"}, headers=headers
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert response.json()["error"]["field"] == "avatar_path"


def test_patch_profile_rejects_url_avatar_path(client):
    user_id = uuid.uuid4()
    headers = auth_headers(user_id=user_id)

    response = client.patch(
        "/api/v1/profile",
        json={"avatar_path": f"https://example.com/{user_id}/avatar.jpg"},
        headers=headers,
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_patch_profile_rejects_nested_or_traversal_avatar_path(client):
    user_id = uuid.uuid4()
    headers = auth_headers(user_id=user_id)

    for bad_path in (
        f"{user_id}/nested/avatar",
        f"../{user_id}/avatar",
        f"{user_id}/../other/avatar",
        f"{user_id}/avatar/../../secret",
    ):
        response = client.patch(
            "/api/v1/profile", json={"avatar_path": bad_path}, headers=headers
        )
        assert response.status_code == 422, bad_path
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_patch_profile_rejects_avatar_path_with_extension_or_query(client):
    user_id = uuid.uuid4()
    headers = auth_headers(user_id=user_id)

    for bad_path in (
        f"{user_id}/avatar.jpg",
        f"{user_id}/avatar.png",
        f"{user_id}/avatar?token=abc",
    ):
        response = client.patch(
            "/api/v1/profile", json={"avatar_path": bad_path}, headers=headers
        )
        assert response.status_code == 422, bad_path
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_two_account_isolation(client):
    user_a, user_b = uuid.uuid4(), uuid.uuid4()
    headers_a = {"Authorization": f"Bearer {make_token(user_a, 'alice@example.com')}"}
    headers_b = {"Authorization": f"Bearer {make_token(user_b, 'bob@example.com')}"}

    client.patch(
        "/api/v1/profile",
        json={"display_name": "Alice Only", "avatar_path": f"{user_a}/avatar"},
        headers=headers_a,
    )

    response_b = client.get("/api/v1/profile", headers=headers_b)
    assert response_b.status_code == 200
    assert response_b.json()["id"] == str(user_b)
    assert response_b.json()["avatar_path"] is None
    assert response_b.json()["display_name"] != "Alice Only"

    response_a = client.get("/api/v1/profile", headers=headers_a)
    assert response_a.json()["id"] == str(user_a)
    assert response_a.json()["display_name"] == "Alice Only"
