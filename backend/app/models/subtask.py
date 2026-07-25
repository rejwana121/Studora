import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Uuid, false
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Subtask(SQLModel, table=True):
    """docs/phase1/09-data-dictionary.md §9.4. RLS: user_id = auth.uid() (see migration).

    `user_id` has no `foreign_key=`/`ForeignKey(...)` here (references
    `auth.users`, absent on SQLite test runs) — that FK is added by the
    Postgres-gated Alembic migration only, same as `profiles`/`subjects`/
    `tasks`. It's denormalized onto this table (rather than requiring a
    join through `tasks`) specifically so RLS can filter directly, per
    the data dictionary's own stated reason for the column's existence.

    `task_id` DOES declare its FK in-model: `tasks` is this app's own
    table, present on every dialect including SQLite tests. `NOT NULL` +
    `ondelete="CASCADE"` — a subtask has no independent existence outside
    its parent task (data dictionary §9.4), so deleting a task deletes
    its subtasks.
    """

    __tablename__ = "subtasks"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    task_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
        )
    )
    user_id: uuid.UUID = Field(index=True, nullable=False)
    title: str = Field(nullable=False)
    is_complete: bool = Field(
        default=False,
        sa_column=Column(Boolean(), nullable=False, server_default=false()),
    )
    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
