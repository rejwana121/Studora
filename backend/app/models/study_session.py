import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Uuid,
    false,
    text,
)
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(UTC)


_UNFINISHED_STATUSES_SQL = "status IN ('Active', 'Paused')"


class StudySession(SQLModel, table=True):
    """docs/phase1/09-data-dictionary.md §9.6. RLS: user_id = auth.uid() (see migration).

    `user_id` has no in-model FK (references `auth.users`, absent on
    SQLite test runs) — added by the Postgres-gated Alembic migration
    only, same as every other table. `task_id` DOES declare its FK
    in-model: `tasks` is this app's own table. `ondelete="SET NULL"` —
    a study session is a historical record of time actually spent
    studying (feeds Phase 8 dashboard study-minutes); deleting the
    linked task must not delete or corrupt that history, only detach it
    (same reasoning as `study_blocks.task_id`).

    `active_segment_started_at` is an internal bookkeeping column with
    no data-dictionary equivalent, added per the Checkpoint 2 design
    review: it anchors the currently-open Active segment so the server
    can correctly accrue `active_duration_seconds` across multiple
    pause/resume cycles without ever trusting a client-reported elapsed
    time. It is non-null only while `status == "Active"` (enforced by a
    CHECK constraint below) and never appears in any client-facing
    schema. `active_duration_seconds` always reflects only *completed*
    segments — the currently-open segment (if Active) is added on top by
    the future service-layer serializer at response time, never stored
    mid-flight.

    `status` is a plain validated string, not a native Postgres ENUM —
    same established choice as `Task.type`/`priority`/`status`.

    Only one unfinished (Active or Paused) session may exist per user at
    a time — an explicit product rule (not derived from the data
    dictionary), enforced here via a partial unique index on `user_id`
    scoped to `status IN ('Active', 'Paused')`. `postgresql_where`/
    `sqlite_where` are both supplied so the same construct compiles
    correctly on real Supabase Postgres and the throwaway SQLite engine
    used for local test validation.

    Four additional CHECK constraints (SQLite- and Postgres-compatible
    plain SQL, no dialect-specific functions) guard invariants that
    would otherwise depend entirely on service-layer discipline:
    `active_duration_seconds` non-negative; `status` restricted to the
    four documented values; `ended_at` null iff the session is still
    ongoing (Active/Paused) and non-null iff terminal (Finished/
    Cancelled); `active_segment_started_at` null iff not Active; and
    `ended_at` never earlier than `started_at`.

    `active_duration_seconds_at_last_break` is an internal-only snapshot
    (Checkpoint 6 design review, approved) — never exposed on any client
    schema, same treatment as `active_segment_started_at`. It holds the
    stored `active_duration_seconds` value immediately after the most
    recent successful TakeBreak's accrual, so the service layer can
    compute "active time since the last break" for repeated break-prompt
    eligibility instead of only ever prompting once per session. Three
    further CHECK constraints guard it: non-negative when present; never
    exceeding the current `active_duration_seconds` (true by construction
    at the moment it is set, and preserved afterward because
    `active_duration_seconds` only ever increases); and an iff against
    `break_taken` — null exactly when `break_taken` is false, non-null
    exactly when `break_taken` is true. `start_session`/`pause_session`/
    `resume_session`/`finish_session` never assign to either field, so
    all three hold for every reachable row without any change to those
    four functions.
    """

    __tablename__ = "study_sessions"
    __table_args__ = (
        Index(
            "ux_study_sessions_user_unfinished",
            "user_id",
            unique=True,
            postgresql_where=text(_UNFINISHED_STATUSES_SQL),
            sqlite_where=text(_UNFINISHED_STATUSES_SQL),
        ),
        CheckConstraint(
            "active_duration_seconds >= 0",
            name="ck_study_sessions_duration_non_negative",
        ),
        CheckConstraint(
            "status IN ('Active', 'Paused', 'Finished', 'Cancelled')",
            name="ck_study_sessions_status_enum",
        ),
        CheckConstraint(
            "(status IN ('Active', 'Paused') AND ended_at IS NULL) "
            "OR (status IN ('Finished', 'Cancelled') AND ended_at IS NOT NULL)",
            name="ck_study_sessions_ended_at_matches_status",
        ),
        CheckConstraint(
            "(status = 'Active' AND active_segment_started_at IS NOT NULL) "
            "OR (status != 'Active' AND active_segment_started_at IS NULL)",
            name="ck_study_sessions_segment_anchor_matches_status",
        ),
        CheckConstraint(
            "ended_at IS NULL OR ended_at >= started_at",
            name="ck_study_sessions_ended_not_before_started",
        ),
        CheckConstraint(
            "active_duration_seconds_at_last_break IS NULL "
            "OR active_duration_seconds_at_last_break >= 0",
            name="ck_study_sessions_break_baseline_non_negative",
        ),
        CheckConstraint(
            "active_duration_seconds_at_last_break IS NULL "
            "OR active_duration_seconds_at_last_break <= active_duration_seconds",
            name="ck_study_sessions_break_baseline_not_exceeding_duration",
        ),
        CheckConstraint(
            "(break_taken AND active_duration_seconds_at_last_break IS NOT NULL) "
            "OR (NOT break_taken AND active_duration_seconds_at_last_break IS NULL)",
            name="ck_study_sessions_break_baseline_matches_break_taken",
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(index=True, nullable=False)
    task_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(Uuid(), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True),
    )
    started_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    ended_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    active_duration_seconds: int = Field(
        default=0,
        sa_column=Column(Integer(), nullable=False, server_default=text("0")),
    )
    status: str = Field(default="Active", nullable=False)
    break_taken: bool = Field(
        default=False,
        sa_column=Column(Boolean(), nullable=False, server_default=false()),
    )
    active_segment_started_at: datetime | None = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    active_duration_seconds_at_last_break: int | None = Field(
        default=None,
        sa_column=Column(Integer(), nullable=True),
    )
    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
