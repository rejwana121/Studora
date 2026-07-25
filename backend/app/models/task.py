import uuid
from datetime import UTC, datetime

from sqlalchemy import Column, DateTime, ForeignKey, Index, Uuid
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Task(SQLModel, table=True):
    """docs/phase1/09-data-dictionary.md §9.3. RLS: user_id = auth.uid() (see migration).

    `user_id` has no `foreign_key=`/`ForeignKey(...)` here (references
    `auth.users`, absent on SQLite test runs) — that FK is added by the
    Postgres-gated Alembic migration only, same as `profiles`/`subjects`.

    `subject_id` DOES declare its FK in-model: `subjects` is part of this
    app's own metadata (present on every dialect, including SQLite tests),
    so its constraint can be created directly. `ondelete="SET NULL"`
    matches the data dictionary's own note that this column is nullable
    "(Other/no subject)" — archiving/any future subject removal must not
    orphan a task's other fields.

    `type`/`priority`/`status` are plain validated strings, not native
    Postgres ENUM columns — same choice already made for `profiles.timezone`
    (keeps SQLite test parity, avoids enum-migration churn); the fixed
    value sets are enforced at the Pydantic schema layer (`app/schemas/task.py`).
    """

    __tablename__ = "tasks"
    __table_args__ = (
        Index("ix_tasks_user_id_status", "user_id", "status"),
        Index("ix_tasks_user_id_deadline", "user_id", "deadline"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(nullable=False)
    subject_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(Uuid(), ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True),
    )
    title: str = Field(nullable=False)
    type: str = Field(nullable=False)
    deadline: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    priority: str = Field(nullable=False)
    estimate_hours: float | None = Field(default=None)
    status: str = Field(default="Pending", nullable=False)
    notes: str | None = Field(default=None)
    completed_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    reschedule_count: int = Field(default=0, nullable=False)
    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
