import uuid
from datetime import UTC, datetime

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Index, Uuid
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(UTC)


class StudyBlock(SQLModel, table=True):
    """docs/phase1/09-data-dictionary.md §9.5. RLS: user_id = auth.uid() (see migration).

    `user_id` has no in-model FK (references `auth.users`, absent on SQLite
    test runs) — added by the Postgres-gated Alembic migration only, same
    as `profiles`/`subjects`/`tasks`/`subtasks`.

    `task_id` DOES declare its FK in-model — `tasks` is this app's own
    table, present on every dialect. `ondelete="SET NULL"` (not CASCADE):
    a study block represents planned calendar time, not an owned child of
    the task, and the data dictionary calls the nullable column out as
    "unscheduled-work blocks allowed" — deleting the linked task should
    detach the block, not delete a slot the student already planned
    around (same pattern as `tasks.subject_id`'s existing SET NULL).

    `ends_at > starts_at` is enforced both here (CheckConstraint, DB-level
    guarantee regardless of write path) and in the Pydantic schema (early
    422 instead of a DB error).
    """

    __tablename__ = "study_blocks"
    __table_args__ = (
        Index("ix_study_blocks_user_id_starts_at", "user_id", "starts_at"),
        CheckConstraint("ends_at > starts_at", name="ck_study_blocks_ends_after_starts"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(nullable=False)
    task_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(Uuid(), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True),
    )
    starts_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    ends_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
