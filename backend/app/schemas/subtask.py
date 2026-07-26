import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator, model_validator


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
    """PATCH /tasks/{id}/subtasks/{id} — both title and is_complete are
    NOT NULL columns (data dictionary §9.4), so unlike TaskUpdate there
    is no nullable-field carve-out: an explicit null for either supplied
    field is rejected, same reasoning as SubjectUpdate. An entirely
    empty body is rejected either way, since it expresses no intent."""

    model_config = ConfigDict(extra="forbid")

    title: str | None = None
    is_complete: bool | None = None

    @model_validator(mode="before")
    @classmethod
    def reject_empty_body_and_explicit_nulls(cls, data):
        if not isinstance(data, dict):
            return data
        if not data:
            raise ValueError("at least one field must be supplied")
        for field in ("title", "is_complete"):
            if field in data and data[field] is None:
                raise ValueError(f"{field} cannot be null — omit it to leave unchanged")
        return data

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str | None) -> str | None:
        if value is None:
            return value
        stripped = value.strip()
        if not stripped:
            raise ValueError("title cannot be blank")
        return stripped
