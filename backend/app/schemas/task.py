import uuid
from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

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
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("deadline must be timezone-aware")
        return value.astimezone(UTC)


_TASK_UPDATE_NON_NULLABLE = ("title", "type", "deadline", "priority", "status")


class TaskUpdate(BaseModel):
    """PATCH /tasks/{id} — title/subject/type/deadline/priority/estimate/
    notes/status are client-editable (status carries complete/reopen,
    per API contract §10.3). `completed_at` and `reschedule_count` are
    never accepted here — both are server-derived in the task service
    (plan §5): `completed_at` from a `status` transition to/from
    `Completed`, `reschedule_count` incremented only when `deadline`
    actually changes. `extra="forbid"` also blocks a client attempt to
    set either directly.

    A PATCH is a partial update: every field is optional so it can be
    omitted. But whether an explicit `null` is accepted for a field that
    IS present depends on whether the underlying column is nullable:
    `subject_id`/`estimate_hours`/`notes` may be explicitly null — that's
    a real command ("unlink subject" / "clear estimate" / "clear notes"),
    matching their nullable columns in the data dictionary. `title`/
    `type`/`deadline`/`priority`/`status` are NOT NULL columns — an
    explicit null there is rejected, same reasoning as SubjectUpdate.name.
    An entirely empty body is rejected either way, since it expresses no
    intent.
    """

    model_config = ConfigDict(extra="forbid")

    subject_id: uuid.UUID | None = None
    title: str | None = None
    type: TaskType | None = None
    deadline: datetime | None = None
    priority: TaskPriority | None = None
    estimate_hours: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    status: TaskStatus | None = None
    notes: str | None = None

    @model_validator(mode="before")
    @classmethod
    def reject_empty_body_and_invalid_nulls(cls, data):
        if not isinstance(data, dict):
            return data
        if not data:
            raise ValueError("at least one field must be supplied")
        for field in _TASK_UPDATE_NON_NULLABLE:
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

    @field_validator("deadline")
    @classmethod
    def deadline_must_be_aware(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return value
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("deadline must be timezone-aware")
        return value.astimezone(UTC)


class TaskListQuery(BaseModel):
    """Query params for GET /tasks. extra="forbid" is what makes an
    unrecognized ?param= 422 instead of being silently ignored — FastAPI's
    query-parameter-model binding validates the whole raw query string
    against this model, same as a JSON body."""

    model_config = ConfigDict(extra="forbid")

    status: TaskStatus | None = None
    subject_id: uuid.UUID | None = None
    type: TaskType | None = None
    due_before: datetime | None = None
    due_after: datetime | None = None
    search: str | None = None
    sort: Literal[
        "deadline_asc",
        "deadline_desc",
        "priority_asc",
        "priority_desc",
        "created_at_asc",
        "created_at_desc",
    ] = "deadline_asc"
    limit: int = Field(20, ge=1, le=100)
    offset: int = Field(0, ge=0)

    @field_validator("due_before", "due_after")
    @classmethod
    def bound_must_be_aware(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return value
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("must be timezone-aware")
        return value.astimezone(UTC)
