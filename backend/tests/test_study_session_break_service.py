"""Service-level tests for Phase 5 Checkpoint 6 — break-prompt
eligibility (`_compute_break_eligible`/`serialize_study_session_for_response`)
and `record_break_action` (TakeBreak/Snooze/Dismiss). No HTTP client;
same fixed-injected-time pattern as test_study_session_service.py.
"""
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.core.errors import ApiError
from app.models.study_session import StudySession
from app.models.study_session_break import StudySessionBreak
from app.schemas.study_session import StudySessionRead
from app.schemas.study_session_break import StudySessionBreakCreate
from app.services.study_session import (
    BREAK_THRESHOLD_SECONDS,
    DEFAULT_SNOOZE_MINUTES,
    _latest_break_event,
    record_break_action,
    resume_session,
    serialize_break_event,
    serialize_study_session_for_response,
)

NOW = datetime(2026, 8, 1, 9, 0, tzinfo=UTC)


def _insert_active_session(
    session: Session,
    user_id: uuid.UUID,
    *,
    active_duration_seconds: int = 0,
    baseline: int | None = None,
    break_taken: bool = False,
    status: str = "Active",
    active_segment_started_at: datetime | None = NOW,
) -> StudySession:
    row = StudySession(
        user_id=user_id,
        started_at=NOW,
        status=status,
        active_segment_started_at=active_segment_started_at,
        active_duration_seconds=active_duration_seconds,
        break_taken=break_taken,
        active_duration_seconds_at_last_break=baseline,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def _insert_break(
    session: Session,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    action: str,
    prompted_at: datetime,
    duration_minutes: int | None = None,
    id: uuid.UUID | None = None,
) -> StudySessionBreak:
    row = StudySessionBreak(
        id=id if id is not None else uuid.uuid4(),
        session_id=session_id,
        user_id=user_id,
        prompted_at=prompted_at,
        action=action,
        duration_minutes=duration_minutes,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


# --- eligibility: threshold boundaries (first cycle, no break yet) ---


@pytest.mark.parametrize(
    "active_duration_seconds,expected",
    [
        (BREAK_THRESHOLD_SECONDS - 1, False),
        (BREAK_THRESHOLD_SECONDS, True),
        (BREAK_THRESHOLD_SECONDS + 1, True),
    ],
)
def test_eligibility_threshold_boundaries_first_cycle(engine, active_duration_seconds, expected):
    owner_id = uuid.uuid4()
    with Session(engine) as session:
        row = _insert_active_session(
            session, owner_id, active_duration_seconds=active_duration_seconds
        )
        read = serialize_study_session_for_response(session, row, None, None, as_of=NOW)
        assert read.break_eligible is expected
        if expected:
            # Checkpoint 9A: already eligible -> equals this response's as_of.
            assert read.next_break_eligible_at == NOW
        else:
            remaining = BREAK_THRESHOLD_SECONDS - active_duration_seconds
            assert read.next_break_eligible_at == NOW + timedelta(seconds=remaining)


# --- eligibility: threshold boundaries relative to a non-zero baseline (repeated cycle) ---


@pytest.mark.parametrize(
    "offset,expected",
    [
        (BREAK_THRESHOLD_SECONDS - 1, False),
        (BREAK_THRESHOLD_SECONDS, True),
        (BREAK_THRESHOLD_SECONDS + 1, True),
    ],
)
def test_eligibility_threshold_boundaries_relative_to_baseline(engine, offset, expected):
    owner_id = uuid.uuid4()
    baseline = 1000
    with Session(engine) as session:
        row = _insert_active_session(
            session,
            owner_id,
            active_duration_seconds=baseline + offset,
            baseline=baseline,
            break_taken=True,
        )
        read = serialize_study_session_for_response(session, row, None, None, as_of=NOW)
        assert read.break_eligible is expected
        if expected:
            assert read.next_break_eligible_at == NOW
        else:
            remaining = BREAK_THRESHOLD_SECONDS - offset
            assert read.next_break_eligible_at == NOW + timedelta(seconds=remaining)


def test_next_break_eligible_at_stable_across_repeated_serialization_below_threshold(engine):
    """Checkpoint 9A stability requirement: while an Active session
    remains below threshold and no state changes, serializing at two
    later as_of instants must return the SAME absolute
    next_break_eligible_at — required so mobile notification scheduling
    does not churn on every 30s reconciliation poll."""
    owner_id = uuid.uuid4()
    with Session(engine) as session:
        row = _insert_active_session(session, owner_id, active_duration_seconds=100)

        first = serialize_study_session_for_response(session, row, None, None, as_of=NOW)
        second = serialize_study_session_for_response(
            session, row, None, None, as_of=NOW + timedelta(seconds=30)
        )

        assert first.next_break_eligible_at is not None
        assert first.next_break_eligible_at == second.next_break_eligible_at


def test_eligibility_false_for_paused_session_even_past_threshold(engine):
    owner_id = uuid.uuid4()
    with Session(engine) as session:
        row = _insert_active_session(
            session,
            owner_id,
            active_duration_seconds=BREAK_THRESHOLD_SECONDS + 500,
            status="Paused",
            active_segment_started_at=None,
        )
        read = serialize_study_session_for_response(session, row, None, None, as_of=NOW)
        assert read.break_eligible is False
        assert read.next_break_eligible_at is None


# --- record_break_action: TakeBreak ---


def test_take_break_pauses_session_and_sets_baseline(engine):
    owner_id = uuid.uuid4()
    with Session(engine) as session:
        row = _insert_active_session(session, owner_id, active_duration_seconds=0)
        t1 = NOW + timedelta(seconds=BREAK_THRESHOLD_SECONDS)

        updated, break_event = record_break_action(
            session, owner_id, row.id, StudySessionBreakCreate(action="TakeBreak"), now=t1
        )

        assert updated.status == "Paused"
        assert updated.break_taken is True
        assert updated.active_duration_seconds == BREAK_THRESHOLD_SECONDS
        assert updated.active_duration_seconds_at_last_break == BREAK_THRESHOLD_SECONDS
        assert updated.active_segment_started_at is None
        assert break_event.action == "TakeBreak"
        assert break_event.session_id == row.id

        read = serialize_study_session_for_response(session, updated, None, None, as_of=t1)
        assert read.next_break_eligible_at is None


def test_two_full_take_break_cycles_advance_baseline_each_time(engine):
    owner_id = uuid.uuid4()
    with Session(engine) as session:
        row = _insert_active_session(session, owner_id, active_duration_seconds=0)

        t1 = NOW + timedelta(seconds=BREAK_THRESHOLD_SECONDS)
        updated, _ = record_break_action(
            session, owner_id, row.id, StudySessionBreakCreate(action="TakeBreak"), now=t1
        )
        assert updated.active_duration_seconds_at_last_break == BREAK_THRESHOLD_SECONDS

        t2 = t1 + timedelta(seconds=10)
        resumed = resume_session(session, owner_id, row.id, now=t2)
        assert resumed.status == "Active"

        # Not yet eligible again immediately after resume.
        read = serialize_study_session_for_response(session, resumed, None, None, as_of=t2)
        assert read.break_eligible is False
        # Checkpoint 9A: the new cycle's next_break_eligible_at uses the
        # STORED baseline from the first TakeBreak (BREAK_THRESHOLD_SECONDS),
        # not zero — it must count a full threshold forward from that
        # baseline, landing BREAK_THRESHOLD_SECONDS after t2.
        assert read.next_break_eligible_at == t2 + timedelta(seconds=BREAK_THRESHOLD_SECONDS)

        t3 = t2 + timedelta(seconds=BREAK_THRESHOLD_SECONDS)
        updated2, _ = record_break_action(
            session, owner_id, row.id, StudySessionBreakCreate(action="TakeBreak"), now=t3
        )
        assert updated2.active_duration_seconds_at_last_break == BREAK_THRESHOLD_SECONDS * 2
        assert updated2.active_duration_seconds == BREAK_THRESHOLD_SECONDS * 2


def test_take_break_on_paused_session_returns_409(engine):
    owner_id = uuid.uuid4()
    with Session(engine) as session:
        row = _insert_active_session(
            session, owner_id, status="Paused", active_segment_started_at=None
        )
        with pytest.raises(ApiError) as exc_info:
            record_break_action(
                session, owner_id, row.id, StudySessionBreakCreate(action="TakeBreak")
            )
        assert exc_info.value.status_code == 409


# --- record_break_action: Snooze / Dismiss leave the session unchanged ---


@pytest.mark.parametrize("action", ["Snooze", "Dismiss"])
def test_snooze_and_dismiss_leave_session_active_and_unmutated(engine, action):
    owner_id = uuid.uuid4()
    with Session(engine) as session:
        row = _insert_active_session(session, owner_id, active_duration_seconds=100)
        data = StudySessionBreakCreate(action=action)

        updated, break_event = record_break_action(session, owner_id, row.id, data, now=NOW)

        assert updated.status == "Active"
        assert updated.break_taken is False
        assert updated.active_duration_seconds_at_last_break is None
        assert updated.active_duration_seconds == 100
        assert break_event.action == action
        assert break_event.duration_minutes is None


def test_snooze_with_explicit_duration_is_persisted(engine):
    owner_id = uuid.uuid4()
    with Session(engine) as session:
        row = _insert_active_session(session, owner_id)
        _, break_event = record_break_action(
            session,
            owner_id,
            row.id,
            StudySessionBreakCreate(action="Snooze", duration_minutes=15),
            now=NOW,
        )
        assert break_event.duration_minutes == 15


# --- suppression window: Snooze/Dismiss narrow an already-eligible session ---


def test_snooze_suppresses_eligibility_for_its_duration_then_expires(engine):
    owner_id = uuid.uuid4()
    with Session(engine) as session:
        row = _insert_active_session(
            session, owner_id, active_duration_seconds=BREAK_THRESHOLD_SECONDS
        )
        record_break_action(
            session,
            owner_id,
            row.id,
            StudySessionBreakCreate(action="Snooze", duration_minutes=10),
            now=NOW,
        )

        suppress_until = NOW + timedelta(minutes=10)

        just_inside = suppress_until - timedelta(seconds=1)
        read = serialize_study_session_for_response(session, row, None, None, as_of=just_inside)
        assert read.break_eligible is False
        assert read.next_break_eligible_at == suppress_until

        # Stability: two distinct, later reads still inside the
        # suppression window must both return the identical
        # suppression-expiry instant.
        for later_as_of in (NOW + timedelta(minutes=2), NOW + timedelta(minutes=5)):
            read_again = serialize_study_session_for_response(
                session, row, None, None, as_of=later_as_of
            )
            assert read_again.next_break_eligible_at == suppress_until

        at_boundary = NOW + timedelta(minutes=10)
        read = serialize_study_session_for_response(session, row, None, None, as_of=at_boundary)
        assert read.break_eligible is True
        assert read.next_break_eligible_at == at_boundary


def test_dismiss_uses_default_snooze_minutes_for_suppression(engine):
    owner_id = uuid.uuid4()
    with Session(engine) as session:
        row = _insert_active_session(
            session, owner_id, active_duration_seconds=BREAK_THRESHOLD_SECONDS
        )
        record_break_action(
            session, owner_id, row.id, StudySessionBreakCreate(action="Dismiss"), now=NOW
        )

        expiry = NOW + timedelta(minutes=DEFAULT_SNOOZE_MINUTES)

        still_suppressed = expiry - timedelta(seconds=1)
        read = serialize_study_session_for_response(
            session, row, None, None, as_of=still_suppressed
        )
        assert read.break_eligible is False
        assert read.next_break_eligible_at == expiry

        read = serialize_study_session_for_response(session, row, None, None, as_of=expiry)
        assert read.break_eligible is True
        assert read.next_break_eligible_at == expiry


def test_snooze_custom_duration_reflected_in_next_break_eligible_at(engine):
    owner_id = uuid.uuid4()
    with Session(engine) as session:
        row = _insert_active_session(
            session, owner_id, active_duration_seconds=BREAK_THRESHOLD_SECONDS
        )
        record_break_action(
            session,
            owner_id,
            row.id,
            StudySessionBreakCreate(action="Snooze", duration_minutes=25),
            now=NOW,
        )
        read = serialize_study_session_for_response(
            session, row, None, None, as_of=NOW + timedelta(minutes=1)
        )
        assert read.next_break_eligible_at == NOW + timedelta(minutes=25)


def test_suppression_never_manufactures_eligibility_below_threshold(engine):
    owner_id = uuid.uuid4()
    with Session(engine) as session:
        row = _insert_active_session(session, owner_id, active_duration_seconds=100)
        record_break_action(
            session,
            owner_id,
            row.id,
            StudySessionBreakCreate(action="Snooze", duration_minutes=10),
            now=NOW,
        )
        read = serialize_study_session_for_response(
            session, row, None, None, as_of=NOW + timedelta(minutes=20)
        )
        assert read.break_eligible is False


def test_resume_during_snooze_suppression_still_reports_ineligible(engine):
    owner_id = uuid.uuid4()
    with Session(engine) as session:
        row = _insert_active_session(
            session, owner_id, active_duration_seconds=BREAK_THRESHOLD_SECONDS
        )
        record_break_action(
            session,
            owner_id,
            row.id,
            StudySessionBreakCreate(action="Snooze", duration_minutes=10),
            now=NOW,
        )

        resumed = resume_session(session, owner_id, row.id, now=NOW + timedelta(minutes=1))
        read = serialize_study_session_for_response(
            session, resumed, None, None, as_of=NOW + timedelta(minutes=1)
        )
        assert read.break_eligible is False


# --- deterministic latest-break ordering: (prompted_at DESC, id DESC) ---


def test_latest_break_event_ties_broken_by_id_desc(engine):
    owner_id = uuid.uuid4()
    with Session(engine) as session:
        row = _insert_active_session(session, owner_id)
        low_id = uuid.UUID(int=1)
        high_id = uuid.UUID(int=2)
        _insert_break(
            session, row.id, owner_id, action="Snooze", prompted_at=NOW, duration_minutes=5,
            id=low_id,
        )
        _insert_break(
            session, row.id, owner_id, action="Dismiss", prompted_at=NOW, id=high_id
        )

        latest = _latest_break_event(session, row.id)
        assert latest.id == high_id
        assert latest.action == "Dismiss"


# --- baseline invisibility from response schemas ---


def test_baseline_field_never_appears_on_study_session_read():
    assert "active_duration_seconds_at_last_break" not in StudySessionRead.model_fields


# --- transaction failure: rollback leaves session and break events unchanged ---


def test_record_break_action_rolls_back_on_commit_failure(engine, monkeypatch):
    owner_id = uuid.uuid4()
    with Session(engine) as session:
        row = _insert_active_session(session, owner_id, active_duration_seconds=100)
        session_id = row.id

        def failing_commit():
            raise IntegrityError("insert", {}, Exception("forced failure"))

        monkeypatch.setattr(session, "commit", failing_commit)

        with pytest.raises(IntegrityError):
            record_break_action(
                session, owner_id, session_id, StudySessionBreakCreate(action="TakeBreak"), now=NOW
            )

    with Session(engine) as fresh:
        reloaded = fresh.get(StudySession, session_id)
        assert reloaded.status == "Active"
        assert reloaded.break_taken is False
        assert reloaded.active_duration_seconds == 100
        assert reloaded.active_duration_seconds_at_last_break is None

        count = fresh.exec(
            select(StudySessionBreak).where(StudySessionBreak.session_id == session_id)
        ).all()
        assert count == []


# --- serialize_break_event: UTC canonicalization ---


def test_serialize_break_event_returns_timezone_aware_prompted_at(engine):
    owner_id = uuid.uuid4()
    with Session(engine) as session:
        row = _insert_active_session(session, owner_id)
        break_row = _insert_break(session, row.id, owner_id, action="Snooze", prompted_at=NOW)
        read = serialize_break_event(break_row)
        assert read.prompted_at.tzinfo is not None
