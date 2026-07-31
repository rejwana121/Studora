"""Pure, deterministic, read-only recommendation generator
(docs/phase1/11-workload-engine-spec.md §11.5). `generate_recommendations()`
takes an already-computed `EvaluationResult`, `Signals`, and
`list[TaskContext]` and returns an ordered `list[Recommendation]` — no
database or HTTP import anywhere in this module, no clock access (every
"is this overdue/due-soon" fact already arrives precomputed on
`TaskContext`), and nothing here ever creates/edits/deletes a Task or
StudyBlock. `proposed_change` on every `Recommendation` is preview data
only, for a human to review and act on through the app's own existing,
explicit create/edit routes.

The six recommendation types are exactly spec §11.5's six rows —
Priority, Split, Reschedule, StudyBlock, Break, Recovery (Checkpoint —
approved; none merged or omitted).
"""

import math

from app.schemas.workload import EvaluationResult, Recommendation, Signals, TaskContext
from app.services.workload.constants import (
    ASSESSMENT_TYPES,
    BREAK_SUGGESTED_MINUTES,
    MAX_PRIORITY_RECOMMENDATIONS,
    MAX_RECOMMENDATIONS,
    RECOMMENDATION_ENGINE_VERSION,
    RECOMMENDATION_TYPE_RANK,
    RECOVERY_MAX_TASKS,
    RESCHEDULE_COLLISION_WINDOW_HOURS,
    SPLIT_CHUNK_HOURS,
    SPLIT_MIN_UNSCHEDULED_HOURS,
    STRONG_CLUSTER_72H,
    STRONG_HIGH_PRIORITY_DUE_SOON_COUNT,
    STRONG_OVERDUE_BACKLOG_COUNT,
    STUDY_BLOCK_DEFAULT_DURATION_HOURS,
    STUDY_BLOCK_MAX_SUGGESTED_HOURS,
)

# Recommendation types suppressed at Low level (Checkpoint — approved,
# requirement 9): even if their raw trigger technically holds (a single
# strong signal can coexist with an overall Low score — see engine.py's
# own gate reasoning), a Low-load evaluation's advice must stay practical,
# never backlog/crisis-framed. Priority/StudyBlock/Break are neutral,
# always-eligible task/behaviour facts; Reschedule/Split/Recovery read as
# more serious and are held back until at least Moderate.
_SUPPRESSED_AT_LOW = frozenset({"Reschedule", "Split", "Recovery"})

_TASK_PRIORITY_RANK = {"Low": 0, "Medium": 1, "High": 2}


def _generate_break(signals: Signals) -> Recommendation | None:
    if not signals.long_continuous_session_flag:
        return None
    return Recommendation(
        type="Break",
        title="Take a break",
        explanation=(
            "You've been studying continuously for over 90 minutes — a 10-15 minute "
            "break might help."
        ),
        relevant_task_ids=[],
        proposed_change={"suggested_break_minutes": BREAK_SUGGESTED_MINUTES},
        rank=RECOMMENDATION_TYPE_RANK["Break"],
        recommendation_engine_version=RECOMMENDATION_ENGINE_VERSION,
    )


def _generate_recovery(
    signals: Signals, task_context: list[TaskContext]
) -> Recommendation | None:
    if signals.overdue_backlog_count < STRONG_OVERDUE_BACKLOG_COUNT:
        return None
    candidates = [t for t in task_context if t.is_overdue_backlog]
    if not candidates:
        return None
    # Favors small overdue active tasks first, missing estimates last
    # (Checkpoint — approved, requirement: "small next-step suggestions").
    selected = sorted(
        candidates,
        key=lambda t: (
            t.had_missing_estimate,
            t.estimate_hours if t.estimate_hours is not None else 0.0,
            t.deadline,
            t.id,
        ),
    )[:RECOVERY_MAX_TASKS]

    if len(selected) == 1:
        explanation = (
            f"{selected[0].title} has been overdue for a while — tackling it first "
            "might help clear the backlog."
        )
    else:
        titles = ", ".join(t.title for t in selected)
        explanation = f"These overdue tasks are good candidates to clear first: {titles}."

    return Recommendation(
        type="Recovery",
        title="Clear overdue backlog",
        explanation=explanation,
        relevant_task_ids=[t.id for t in selected],
        proposed_change={"task_ids": [t.id for t in selected]},
        rank=RECOMMENDATION_TYPE_RANK["Recovery"],
        recommendation_engine_version=RECOMMENDATION_ENGINE_VERSION,
    )


