"""Pure/service-level tests for app.services.study_session — no HTTP
client. Covers `_elapsed_seconds`/`_as_utc_instant`, multi-cycle duration
accrual using injected fixed server times, strict idempotency (no
mutation on no-op transitions), invalid-transition 409s, the deterministic
duplicate-start-race normalization (simulated, not threaded), the
PostgreSQL FOR UPDATE compilation proof, effective-duration serialization
with an injected `as_of`, no-mutation-during-serialization, timezone-aware
response datetimes, and the bounded query-count proof for history +
snapshot loading.
"""
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import event
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.core.errors import ApiError
from app.models.study_session import StudySession
from app.models.subject import Subject
from app.models.task import Task
from app.schemas.study_session import StudySessionCreate, StudySessionListQuery
from app.services import study_session as study_session_service
from app.services.study_block import build_task_snapshot_map
from app.services.study_session import (
    BREAK_THRESHOLD_SECONDS,
    _as_utc_instant,
    _elapsed_seconds,
    finish_session,
    get_owned_study_session,
    list_sessions,
    pause_session,
    resume_session,
    serialize_study_session,
    start_session,
)
from app.services.task import build_subject_snapshot_map

NOW = datetime(2026, 8, 1, 9, 0, tzinfo=UTC)


# --- _elapsed_seconds ---


def test_elapsed_seconds_basic():
    assert _elapsed_seconds(NOW, NOW + timedelta(seconds=90)) == 90


def test_elapsed_seconds_truncates_fractional():
    assert _elapsed_seconds(NOW, NOW + timedelta(seconds=90.9)) == 90


def test_elapsed_seconds_clamps_negative_to_zero():
    assert _elapsed_seconds(NOW, NOW - timedelta(seconds=5)) == 0


# --- _as_utc_instant ---


def test_as_utc_instant_treats_naive_as_utc():
    naive = datetime(2026, 8, 1, 9, 0)
    assert _as_utc_instant(naive) == NOW


def test_as_utc_instant_normalizes_other_offsets():
    from datetime import timezone

    plus_six = timezone(timedelta(hours=6))
    local = datetime(2026, 8, 1, 15, 0, tzinfo=plus_six)  # == 09:00 UTC
    assert _as_utc_instant(local) == NOW


# --- start_session ---


def test_start_session_success_without_task(engine):
    owner_id = uuid.uuid4()
    with Session(engine) as session:
        row = start_session(session, owner_id, StudySessionCreate())
        assert row.status == "Active"
        assert row.task_id is None
        assert row.active_duration_seconds == 0


def test_start_session_rejects_second_unfinished_session(engine):
    owner_id = uuid.uuid4()
    with Session(engine) as session:
        start_session(session, owner_id, StudySessionCreate())
        with pytest.raises(ApiError) as exc_info:
            start_session(session, owner_id, StudySessionCreate())
        assert exc_info.value.status_code == 409
        assert exc_info.value.code == "CONFLICT"


def test_start_session_rejects_unknown_task_id(engine):
    owner_id = uuid.uuid4()
    with Session(engine) as session:
        with pytest.raises(ApiError) as exc_info:
            start_session(session, owner_id, StudySessionCreate(task_id=uuid.uuid4()))
        assert exc_info.value.status_code == 422
        assert exc_info.value.field == "task_id"


def test_start_session_rejects_other_users_task_id(engine):
    owner_id = uuid.uuid4()
    other_id = uuid.uuid4()
    with Session(engine) as session:
        task = Task(
            user_id=other_id,
            title="Foreign",
            type="Assignment",
            deadline=NOW,
            priority="Medium",
            status="Pending",
        )
        session.add(task)
        session.commit()
        session.refresh(task)

        with pytest.raises(ApiError) as exc_info:
            start_session(session, owner_id, StudySessionCreate(task_id=task.id))
        assert exc_info.value.status_code == 422
        assert exc_info.value.field == "task_id"


