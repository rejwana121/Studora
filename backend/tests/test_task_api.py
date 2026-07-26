import uuid
from datetime import UTC, datetime, timedelta, timezone

import pytest
from sqlmodel import Session

from app.models.subtask import Subtask
from app.models.task import Task

from .conftest import auth_headers, make_token

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
    return client.post("/api/v1/tasks", json=payload, headers=headers)


def _create_subject(client, headers, **overrides):
    payload = {"name": "Physics", "color_token": "teal"}
    payload.update(overrides)
    return client.post("/api/v1/subjects", json=payload, headers=headers).json()["id"]


# --- authentication ---


def test_get_tasks_requires_auth(client):
    response = client.get("/api/v1/tasks")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_create_task_requires_auth(client):
    response = client.post(
        "/api/v1/tasks",
        json={
            "title": "x",
            "type": "Assignment",
            "deadline": DEFAULT_DEADLINE.isoformat(),
            "priority": "Medium",
        },
    )
    assert response.status_code == 401


def test_get_task_detail_requires_auth(client):
    response = client.get(f"/api/v1/tasks/{uuid.uuid4()}")
    assert response.status_code == 401


def test_patch_task_requires_auth(client):
    response = client.patch(f"/api/v1/tasks/{uuid.uuid4()}", json={"title": "New"})
    assert response.status_code == 401


def test_delete_task_requires_auth(client):
    response = client.delete(f"/api/v1/tasks/{uuid.uuid4()}")
    assert response.status_code == 401


# --- create ---


def test_create_task_success(client):
    response = _create_task(client)
    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "Read Chapter 3"
    assert body["status"] == "Pending"
    assert body["completed_at"] is None
    assert body["reschedule_count"] == 0
    assert body["subject_id"] is None
    assert body["subject"] is None


def test_create_task_with_subject_success(client):
    headers = auth_headers()
    subject_id = _create_subject(client, headers)
    response = _create_task(client, headers, subject_id=subject_id)
    assert response.status_code == 201
    body = response.json()
    assert body["subject_id"] == subject_id
    assert body["subject"]["id"] == subject_id
    assert body["subject"]["archived"] is False


def test_create_rejects_blank_title(client):
    response = _create_task(client, title="   ")
    assert response.status_code == 422


def test_create_rejects_invalid_type(client):
    response = _create_task(client, type="Homework")
    assert response.status_code == 422


def test_create_rejects_invalid_priority(client):
    response = _create_task(client, priority="Urgent")
    assert response.status_code == 422


def test_create_rejects_naive_deadline(client):
    headers = auth_headers()
    payload = {
        "title": "x",
        "type": "Assignment",
        "deadline": "2026-08-01T12:00:00",
        "priority": "Medium",
    }
    response = client.post("/api/v1/tasks", json=payload, headers=headers)
    assert response.status_code == 422


def test_create_rejects_extra_field(client):
    response = _create_task(client, bogus="x")
    assert response.status_code == 422


def test_create_rejects_unknown_subject_id(client):
    response = _create_task(client, subject_id=str(uuid.uuid4()))
    assert response.status_code == 422
    assert response.json()["error"]["field"] == "subject_id"


def test_create_rejects_other_users_subject_id(client):
    owner_headers = auth_headers(email="owner@example.com")
    subject_id = _create_subject(client, owner_headers)

    intruder_headers = {
        "Authorization": f"Bearer {make_token(uuid.uuid4(), 'intruder@example.com')}"
    }
    response = _create_task(client, intruder_headers, subject_id=subject_id)
    assert response.status_code == 422
    assert response.json()["error"]["field"] == "subject_id"


# --- list: filters ---


def test_list_filters_by_status(client):
    headers = auth_headers()
    pending_id = _create_task(client, headers, title="Pending Task").json()["id"]
    other_id = _create_task(client, headers, title="Other Task").json()["id"]
    client.patch(f"/api/v1/tasks/{other_id}", json={"status": "Completed"}, headers=headers)

    response = client.get("/api/v1/tasks", params={"status": "Pending"}, headers=headers)
    ids = {t["id"] for t in response.json()}
    assert pending_id in ids
    assert other_id not in ids


