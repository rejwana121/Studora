import re
import uuid
from datetime import datetime
from zoneinfo import available_timezones

from pydantic import BaseModel, field_validator

_VALID_TIMEZONES = available_timezones()

# Deterministic Storage object path only: "<uuid>/avatar", no extension, no
# nested segments, no scheme/host, no query string, no "..". Shape-only —
# whether the uuid segment actually belongs to the caller is verified
# separately in app.services.profile.update_profile, which is the only
# place the authenticated user's own id is available.
_AVATAR_PATH_PATTERN = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/avatar$"
)


class ProfileRead(BaseModel):
    id: uuid.UUID
    display_name: str | None
    timezone: str
    study_preferences: dict | None
    avatar_path: str | None
    created_at: datetime
    updated_at: datetime


class ProfileUpdate(BaseModel):
    display_name: str | None = None
    timezone: str | None = None
    study_preferences: dict | None = None
    avatar_path: str | None = None

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

    @field_validator("avatar_path")
    @classmethod
    def avatar_path_must_be_well_formed(cls, value: str | None) -> str | None:
        """`None` clears the photo. Otherwise the value must be exactly
        `<uuid>/avatar` — no extension, no nested path, no URL, no query
        string, no `..`. This rejects malformed *shapes*; ownership (does
        the uuid match the caller) is checked in the service layer, which
        alone has the verified identity."""
        if value is not None and not _AVATAR_PATH_PATTERN.fullmatch(value):
            raise ValueError(
                "avatar_path must be exactly '<your user id>/avatar' — "
                "no extension, query string, nested path, or URL"
            )
        return value
