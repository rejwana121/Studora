import uuid
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlmodel import Session, select

from app.models.study_block import StudyBlock
from app.models.subject import Subject
from app.models.task import Task
from app.schemas.planner import CalendarQuery, CalendarResponse, DayQuery, DayView, PlannerTaskItem
from app.schemas.task import TaskSubjectSnapshot
from app.services.study_block import build_task_snapshot_map, serialize_study_block
from app.services.task import build_subject_snapshot_map


def _as_utc_instant(value: datetime) -> datetime:
    """Same canonicalization as app.services.task._as_utc_instant /
    app.services.study_block._as_utc_instant — a value freshly loaded from
    the (test) SQLite engine comes back naive even though its wall-clock
    value is already UTC, so a naive value is treated as already-UTC
    rather than reinterpreted in another zone. Applied at serialization
    time so every planner response datetime is timezone-aware."""
    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _day_bounds_utc(day: date, tz_name: str) -> tuple[datetime, datetime]:
    """Converts one local calendar day (in `tz_name`) into a half-open UTC
    instant interval [local day midnight, local next-day midnight).

    `zoneinfo` resolves the correct UTC offset for the specific date being
    combined (DST-safe by construction — no manual fold/gap handling is
    written here). Historically skipped civil dates/times (a jurisdiction
    that legislated a clock change spanning local midnight itself) are not
    specifically tested or claimed to be handled any particular way; this
    is an edge case Python's zoneinfo/PEP 495 fold semantics govern, not
    something this function adds its own logic for.

    Falls back to UTC only defensively: `Profile.timezone` is a NOT NULL
    column with a default of "UTC", already validated as a real IANA name
    at write time by ProfileUpdate.timezone_must_be_iana — this except
    branch guards a hypothetical row that predates that validation, not an
    expected runtime path.
    """
    try:
        tz = ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, ValueError):
        tz = ZoneInfo("UTC")
    start_local = datetime.combine(day, time.min, tzinfo=tz)
    end_local = datetime.combine(day + timedelta(days=1), time.min, tzinfo=tz)
    return start_local.astimezone(UTC), end_local.astimezone(UTC)


def _query_window(
    session: Session, user_id: uuid.UUID, range_start_utc: datetime, range_end_utc: datetime
) -> tuple[list[Task], list[StudyBlock], dict[uuid.UUID, Task], dict[uuid.UUID, Subject]]:
    """The bounded four-query plan (Checkpoint 4 design review, approved):
    (1) tasks whose deadline falls in the window, (2) study blocks
    overlapping the window (half-open interval-overlap test — a block
    starting before the window and ending inside it is included), (3) the
    distinct tasks linked by those blocks, (4) the distinct subjects
    referenced by both groups of tasks. Exactly four queries regardless of
    row counts — no per-row queries follow this."""
    tasks = list(
        session.exec(
            select(Task)
            .where(
                Task.user_id == user_id,
                Task.deadline >= range_start_utc,
                Task.deadline < range_end_utc,
            )
            .order_by(Task.deadline, Task.id)
        )
    )
    blocks = list(
        session.exec(
            select(StudyBlock)
            .where(
                StudyBlock.user_id == user_id,
                StudyBlock.starts_at < range_end_utc,
                StudyBlock.ends_at > range_start_utc,
            )
            .order_by(StudyBlock.starts_at, StudyBlock.id)
        )
    )
    linked_task_ids = {b.task_id for b in blocks if b.task_id is not None}
    linked_tasks = build_task_snapshot_map(session, user_id, linked_task_ids)
    subject_map = build_subject_snapshot_map(session, user_id, [*tasks, *linked_tasks.values()])
    return tasks, blocks, linked_tasks, subject_map


def _serialize_planner_task(task: Task, subject: Subject | None) -> PlannerTaskItem:
    snapshot = None
    if subject is not None:
        snapshot = TaskSubjectSnapshot(
            id=subject.id,
            name=subject.name,
            color_token=subject.color_token,
            archived=subject.archived_at is not None,
        )
    return PlannerTaskItem(
        id=task.id,
        subject_id=task.subject_id,
        subject=snapshot,
        title=task.title,
        type=task.type,
        deadline=_as_utc_instant(task.deadline),
        priority=task.priority,
        status=task.status,
    )


def _linked_task_subject(
    block: StudyBlock, linked_tasks: dict[uuid.UUID, Task], subject_map: dict[uuid.UUID, Subject]
) -> Subject | None:
    if block.task_id is None:
        return None
    task = linked_tasks.get(block.task_id)
    if task is None or task.subject_id is None:
        return None
    return subject_map.get(task.subject_id)


def get_calendar(
    session: Session, user_id: uuid.UUID, query: CalendarQuery, profile_timezone: str
) -> CalendarResponse:
    range_start_utc, _ = _day_bounds_utc(query.start_date, profile_timezone)
    _, range_end_utc = _day_bounds_utc(query.end_date, profile_timezone)
    tasks, blocks, linked_tasks, subject_map = _query_window(
        session, user_id, range_start_utc, range_end_utc
    )
    return CalendarResponse(
        tasks=[_serialize_planner_task(t, subject_map.get(t.subject_id)) for t in tasks],
        study_blocks=[
            serialize_study_block(
                b, linked_tasks.get(b.task_id), _linked_task_subject(b, linked_tasks, subject_map)
            )
            for b in blocks
        ],
    )


def get_day(
    session: Session, user_id: uuid.UUID, query: DayQuery, profile_timezone: str
) -> DayView:
    range_start_utc, range_end_utc = _day_bounds_utc(query.date, profile_timezone)
    tasks, blocks, linked_tasks, subject_map = _query_window(
        session, user_id, range_start_utc, range_end_utc
    )
    return DayView(
        date=query.date,
        tasks=[_serialize_planner_task(t, subject_map.get(t.subject_id)) for t in tasks],
        study_blocks=[
            serialize_study_block(
                b, linked_tasks.get(b.task_id), _linked_task_subject(b, linked_tasks, subject_map)
            )
            for b in blocks
        ],
    )