def test_list_filters_by_subject_id(client):
    headers = auth_headers()
    subject_id = _create_subject(client, headers)
    linked_id = _create_task(client, headers, title="Linked", subject_id=subject_id).json()["id"]
    unlinked_id = _create_task(client, headers, title="Unlinked").json()["id"]

    response = client.get("/api/v1/tasks", params={"subject_id": subject_id}, headers=headers)
    ids = {t["id"] for t in response.json()}
    assert linked_id in ids
    assert unlinked_id not in ids


def test_list_filters_by_type(client):
    headers = auth_headers()
    quiz_id = _create_task(client, headers, title="Quiz Task", type="Quiz").json()["id"]
    assignment_id = _create_task(client, headers, title="Assignment Task").json()["id"]

    response = client.get("/api/v1/tasks", params={"type": "Quiz"}, headers=headers)
    ids = {t["id"] for t in response.json()}
    assert quiz_id in ids
    assert assignment_id not in ids


def test_list_filters_by_due_before_and_after(client):
    headers = auth_headers()
    early_id = _create_task(
        client,
        headers,
        title="Early",
        deadline=(DEFAULT_DEADLINE - timedelta(days=10)).isoformat(),
    ).json()["id"]
    late_id = _create_task(
        client,
        headers,
        title="Late",
        deadline=(DEFAULT_DEADLINE + timedelta(days=10)).isoformat(),
    ).json()["id"]

    before_response = client.get(
        "/api/v1/tasks", params={"due_before": DEFAULT_DEADLINE.isoformat()}, headers=headers
    )
    before_ids = {t["id"] for t in before_response.json()}
    assert early_id in before_ids
    assert late_id not in before_ids

    after_response = client.get(
        "/api/v1/tasks", params={"due_after": DEFAULT_DEADLINE.isoformat()}, headers=headers
    )
    after_ids = {t["id"] for t in after_response.json()}
    assert late_id in after_ids
    assert early_id not in after_ids


def test_list_search_matches_title_case_insensitively(client):
    headers = auth_headers()
    match_id = _create_task(client, headers, title="Read Chapter Nine").json()["id"]
    other_id = _create_task(client, headers, title="Lab Report").json()["id"]

    response = client.get("/api/v1/tasks", params={"search": "chapter"}, headers=headers)
    ids = {t["id"] for t in response.json()}
    assert match_id in ids
    assert other_id not in ids


def test_list_rejects_unknown_query_param(client):
    response = client.get("/api/v1/tasks", params={"bogus": "1"}, headers=auth_headers())
    assert response.status_code == 422


def test_list_only_returns_own_tasks(client):
    user_a, user_b = uuid.uuid4(), uuid.uuid4()
    headers_a = {"Authorization": f"Bearer {make_token(user_a, 'alice@example.com')}"}
    headers_b = {"Authorization": f"Bearer {make_token(user_b, 'bob@example.com')}"}

    _create_task(client, headers_a, title="Alice's Task")
    _create_task(client, headers_b, title="Bob's Task")

    titles_a = {t["title"] for t in client.get("/api/v1/tasks", headers=headers_a).json()}
    assert titles_a == {"Alice's Task"}

    titles_b = {t["title"] for t in client.get("/api/v1/tasks", headers=headers_b).json()}
    assert titles_b == {"Bob's Task"}


# --- list: pagination ---


def test_list_default_limit_is_20(client):
    headers = auth_headers()
    for i in range(21):
        _create_task(client, headers, title=f"Task {i}")

    full = client.get("/api/v1/tasks", params={"limit": 100}, headers=headers).json()
    assert len(full) == 21

    default_page = client.get("/api/v1/tasks", headers=headers).json()
    assert len(default_page) == 20
    assert [t["id"] for t in default_page] == [t["id"] for t in full[:20]]


