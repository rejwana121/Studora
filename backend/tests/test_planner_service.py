"""Pure/service-level tests for app.services.planner — no HTTP client.

Covers: `_day_bounds_utc`'s local-midnight-to-UTC conversion (including a
half-hour-offset zone and both 2026 DST transition days for
America/New_York, without claiming any behavior for the unrelated
skipped-civil-date edge case), the defensive UTC fallback for a garbage
timezone name, `_query_window`'s two-account isolation, and the bounded
four-query proof (Checkpoint 4 design review, approved) showing the
service-layer SELECT count stays fixed as row counts increase.
"""
import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import event
from sqlmodel import Session

from app.models.study_block import StudyBlock
from app.models.subject import Subject
from app.models.task import Task
from app.services.planner import _day_bounds_utc, _query_window

# --- _day_bounds_utc: basic UTC zone ---


def test_day_bounds_utc_zone_is_local_midnight_to_next_midnight():
    start, end = _day_bounds_utc(date(2026, 6, 15), "UTC")
    assert start == datetime(2026, 6, 15, 0, 0, tzinfo=UTC)
    assert end == datetime(2026, 6, 16, 0, 0, tzinfo=UTC)
    assert end - start == timedelta(hours=24)


# --- _day_bounds_utc: half-hour/non-integer offset zone, no DST ---


def test_day_bounds_utc_half_hour_offset_zone():
    # Asia/Kolkata is a fixed UTC+05:30 offset year-round (no DST).
    start, end = _day_bounds_utc(date(2026, 6, 15), "Asia/Kolkata")
    assert start == datetime(2026, 6, 14, 18, 30, tzinfo=UTC)
    assert end == datetime(2026, 6, 15, 18, 30, tzinfo=UTC)
    assert end - start == timedelta(hours=24)


# --- _day_bounds_utc: DST transition days (America/New_York, 2026) ---
# Confirmed via zoneinfo directly: spring-forward transition lands on
# 2026-03-08 (offset changes at 2am local, -05:00 -> -04:00); fall-back
# lands on 2026-11-01 (-04:00 -> -05:00). Local midnight itself is never
# inside the skipped/repeated hour on either date, so both boundaries are
# unambiguous — only the resulting local day *length* changes.


def test_day_bounds_utc_normal_day_is_24_hours():
    start, end = _day_bounds_utc(date(2026, 6, 15), "America/New_York")
    assert end - start == timedelta(hours=24)


def test_day_bounds_utc_spring_forward_day_is_23_hours():
    start, end = _day_bounds_utc(date(2026, 3, 8), "America/New_York")
    assert end - start == timedelta(hours=23)


def test_day_bounds_utc_fall_back_day_is_25_hours():
    start, end = _day_bounds_utc(date(2026, 11, 1), "America/New_York")
    assert end - start == timedelta(hours=25)


# --- _day_bounds_utc: defensive fallback ---


def test_day_bounds_utc_falls_back_to_utc_for_invalid_timezone_name():
    start, end = _day_bounds_utc(date(2026, 6, 15), "Not/A_Real_Zone")
    assert start == datetime(2026, 6, 15, 0, 0, tzinfo=UTC)
    assert end == datetime(2026, 6, 16, 0, 0, tzinfo=UTC)


def test_day_bounds_utc_falls_back_to_utc_for_empty_string():
    start, end = _day_bounds_utc(date(2026, 6, 15), "")
    assert start == datetime(2026, 6, 15, 0, 0, tzinfo=UTC)


# --- _query_window: two-account isolation ---


def test_query_window_two_account_isolation(engine):
    owner_a = uuid.uuid4()
    owner_b = uuid.uuid4()
    window_start = datetime(2026, 6, 15, 0, 0, tzinfo=UTC)
    window_end = datetime(2026, 6, 16, 0, 0, tzinfo=UTC)

    with Session(engine) as session:
        session.add(
            Task(
                user_id=owner_a,
                title="A's task",
                type="Assignment",
                deadline=window_start + timedelta(hours=1),
                priority="Medium",
                status="Pending",
            )
        )
        session.add(
            Task(
                user_id=owner_b,
                title="B's task",
                type="Assignment",
                deadline=window_start + timedelta(hours=1),
                priority="Medium",
                status="Pending",
            )
        )
        session.commit()

        tasks, blocks, linked_tasks, subject_map = _query_window(
            session, owner_a, window_start, window_end
        )

    assert {t.title for t in tasks} == {"A's task"}
    assert blocks == []
    assert linked_tasks == {}
    assert subject_map == {}


# --- _query_window: bounded four-query plan ---


def _seed_linked_rows(session: Session, user_id: uuid.UUID, subject_id: uuid.UUID, count: int):
    window_start = datetime(2026, 6, 15, 0, 0, tzinfo=UTC)
    outside_window = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
    for i in range(count):
        deadline_task = Task(
            user_id=user_id,
            subject_id=subject_id,
            title=f"deadline-task-{i}",
            type="Assignment",
            deadline=window_start + timedelta(hours=1, minutes=i),
            priority="Medium",
            status="Pending",
        )
        linked_task = Task(
            user_id=user_id,
            subject_id=subject_id,
            title=f"linked-task-{i}",
            type="Assignment",
            deadline=outside_window,
            priority="Medium",
            status="Pending",
        )
        session.add(deadline_task)
        session.add(linked_task)
        session.flush()
        session.add(
            StudyBlock(
                user_id=user_id,
                task_id=linked_task.id,
                starts_at=window_start + timedelta(hours=2, minutes=i),
                ends_at=window_start + timedelta(hours=3, minutes=i),
            )
        )
    session.commit()


def _count_select_statements(engine, fn) -> int:
    statements: list[str] = []

    def _listener(conn, cursor, statement, parameters, context, executemany):
        if statement.strip().upper().startswith("SELECT"):
            statements.append(statement)

    event.listen(engine, "before_cursor_execute", _listener)
    try:
        fn()
    finally:
        event.remove(engine, "before_cursor_execute", _listener)
    return len(statements)


def test_query_window_select_count_bounded_as_rows_increase(engine):
    user_id = uuid.uuid4()
    window_start = datetime(2026, 6, 15, 0, 0, tzinfo=UTC)
    window_end = datetime(2026, 6, 16, 0, 0, tzinfo=UTC)

    with Session(engine) as session:
        subject = Subject(user_id=user_id, name="Physics", color_token="teal")
        session.add(subject)
        session.commit()
        session.refresh(subject)
        subject_id = subject.id

        counts = []
        for n in (2, 20):
            _seed_linked_rows(session, user_id, subject_id, n)

            def _run():
                _query_window(session, user_id, window_start, window_end)

            counts.append(_count_select_statements(engine, _run))

    assert counts[0] == counts[1]
    assert counts[0] <= 4