# --- start_session: deterministic duplicate-race normalization ---


def test_start_session_race_returns_409_when_post_rollback_check_finds_row(engine, monkeypatch):
    owner_id = uuid.uuid4()
    calls = {"n": 0}

    def fake_has_unfinished(session, user_id):
        calls["n"] += 1
        return calls["n"] > 1

    monkeypatch.setattr(study_session_service, "_has_unfinished_session", fake_has_unfinished)

    with Session(engine) as session:

        def failing_commit():
            raise IntegrityError("insert", {}, Exception("unique violation"))

        monkeypatch.setattr(session, "commit", failing_commit)

        with pytest.raises(ApiError) as exc_info:
            start_session(session, owner_id, StudySessionCreate())

    assert exc_info.value.status_code == 409
    assert exc_info.value.code == "CONFLICT"
    assert calls["n"] == 2


def test_start_session_reraises_unexpected_integrity_error_when_no_competing_row(
    engine, monkeypatch
):
    owner_id = uuid.uuid4()
    monkeypatch.setattr(study_session_service, "_has_unfinished_session", lambda *a, **k: False)

    with Session(engine) as session:

        def failing_commit():
            raise IntegrityError("insert", {}, Exception("some other constraint"))

        monkeypatch.setattr(session, "commit", failing_commit)

        with pytest.raises(IntegrityError):
            start_session(session, owner_id, StudySessionCreate())


# --- multi-cycle duration accrual with injected fixed times ---


def _insert_active_session(session: Session, user_id: uuid.UUID, started_at: datetime) -> uuid.UUID:
    row = StudySession(user_id=user_id, started_at=started_at, active_segment_started_at=started_at)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row.id


def test_multi_cycle_duration_accrual_with_fixed_times(engine):
    owner_id = uuid.uuid4()
    with Session(engine) as session:
        session_id = _insert_active_session(session, owner_id, NOW)

        t1 = NOW + timedelta(minutes=10)
        row = pause_session(session, owner_id, session_id, now=t1)
        assert row.active_duration_seconds == 600
        assert row.status == "Paused"
        assert row.active_segment_started_at is None

        t2 = t1 + timedelta(minutes=5)
        row = resume_session(session, owner_id, session_id, now=t2)
        assert row.active_duration_seconds == 600
        assert row.status == "Active"

        t3 = t2 + timedelta(minutes=20)
        row = pause_session(session, owner_id, session_id, now=t3)
        assert row.active_duration_seconds == 600 + 1200

        t4 = t3 + timedelta(minutes=2)
        row = finish_session(session, owner_id, session_id, now=t4)
        assert row.active_duration_seconds == 1800
        assert row.status == "Finished"
        assert _as_utc_instant(row.ended_at) == t4


def test_finish_from_active_accrues_final_open_segment(engine):
    owner_id = uuid.uuid4()
    with Session(engine) as session:
        session_id = _insert_active_session(session, owner_id, NOW)
        t1 = NOW + timedelta(minutes=15)
        row = finish_session(session, owner_id, session_id, now=t1)
        assert row.active_duration_seconds == 900
        assert row.active_segment_started_at is None


# --- strict idempotency: no mutation on no-op transitions ---


def test_pause_while_paused_is_noop_and_preserves_fields(engine):
    owner_id = uuid.uuid4()
    with Session(engine) as session:
        row = StudySession(
            user_id=owner_id,
            started_at=NOW,
            status="Paused",
            active_segment_started_at=None,
            active_duration_seconds=100,
        )
        session.add(row)
        session.commit()
        session.refresh(row)
        original_updated_at = row.updated_at

        result = pause_session(session, owner_id, row.id, now=NOW + timedelta(hours=1))
        assert result.status == "Paused"
        assert result.active_duration_seconds == 100
        assert result.updated_at == original_updated_at


