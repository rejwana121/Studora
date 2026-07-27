import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, model_validator

from app.schemas.study_block import StudyBlockRead
from app.schemas.task import TaskPriority, TaskStatus, TaskSubjectSnapshot, TaskType

# GET /planner/calendar — API contract §10.4. Both dates are inclusive; the
# service converts this into one half-open UTC interval
# [local start_date midnight, local (end_date + 1 day) midnight) — see
# app.services.planner._day_bounds_utc. 62 is an undocumented, defensive
# abuse-prevention cap (Checkpoint 4 design review) — no approved document
# specifies a maximum calendar range.
MAX_CALENDAR_DAYS = 62


class CalendarQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start_date: date
    end_date: date

    @model_validator(mode="after")
    def end_not_before_start_and_within_cap(self):
        if self.end_date < self.start_date:
            raise ValueError("end_date must not be before start_date")
        span_days = (self.end_date - self.start_date).days + 1
        if span_days > MAX_CALENDAR_DAYS:
            raise ValueError(f"range must not exceed {MAX_CALENDAR_DAYS} calendar dates")
        return self


class DayQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: date


class PlannerTaskItem(BaseModel):
    """Lightweight task representation for planner responses (Checkpoint 4
    design review, approved) — deliberately NOT the full TaskRead: a
    calendar/day view never needs `subtasks`/`notes`/`completed_at`/
    `reschedule_count`/`estimate_hours`, and including `subtasks` in
    particular would be misleading (empty unless explicitly loaded, which
    the planner's bounded 4-query plan never does per-task)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    subject_id: uuid.UUID | None
    subject: TaskSubjectSnapshot | None = None
    title: str
    type: TaskType
    deadline: datetime
    priority: TaskPriority
    status: TaskStatus


class CalendarResponse(BaseModel):
    """GET /planner/calendar — API contract §10.4 'Tasks + study blocks by
    date range'. Ordering: tasks by (deadline, id), study blocks by
    (starts_at, id) — Checkpoint 4 design review, approved."""

    model_config = ConfigDict(from_attributes=True)

    tasks: list[PlannerTaskItem]
    study_blocks: list[StudyBlockRead]


class DayView(BaseModel):
    """GET /planner/day — API contract §10.4 'Agenda for one date +
    feasibility'. No `feasibility` field exists in this checkpoint: the
    required inputs/formula for the feasibility strip are not defined by
    any approved document (Checkpoint 4 design review) and are an
    explicitly recorded Phase-5 gap, not Phase-6 workload-risk logic and
    not silently-invented behavior. Do not add a feasibility field here
    until it is formally defined and approved."""

    model_config = ConfigDict(from_attributes=True)

    date: date
    tasks: list[PlannerTaskItem]
    study_blocks: list[StudyBlockRead]
