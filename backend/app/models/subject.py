import uuid
from datetime import UTC, datetime

from sqlalchemy import Column, DateTime
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Subject(SQLModel, table=True):
    """docs/phase1/09-data-dictionary.md §9.2. RLS: user_id = auth.uid() (see migration).

    `user_id` has no `foreign_key=` here (SQLModel/SQLAlchemy would try to
    create it against `auth.users` on every dialect, including SQLite test
    runs where that table doesn't exist) — the FK is added by the
    Postgres-gated Alembic migration only, same as `profiles`.
    """

    __tablename__ = "subjects"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(index=True, nullable=False)
    name: str = Field(nullable=False)
    color_token: str = Field(nullable=False)
    archived_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