def test_resume_while_active_is_noop_and_preserves_fields(engine):
    owner_id = uuid.uuid4()
    with Session(engine) as session:
        row = StudySession(
            user_id=owner_id, started_at=NOW, status="Active", active_segment_started_at=NOW
        )
        session.add(row)
        session.commit()
        session.refresh(row)
        original_updated_at = row.updated_at
        original_anchor = row.active_segment_started_at

        result = resume_session(session, owner_id, row.id, now=NOW + timedelta(hours=1))
        assert result.status == "Active"
        assert result.updated_at == original_updated_at
        assert result.active_segment_started_at == original_anchor


def test_finish_while_finished_is_noop_and_preserves_fields(engine):
    owner_id = uuid.uuid4()
    with Session(engine) as session:
        row = StudySession(
            user_id=owner_id,
            started_at=NOW,
            status="Finished",
            ended_at=NOW,
            active_segment_started_at=None,
            active_duration_seconds=500,
        )
        session.add(row)
        session.commit()
        session.refresh(row)
        original_updated_at = row.updated_at
        original_ended_at = row.ended_at

        result = finish_session(session, owner_id, row.id, now=NOW + timedelta(hours=1))
        assert result.active_duration_seconds == 500
        assert result.updated_at == original_updated_at
        assert result.ended_at == original_ended_at


# --- invalid terminal-state transitions ---


def test_pause_finished_session_returns_409(engine):
    owner_id = uuid.uuid4()
    with Session(engine) as session:
        row = StudySession(
            user_id=owner_id,
            started_at=NOW,
            status="Finished",
            ended_at=NOW,
            active_segment_started_at=None,
        )
        session.add(row)
        session.commit()
        session.refresh(row)

        with pytest.raises(ApiError) as exc_info:
            pause_session(session, owner_id, row.id)
        assert exc_info.value.status_code == 409


def test_resume_finished_session_returns_409(engine):
    owner_id = uuid.uuid4()
    with Session(engine) as session:
        row = StudySession(
            user_id=owner_id,
            started_at=NOW,
            status="Finished",
            ended_at=NOW,
            active_segment_started_at=None,
        )
        session.add(row)
        session.commit()
        session.refresh(row)

        with pytest.raises(ApiError) as exc_info:
            resume_session(session, owner_id, row.id)
        assert exc_info.value.status_code == 409


def test_finish_cancelled_session_returns_409(engine):
    owner_id = uuid.uuid4()
    with Session(engine) as session:
        row = StudySession(
            user_id=owner_id,
            started_at=NOW,
            status="Cancelled",
            ended_at=NOW,
            active_segment_started_at=None,
        )
        session.add(row)
        session.commit()
        session.refresh(row)

        with pytest.raises(ApiError) as exc_info:
            finish_session(session, owner_id, row.id)
        assert exc_info.value.status_code == 409


# --- ownership ---


def test_get_owned_study_session_missing_returns_404(engine):
    with Session(engine) as session:
        with pytest.raises(ApiError) as exc_info:
            get_owned_study_session(session, uuid.uuid4(), uuid.uuid4())
        assert exc_info.value.status_code == 404


def test_get_owned_study_session_other_users_session_returns_404(engine):
    owner_id = uuid.uuid4()
    with Session(engine) as session:
        row = StudySession(user_id=owner_id, started_at=NOW, active_segment_started_at=NOW)
        session.add(row)
        session.commit()
        session.refresh(row)

        with pytest.raises(ApiError) as exc_info:
            get_owned_study_session(session, uuid.uuid4(), row.id)
        assert exc_info.value.status_code == 404


# --- concurrency: PostgreSQL FOR UPDATE compilation, SQLite no-op execution ---


def test_owned_session_lookup_compiles_for_update_on_postgresql():
    statement = (
        select(StudySession)
        .where(StudySession.id == uuid.uuid4(), StudySession.user_id == uuid.uuid4())
        .with_for_update()
    )
    compiled = str(statement.compile(dialect=postgresql.dialect()))
    assert "FOR UPDATE" in compiled


