import uuid
from datetime import datetime
from zoneinfo import available_timezones

from pydantic import BaseModel, field_validator

_VALID_TIMEZONES = available_timezones()


class ProfileRead(BaseModel):
    id: uuid.UUID
    display_name: str | None
    timezone: str
    study_preferences: dict | None
    created_at: datetime
    updated_at: datetime


class ProfileUpdate(BaseModel):
    display_name: str | None = None
    timezone: str | None = None
    study_preferences: dict | None = None

    @field_validator("timezone")
    @classmethod
    def timezone_must_be_iana(cls, value: str | None) -> str | None:
        if value is not None and value not in _VALID_TIMEZONES:
            raise ValueError("timezone must be a valid IANA timezone name")
        return value

    @field_validator("display_name")
    @classmethod
    def display_name_not_blank(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("display_name cannot be blank")
        return value
