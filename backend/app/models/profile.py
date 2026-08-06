import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, Column, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Profile(SQLModel, table=True):
    """docs/phase1/09-data-dictionary.md §9.1. RLS: id = auth.uid() (see migration)."""

    __tablename__ = "profiles"

    id: uuid.UUID = Field(primary_key=True)
    display_name: str | None = Field(default=None)
    timezone: str = Field(default="UTC", nullable=False)
    avatar_path: str | None = Field(default=None)
    study_preferences: dict | None = Field(
        default=None,
        sa_column=Column(JSON().with_variant(JSONB(), "postgresql"), nullable=True),
    )
    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