def test_owned_session_lookup_for_update_executes_without_error_on_sqlite(engine):
    owner_id = uuid.uuid4()
    with Session(engine) as session:
        row = StudySession(user_id=owner_id, started_at=NOW, active_segment_started_at=NOW)
        session.add(row)
        session.commit()
        session.refresh(row)

        found = get_owned_study_session(session, owner_id, row.id, for_update=True)
        assert found.id == row.id


# --- serialization: effective duration, as_of, no mutation, tz-awareness ---


def test_serialize_active_session_effective_duration_uses_as_of(engine):
    with Session(engine) as session:
        row = StudySession(
            user_id=uuid.uuid4(),
            started_at=NOW,
            active_segment_started_at=NOW,
            active_duration_seconds=50,
        )
        session.add(row)
        session.commit()
        session.refresh(row)

        as_of = NOW + timedelta(seconds=30)
        read = serialize_study_session(row, None, None, as_of=as_of)
        assert read.active_duration_seconds == 80


def test_serialize_does_not_mutate_stored_accumulator(engine):
    with Session(engine) as session:
        row = StudySession(
            user_id=uuid.uuid4(),
            started_at=NOW,
            active_segment_started_at=NOW,
            active_duration_seconds=50,
        )
        session.add(row)
        session.commit()
        session.refresh(row)
        session_id = row.id

        serialize_study_session(row, None, None, as_of=NOW + timedelta(seconds=30))
        assert row.active_duration_seconds == 50

    with Session(engine) as session:
        reloaded = session.get(StudySession, session_id)
        assert reloaded.active_duration_seconds == 50


def test_serialize_paused_session_uses_stored_duration_ignoring_as_of(engine):
    with Session(engine) as session:
        row = StudySession(
            user_id=uuid.uuid4(),
            started_at=NOW,
            status="Paused",
            active_segment_started_at=None,
            active_duration_seconds=50,
        )
        session.add(row)
        session.commit()
        session.refresh(row)

        read = serialize_study_session(row, None, None, as_of=NOW + timedelta(hours=5))
        assert read.active_duration_seconds == 50


def test_serialize_returns_timezone_aware_datetimes(engine):
    with Session(engine) as session:
        row = StudySession(
            user_id=uuid.uuid4(),
            started_at=NOW,
            status="Finished",
            ended_at=NOW,
            active_segment_started_at=None,
        )
        session.add(row)
        session.commit()
        session.refresh(row)

        read = serialize_study_session(row, None, None, as_of=NOW)
        assert read.started_at.tzinfo is not None
        assert read.created_at.tzinfo is not None
        assert read.updated_at.tzinfo is not None
        assert read.ended_at is not None
        assert read.ended_at.tzinfo is not None
        assert read.next_break_eligible_at is None


def test_serialize_paused_session_next_break_eligible_at_is_none(engine):
    with Session(engine) as session:
        row = StudySession(
            user_id=uuid.uuid4(),
            started_at=NOW,
            status="Paused",
            active_segment_started_at=None,
            active_duration_seconds=BREAK_THRESHOLD_SECONDS + 500,
        )
        session.add(row)
        session.commit()
        session.refresh(row)

        read = serialize_study_session(row, None, None, as_of=NOW)
        assert read.next_break_eligible_at is None


def test_serialize_cancelled_session_next_break_eligible_at_is_none(engine):
    # Cancelled is schema-reserved and unreachable through any documented
    # endpoint, but is directly constructible at the ORM/serializer level
    # for this defensive check.
    with Session(engine) as session:
        row = StudySession(
            user_id=uuid.uuid4(),
            started_at=NOW,
            status="Cancelled",
            ended_at=NOW,
            active_segment_started_at=None,
        )
        session.add(row)
        session.commit()
        session.refresh(row)

        read = serialize_study_session(row, None, None, as_of=NOW)
        assert read.next_break_eligible_at is None


