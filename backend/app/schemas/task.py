import uuid
from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.subject import SubjectColorToken

# Canonical enum values — exact casing from docs/phase1/09-data-dictionary.md
# §9.3, cross-checked against mobile/src/design-system/tokens.ts's existing
# taskTypeColor/priorityColor key sets (already consistent). See plan §1.
TaskType = Literal[
    "Assignment",
    "Quiz",
    "Project",
    "Presentation",
    "Lab",
    "Midterm",
    "FinalExam",
    "StudySession",
    "Other",
]
TaskPriority = Literal["Low", "Medium", "High"]
TaskStatus = Literal["Pending", "InProgress", "Completed", "Cancelled"]


class TaskSubjectSnapshot(BaseModel):
    """Nested read-only subject snapshot embedded in TaskRead (plan §4) —
    populated via a join in the task service (not built this checkpoint),
    independent of GET /subjects' own archived-exclusion filter. Lets a
    task keep showing its linked subject's name/color even after that
    subject is archived, without a GET /subjects/{id} endpoint (none is
    documented in the API contract)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    color_token: SubjectColorToken
    archived: bool


class TaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    subject_id: uuid.UUID | None
    subject: TaskSubjectSnapshot | None = None
    title: str
    type: TaskType
    deadline: datetime
    priority: TaskPriority
    estimate_hours: float | None
    status: TaskStatus
    notes: str | None
    completed_at: datetime | None
    reschedule_count: int
    created_at: datetime
    updated_at: datetime


class TaskCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subject_id: uuid.UUID | None = None
    title: str
    type: TaskType
    deadline: datetime
    priority: TaskPriority
    estimate_hours: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    notes: str | None = None

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("title cannot be blank")
        return stripped

    @field_validator("deadline")
    @classmethod
    def deadline_must_be_aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("deadline must be timezone-aware")
        return value.astimezone(UTC)


class TaskUpdate(BaseModel):
    """PATCH /tasks/{id} — title/subject/type/deadline/priority/estimate/
    notes/status are client-editable (status carries complete/reopen,
    per API contract §10.3). `completed_at` and `reschedule_count` are
    never accepted here — both are server-derived in the task service
    (plan §5): `completed_at` from a `status` transition to/from
    `Completed`, `reschedule_count` incremented only when `deadline`
    actually changes. `extra="forbid"` also blocks a client attempt to
    set either directly."""

    model_config = ConfigDict(extra="forbid")

    subject_id: uuid.UUID | None = None
    title: str | None = None
    type: TaskType | None = None
    deadline: datetime | None = None
    priority: TaskPriority | None = None
    estimate_hours: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    status: TaskStatus | None = None
    notes: str | None = None

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str | None) -> str | None:
        if value is None:
            return value
        stripped = value.strip()
        if not stripped:
            raise ValueError("title cannot be blank")
        return stripped

    @field_validator("deadline")
    @classmethod
    def deadline_must_be_aware(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return value
        if value.tzinfo is None:
            raise ValueError("deadline must be timezone-aware")
        return value.astimezone(UTC)