def test_list_pagination_offset(client):
    headers = auth_headers()
    for i in range(5):
        _create_task(client, headers, title=f"Task {i}")

    full = client.get("/api/v1/tasks", params={"limit": 100}, headers=headers).json()
    page = client.get(
        "/api/v1/tasks", params={"limit": 2, "offset": 2}, headers=headers
    ).json()
    assert [t["id"] for t in page] == [t["id"] for t in full[2:4]]


# --- list: sort — exact token/order/tiebreak chains ---
#
# Every fixture below is built so each tie is broken by one of the three
# approved keys before ever reaching the Task.id fallback, so expected
# order is fully deterministic and doesn't depend on random UUID ordering.


def _insert_task(engine, user_id, **kwargs):
    defaults = {
        "title": "Fixture Task",
        "type": "Assignment",
        "priority": "Medium",
        "deadline": DEFAULT_DEADLINE,
    }
    defaults.update(kwargs)
    with Session(engine) as session:
        task = Task(user_id=user_id, **defaults)
        session.add(task)
        session.commit()
        session.refresh(task)
        return task


def test_sort_deadline_tokens_exact_order(client, engine):
    owner_id = uuid.uuid4()
    headers = auth_headers(user_id=owner_id)
    d0 = datetime(2026, 9, 1, 12, 0, tzinfo=UTC)
    d1 = datetime(2026, 9, 2, 12, 0, tzinfo=UTC)
    t0 = datetime(2026, 1, 1, tzinfo=UTC)

    y = _insert_task(engine, owner_id, deadline=d0, priority="High", created_at=t0)
    w = _insert_task(
        engine, owner_id, deadline=d0, priority="High", created_at=t0 + timedelta(seconds=3)
    )
    x = _insert_task(
        engine, owner_id, deadline=d0, priority="Low", created_at=t0 + timedelta(seconds=1)
    )
    z = _insert_task(
        engine, owner_id, deadline=d1, priority="Medium", created_at=t0 + timedelta(seconds=2)
    )

    asc = client.get("/api/v1/tasks", params={"sort": "deadline_asc"}, headers=headers).json()
    assert [t["id"] for t in asc] == [str(y.id), str(w.id), str(x.id), str(z.id)]

    desc = client.get("/api/v1/tasks", params={"sort": "deadline_desc"}, headers=headers).json()
    assert [t["id"] for t in desc] == [str(z.id), str(y.id), str(w.id), str(x.id)]

    default = client.get("/api/v1/tasks", headers=headers).json()
    assert [t["id"] for t in default] == [t["id"] for t in asc]


def test_sort_priority_tokens_exact_order(client, engine):
    owner_id = uuid.uuid4()
    headers = auth_headers(user_id=owner_id)
    d0 = datetime(2026, 9, 1, 12, 0, tzinfo=UTC)
    d1 = datetime(2026, 9, 2, 12, 0, tzinfo=UTC)
    t0 = datetime(2026, 1, 1, tzinfo=UTC)

    p = _insert_task(engine, owner_id, priority="High", deadline=d1, created_at=t0)
    q = _insert_task(
        engine, owner_id, priority="High", deadline=d0, created_at=t0 + timedelta(seconds=1)
    )
    r = _insert_task(
        engine, owner_id, priority="High", deadline=d0, created_at=t0 + timedelta(seconds=2)
    )
    s = _insert_task(
        engine, owner_id, priority="Low", deadline=d0, created_at=t0 + timedelta(seconds=3)
    )

    asc = client.get("/api/v1/tasks", params={"sort": "priority_asc"}, headers=headers).json()
    assert [t["id"] for t in asc] == [str(s.id), str(q.id), str(r.id), str(p.id)]

    desc = client.get("/api/v1/tasks", params={"sort": "priority_desc"}, headers=headers).json()
    assert [t["id"] for t in desc] == [str(q.id), str(r.id), str(p.id), str(s.id)]