def _generate_priority(
    signals: Signals, task_context: list[TaskContext]
) -> Recommendation | None:
    triggered = (
        signals.high_priority_due_soon_count >= STRONG_HIGH_PRIORITY_DUE_SOON_COUNT
        or signals.cluster_72h >= STRONG_CLUSTER_72H
    )
    if not triggered:
        return None
    candidates = [t for t in task_context if t.is_due_soon_72h]
    if not candidates:
        return None
    selected = sorted(
        candidates,
        key=lambda t: (-_TASK_PRIORITY_RANK[t.priority], t.deadline, t.id),
    )[:MAX_PRIORITY_RECOMMENDATIONS]

    if len(selected) == 1:
        explanation = (
            f"{selected[0].title} is due soon and high priority — consider tackling "
            "it first."
        )
    else:
        titles = ", ".join(t.title for t in selected)
        explanation = f"These tasks are due soon and worth prioritizing: {titles}."

    return Recommendation(
        type="Priority",
        title="Focus on what's due soon",
        explanation=explanation,
        relevant_task_ids=[t.id for t in selected],
        proposed_change={"suggested_order": [t.id for t in selected]},
        rank=RECOMMENDATION_TYPE_RANK["Priority"],
        recommendation_engine_version=RECOMMENDATION_ENGINE_VERSION,
    )


def _generate_study_block(task_context: list[TaskContext]) -> Recommendation | None:
    candidates = [
        t
        for t in task_context
        if t.is_due_soon_72h
        and t.scheduled_hours == 0.0
        and (t.priority == "High" or t.type in ASSESSMENT_TYPES)
    ]
    if not candidates:
        return None
    selected = sorted(candidates, key=lambda t: (t.deadline, t.id))[0]

    if selected.estimate_hours is not None:
        duration = min(selected.estimate_hours, STUDY_BLOCK_MAX_SUGGESTED_HOURS)
    else:
        duration = STUDY_BLOCK_DEFAULT_DURATION_HOURS

    # Preview-only (Checkpoint — approved, requirement 3): the 5/6-query
    # context has no visibility into the user's whole Planner calendar,
    # so no specific start/end time is ever fabricated or called
    # "available" — only a suggested duration, the deadline it must land
    # before, and a flag telling the client to open the Planner for the
    # user's own slot choice.
    return Recommendation(
        type="StudyBlock",
        title="Schedule study time",
        explanation=f"Schedule study time for {selected.title} before its deadline.",
        relevant_task_ids=[selected.id],
        proposed_change={
            "task_id": selected.id,
            "suggested_duration_hours": duration,
            "schedule_before": selected.deadline,
            "open_planner_for_user_selection": True,
        },
        rank=RECOMMENDATION_TYPE_RANK["StudyBlock"],
        recommendation_engine_version=RECOMMENDATION_ENGINE_VERSION,
    )


def _generate_split(task_context: list[TaskContext]) -> Recommendation | None:
    candidates = [
        t
        for t in task_context
        if t.is_due_soon_72h
        and not t.had_missing_estimate
        and t.unscheduled_hours >= SPLIT_MIN_UNSCHEDULED_HOURS
    ]
    if not candidates:
        return None
    # Largest unscheduled task first; deterministic tie-break (deadline,
    # then id) when two tasks tie exactly on unscheduled_hours.
    selected = sorted(candidates, key=lambda t: (-t.unscheduled_hours, t.deadline, t.id))[0]
    suggested_subtask_count = max(1, math.ceil(selected.unscheduled_hours / SPLIT_CHUNK_HOURS))

    return Recommendation(
        type="Split",
        title="Split a large task",
        explanation=(
            f"{selected.title} has about {selected.unscheduled_hours:.1f}h of "
            "unscheduled work left — consider splitting it into smaller pieces."
        ),
        relevant_task_ids=[selected.id],
        proposed_change={
            "task_id": selected.id,
            "suggested_subtask_count": suggested_subtask_count,
        },
        rank=RECOMMENDATION_TYPE_RANK["Split"],
        recommendation_engine_version=RECOMMENDATION_ENGINE_VERSION,
    )


