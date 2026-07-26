import uuid
from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, field_validator, model_validator


class StudyBlockRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    task_id: uuid.UUID | None
    starts_at: datetime
    ends_at: datetime
    created_at: datetime
    updated_at: datetime


class StudyBlockCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_id: uuid.UUID | None = None
    starts_at: datetime
    ends_at: datetime

    @field_validator("starts_at", "ends_at")
    @classmethod
    def must_be_aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("must be timezone-aware")
        return value.astimezone(UTC)

    @model_validator(mode="after")
    def ends_after_starts(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        return self


_STUDY_BLOCK_UPDATE_NON_NULLABLE = ("starts_at", "ends_at")


class StudyBlockUpdate(BaseModel):
    """PATCH /study-blocks/{id} — API contract §10.4 "Edit/move".

    `task_id` may be explicitly null (unlink/make unscheduled — a real
    command, matching its nullable column). `starts_at`/`ends_at` are
    NOT NULL columns — explicit null rejected, same reasoning as
    TaskUpdate's non-nullable fields. An entirely empty body is rejected.

    Cross-field `ends_at > starts_at` is only checked here when BOTH are
    present in the same payload — a schema has no visibility into the
    existing row's other value when only one field is patched. Checking
    a new `starts_at` (or `ends_at`) against the *stored* other value is
    a service-layer concern (Checkpoint 4), not here.

    No overlap-prevention rule is enforced here or planned for this
    checkpoint — no approved document defines an overlap restriction for
    study blocks.
    """

    model_config = ConfigDict(extra="forbid")

    task_id: uuid.UUID | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None

    @model_validator(mode="before")
    @classmethod
    def reject_empty_body_and_invalid_nulls(cls, data):
        if not isinstance(data, dict):
            return data
        if not data:
            raise ValueError("at least one field must be supplied")
        for field in _STUDY_BLOCK_UPDATE_NON_NULLABLE:
            if field in data and data[field] is None:
                raise ValueError(f"{field} cannot be null — omit it to leave unchanged")
        return data

    @field_validator("starts_at", "ends_at")
    @classmethod
    def must_be_aware(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return value
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("must be timezone-aware")
        return value.astimezone(UTC)

    @model_validator(mode="after")
    def ends_after_starts_if_both_present(self):
        both_present = self.starts_at is not None and self.ends_at is not None
        if both_present and self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        return self
