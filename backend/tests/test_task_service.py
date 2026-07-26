"""Pure unit tests for app.services.task's private canonicalization
helper — no DB, no HTTP client — plus deterministic-time tests for
get_today_view (GET /tasks/today), which need a real (in-memory SQLite)
session so they use the shared `engine` fixture from conftest.py.

_as_utc_instant is subtle enough (SQLite's DateTime(timezone=True) not
reifying timezone on read) to warrant direct testing rather than only
being exercised indirectly through the API test suite.
"""
import uuid
from datetime import UTC, datetime, timedelta, timezone

from sqlmodel import Session

from app.models.task import Task
from app.services.task import _as_utc_instant, get_today_view


def test_as_utc_instant_treats_naive_as_utc():
    naive = datetime(2026, 8, 1, 12, 0)
    aware = datetime(2026, 8, 1, 12, 0, tzinfo=UTC)
    assert _as_utc_instant(naive) == _as_utc_instant(aware)


def test_as_utc_instant_normalizes_other_offsets():
    plus_six = timezone(timedelta(hours=6))
    local = datetime(2026, 8, 1, 18, 0, tzinfo=plus_six)  # == 12:00 UTC
    aware_utc = datetime(2026, 8, 1, 12, 0, tzinfo=UTC)
    assert _as_utc_instant(local) == _as_utc_instant(aware_utc)


def test_as_utc_instant_distinguishes_different_instants():
    a = datetime(2026, 8, 1, 12, 0, tzinfo=UTC)
    b = datetime(2026, 8, 1, 12, 1, tzinfo=UTC)
    assert _as_utc_instant(a) != _as_utc_instant(b)


# --- get_today_view: deterministic, fixed reference `now` ---

NOW = datetime(2026, 8, 1, 12, 0, tzinfo=UTC)


def _insert_task(engine, user_id, **kwargs):
    defaults = {
        "title": "Fixture Task",
        "type": "Assignment",
        "priority": "Medium",
        "deadline": NOW,
        "status": "Pending",
    }
    defaults.update(kwargs)
    with Session(engine) as session:
        task = Task(user_id=user_id, **defaults)
        session.add(task)
        session.commit()
        session.refresh(task)
        return task


def _today_view(engine, user_id, now=NOW):
    with Session(engine) as session:
        return get_today_view(session, user_id, now=now)


def test_overdue_boundary_now_minus_one_second(engine):
    owner_id = uuid.uuid4()
    task = _insert_task(engine, owner_id, deadline=NOW - timedelta(seconds=1))
    groups = _today_view(engine, owner_id)
    assert task.id in {t.id for t in groups["overdue"]}
    assert task.id not in {t.id for t in groups["due_soon"]}


def test_not_overdue_and_due_soon_at_exactly_now(engine):
    owner_id = uuid.uuid4()
    task = _insert_task(engine, owner_id, deadline=NOW)
    groups = _today_view(engine, owner_id)
    assert task.id not in {t.id for t in groups["overdue"]}
    assert task.id in {t.id for t in groups["due_soon"]}


def test_due_soon_includes_exactly_now_plus_72h(engine):
    owner_id = uuid.uuid4()
    task = _insert_task(engine, owner_id, deadline=NOW + timedelta(hours=72))
    groups = _today_view(engine, owner_id)
    assert task.id in {t.id for t in groups["due_soon"]}


def test_due_soon_excludes_now_plus_72h_plus_one_second(engine):
    owner_id = uuid.uuid4()
    task = _insert_task(engine, owner_id, deadline=NOW + timedelta(hours=72, seconds=1))
    groups = _today_view(engine, owner_id)
    assert task.id not in {t.id for t in groups["due_soon"]}
    assert task.id in {t.id for t in groups["pending"]}


def test_task_can_appear_in_multiple_groups(engine):
    owner_id = uuid.uuid4()
    task = _insert_task(engine, owner_id, deadline=NOW + timedelta(hours=1), priority="High")
    groups = _today_view(engine, owner_id)
    assert task.id in {t.id for t in groups["due_soon"]}
    assert task.id in {t.id for t in groups["pending"]}
    assert task.id in {t.id for t in groups["high_priority"]}
    assert task.id not in {t.id for t in groups["overdue"]}


def test_completed_tasks_excluded_from_all_groups(engine):
    owner_id = uuid.uuid4()
    _insert_task(
        engine, owner_id, status="Completed", deadline=NOW - timedelta(days=1), priority="High"
    )
    groups = _today_view(engine, owner_id)
    assert all(len(g) == 0 for g in groups.values())


def test_cancelled_tasks_excluded_from_all_groups(engine):
    owner_id = uuid.uuid4()
    _insert_task(
        engine, owner_id, status="Cancelled", deadline=NOW - timedelta(days=1), priority="High"
    )
    groups = _today_view(engine, owner_id)
    assert all(len(g) == 0 for g in groups.values())


def test_empty_groups_when_no_tasks(engine):
    groups = _today_view(engine, uuid.uuid4())
    assert groups == {"overdue": [], "due_soon": [], "pending": [], "high_priority": []}


def test_two_account_isolation(engine):
    owner_a = uuid.uuid4()
    owner_b = uuid.uuid4()
    _insert_task(engine, owner_a, title="Alice's Task")
    task_b = _insert_task(engine, owner_b, title="Bob's Task")

    groups = _today_view(engine, owner_b)
    assert {t.id for t in groups["pending"]} == {task_b.id}


def test_dst_straddling_utc_duration_window(engine):
    """Pure UTC arithmetic has no DST concept — this pins that down by
    choosing a reference instant during the week of a real US DST
    spring-forward (2026-03-08) and confirming the 72h window is still
    exactly 72h of UTC wall-clock, undisturbed by any local-calendar
    logic (there is none in get_today_view)."""
    owner_id = uuid.uuid4()
    straddling_now = datetime(2026, 3, 8, 6, 30, tzinfo=UTC)
    task = _insert_task(engine, owner_id, deadline=straddling_now + timedelta(hours=72))
    groups = _today_view(engine, owner_id, now=straddling_now)
    assert task.id in {t.id for t in groups["due_soon"]}


def test_groups_preserve_deadline_id_order(engine):
    owner_id = uuid.uuid4()
    d0 = NOW - timedelta(hours=2)
    d1 = NOW - timedelta(hours=1)
    early = _insert_task(engine, owner_id, deadline=d0)
    late = _insert_task(engine, owner_id, deadline=d1)
    groups = _today_view(engine, owner_id)
    assert [t.id for t in groups["pending"]] == [early.id, late.id]
    assert [t.id for t in groups["overdue"]] == [early.id, late.id]
