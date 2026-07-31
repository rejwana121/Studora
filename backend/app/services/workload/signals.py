"""Authenticated per-user workload signal extraction
(docs/phase1/11-workload-engine-spec.md §11.1). `extract_signals()` is the
orchestrator combining every signal group (Deadline/Importance/Feasibility
— Batch 2A — plus Backlog/Completion/Study — Batch 2B) into a complete
`app.schemas.workload.Signals`, ready for
`app.services.workload.engine.evaluate()`. The standalone Batch 2A entry
point, `extract_deadline_importance_feasibility_signals()`, is preserved
unchanged for direct testing/use — both it and `extract_signals()` share
the same private computation helpers so there is exactly one
implementation of each rule, not two.
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, or_
from sqlmodel import Session, select

from app.models.study_block import StudyBlock
from app.models.study_session import StudySession
from app.models.study_session_break import StudySessionBreak
from app.models.subtask import Subtask
from app.models.task import Task
from app.schemas.workload import Signals, TaskContext
from app.services.workload.constants import (
    ASSESSMENT_TYPES,
    COMPLETION_DELAY_LOOKBACK_DAYS,
    MISSED_BREAK_LOOKBACK_DAYS,
    OVERDUE_BACKLOG_HOURS,
    WORKLOAD_LONG_SESSION_SECONDS,
)

# Rolling UTC duration, not a calendar/local-midnight concept — same
# precedent as app.services.task.DUE_SOON_WINDOW.
DUE_SOON_WINDOW = timedelta(hours=72)
_ACTIVE_STATUSES = ("Pending", "InProgress")
_UNFINISHED_SESSION_STATUSES = ("Active", "Paused")


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
    """One bounded query — every Deadline/Importance/Backlog/Completion
    signal that only needs the user's active (Pending/InProgress) tasks
    is derived from this single fetch, partitioned in memory, matching
    app.services.task.get_today_view's documented "one base query"
    pattern. Shared by both the standalone Batch 2A entry point and
    `extract_signals()`, which fetches it exactly once and reuses it for
    Batch 2B's overdue_backlog_count/reschedule_count_lifetime too — never
    a second fetch for the same data."""
    statement = (
        select(Task)
        .where(Task.user_id == user_id, Task.status.in_(_ACTIVE_STATUSES))
        .order_by(Task.deadline, Task.id)
    )
    return list(session.exec(statement))


def _due_within(tasks: list[Task], window: timedelta, now: datetime) -> list[Task]:
    return [t for t in tasks if now <= _as_utc_instant(t.deadline) <= now + window]


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


def _compute_deadline_importance_feasibility(
    active_tasks: list[Task],
    due_soon_72h: list[Task],
    blocks_by_task: dict[uuid.UUID, list[StudyBlock]],
    now: datetime,
) -> dict:
    """Pure (no DB) computation shared by
    `extract_deadline_importance_feasibility_signals` and
    `extract_signals` — the only place these Deadline/Importance/
    Feasibility rules are implemented.

    Feasibility is computed strictly per-task (`_clipped_scheduled_hours`
    then `max(0, estimate - scheduled)`) and only THEN summed across the
    cohort — never a global "all blocks vs all estimates" subtraction, so
    surplus scheduling on one task can never mask another task's deficit.
    A task with `estimate_hours is None` contributes no numeric hours to
    that sum and sets `had_missing_estimate`, but still counts toward
    every applicable Deadline/Importance count and toward
    `relevant_task_ids` — missing an estimate is not evidence the task
    needs no time, only that its feasibility contribution is unknown.

    `relevant_task_ids` is built by filtering `active_tasks` (already
    ordered `(deadline, id)` by the query in `_fetch_active_tasks`)
    rather than via set union — deterministic, unique-by-construction
    (each task appears once in `active_tasks`), and stably ordered run to
    run, not dependent on Python set/hash iteration order.
    """
    overdue_tasks = [t for t in active_tasks if _as_utc_instant(t.deadline) < now]

    unscheduled_hours_total = 0.0
    had_missing_estimate = False
    for task in due_soon_72h:
        if task.estimate_hours is None:
            had_missing_estimate = True
            continue
        scheduled = _clipped_scheduled_hours(task, blocks_by_task.get(task.id, []), now)
        unscheduled_hours_total += max(0.0, task.estimate_hours - scheduled)

    relevant_ids = {t.id for t in overdue_tasks} | {t.id for t in due_soon_72h}
    relevant_task_ids = [t.id for t in active_tasks if t.id in relevant_ids]

    return {
        "overdue_count": len(overdue_tasks),
        "due_24h_count": len(_due_within(active_tasks, timedelta(hours=24), now)),
        "due_48h_count": len(_due_within(active_tasks, timedelta(hours=48), now)),
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


def _fetch_due_soon_blocks(
    session: Session, user_id: uuid.UUID, due_soon_task_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[StudyBlock]]:
    """One bounded query, filtered directly on `StudyBlock.user_id` (not
    merely on the already-owned `task_id` set) — same defense-in-depth
    double-filtering `app.services.planner._query_window` already applies
    to its own Study Block fetch."""
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
    return blocks_by_task


def extract_deadline_importance_feasibility_signals(
    session: Session, user_id: uuid.UUID, now: datetime | None = None
) -> dict:
    """Batch 2A — Deadline, Importance, and Feasibility groups (spec
    §11.1), standalone entry point. Exactly 2 bounded queries regardless
    of row counts: one fetch of the user's active tasks, one fetch of the
    Study Blocks linked to the due-soon (<=72h) cohort. Returns a plain
    dict keyed by the corresponding `app.schemas.workload.Signals` field
    names — not a `Signals` instance, since this alone never has the
    Backlog/Completion/Study fields (see `extract_signals` for the
    complete orchestrator)."""
    reference_now = _as_utc_instant(now) if now is not None else datetime.now(UTC)
    active_tasks = _fetch_active_tasks(session, user_id)
    due_soon_72h = _due_within(active_tasks, DUE_SOON_WINDOW, reference_now)
    blocks_by_task = _fetch_due_soon_blocks(session, user_id, [t.id for t in due_soon_72h])
    return _compute_deadline_importance_feasibility(
        active_tasks, due_soon_72h, blocks_by_task, reference_now
    )


def extract_backlog_completion_study_signals(
    session: Session,
    user_id: uuid.UUID,
    active_tasks: list[Task],
    now: datetime | None = None,
) -> dict:
    """Batch 2B — Backlog, Completion, and Study groups (spec §11.1).
    `active_tasks` must already be fetched by the caller (`extract_signals`
    reuses the same fetch `_compute_deadline_importance_feasibility` used
    — never a second query for the same rows), and is used directly for
    `overdue_backlog_count`/`reschedule_count_lifetime` at zero extra
    query cost.

    Query budget: 3 unconditional (Subtask join, Completed tasks, one
    merged StudySession fetch serving both long_continuous_session_flag
    and missed_break_count candidates) + 1 conditional (TakeBreak events
    — only run when at least one long Finished-session candidate exists).
    Combined with the 2 queries `active_tasks`'s own caller already
    spent, the whole-engine total is bounded at 6 SELECTs when break
    candidates exist, 5 when they don't — flat regardless of row counts,
    no per-row queries.
    """
    reference_now = _as_utc_instant(now) if now is not None else datetime.now(UTC)

    # --- Backlog: overdue_backlog_count (reuses active_tasks, 0 queries) ---
    # Strictly MORE than OVERDUE_BACKLOG_HOURS overdue — a task exactly on
    # the boundary is not counted (deadline < cutoff, not <=).
    backlog_cutoff = reference_now - timedelta(hours=OVERDUE_BACKLOG_HOURS)
    overdue_backlog_count = sum(
        1 for t in active_tasks if _as_utc_instant(t.deadline) < backlog_cutoff
    )

    # --- Completion: reschedule_count_lifetime (reuses active_tasks, 0 queries) ---
    # Sum over currently-active tasks only (Checkpoint — approved
    # correction from an earlier all-tasks-ever draft) — "lifetime" here
    # means each active task's own all-time reschedule_count, not a
    # 14-day or any other windowed figure. Every explanation string for
    # this key says exactly "reschedules on active tasks (all-time per
    # task)" (app.services.workload.engine._EXPLANATION_TEMPLATES).
    reschedule_count_lifetime = sum(t.reschedule_count for t in active_tasks)

    # --- Backlog: incomplete_subtask_ratio (1 query) ---
    # Ownership filtered directly on BOTH Subtask.user_id and
    # Task.user_id (defense in depth, not relying on the join alone),
    # scoped to the user's active tasks only.
    subtasks = list(
        session.exec(
            select(Subtask)
            .join(Task, Subtask.task_id == Task.id)
            .where(
                Subtask.user_id == user_id,
                Task.user_id == user_id,
                Task.status.in_(_ACTIVE_STATUSES),
            )
        )
    )
    total_subtasks = len(subtasks)
    incomplete_subtasks = sum(1 for s in subtasks if not s.is_complete)
    incomplete_subtask_ratio = (incomplete_subtasks / total_subtasks) if total_subtasks else 0.0

    # --- Completion: recent_completion_delay_avg (1 query) ---
    completion_window_start = reference_now - timedelta(days=COMPLETION_DELAY_LOOKBACK_DAYS)
    completed_tasks = list(
        session.exec(
            select(Task).where(
                Task.user_id == user_id,
                Task.status == "Completed",
                Task.completed_at >= completion_window_start,
                Task.completed_at <= reference_now,
            )
        )
    )
    if completed_tasks:
        # Each delay clamped to >= 0 first — an early/on-time completion
        # contributes exactly 0, never a negative value that would mask
        # genuine lateness elsewhere in the average (Checkpoint — approved).
        delays_hours = [
            max(
                0.0,
                (_as_utc_instant(t.completed_at) - _as_utc_instant(t.deadline)).total_seconds()
                / 3600,
            )
            for t in completed_tasks
        ]
        recent_completion_delay_avg = sum(delays_hours) / len(delays_hours)
    else:
        recent_completion_delay_avg = None

    # --- Study: long_continuous_session_flag + missed_break_count candidates (1 query) ---
    # One query serves both signals: the current Active/Paused session
    # (at most one row, DB partial unique index) for
    # long_continuous_session_flag, and recent long Finished sessions for
    # missed_break_count — merged via OR so this stays a single SELECT
    # rather than two (keeps the whole-orchestrator budget at 6/5, see
    # `extract_signals`'s docstring).
    #
    # Only a currently ACTIVE session's OPEN segment can prove
    # continuity — active_duration_seconds is an aggregate across
    # possibly many pause/resume cycles and is never used for this flag
    # (a Paused session's active_segment_started_at is always None by the
    # model's own CHECK constraint, so it fails this check trivially
    # without a separate status branch).
    #
    # For missed_break_count, only Finished sessions are judged (an
    # in-progress session hasn't "missed" anything yet);
    # active_duration_seconds here IS an aggregate, not proof of an
    # uninterrupted segment — this signal means "a long finished session
    # with no recorded Take Break", never "a proven continuous session"
    # (see engine._EXPLANATION_TEMPLATES).
    missed_break_window_start = reference_now - timedelta(days=MISSED_BREAK_LOOKBACK_DAYS)
    sessions = list(
        session.exec(
            select(StudySession).where(
                StudySession.user_id == user_id,
                or_(
                    StudySession.status.in_(_UNFINISHED_SESSION_STATUSES),
                    and_(
                        StudySession.status == "Finished",
                        StudySession.started_at >= missed_break_window_start,
                        StudySession.active_duration_seconds >= WORKLOAD_LONG_SESSION_SECONDS,
                    ),
                ),
            )
        )
    )

    unfinished_session = next(
        (s for s in sessions if s.status in _UNFINISHED_SESSION_STATUSES), None
    )
    long_continuous_session_flag = False
    if unfinished_session is not None and unfinished_session.active_segment_started_at is not None:
        open_segment_seconds = (
            reference_now - _as_utc_instant(unfinished_session.active_segment_started_at)
        ).total_seconds()
        long_continuous_session_flag = open_segment_seconds >= WORKLOAD_LONG_SESSION_SECONDS

    long_finished_sessions = [s for s in sessions if s.status == "Finished"]
    missed_break_count = len(long_finished_sessions)
    if long_finished_sessions:
        candidate_ids = [s.id for s in long_finished_sessions]
        took_break_session_ids = set(
            session.exec(
                select(StudySessionBreak.session_id).where(
                    StudySessionBreak.user_id == user_id,
                    StudySessionBreak.session_id.in_(candidate_ids),
                    StudySessionBreak.action == "TakeBreak",
                )
            )
        )
        # Snooze/Dismiss/no event at all still count as missed -- only a
        # TakeBreak event removes a candidate session from this count.
        missed_break_count = sum(
            1 for s in long_finished_sessions if s.id not in took_break_session_ids
        )

    return {
        "overdue_backlog_count": overdue_backlog_count,
        "incomplete_subtask_ratio": incomplete_subtask_ratio,
        "recent_completion_delay_avg": recent_completion_delay_avg,
        "reschedule_count_lifetime": reschedule_count_lifetime,
        "long_continuous_session_flag": long_continuous_session_flag,
        "missed_break_count": missed_break_count,
    }


def _extract_all(
    session: Session, user_id: uuid.UUID, now: datetime | None
) -> tuple[datetime, list[Task], list[Task], dict[uuid.UUID, list[StudyBlock]], Signals]:
    """Shared internals for `extract_signals` and
    `extract_signals_with_context` (Batch 3) — exactly the same 5/6
    bounded queries either way. Returns `reference_now` alongside the raw
    rows so both public functions use the literal same instant (never a
    second `datetime.now(UTC)` call that could theoretically drift from
    the first one)."""
    reference_now = _as_utc_instant(now) if now is not None else datetime.now(UTC)
    active_tasks = _fetch_active_tasks(session, user_id)  # query 1
    due_soon_72h = _due_within(active_tasks, DUE_SOON_WINDOW, reference_now)
    blocks_by_task = _fetch_due_soon_blocks(
        session, user_id, [t.id for t in due_soon_72h]
    )  # query 2

    deadline_importance_feasibility = _compute_deadline_importance_feasibility(
        active_tasks, due_soon_72h, blocks_by_task, reference_now
    )
    backlog_completion_study = extract_backlog_completion_study_signals(
        session, user_id, active_tasks, now=reference_now
    )  # queries 3-6, or 3-7 when break candidates exist

    signals = Signals(**deadline_importance_feasibility, **backlog_completion_study)
    return reference_now, active_tasks, due_soon_72h, blocks_by_task, signals


def extract_signals(session: Session, user_id: uuid.UUID, now: datetime | None = None) -> Signals:
    """The complete per-user extraction orchestrator — combines Batch 2A
    (Deadline/Importance/Feasibility) and Batch 2B
    (Backlog/Completion/Study) into one `Signals`, ready for
    `app.services.workload.engine.evaluate()`. `active_tasks` is fetched
    exactly once and reused by both halves; total query count is bounded
    at 6 SELECTs when missed-break candidates exist, 5 when they don't,
    flat regardless of row counts (see `extract_backlog_completion_study_signals`'s
    own docstring for the full budget breakdown). Accepts an injectable
    `now` so tests never depend on wall-clock time.

    Contract unchanged since Batch 2B (Checkpoint — approved: Batch 3
    must not modify this). Internally routes through `_extract_all`
    (Batch 3 refactor) purely so `extract_signals_with_context` can reuse
    the exact same fetch — this function's own signature, return type,
    and observable behavior are identical to before."""
    *_, signals = _extract_all(session, user_id, now)
    return signals


def build_task_context(
    active_tasks: list[Task],
    due_soon_72h: list[Task],
    blocks_by_task: dict[uuid.UUID, list[StudyBlock]],
    relevant_task_ids: list[uuid.UUID],
    now: datetime,
) -> list[TaskContext]:
    """Batch 3 — pure (no DB) per-task context for
    `app.services.workload.recommendations.generate_recommendations`.
    Built entirely from data `extract_signals` already fetched — zero
    additional queries. Scoped to exactly `relevant_task_ids` (already
    ownership-safe, since it was derived only from this user's own
    `active_tasks`), in `active_tasks`'s own stable `(deadline, id)`
    order.

    `scheduled_hours` reuses `_clipped_scheduled_hours` — the identical
    per-task feasibility computation `Signals.unscheduled_estimate_hours`
    already sums, never a second implementation. Computed for every
    due-soon task regardless of whether it has an estimate (StudyBlock's
    trigger — "no linked study block before deadline" — doesn't require
    one); `unscheduled_hours` is only ever non-zero when an estimate is
    present, matching `Signals`' own missing-estimate handling.
    """
    due_soon_ids = {t.id for t in due_soon_72h}
    relevant_ids = set(relevant_task_ids)
    backlog_cutoff = now - timedelta(hours=OVERDUE_BACKLOG_HOURS)

    contexts: list[TaskContext] = []
    for task in active_tasks:
        if task.id not in relevant_ids:
            continue
        deadline = _as_utc_instant(task.deadline)
        is_due_soon = task.id in due_soon_ids
        had_missing_estimate = task.estimate_hours is None

        scheduled_hours = 0.0
        unscheduled_hours = 0.0
        if is_due_soon:
            scheduled_hours = _clipped_scheduled_hours(task, blocks_by_task.get(task.id, []), now)
            if not had_missing_estimate:
                unscheduled_hours = max(0.0, task.estimate_hours - scheduled_hours)

        contexts.append(
            TaskContext(
                id=task.id,
                title=task.title,
                type=task.type,
                priority=task.priority,
                deadline=deadline,
                estimate_hours=task.estimate_hours,
                is_overdue=deadline < now,
                is_overdue_backlog=deadline < backlog_cutoff,
                is_due_soon_72h=is_due_soon,
                scheduled_hours=scheduled_hours,
                unscheduled_hours=unscheduled_hours,
                had_missing_estimate=had_missing_estimate,
            )
        )
    return contexts


def extract_signals_with_context(
    session: Session, user_id: uuid.UUID, now: datetime | None = None
) -> tuple[Signals, list[TaskContext]]:
    """Batch 3 — additive wrapper for the recommendation generator.
    Runs the exact same internals `extract_signals` runs (via
    `_extract_all`, still 5/6 bounded queries, unchanged), then builds
    `TaskContext` from the already-fetched rows — never a new query.
    `extract_signals` itself is untouched and remains the contract every
    Batch 1/2 caller/test already depends on."""
    reference_now, active_tasks, due_soon_72h, blocks_by_task, signals = _extract_all(
        session, user_id, now
    )
    task_context = build_task_context(
        active_tasks, due_soon_72h, blocks_by_task, signals.relevant_task_ids, reference_now
    )
    return signals, task_context
