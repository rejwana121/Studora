import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.task import TaskPriority, TaskStatus, TaskSubjectSnapshot, TaskType

# "Cancelled" is retained for data-dictionary completeness (docs/phase1/
# 09-data-dictionary.md §9.6) but is reserved/unreachable through the
# currently approved API contract — no documented endpoint transitions a
# session into Cancelled. Do not add an undocumented cancel endpoint.
StudySessionStatus = Literal["Active", "Paused", "Finished", "Cancelled"]


class StudySessionTaskSnapshot(BaseModel):
    """Nested read-only linked-task snapshot embedded in StudySessionRead
    (Checkpoint 5 design review, approved) — same shape/purpose as
    app.schemas.study_block.StudyBlockTaskSnapshot, populated via a
    bounded bulk lookup (app.services.study_session), never a per-session
    query. `subject` reflects the task's *current* subject snapshot,
    including archived state. `user_id` is intentionally never exposed."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    type: TaskType
    deadline: datetime
    priority: TaskPriority
    status: TaskStatus
    subject: TaskSubjectSnapshot | None = None


class StudySessionRead(BaseModel):
    """`active_segment_started_at` is intentionally omitted — it is
    internal bookkeeping only (see app.models.study_session.StudySession
    docstring), never exposed to a client. The stored
    `active_duration_seconds` reflects only completed segments; the
    Checkpoint 5 service-layer serializer computes an *effective*
    active_duration_seconds at response time by adding elapsed time since
    `active_segment_started_at` whenever `status == "Active"` — that
    computed value, not the raw anchor timestamp, is what a live-session
    read response reports. `task` is populated via a bounded bulk lookup,
    never left default when `task_id` is set.

    `break_eligible` (Checkpoint 6 design review, approved) is a flat,
    server-derived boolean — true when the session is Active, has
    accrued >= 3000 effective active seconds since its last break (or
    since session start, if no break has been taken yet), and is not
    currently within an active Snooze/Dismiss suppression window. It
    defaults to `False` here only so `model_validate(row, from_attributes=
    True)` doesn't fail against a bare ORM row in schema-level tests that
    don't care about eligibility — every real API response computes and
    passes the real value explicitly via
    `app.services.study_session.serialize_study_session`; no route may
    rely on this default. `active_duration_seconds_at_last_break`, the
    internal baseline this is computed from, is intentionally never a
    field on this schema.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    task_id: uuid.UUID | None
    task: StudySessionTaskSnapshot | None = None
    started_at: datetime
    ended_at: datetime | None
    active_duration_seconds: int
    status: StudySessionStatus
    break_taken: bool
    break_eligible: bool = False
    created_at: datetime
    updated_at: datetime


class StudySessionCreate(BaseModel):
    """POST /sessions/start — `task_id` is the only field a client ever
    supplies across this resource's entire lifecycle. `started_at`,
    `status`, `active_segment_started_at`, `active_duration_seconds`,
    `ended_at`, and `break_taken` are all server-derived and never
    accepted from a client at creation or afterward. The route accepts
    either no request body or `{}` — see app.api.v1.study_session — with
    `task_id` remaining optional either way.

    No `StudySessionUpdate` schema exists: pause/resume/finish (and any
    future break-recording) are server-controlled action endpoints with
    no client-editable request body — their transition logic lives in
    the Checkpoint 5 service layer, operating directly on the model, not
    on client-supplied schema fields.
    """

    model_config = ConfigDict(extra="forbid")

    task_id: uuid.UUID | None = None


class SessionAction(BaseModel):
    """Deliberately empty request-body schema for PATCH
    /sessions/{id}/pause|resume|finish (Checkpoint 5 design review,
    approved). These transitions accept no client-editable fields at
    all — this schema exists only so `extra="forbid"` rejects a body
    like `{"status": "Finished"}` with 422 instead of FastAPI silently
    ignoring unrecognized keys. The route parameter is optional
    (`SessionAction | None = None`) so a client may send no body at all,
    or an explicit `{}` — both are equivalent."""

    model_config = ConfigDict(extra="forbid")


class StudySessionListQuery(BaseModel):
    """Query params for GET /sessions (Checkpoint 5 design review,
    approved) — same extra="forbid"-rejects-unknown-params pattern as
    TaskListQuery."""

    model_config = ConfigDict(extra="forbid")

    status: StudySessionStatus | None = None
    limit: int = Field(20, ge=1, le=100)
    offset: int = Field(0, ge=0)