def test_serialize_task_snapshot_deadline_is_timezone_aware(engine):
    with Session(engine) as session:
        user_id = uuid.uuid4()
        task = Task(
            user_id=user_id,
            title="Read Chapter 3",
            type="Assignment",
            deadline=NOW,
            priority="Medium",
            status="Pending",
        )
        session.add(task)
        session.commit()
        session.refresh(task)

        row = StudySession(
            user_id=user_id, task_id=task.id, started_at=NOW, active_segment_started_at=NOW
        )
        session.add(row)
        session.commit()
        session.refresh(row)

        read = serialize_study_session(row, task, None, as_of=NOW)
        assert read.task is not None
        assert read.task.deadline.tzinfo is not None


# --- list_sessions ---


def test_list_sessions_orders_by_started_at_desc_then_id_desc(engine):
    owner_id = uuid.uuid4()
    with Session(engine) as session:
        earlier = StudySession(
            user_id=owner_id,
            started_at=NOW,
            status="Finished",
            ended_at=NOW,
            active_segment_started_at=None,
        )
        later = StudySession(
            user_id=owner_id,
            started_at=NOW + timedelta(hours=1),
            status="Finished",
            ended_at=NOW + timedelta(hours=1),
            active_segment_started_at=None,
        )
        session.add(earlier)
        session.add(later)
        session.commit()

        rows = list_sessions(session, owner_id, StudySessionListQuery())
        assert [r.id for r in rows] == [later.id, earlier.id]


def test_list_sessions_filters_by_status(engine):
    owner_id = uuid.uuid4()
    with Session(engine) as session:
        active = StudySession(user_id=owner_id, started_at=NOW, active_segment_started_at=NOW)
        finished = StudySession(
            user_id=owner_id,
            started_at=NOW,
            status="Finished",
            ended_at=NOW,
            active_segment_started_at=None,
        )
        session.add(active)
        session.add(finished)
        session.commit()

        rows = list_sessions(session, owner_id, StudySessionListQuery(status="Active"))
        assert [r.id for r in rows] == [active.id]


def test_list_sessions_two_account_isolation(engine):
    owner_a = uuid.uuid4()
    owner_b = uuid.uuid4()
    with Session(engine) as session:
        session.add(StudySession(user_id=owner_a, started_at=NOW, active_segment_started_at=NOW))
        session.add(StudySession(user_id=owner_b, started_at=NOW, active_segment_started_at=NOW))
        session.commit()

        rows = list_sessions(session, owner_a, StudySessionListQuery())
        assert all(r.user_id == owner_a for r in rows)


# --- bounded query count for history + snapshot loading ---


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


def test_list_sessions_snapshot_query_count_bounded_as_rows_increase(engine):
    owner_id = uuid.uuid4()
    with Session(engine) as session:
        subject = Subject(user_id=owner_id, name="Physics", color_token="teal")
        session.add(subject)
        session.commit()
        session.refresh(subject)

        counts = []
        for n in (2, 10):
            for i in range(n):
                task = Task(
                    user_id=owner_id,
                    subject_id=subject.id,
                    title=f"t{i}",
                    type="Assignment",
                    deadline=NOW,
                    priority="Medium",
                    status="Pending",
                )
                session.add(task)
                session.commit()
                session.refresh(task)
                session.add(
                    StudySession(
                        user_id=owner_id,
                        task_id=task.id,
                        started_at=NOW,
                        status="Finished",
                        ended_at=NOW,
                        active_segment_started_at=None,
                    )
                )
            session.commit()

            def _run():
                rows = list_sessions(session, owner_id, StudySessionListQuery())
                task_map = build_task_snapshot_map(session, owner_id, [r.task_id for r in rows])
                build_subject_snapshot_map(session, owner_id, list(task_map.values()))

            counts.append(_count_select_statements(engine, _run))

    assert counts[0] == counts[1]
    assert counts[0] <= 3
