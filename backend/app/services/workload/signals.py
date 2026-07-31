"""Authenticated per-user workload signal extraction — Deadline,
Importance, and Feasibility groups only (Batch 2A;
docs/phase1/11-workload-engine-spec.md §11.1). Backlog/Completion/Study
groups and the final `extract_signals()` orchestrator that combines every
group into a complete `app.schemas.workload.Signals` are a later batch
(Batch 2B) — this module returns a plain dict of the field values it
computes, not a `Signals` instance, so it has no premature dependency on
code that doesn't exist yet.
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlmodel import Session, select

from app.models.study_block import StudyBlock
from app.models.task import Task
from app.services.workload.constants import ASSESSMENT_TYPES

# Rolling UTC duration, not a calendar/local-midnight concept — same
# precedent as app.services.task.DUE_SOON_WINDOW.
DUE_SOON_WINDOW = timedelta(hours=72)
_ACTIVE_STATUSES = ("Pending", "InProgress")


def _as_utc_instant(value: datetime) -> datetime:
    """Same canonicalization as app.services.task._as_utc_instant /
    app.services.planner._as_utc_instant / app.services.study_block /
    app.services.study_session's own copies — a value freshly loaded from
    the (test) SQLite engine comes back naive even though its wall-clock
    value is already UTC, so a naive value is treated as already-UTC
    rather than reinterpreted in another zone."""
    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _fetch_active_tasks(session: Session, user_id: uuid.UUID) -> list[Task]:
    """One bounded query — every Deadline/Importance signal in this
    module (and, in Batch 2B, Backlog's overdue_backlog_count) is derived
    from this single fetch, partitioned in memory, matching
    app.services.task.get_today_view's documented "one base query"
    pattern — never a per-signal query."""
    statement = (
        select(Task)
        .where(Task.user_id == user_id, Task.status.in_(_ACTIVE_STATUSES))
        .order_by(Task.deadline, Task.id)
    )
    return list(session.exec(statement))


def _merge_intervals(
    intervals: list[tuple[datetime, datetime]],
) -> list[tuple[datetime, datetime]]:
    """Sorts by start and merges any pair that overlaps OR touches
    (`start <= previous_end`) — two Study Blocks scheduled back-to-back
    with no gap must not be double-counted as if they covered separate
    time, same requirement as two that literally overlap."""
    if not intervals:
        return []
    ordered = sorted(intervals, key=lambda interval: interval[0])
    merged = [ordered[0]]
    for start, end in ordered[1:]:
        last_start, last_end = merged[-1]
        if start <= last_end:
            merged[-1] = (last_start, max(last_end, end))
        else:
            merged.append((start, end))
    return merged


def _clipped_scheduled_hours(task: Task, blocks: list[StudyBlock], now: datetime) -> float:
    """Every Study Block linked to `task` is clipped to [now,
    task.deadline] — an already-elapsed portion before `now` isn't
    schedulable time going forward, and a portion scheduled past the
    deadline doesn't help meet it (this is also how a block linked
    entirely at/after the deadline naturally contributes zero, with no
    special-case branch: its clipped interval is empty by construction).
    Empty/invalid clipped intervals are discarded, survivors are merged
    (`_merge_intervals`) so overlapping/touching blocks are never
    double-counted, and only then summed to hours."""
    deadline = _as_utc_instant(task.deadline)
    clipped: list[tuple[datetime, datetime]] = []
    for block in blocks:
        start = max(_as_utc_instant(block.starts_at), now)
        end = min(_as_utc_instant(block.ends_at), deadline)
        if start < end:
            clipped.append((start, end))
    merged = _merge_intervals(clipped)
    return sum((end - start).total_seconds() / 3600 for start, end in merged)


def extract_deadline_importance_feasibility_signals(
    session: Session, user_id: uuid.UUID, now: datetime | None = None
) -> dict:
    """Batch 2A — Deadline, Importance, and Feasibility groups (spec
    §11.1). Exactly 2 bounded queries regardless of row counts: one fetch
    of the user's active tasks, one fetch of the Study Blocks linked to
    the due-soon (<=72h) cohort — both filtered directly on `user_id`
    (not merely on the already-owned `task_id` set), same defense-in-depth
    double-filtering `app.services.planner._query_window` already applies
    to its own Study Block fetch. Returns a plain dict keyed by the
    corresponding `app.schemas.workload.Signals` field names.

    Feasibility is computed strictly per-task (`_clipped_scheduled_hours`
    then `max(0, estimate - scheduled)`) and only THEN summed across the
    cohort — never a global "all blocks vs all estimates" subtraction,
    so surplus scheduling on one task can never mask another task's
    deficit. A task with `estimate_hours is None` contributes no numeric
    hours to that sum and sets `had_missing_estimate`, but still counts
    toward every applicable Deadline/Importance count and toward
    `relevant_task_ids` — missing an estimate is not evidence the task
    needs no time, only that its feasibility contribution is unknown.
    """
    reference_now = _as_utc_instant(now) if now is not None else datetime.now(UTC)
    active_tasks = _fetch_active_tasks(session, user_id)

    overdue_tasks = [t for t in active_tasks if _as_utc_instant(t.deadline) < reference_now]

    def _due_within(window: timedelta) -> list[Task]:
        return [
            t
            for t in active_tasks
            if reference_now <= _as_utc_instant(t.deadline) <= reference_now + window
        ]

    due_soon_72h = _due_within(DUE_SOON_WINDOW)
    due_soon_task_ids = [t.id for t in due_soon_72h]

    blocks = list(
        session.exec(
            select(StudyBlock).where(
                StudyBlock.user_id == user_id, StudyBlock.task_id.in_(due_soon_task_ids)
            )
        )
    )
    blocks_by_task: dict[uuid.UUID, list[StudyBlock]] = {}
    for block in blocks:
        blocks_by_task.setdefault(block.task_id, []).append(block)

    unscheduled_hours_total = 0.0
    had_missing_estimate = False
    for task in due_soon_72h:
        if task.estimate_hours is None:
            had_missing_estimate = True
            continue
        scheduled = _clipped_scheduled_hours(task, blocks_by_task.get(task.id, []), reference_now)
        unscheduled_hours_total += max(0.0, task.estimate_hours - scheduled)

    relevant_task_ids = list({t.id for t in overdue_tasks} | {t.id for t in due_soon_72h})

    return {
        "overdue_count": len(overdue_tasks),
        "due_24h_count": len(_due_within(timedelta(hours=24))),
        "due_48h_count": len(_due_within(timedelta(hours=48))),
        "due_72h_count": len(due_soon_72h),
        "cluster_72h": len(due_soon_72h),
        "high_priority_due_soon_count": sum(1 for t in due_soon_72h if t.priority == "High"),
        "assessment_type_due_soon_count": sum(
            1 for t in due_soon_72h if t.type in ASSESSMENT_TYPES
        ),
        "unscheduled_estimate_hours": unscheduled_hours_total,
        "had_missing_estimate": had_missing_estimate,
        "relevant_task_ids": relevant_task_ids,
    }
