import uuid
from datetime import UTC, datetime

from .conftest import auth_headers

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


def _create_subtask(client, task_id, headers, **overrides):
    payload = {"title": "Draft outline"}
    payload.update(overrides)
    return client.post(f"/api/v1/tasks/{task_id}/subtasks", json=payload, headers=headers)


# --- authentication ---


def test_create_subtask_requires_auth(client):
    task_id = _create_task(client)
    response = client.post(f"/api/v1/tasks/{task_id}/subtasks", json={"title": "x"})
    assert response.status_code == 401


def test_patch_subtask_requires_auth(client):
    response = client.patch(
        f"/api/v1/tasks/{uuid.uuid4()}/subtasks/{uuid.uuid4()}", json={"title": "x"}
    )
    assert response.status_code == 401


def test_delete_subtask_requires_auth(client):
    response = client.delete(f"/api/v1/tasks/{uuid.uuid4()}/subtasks/{uuid.uuid4()}")
    assert response.status_code == 401


# --- create ---


def test_create_subtask_success(client):
    headers = auth_headers()
    task_id = _create_task(client, headers)
    response = _create_subtask(client, task_id, headers, title="  Draft outline  ")
    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "Draft outline"
    assert body["is_complete"] is False
    assert "task_id" not in body
    assert "user_id" not in body


def test_create_subtask_rejects_blank_title(client):
    headers = auth_headers()
    task_id = _create_task(client, headers)
    response = _create_subtask(client, task_id, headers, title="   ")
    assert response.status_code == 422


def test_create_subtask_rejects_unknown_field(client):
    headers = auth_headers()
    task_id = _create_task(client, headers)
    response = _create_subtask(client, task_id, headers, bogus="x")
    assert response.status_code == 422


def test_create_subtask_nonexistent_task_returns_404(client):
    response = _create_subtask(client, uuid.uuid4(), auth_headers())
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_create_subtask_other_users_task_returns_404(client):
    owner_headers = auth_headers(email="owner@example.com")
    task_id = _create_task(client, owner_headers)
    intruder_headers = auth_headers(email="intruder@example.com")
    response = _create_subtask(client, task_id, intruder_headers)
    assert response.status_code == 404


# --- patch ---


def test_patch_subtask_title(client):
    headers = auth_headers()
    task_id = _create_task(client, headers)
    subtask_id = _create_subtask(client, task_id, headers).json()["id"]

    response = client.patch(
        f"/api/v1/tasks/{task_id}/subtasks/{subtask_id}",
        json={"title": "Finalize outline"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["title"] == "Finalize outline"


def test_patch_subtask_toggles_is_complete(client):
    headers = auth_headers()
    task_id = _create_task(client, headers)
    subtask_id = _create_subtask(client, task_id, headers).json()["id"]

    response = client.patch(
        f"/api/v1/tasks/{task_id}/subtasks/{subtask_id}",
        json={"is_complete": True},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["is_complete"] is True


def test_patch_subtask_rejects_empty_body(client):
    headers = auth_headers()
    task_id = _create_task(client, headers)
    subtask_id = _create_subtask(client, task_id, headers).json()["id"]

    response = client.patch(
        f"/api/v1/tasks/{task_id}/subtasks/{subtask_id}", json={}, headers=headers
    )
    assert response.status_code == 422


def test_patch_subtask_rejects_null_title(client):
    headers = auth_headers()
    task_id = _create_task(client, headers)
    subtask_id = _create_subtask(client, task_id, headers).json()["id"]

    response = client.patch(
        f"/api/v1/tasks/{task_id}/subtasks/{subtask_id}",
        json={"title": None},
        headers=headers,
    )
    assert response.status_code == 422


def test_patch_subtask_rejects_null_is_complete(client):
    headers = auth_headers()
    task_id = _create_task(client, headers)
    subtask_id = _create_subtask(client, task_id, headers).json()["id"]

    response = client.patch(
        f"/api/v1/tasks/{task_id}/subtasks/{subtask_id}",
        json={"is_complete": None},
        headers=headers,
    )
    assert response.status_code == 422


def test_patch_subtask_rejects_unknown_field(client):
    headers = auth_headers()
    task_id = _create_task(client, headers)
    subtask_id = _create_subtask(client, task_id, headers).json()["id"]

    response = client.patch(
        f"/api/v1/tasks/{task_id}/subtasks/{subtask_id}",
        json={"bogus": "x"},
        headers=headers,
    )
    assert response.status_code == 422


def test_patch_subtask_nonexistent_returns_404(client):
    headers = auth_headers()
    task_id = _create_task(client, headers)
    response = client.patch(
        f"/api/v1/tasks/{task_id}/subtasks/{uuid.uuid4()}",
        json={"title": "x"},
        headers=headers,
    )
    assert response.status_code == 404


def test_patch_subtask_mismatched_parent_returns_404(client):
    headers = auth_headers()
    task_a = _create_task(client, headers, title="Task A")
    task_b = _create_task(client, headers, title="Task B")
    subtask_id = _create_subtask(client, task_a, headers).json()["id"]

    response = client.patch(
        f"/api/v1/tasks/{task_b}/subtasks/{subtask_id}",
        json={"title": "x"},
        headers=headers,
    )
    assert response.status_code == 404


def test_patch_subtask_other_users_task_returns_404(client):
    owner_headers = auth_headers(email="owner@example.com")
    task_id = _create_task(client, owner_headers)
    subtask_id = _create_subtask(client, task_id, owner_headers).json()["id"]

    intruder_headers = auth_headers(email="intruder@example.com")
    response = client.patch(
        f"/api/v1/tasks/{task_id}/subtasks/{subtask_id}",
        json={"title": "x"},
        headers=intruder_headers,
    )
    assert response.status_code == 404


# --- delete ---


def test_delete_subtask_success(client):
    headers = auth_headers()
    task_id = _create_task(client, headers)
    subtask_id = _create_subtask(client, task_id, headers).json()["id"]

    response = client.delete(f"/api/v1/tasks/{task_id}/subtasks/{subtask_id}", headers=headers)
    assert response.status_code == 204

    again = client.delete(f"/api/v1/tasks/{task_id}/subtasks/{subtask_id}", headers=headers)
    assert again.status_code == 404


def test_delete_subtask_nonexistent_returns_404(client):
    headers = auth_headers()
    task_id = _create_task(client, headers)
    response = client.delete(
        f"/api/v1/tasks/{task_id}/subtasks/{uuid.uuid4()}", headers=headers
    )
    assert response.status_code == 404


def test_delete_subtask_mismatched_parent_returns_404(client):
    headers = auth_headers()
    task_a = _create_task(client, headers, title="Task A")
    task_b = _create_task(client, headers, title="Task B")
    subtask_id = _create_subtask(client, task_a, headers).json()["id"]

    response = client.delete(f"/api/v1/tasks/{task_b}/subtasks/{subtask_id}", headers=headers)
    assert response.status_code == 404


def test_delete_subtask_other_users_task_returns_404(client):
    owner_headers = auth_headers(email="owner@example.com")
    task_id = _create_task(client, owner_headers)
    subtask_id = _create_subtask(client, task_id, owner_headers).json()["id"]

    intruder_headers = auth_headers(email="intruder@example.com")
    response = client.delete(
        f"/api/v1/tasks/{task_id}/subtasks/{subtask_id}", headers=intruder_headers
    )
    assert response.status_code == 404