def _generate_reschedule(task_context: list[TaskContext]) -> Recommendation | None:
    due_soon = [t for t in task_context if t.is_due_soon_72h]
    high_priority = [t for t in due_soon if t.priority == "High"]
    others = [t for t in due_soon if t.priority != "High"]

    collision_window_seconds = RESCHEDULE_COLLISION_WINDOW_HOURS * 3600
    colliding_pairs = [
        (a, b, abs((a.deadline - b.deadline).total_seconds()))
        for a in high_priority
        for b in others
        if abs((a.deadline - b.deadline).total_seconds()) <= collision_window_seconds
    ]
    if not colliding_pairs:
        return None

    # Deterministic tie-break: smallest gap wins; ties broken by b's own
    # (deadline, id) so the result never depends on list/set/dict
    # iteration order.
    colliding_with, selected, _gap_seconds = min(
        colliding_pairs, key=lambda pair: (pair[2], pair[1].deadline, pair[1].id)
    )

    # No invented deadline (Checkpoint — approved): spec defines no
    # algorithm for picking a new date, so `suggested_new_deadline` is
    # explicitly null rather than a fabricated value.
    return Recommendation(
        type="Reschedule",
        title="Reschedule a conflicting task",
        explanation=(
            f"{selected.title} is due close to {colliding_with.title}, a "
            "higher-priority deadline — consider moving it."
        ),
        relevant_task_ids=[selected.id],
        proposed_change={
            "task_id": selected.id,
            "colliding_with_task_id": colliding_with.id,
            "suggested_new_deadline": None,
        },
        rank=RECOMMENDATION_TYPE_RANK["Reschedule"],
        recommendation_engine_version=RECOMMENDATION_ENGINE_VERSION,
    )


def _resolve_conflicts(by_type: dict[str, Recommendation]) -> dict[str, Recommendation]:
    """Explicit conflict rule (Checkpoint — approved, requirement 2): a
    task selected for Reschedule must not also carry a StudyBlock
    recommendation in the same response (proposing to move a deadline
    and proposing to schedule time before that same deadline are
    contradictory advice for the same task). No other pair conflicts —
    Priority+StudyBlock, Priority+Split, and Recovery+Split are all
    explicitly allowed to coexist, including for the same task, since
    they are complementary rather than contradictory."""
    reschedule = by_type.get("Reschedule")
    study_block = by_type.get("StudyBlock")
    if reschedule is not None and study_block is not None:
        if set(reschedule.relevant_task_ids) & set(study_block.relevant_task_ids):
            del by_type["StudyBlock"]
    return by_type


def generate_recommendations(
    evaluation: EvaluationResult, signals: Signals, task_context: list[TaskContext]
) -> list[Recommendation]:
    """docs/phase1/11-workload-engine-spec.md §11.5. Pure, deterministic,
    read-only: never creates/edits/deletes a Task or StudyBlock, never
    reads a clock or a database. Returns at most `MAX_RECOMMENDATIONS`,
    ordered by `constants.RECOMMENDATION_TYPE_RANK` (Break/Recovery first
    so they're never truncated behind lower-confidence scheduling advice),
    with the Reschedule/StudyBlock conflict resolved (see
    `_resolve_conflicts`).

    Every explanation is a fixed template built only from task/behaviour
    facts (titles, hours, counts) — never from `evaluation.level` — so a
    raw High/Critical score gated down to Moderate can never leak
    High/Critical wording (there is no level-derived wording to leak).
    Reschedule/Split/Recovery are additionally suppressed at Low level
    (see `_SUPPRESSED_AT_LOW`) so a low-load evaluation's advice never
    reads as alarming.
    """
    generators: dict[str, Recommendation | None] = {
        "Break": _generate_break(signals),
        "Recovery": _generate_recovery(signals, task_context),
        "Priority": _generate_priority(signals, task_context),
        "StudyBlock": _generate_study_block(task_context),
        "Split": _generate_split(task_context),
        "Reschedule": _generate_reschedule(task_context),
    }

    # Low-level suppression lives in exactly this one place (requirement
    # 9) — Reschedule/Split/Recovery are held back regardless of whether
    # their own trigger technically fired, so a low-load evaluation's
    # advice never reads as alarming.
    by_type = {
        rec_type: rec
        for rec_type, rec in generators.items()
        if rec is not None and not (evaluation.level == "Low" and rec_type in _SUPPRESSED_AT_LOW)
    }
    by_type = _resolve_conflicts(by_type)

    ordered = sorted(by_type.values(), key=lambda r: r.rank)
    return ordered[:MAX_RECOMMENDATIONS]