def test_sort_created_at_tokens_exact_order(client, engine):
    owner_id = uuid.uuid4()
    headers = auth_headers(user_id=owner_id)
    d0 = datetime(2026, 9, 1, 12, 0, tzinfo=UTC)
    d1 = datetime(2026, 9, 2, 12, 0, tzinfo=UTC)
    t0 = datetime(2026, 1, 1, tzinfo=UTC)

    early = _insert_task(
        engine, owner_id, created_at=t0 - timedelta(seconds=1), deadline=d0, priority="Low"
    )
    m = _insert_task(engine, owner_id, created_at=t0, deadline=d0, priority="Low")
    n = _insert_task(engine, owner_id, created_at=t0, deadline=d0, priority="High")
    o = _insert_task(engine, owner_id, created_at=t0, deadline=d1, priority="Medium")

    asc = client.get(
        "/api/v1/tasks", params={"sort": "created_at_asc"}, headers=headers
    ).json()
    assert [t["id"] for t in asc] == [str(early.id), str(n.id), str(m.id), str(o.id)]

    desc = client.get(
        "/api/v1/tasks", params={"sort": "created_at_desc"}, headers=headers
    ).json()
    assert [t["id"] for t in desc] == [str(n.id), str(m.id), str(o.id), str(early.id)]


def test_sort_rejects_invalid_value(client):
    response = client.get(
        "/api/v1/tasks", params={"sort": "bogus"}, headers=auth_headers()
    )
    assert response.status_code == 422


# --- detail ---


