import uuid
from datetime import UTC, datetime

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.core.errors import ApiError
from app.models.study_session import StudySession
from app.models.subject import Subject
from app.models.task import Task
from app.schemas.study_session import (
    StudySessionCreate,
    StudySessionListQuery,
    StudySessionRead,
    StudySessionTaskSnapshot,
)
from app.schemas.task import TaskSubjectSnapshot

_UNFINISHED_STATUSES = ("Active", "Paused")


def _as_utc_instant(value: datetime) -> datetime:
    """Same canonicalization as app.services.task._as_utc_instant /
    app.services.study_block._as_utc_instant / app.services.planner
    equivalents — a value freshly loaded from the (test) SQLite engine
    comes back naive even though its wall-clock value is already UTC, so
    a naive value is treated as already-UTC rather than reinterpreted in
    another zone."""
    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _elapsed_seconds(start: datetime, end: datetime) -> int:
    """Floor-truncated non-negative elapsed seconds. Clamped to zero if
    `end` is before `start` — a defensive branch for a hypothetical
    backward wall-clock adjustment between two server-generated
    timestamps; normal timestamps are monotonic and never trigger it."""
    return max(0, int((end - start).total_seconds()))


def _validate_task_ownership(
    session: Session, user_id: uuid.UUID, task_id: uuid.UUID | None
) -> None:
    """A task_id that doesn't exist or belongs to another user is a
    body-validation problem on the start request, not a missing-session
    problem — 422, not 404. Same reasoning as StudyBlock's
    _validate_task_ownership / Task's _validate_subject_ownership."""
    if task_id is None:
        return
    owned = session.exec(select(Task.id).where(Task.id == task_id, Task.user_id == user_id)).first()
    if owned is None:
        raise ApiError(422, "VALIDATION_ERROR", "task not found", field="task_id")


def _has_unfinished_session(session: Session, user_id: uuid.UUID) -> bool:
    existing = session.exec(
        select(StudySession.id).where(
            StudySession.user_id == user_id, StudySession.status.in_(_UNFINISHED_STATUSES)
        )
    ).first()
    return existing is not None


def _duplicate_session_error() -> ApiError:
    return ApiError(409, "CONFLICT", "an unfinished study session already exists")


def start_session(session: Session, user_id: uuid.UUID, data: StudySessionCreate) -> StudySession:
    """One unfinished (Active/Paused) session per user is enforced twice:
    a fast-path pre-check here (avoids a wasted insert in the common
    non-racing case), and the DB's own partial unique index as the actual
    source of truth. If two concurrent starts both pass the pre-check,
    the loser's insert raises IntegrityError; after rollback, a re-query
    decides the response — a row now exists -> the same fixed 409; no row
    exists -> the IntegrityError was for some other, unexpected reason
    and is re-raised rather than misclassified as a duplicate-session
    conflict."""
    _validate_task_ownership(session, user_id, data.task_id)
    if _has_unfinished_session(session, user_id):
        raise _duplicate_session_error()

    new_session = StudySession(user_id=user_id, task_id=data.task_id)
    session.add(new_session)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        if _has_unfinished_session(session, user_id):
            raise _duplicate_session_error() from None
        raise
    session.refresh(new_session)
    return new_session


def get_owned_study_session(
    session: Session, user_id: uuid.UUID, session_id: uuid.UUID, *, for_update: bool = False
) -> StudySession:
    """Scopes the lookup to (id, user_id) in one query — a session that
    exists but belongs to another user is indistinguishable from one that
    doesn't exist at all, so both raise the same 404. `for_update=True`
    (used by pause/resume/finish) adds a row lock: real on PostgreSQL,
    silently a no-op on SQLite (confirmed — that dialect drops the clause
    without erroring), so sequential-logic correctness is what the test
    suite proves here, not true concurrent exclusion."""
    statement = select(StudySession).where(
        StudySession.id == session_id, StudySession.user_id == user_id
    )
    if for_update:
        statement = statement.with_for_update()
    row = session.exec(statement).first()
    if row is None:
        raise ApiError(404, "NOT_FOUND", "Study session not found")
    return row


