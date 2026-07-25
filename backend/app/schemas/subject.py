import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator

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
    never trusting a client-supplied timestamp for a server-owned field."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    color_token: SubjectColorToken | None = None
    archived: bool | None = None

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str | None) -> str | None:
        if value is None:
            return value
        stripped = value.strip()
        if not stripped:
            raise ValueError("name cannot be blank")
        return stripped