def test_get_task_detail_success(client):
    headers = auth_headers()
    task_id = _create_task(client, headers).json()["id"]
    response = client.get(f"/api/v1/tasks/{task_id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["id"] == task_id


def test_get_task_detail_includes_archived_subject_snapshot(client):
    headers = auth_headers()
    subject_id = _create_subject(client, headers)
    task_id = _create_task(client, headers, subject_id=subject_id).json()["id"]

    client.patch(f"/api/v1/subjects/{subject_id}", json={"archived": True}, headers=headers)

    response = client.get(f"/api/v1/tasks/{task_id}", headers=headers)
    body = response.json()
    assert body["subject_id"] == subject_id
    assert body["subject"]["archived"] is True


def test_get_task_detail_includes_subtasks_in_created_at_id_order(client, engine):
    owner_id = uuid.uuid4()
    headers = auth_headers(user_id=owner_id)
    task_id = _create_task(client, headers).json()["id"]

    t0 = datetime(2026, 7, 1, 12, 0, tzinfo=UTC)
    with Session(engine) as session:
        first = Subtask(task_id=uuid.UUID(task_id), user_id=owner_id, title="First", created_at=t0)
        # Same created_at as `first` — order between these two must be
        # decided by id, not by insertion order (same lesson as list
        # pagination elsewhere: never assume timestamp ties break in
        # creation order).
        second = Subtask(
            task_id=uuid.UUID(task_id), user_id=owner_id, title="Second", created_at=t0
        )
        third = Subtask(
            task_id=uuid.UUID(task_id),
            user_id=owner_id,
            title="Third",
            created_at=t0.replace(hour=13),
        )
        session.add_all([first, second, third])
        session.commit()
        ids_by_title = {first.title: first.id, second.title: second.id, third.title: third.id}

    response = client.get(f"/api/v1/tasks/{task_id}", headers=headers)
    assert response.status_code == 200
    titles = [s["title"] for s in response.json()["subtasks"]]
    expected_first_two = sorted(["First", "Second"], key=lambda title: ids_by_title[title])
    assert titles == [*expected_first_two, "Third"]


def test_get_task_detail_returns_empty_subtasks_list_when_none_exist(client):
    headers = auth_headers()
    task_id = _create_task(client, headers).json()["id"]
    response = client.get(f"/api/v1/tasks/{task_id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["subtasks"] == []


def test_get_task_detail_never_exposes_another_users_subtasks(client, engine):
    owner_headers = auth_headers(email="owner@example.com")
    task_id = _create_task(client, owner_headers).json()["id"]

    with Session(engine) as session:
        intruder_subtask = Subtask(
            task_id=uuid.UUID(task_id), user_id=uuid.uuid4(), title="Not yours"
        )
        session.add(intruder_subtask)
        session.commit()

    response = client.get(f"/api/v1/tasks/{task_id}", headers=owner_headers)
    assert response.status_code == 200
    assert response.json()["subtasks"] == []


def test_get_task_detail_nonexistent_returns_404(client):
    response = client.get(f"/api/v1/tasks/{uuid.uuid4()}", headers=auth_headers())
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_get_task_detail_other_users_task_returns_404(client):
    owner_headers = auth_headers(email="owner@example.com")
    task_id = _create_task(client, owner_headers).json()["id"]
    other_headers = {
        "Authorization": f"Bearer {make_token(uuid.uuid4(), 'intruder@example.com')}"
    }

    response = client.get(f"/api/v1/tasks/{task_id}", headers=other_headers)
    assert response.status_code == 404


# --- patch: basic edits ---


def test_patch_updates_plain_fields(client):
    headers = auth_headers()
    task_id = _create_task(client, headers).json()["id"]
    response = client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"title": "Updated Title", "notes": "Some notes", "priority": "High"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Updated Title"
    assert body["notes"] == "Some notes"
    assert body["priority"] == "High"


def test_patch_nonexistent_task_returns_404(client):
    response = client.patch(
        f"/api/v1/tasks/{uuid.uuid4()}", json={"title": "New"}, headers=auth_headers()
    )
    assert response.status_code == 404


def test_patch_other_users_task_returns_404(client):
    owner_headers = auth_headers(email="owner@example.com")
    task_id = _create_task(client, owner_headers).json()["id"]
    other_headers = {
        "Authorization": f"Bearer {make_token(uuid.uuid4(), 'intruder@example.com')}"
    }

    response = client.patch(
        f"/api/v1/tasks/{task_id}", json={"title": "Hijacked"}, headers=other_headers
    )
    assert response.status_code == 404


# --- patch: empty body / null semantics ---


def test_patch_rejects_empty_body(client):
    headers = auth_headers()
    task_id = _create_task(client, headers).json()["id"]
    response = client.patch(f"/api/v1/tasks/{task_id}", json={}, headers=headers)
    assert response.status_code == 422


@pytest.mark.parametrize("field", ["title", "type", "deadline", "priority", "status"])
def test_patch_rejects_explicit_null_for_non_nullable(client, field):
    headers = auth_headers()
    task_id = _create_task(client, headers).json()["id"]
    response = client.patch(f"/api/v1/tasks/{task_id}", json={field: None}, headers=headers)
    assert response.status_code == 422


def test_patch_allows_null_subject_id_to_unlink(client):
    headers = auth_headers()
    subject_id = _create_subject(client, headers)
    task_id = _create_task(client, headers, subject_id=subject_id).json()["id"]

    response = client.patch(
        f"/api/v1/tasks/{task_id}", json={"subject_id": None}, headers=headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["subject_id"] is None
    assert body["subject"] is None


def test_patch_allows_null_estimate_hours_to_clear(client):
    headers = auth_headers()
    task_id = _create_task(client, headers, estimate_hours=2.5).json()["id"]
    response = client.patch(
        f"/api/v1/tasks/{task_id}", json={"estimate_hours": None}, headers=headers
    )
    assert response.status_code == 200
    assert response.json()["estimate_hours"] is None


def test_patch_allows_null_notes_to_clear(client):
    headers = auth_headers()
    task_id = _create_task(client, headers, notes="Some notes").json()["id"]
    response = client.patch(f"/api/v1/tasks/{task_id}", json={"notes": None}, headers=headers)
    assert response.status_code == 200
    assert response.json()["notes"] is None


# --- patch: subject relinking ---


def test_patch_relink_to_valid_owned_subject(client):
    headers = auth_headers()
    subject_id = _create_subject(client, headers)
    task_id = _create_task(client, headers).json()["id"]

    response = client.patch(
        f"/api/v1/tasks/{task_id}", json={"subject_id": subject_id}, headers=headers
    )
    assert response.status_code == 200
    assert response.json()["subject_id"] == subject_id


def test_patch_relink_to_foreign_subject_rejected(client):
    owner_headers = auth_headers(email="owner@example.com")
    task_id = _create_task(client, owner_headers).json()["id"]

    intruder_headers = {
        "Authorization": f"Bearer {make_token(uuid.uuid4(), 'intruder@example.com')}"
    }
    other_subject_id = _create_subject(client, intruder_headers, name="Chemistry")

    response = client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"subject_id": other_subject_id},
        headers=owner_headers,
    )
    assert response.status_code == 422
    assert response.json()["error"]["field"] == "subject_id"


# --- patch: status transitions / completed_at ---


def test_patch_completing_sets_completed_at(client):
    headers = auth_headers()
    task_id = _create_task(client, headers).json()["id"]
    response = client.patch(
        f"/api/v1/tasks/{task_id}", json={"status": "Completed"}, headers=headers
    )
    assert response.status_code == 200
    assert response.json()["completed_at"] is not None


def test_patch_reopening_clears_completed_at(client):
    headers = auth_headers()
    task_id = _create_task(client, headers).json()["id"]
    client.patch(f"/api/v1/tasks/{task_id}", json={"status": "Completed"}, headers=headers)

    response = client.patch(
        f"/api/v1/tasks/{task_id}", json={"status": "Pending"}, headers=headers
    )
    assert response.status_code == 200
    assert response.json()["completed_at"] is None


def test_patch_cancelling_does_not_set_completed_at(client):
    headers = auth_headers()
    task_id = _create_task(client, headers).json()["id"]
    response = client.patch(
        f"/api/v1/tasks/{task_id}", json={"status": "Cancelled"}, headers=headers
    )
    assert response.status_code == 200
    assert response.json()["completed_at"] is None


# --- patch: reschedule_count / canonical instant comparison ---


def test_patch_same_deadline_different_offset_does_not_increment(client):
    headers = auth_headers()
    task_id = _create_task(client, headers).json()["id"]

    plus_six = timezone(timedelta(hours=6))
    same_instant_local = DEFAULT_DEADLINE.astimezone(plus_six)

    response = client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"deadline": same_instant_local.isoformat()},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["reschedule_count"] == 0