def pause_session(
    session: Session, user_id: uuid.UUID, session_id: uuid.UUID, now: datetime | None = None
) -> StudySession:
    """Idempotent: pausing an already-Paused session is a 200 no-op that
    touches nothing (not even `updated_at`). Pausing anything other than
    Active/already-Paused is a 409 — there is no valid pause transition
    from Finished/Cancelled."""
    now = now if now is not None else datetime.now(UTC)
    row = get_owned_study_session(session, user_id, session_id, for_update=True)

    if row.status == "Paused":
        return row
    if row.status != "Active":
        raise ApiError(409, "CONFLICT", f"session is {row.status.lower()}, cannot pause")

    elapsed = _elapsed_seconds(_as_utc_instant(row.active_segment_started_at), now)
    row.active_duration_seconds += elapsed
    row.active_segment_started_at = None
    row.status = "Paused"
    row.updated_at = now
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def resume_session(
    session: Session, user_id: uuid.UUID, session_id: uuid.UUID, now: datetime | None = None
) -> StudySession:
    """Idempotent: resuming an already-Active session is a 200 no-op.
    Resuming anything other than Paused/already-Active is a 409. Never
    resets `active_duration_seconds` — only opens a new segment anchor."""
    now = now if now is not None else datetime.now(UTC)
    row = get_owned_study_session(session, user_id, session_id, for_update=True)

    if row.status == "Active":
        return row
    if row.status != "Paused":
        raise ApiError(409, "CONFLICT", f"session is {row.status.lower()}, cannot resume")

    row.active_segment_started_at = now
    row.status = "Active"
    row.updated_at = now
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def finish_session(
    session: Session, user_id: uuid.UUID, session_id: uuid.UUID, now: datetime | None = None
) -> StudySession:
    """Idempotent: finishing an already-Finished session is a 200 no-op
    that never touches `ended_at`/`updated_at`/the stored duration again.
    Valid from Active (accrues the open segment) or Paused (no open
    segment to accrue). Anything else (Cancelled, unreachable in
    practice) is a 409."""
    now = now if now is not None else datetime.now(UTC)
    row = get_owned_study_session(session, user_id, session_id, for_update=True)

    if row.status == "Finished":
        return row
    if row.status not in _UNFINISHED_STATUSES:
        raise ApiError(409, "CONFLICT", f"session is {row.status.lower()}, cannot finish")

    if row.status == "Active":
        elapsed = _elapsed_seconds(_as_utc_instant(row.active_segment_started_at), now)
        row.active_duration_seconds += elapsed
        row.active_segment_started_at = None

    row.status = "Finished"
    row.ended_at = now
    row.updated_at = now
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def list_sessions(
    session: Session, user_id: uuid.UUID, query: StudySessionListQuery
) -> list[StudySession]:
    statement = select(StudySession).where(StudySession.user_id == user_id)
    if query.status is not None:
        statement = statement.where(StudySession.status == query.status)
    statement = (
        statement.order_by(StudySession.started_at.desc(), StudySession.id.desc())
        .offset(query.offset)
        .limit(query.limit)
    )
    return list(session.exec(statement))


def serialize_study_session(
    session_row: StudySession,
    task: Task | None,
    subject: Subject | None,
    as_of: datetime | None = None,
) -> StudySessionRead:
    """Every datetime placed into the response passes through
    `_as_utc_instant` first (same response-correctness requirement as
    Checkpoint 4's fix — a naive SQLite readback must never serialize
    without a UTC offset). For an Active session, `active_duration_seconds`
    reports the *effective* value as of `as_of` (defaults to real now) by
    adding elapsed time since the open segment's anchor — computed only
    for the response, never written back to `session_row`."""
    as_of = as_of if as_of is not None else datetime.now(UTC)
    effective_duration = session_row.active_duration_seconds
    if session_row.status == "Active":
        anchor = _as_utc_instant(session_row.active_segment_started_at)
        effective_duration += _elapsed_seconds(anchor, as_of)

    task_snapshot = None
    if task is not None:
        subject_snapshot = None
        if subject is not None:
            subject_snapshot = TaskSubjectSnapshot(
                id=subject.id,
                name=subject.name,
                color_token=subject.color_token,
                archived=subject.archived_at is not None,
            )
        task_snapshot = StudySessionTaskSnapshot(
            id=task.id,
            title=task.title,
            type=task.type,
            deadline=_as_utc_instant(task.deadline),
            priority=task.priority,
            status=task.status,
            subject=subject_snapshot,
        )

    ended_at = _as_utc_instant(session_row.ended_at) if session_row.ended_at is not None else None
    return StudySessionRead(
        id=session_row.id,
        task_id=session_row.task_id,
        task=task_snapshot,
        started_at=_as_utc_instant(session_row.started_at),
        ended_at=ended_at,
        active_duration_seconds=effective_duration,
        status=session_row.status,
        break_taken=session_row.break_taken,
        created_at=_as_utc_instant(session_row.created_at),
        updated_at=_as_utc_instant(session_row.updated_at),
    )
