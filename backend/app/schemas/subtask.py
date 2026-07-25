import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator


class SubtaskRead(BaseModel):
    """`task_id`/`user_id` omitted — subtasks are only ever accessed nested
    under a task (POST/PATCH/DELETE /tasks/{id}/subtasks/...), so both are
    already known from the URL; same reasoning SubjectRead already applies
    to omitting user_id."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    is_complete: bool
    created_at: datetime
    updated_at: datetime


class SubtaskCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("title cannot be blank")
        return stripped


class SubtaskUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = None
    is_complete: bool | None = None

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str | None) -> str | None:
        if value is None:
            return value
        stripped = value.strip()
        if not stripped:
            raise ValueError("title cannot be blank")
        return stripped