def test_patch_different_deadline_increments_exactly_once(client):
    headers = auth_headers()
    task_id = _create_task(client, headers).json()["id"]
    new_deadline = DEFAULT_DEADLINE + timedelta(days=1)

    first = client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"deadline": new_deadline.isoformat()},
        headers=headers,
    )
    assert first.status_code == 200
    assert first.json()["reschedule_count"] == 1

    second = client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"deadline": new_deadline.isoformat()},
        headers=headers,
    )
    assert second.status_code == 200
    assert second.json()["reschedule_count"] == 1


# --- delete ---


def test_delete_removes_task(client):
    headers = auth_headers()
    task_id = _create_task(client, headers).json()["id"]

    response = client.delete(f"/api/v1/tasks/{task_id}", headers=headers)
    assert response.status_code == 204

    follow_up = client.get(f"/api/v1/tasks/{task_id}", headers=headers)
    assert follow_up.status_code == 404


def test_delete_nonexistent_task_returns_404(client):
    response = client.delete(f"/api/v1/tasks/{uuid.uuid4()}", headers=auth_headers())
    assert response.status_code == 404


def test_delete_other_users_task_returns_404(client):
    owner_headers = auth_headers(email="owner@example.com")
    task_id = _create_task(client, owner_headers).json()["id"]
    other_headers = {
        "Authorization": f"Bearer {make_token(uuid.uuid4(), 'intruder@example.com')}"
    }

    response = client.delete(f"/api/v1/tasks/{task_id}", headers=other_headers)
    assert response.status_code == 404


def test_delete_cascades_to_subtasks(client, engine):
    owner_id = uuid.uuid4()
    headers = auth_headers(user_id=owner_id)
    task_id = _create_task(client, headers).json()["id"]

    with Session(engine) as session:
        subtask = Subtask(task_id=uuid.UUID(task_id), user_id=owner_id, title="Draft outline")
        session.add(subtask)
        session.commit()
        subtask_id = subtask.id

    client.delete(f"/api/v1/tasks/{task_id}", headers=headers)

    with Session(engine) as session:
        assert session.get(Subtask, subtask_id) is None
