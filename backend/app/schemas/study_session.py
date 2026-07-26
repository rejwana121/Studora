import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

# "Cancelled" is retained for data-dictionary completeness (docs/phase1/
# 09-data-dictionary.md §9.6) but is reserved/unreachable through the
# currently approved API contract — no documented endpoint transitions a
# session into Cancelled. Do not add an undocumented cancel endpoint.
StudySessionStatus = Literal["Active", "Paused", "Finished", "Cancelled"]


class StudySessionRead(BaseModel):
    """`active_segment_started_at` is intentionally omitted — it is
    internal bookkeeping only (see app.models.study_session.StudySession
    docstring), never exposed to a client. The stored
    `active_duration_seconds` reflects only completed segments; a future
    service-layer serializer (Checkpoint 5) will compute an *effective*
    active_duration_seconds at response time by adding elapsed time since
    `active_segment_started_at` whenever `status == "Active"` — that
    computed value, not the raw anchor timestamp, is what a live-session
    read response will report.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    task_id: uuid.UUID | None
    started_at: datetime
    ended_at: datetime | None
    active_duration_seconds: int
    status: StudySessionStatus
    break_taken: bool
    created_at: datetime
    updated_at: datetime


class StudySessionCreate(BaseModel):
    """POST /sessions/start — `task_id` is the only field a client ever
    supplies across this resource's entire lifecycle. `started_at`,
    `status`, `active_segment_started_at`, `active_duration_seconds`,
    `ended_at`, and `break_taken` are all server-derived and never
    accepted from a client at creation or afterward.

    No `StudySessionUpdate` schema exists: pause/resume/finish (and any
    future break-recording) are server-controlled action endpoints with
    no client-editable request body — their transition logic lives in
    the Checkpoint 5 service layer, operating directly on the model, not
    on client-supplied schema fields.
    """

    model_config = ConfigDict(extra="forbid")

    task_id: uuid.UUID | None = None
