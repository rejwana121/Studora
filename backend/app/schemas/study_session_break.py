import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, model_validator

from app.schemas.study_session import StudySessionRead

BreakAction = Literal["TakeBreak", "Snooze", "Dismiss"]


class StudySessionBreakRead(BaseModel):
    """`user_id` is intentionally omitted — a client already knows which
    session it queried via the URL path; no need to echo it back."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    session_id: uuid.UUID
    prompted_at: datetime
    action: BreakAction
    duration_minutes: int | None


class StudySessionBreakCreate(BaseModel):
    """POST /sessions/{id}/break — `session_id` comes from the URL path and
    `user_id` from the verified JWT; neither is ever a client-supplied
    field on this schema. `prompted_at` is server-generated, never
    client-settable.

    `duration_minutes` meaning depends on `action` (Checkpoint 3 design
    review, approved): TakeBreak — optional selected/recommended break
    length; Snooze — optional minutes to suppress the next prompt;
    Dismiss — must be null, enforced here and by a database CHECK
    constraint (defense in depth, same pattern as StudyBlock's
    ends_after_starts check). No 10-15 range is enforced — that is a UI
    recommendation, not a documented invariant; only `>= 1` when supplied.

    No update schema exists: this is an append-only event log, no field
    is ever edited after creation.
    """

    model_config = ConfigDict(extra="forbid")

    action: BreakAction
    duration_minutes: int | None = None

    @model_validator(mode="after")
    def duration_minutes_valid_for_action(self):
        if self.duration_minutes is not None:
            if self.action == "Dismiss":
                raise ValueError("duration_minutes must be null when action is Dismiss")
            if self.duration_minutes < 1:
                raise ValueError("duration_minutes must be >= 1")
        return self


class SessionBreakActionResult(BaseModel):
    """POST /sessions/{id}/break response body (Checkpoint 6 design
    review, approved) — a composite of the parent session's up-to-date
    state and the break event just recorded. `session` reflects any
    TakeBreak-driven accrual/status change; for Snooze/Dismiss it reflects
    the unchanged session (still Active) with a freshly computed
    `break_eligible` that accounts for the new suppression window."""

    model_config = ConfigDict(from_attributes=True)

    session: StudySessionRead
    break_event: StudySessionBreakRead
