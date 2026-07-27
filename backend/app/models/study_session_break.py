import uuid
from datetime import UTC, datetime

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Uuid
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(UTC)


class StudySessionBreak(SQLModel, table=True):
    """docs/phase1/09-data-dictionary.md §9.7. RLS: user_id = auth.uid() (see migration).

    Append-only event log — no `created_at`/`updated_at` (not in the data
    dictionary, and no field here is ever edited after insert); `prompted_at`
    is the event timestamp, server-generated, never client-settable.

    `user_id` has no in-model FK (references `auth.users`, absent on SQLite
    test runs) — added by the Postgres-gated Alembic migration only, same as
    every other table. It's denormalized directly onto this table (rather
    than requiring a join through `study_sessions`) so RLS can filter
    without a join, same reasoning as `Subtask.user_id`.

    `session_id` DOES declare its FK in-model: `study_sessions` is this
    app's own table. `NOT NULL` + `ondelete="CASCADE"` — a break event has
    no independent meaning after its parent session is deleted, same
    reasoning as `Subtask.task_id`.

    `action` is a plain validated string (TakeBreak/Snooze/Dismiss), not a
    native Postgres ENUM — same established choice as `Task.type`/`status`
    and `StudySession.status`.

    `duration_minutes` is nullable and means something different per
    action (Checkpoint 3 design review, approved): for TakeBreak, the
    selected/recommended break length; for Snooze, how many minutes to
    suppress the next prompt; for Dismiss, always NULL (no duration
    applies — enforced by a CHECK constraint below, not just in Pydantic).
    No 10-15 range is enforced here — that is a UI recommendation, not a
    documented database invariant; only a `>= 1` sanity floor is enforced.

    No uniqueness/deduplication constraint exists on this table by design:
    the approved API contract has no prompt ID or idempotency key, so
    multiple break events per session are allowed. The future service
    endpoint must perform the parent-session update (break_taken/pause)
    and this event insert transactionally; the mobile action buttons must
    disable after the first tap. This is intentionally not enforced here.
    """

    __tablename__ = "study_session_breaks"
    __table_args__ = (
        CheckConstraint(
            "action IN ('TakeBreak', 'Snooze', 'Dismiss')",
            name="ck_study_session_breaks_action_enum",
        ),
        CheckConstraint(
            "duration_minutes IS NULL OR duration_minutes >= 1",
            name="ck_study_session_breaks_duration_positive",
        ),
        CheckConstraint(
            "action != 'Dismiss' OR duration_minutes IS NULL",
            name="ck_study_session_breaks_dismiss_duration_null",
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    session_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("study_sessions.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    user_id: uuid.UUID = Field(index=True, nullable=False)
    prompted_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    action: str = Field(nullable=False)
    duration_minutes: int | None = Field(default=None)
