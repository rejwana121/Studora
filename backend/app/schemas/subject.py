import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

# Canonical six-token subject palette — literal camelCase tokens derived
# 1:1 from docs/Studora_PRD_Compact_Final.md §12 ("Deep violet, teal, coral,
# warm yellow, lavender, mint"). No synonyms/renames; one fixed casing.
SubjectColorToken = Literal["deepViolet", "teal", "coral", "warmYellow", "lavender", "mint"]


class SubjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    color_token: SubjectColorToken
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime


class SubjectCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    color_token: SubjectColorToken

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("name cannot be blank")
        return stripped


class SubjectUpdate(BaseModel):
    """PATCH /subjects/{id} — API contract §10.2 says only "Edit / archive",
    with no field-level payload spec. `archived` is a command flag rather
    than a client-supplied `archived_at` timestamp: the service (not the
    client) sets `archived_at` to server UTC now / None, consistent with
    never trusting a client-supplied timestamp for a server-owned field.

    A PATCH is a partial update: every field is optional so it can be
    omitted, but a field that IS present in the payload must carry a real
    value — an explicit `null` for name/color_token/archived is rejected
    rather than silently treated as "no-op", since a client sending
    `"name": null` almost certainly means something other than "leave
    name alone" (that's what omitting the key does). An entirely empty
    body is rejected for the same reason: it can't express any intent.
    """

    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    color_token: SubjectColorToken | None = None
    archived: bool | None = None

    @model_validator(mode="before")
    @classmethod
    def reject_empty_body_and_explicit_nulls(cls, data):
        if not isinstance(data, dict):
            return data
        if not data:
            raise ValueError("at least one field must be supplied")
        for field in ("name", "color_token", "archived"):
            if field in data and data[field] is None:
                raise ValueError(f"{field} cannot be null — omit it to leave unchanged")
        return data

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str | None) -> str | None:
        if value is None:
            return value
        stripped = value.strip()
        if not stripped:
            raise ValueError("name cannot be blank")
        return stripped
