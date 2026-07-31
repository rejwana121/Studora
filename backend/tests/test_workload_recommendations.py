"""Pure-function tests for app.services.workload.recommendations — no DB,
no HTTP, no clock. Constructs `EvaluationResult`/`Signals`/`TaskContext`
fixtures by hand (mirrors test_workload_engine.py's style).

Covers: each of the 6 types' exact trigger boundary, task-selection +
deterministic tie-breaks, exact explanation text, exact `proposed_change`
shape, missing-estimate handling, the explicit Reschedule/StudyBlock
conflict, allowed coexistence (Priority+StudyBlock, Priority+Split,
Recovery+Split — including for the same task), MAX_RECOMMENDATIONS
truncation + rank ordering, Low-level suppression, gate-aware wording
(no level words ever), and a banned-clinical-word scan.
"""

import uuid
from datetime import UTC, datetime, timedelta

from app.schemas.workload import EvaluationResult, Signals, TaskContext
from app.services.workload.constants import (
    MAX_RECOMMENDATIONS,
    RECOMMENDATION_ENGINE_VERSION,
    RECOMMENDATION_TYPE_RANK,
)
from app.services.workload.recommendations import generate_recommendations

NOW = datetime(2026, 8, 1, 12, 0, tzinfo=UTC)


def _evaluation(level: str = "Moderate", **overrides) -> EvaluationResult:
    defaults = dict(
        raw_score=40,
        ungated_level=level,
        level=level,
        gate_applied=False,
        gate_explanation=None,
        strong_signal_count=0,
        confidence="full",
        factors=[],
        relevant_task_ids=[],
        evaluated_at=NOW,
        engine_version="0.1.0",
    )
    defaults.update(overrides)
    return EvaluationResult(**defaults)


def _gated_evaluation() -> EvaluationResult:
    """A raw High/Critical score capped to Moderate by the safety gate —
    used to prove recommendation wording never leaks the ungated word."""
    return _evaluation(
        level="Moderate",
        raw_score=78,
        ungated_level="Critical",
        gate_applied=True,
        gate_explanation=(
            "The raw score maps to Critical, but only 1 of the required 2 strong "
            "signals is present, so the final level is capped at Moderate."
        ),
        strong_signal_count=1,
    )


def _task_ctx(
    title: str = "Task",
    deadline: datetime = NOW + timedelta(hours=10),
    priority: str = "Medium",
    type_: str = "Assignment",
    estimate_hours: float | None = None,
    is_overdue: bool = False,
    is_overdue_backlog: bool = False,
    is_due_soon_72h: bool = True,
    scheduled_hours: float = 0.0,
    unscheduled_hours: float = 0.0,
    had_missing_estimate: bool | None = None,
    id: uuid.UUID | None = None,
) -> TaskContext:
    return TaskContext(
        id=id or uuid.uuid4(),
        title=title,
        type=type_,
        priority=priority,
        deadline=deadline,
        estimate_hours=estimate_hours,
        is_overdue=is_overdue,
        is_overdue_backlog=is_overdue_backlog,
        is_due_soon_72h=is_due_soon_72h,
        scheduled_hours=scheduled_hours,
        unscheduled_hours=unscheduled_hours,
        had_missing_estimate=(
            (estimate_hours is None) if had_missing_estimate is None else had_missing_estimate
        ),
    )


def _signals(**overrides) -> Signals:
    return Signals(**overrides)


# --- Break ---


def test_break_triggers_on_long_continuous_session_flag():
    result = generate_recommendations(
        _evaluation(), _signals(long_continuous_session_flag=True), []
    )
    break_rec = next(r for r in result if r.type == "Break")
    assert break_rec.explanation == (
        "You've been studying continuously for over 90 minutes — a 10-15 minute "
        "break might help."
    )
    assert break_rec.proposed_change == {"suggested_break_minutes": 10}
    assert break_rec.relevant_task_ids == []
    assert break_rec.rank == RECOMMENDATION_TYPE_RANK["Break"]
    assert break_rec.recommendation_engine_version == RECOMMENDATION_ENGINE_VERSION


def test_break_does_not_fire_when_flag_false():
    result = generate_recommendations(
        _evaluation(), _signals(long_continuous_session_flag=False), []
    )
    assert not any(r.type == "Break" for r in result)


def test_break_fires_even_at_low_level():
    result = generate_recommendations(
        _evaluation(level="Low"), _signals(long_continuous_session_flag=True), []
    )
    assert any(r.type == "Break" for r in result)


# --- Recovery ---


def test_recovery_triggers_at_strong_overdue_backlog_threshold():
    tasks = [_task_ctx(title=f"T{i}", is_overdue_backlog=True) for i in range(3)]
    result = generate_recommendations(_evaluation(), _signals(overdue_backlog_count=3), tasks)
    assert any(r.type == "Recovery" for r in result)


def test_recovery_does_not_trigger_below_threshold():
    tasks = [_task_ctx(is_overdue_backlog=True)]
    result = generate_recommendations(_evaluation(), _signals(overdue_backlog_count=2), tasks)
    assert not any(r.type == "Recovery" for r in result)


def test_recovery_favors_small_tasks_missing_estimates_last():
    small = _task_ctx(title="small", is_overdue_backlog=True, estimate_hours=1.0)
    large = _task_ctx(title="large", is_overdue_backlog=True, estimate_hours=5.0)
    unknown = _task_ctx(title="unknown", is_overdue_backlog=True, estimate_hours=None)
    result = generate_recommendations(
        _evaluation(), _signals(overdue_backlog_count=3), [large, unknown, small]
    )
    recovery = next(r for r in result if r.type == "Recovery")
    assert recovery.relevant_task_ids == [small.id, large.id]  # RECOVERY_MAX_TASKS=2, unknown last


def test_recovery_suppressed_at_low_level():
    tasks = [_task_ctx(title=f"T{i}", is_overdue_backlog=True) for i in range(3)]
    result = generate_recommendations(
        _evaluation(level="Low"), _signals(overdue_backlog_count=3), tasks
    )
    assert not any(r.type == "Recovery" for r in result)


def test_recovery_ignores_non_backlog_tasks():
    tasks = [_task_ctx(is_overdue_backlog=False)]
    result = generate_recommendations(_evaluation(), _signals(overdue_backlog_count=3), tasks)
    assert not any(r.type == "Recovery" for r in result)


# --- Priority ---


def test_priority_triggers_on_strong_high_priority_due_soon_count():
    tasks = [_task_ctx(title=f"T{i}", priority="High") for i in range(2)]
    result = generate_recommendations(
        _evaluation(), _signals(high_priority_due_soon_count=2), tasks
    )
    assert any(r.type == "Priority" for r in result)


def test_priority_triggers_on_strong_cluster_72h():
    tasks = [_task_ctx(title=f"T{i}") for i in range(3)]
    result = generate_recommendations(_evaluation(), _signals(cluster_72h=3), tasks)
    assert any(r.type == "Priority" for r in result)


def test_priority_does_not_trigger_below_both_thresholds():
    tasks = [_task_ctx()]
    result = generate_recommendations(
        _evaluation(), _signals(high_priority_due_soon_count=1, cluster_72h=1), tasks
    )
    assert not any(r.type == "Priority" for r in result)


def test_priority_selects_by_priority_then_deadline_then_id():
    low = _task_ctx(title="low", priority="Low", deadline=NOW + timedelta(hours=1))
    high_later = _task_ctx(title="high_later", priority="High", deadline=NOW + timedelta(hours=5))
    high_sooner = _task_ctx(title="high_sooner", priority="High", deadline=NOW + timedelta(hours=2))
    result = generate_recommendations(
        _evaluation(), _signals(cluster_72h=3), [low, high_later, high_sooner]
    )
    priority = next(r for r in result if r.type == "Priority")
    assert priority.relevant_task_ids == [high_sooner.id, high_later.id]  # MAX=2, High first


def test_priority_proposed_change_and_explanation_singular():
    task = _task_ctx(title="Solo", priority="High")
    result = generate_recommendations(
        _evaluation(), _signals(high_priority_due_soon_count=2), [task]
    )
    priority = next(r for r in result if r.type == "Priority")
    assert priority.explanation == (
        "Solo is due soon and high priority — consider tackling it first."
    )
    assert priority.proposed_change == {"suggested_order": [task.id]}


def test_priority_suppressed_at_low_level_is_not_expected():
    # Priority is explicitly NOT in the Low-suppression set (only
    # Reschedule/Split/Recovery are) -- must still fire at Low.
    tasks = [_task_ctx(priority="High") for _ in range(2)]
    result = generate_recommendations(
        _evaluation(level="Low"), _signals(high_priority_due_soon_count=2), tasks
    )
    assert any(r.type == "Priority" for r in result)


# --- Split ---


def test_split_triggers_at_min_unscheduled_hours_threshold():
    task = _task_ctx(estimate_hours=5.0, unscheduled_hours=3.0)
    result = generate_recommendations(_evaluation(), _signals(), [task])
    assert any(r.type == "Split" for r in result)


def test_split_does_not_trigger_below_threshold():
    task = _task_ctx(estimate_hours=5.0, unscheduled_hours=2.99)
    result = generate_recommendations(_evaluation(), _signals(), [task])
    assert not any(r.type == "Split" for r in result)


def test_split_never_selects_missing_estimate_task():
    missing = _task_ctx(title="missing", estimate_hours=None, unscheduled_hours=0.0)
    result = generate_recommendations(_evaluation(), _signals(), [missing])
    assert not any(r.type == "Split" for r in result)


def test_split_selects_largest_unscheduled_with_deterministic_tie_break():
    smaller = _task_ctx(title="smaller", estimate_hours=5.0, unscheduled_hours=3.0)
    larger = _task_ctx(title="larger", estimate_hours=8.0, unscheduled_hours=6.0)
    result = generate_recommendations(_evaluation(), _signals(), [smaller, larger])
    split = next(r for r in result if r.type == "Split")
    assert split.relevant_task_ids == [larger.id]
    assert split.explanation == (
        "larger has about 6.0h of unscheduled work left — consider splitting it "
        "into smaller pieces."
    )
    assert split.proposed_change == {"task_id": larger.id, "suggested_subtask_count": 3}


def test_split_tie_break_by_deadline_then_id_when_hours_equal():
    sooner = _task_ctx(
        title="sooner", estimate_hours=5.0, unscheduled_hours=4.0, deadline=NOW + timedelta(hours=1)
    )
    later = _task_ctx(
        title="later", estimate_hours=5.0, unscheduled_hours=4.0, deadline=NOW + timedelta(hours=5)
    )
    result = generate_recommendations(_evaluation(), _signals(), [later, sooner])
    split = next(r for r in result if r.type == "Split")
    assert split.relevant_task_ids == [sooner.id]


def test_split_suppressed_at_low_level():
    task = _task_ctx(estimate_hours=5.0, unscheduled_hours=4.0)
    result = generate_recommendations(_evaluation(level="Low"), _signals(), [task])
    assert not any(r.type == "Split" for r in result)


# --- StudyBlock ---


def test_study_block_triggers_for_important_task_with_zero_scheduled_hours():
    task = _task_ctx(priority="High", scheduled_hours=0.0)
    result = generate_recommendations(_evaluation(), _signals(), [task])
    assert any(r.type == "StudyBlock" for r in result)


def test_study_block_does_not_trigger_when_hours_already_scheduled():
    task = _task_ctx(priority="High", scheduled_hours=1.0)
    result = generate_recommendations(_evaluation(), _signals(), [task])
    assert not any(r.type == "StudyBlock" for r in result)


def test_study_block_does_not_trigger_for_unimportant_task():
    task = _task_ctx(priority="Low", type_="Assignment", scheduled_hours=0.0)
    result = generate_recommendations(_evaluation(), _signals(), [task])
    assert not any(r.type == "StudyBlock" for r in result)


def test_study_block_triggers_for_assessment_type_even_if_not_high_priority():
    task = _task_ctx(priority="Medium", type_="Quiz", scheduled_hours=0.0)
    result = generate_recommendations(_evaluation(), _signals(), [task])
    assert any(r.type == "StudyBlock" for r in result)


def test_study_block_proposed_change_is_preview_only_no_fabricated_slot():
    task = _task_ctx(title="Exam prep", priority="High", scheduled_hours=0.0, estimate_hours=3.0)
    result = generate_recommendations(_evaluation(), _signals(), [task])
    study_block = next(r for r in result if r.type == "StudyBlock")
    assert study_block.explanation == "Schedule study time for Exam prep before its deadline."
    assert study_block.proposed_change == {
        "task_id": task.id,
        "suggested_duration_hours": 3.0,
        "schedule_before": task.deadline,
        "open_planner_for_user_selection": True,
    }
    # Never fabricates a start/end time or calls anything "available".
    assert "suggested_starts_at" not in study_block.proposed_change
    assert "suggested_ends_at" not in study_block.proposed_change
    assert "available" not in study_block.explanation.lower()


def test_study_block_missing_estimate_uses_default_duration_honestly():
    task = _task_ctx(title="No estimate", priority="High", scheduled_hours=0.0, estimate_hours=None)
    result = generate_recommendations(_evaluation(), _signals(), [task])
    study_block = next(r for r in result if r.type == "StudyBlock")
    # DEFAULT, not fabricated from None.
    assert study_block.proposed_change["suggested_duration_hours"] == 2.0


def test_study_block_duration_capped_at_max_suggested_hours():
    task = _task_ctx(priority="High", scheduled_hours=0.0, estimate_hours=99.0)
    result = generate_recommendations(_evaluation(), _signals(), [task])
    study_block = next(r for r in result if r.type == "StudyBlock")
    assert study_block.proposed_change["suggested_duration_hours"] == 4.0


def test_study_block_selects_soonest_deadline_first():
    later = _task_ctx(
        title="later", priority="High", scheduled_hours=0.0, deadline=NOW + timedelta(hours=5)
    )
    sooner = _task_ctx(
        title="sooner", priority="High", scheduled_hours=0.0, deadline=NOW + timedelta(hours=1)
    )
    result = generate_recommendations(_evaluation(), _signals(), [later, sooner])
    study_block = next(r for r in result if r.type == "StudyBlock")
    assert study_block.relevant_task_ids == [sooner.id]


# --- Reschedule ---


def test_reschedule_triggers_on_colliding_high_and_low_priority_deadlines():
    high = _task_ctx(title="high", priority="High", deadline=NOW + timedelta(hours=10))
    low = _task_ctx(title="low", priority="Low", deadline=NOW + timedelta(hours=12))
    result = generate_recommendations(_evaluation(), _signals(), [high, low])
    reschedule = next(r for r in result if r.type == "Reschedule")
    assert reschedule.relevant_task_ids == [low.id]
    assert reschedule.explanation == (
        "low is due close to high, a higher-priority deadline — consider moving it."
    )


def test_reschedule_does_not_trigger_outside_collision_window():
    high = _task_ctx(title="high", priority="High", deadline=NOW + timedelta(hours=10))
    low = _task_ctx(title="low", priority="Low", deadline=NOW + timedelta(hours=40))
    result = generate_recommendations(_evaluation(), _signals(), [high, low])
    assert not any(r.type == "Reschedule" for r in result)


def test_reschedule_never_invents_a_new_deadline():
    high = _task_ctx(title="high", priority="High", deadline=NOW + timedelta(hours=10))
    low = _task_ctx(title="low", priority="Low", deadline=NOW + timedelta(hours=11))
    result = generate_recommendations(_evaluation(), _signals(), [high, low])
    reschedule = next(r for r in result if r.type == "Reschedule")
    assert reschedule.proposed_change == {
        "task_id": low.id,
        "colliding_with_task_id": high.id,
        "suggested_new_deadline": None,
    }


def test_reschedule_picks_smallest_gap_deterministically():
    high = _task_ctx(title="high", priority="High", deadline=NOW + timedelta(hours=10))
    far = _task_ctx(title="far", priority="Low", deadline=NOW + timedelta(hours=15))
    close = _task_ctx(title="close", priority="Low", deadline=NOW + timedelta(hours=11))
    result = generate_recommendations(_evaluation(), _signals(), [high, far, close])
    reschedule = next(r for r in result if r.type == "Reschedule")
    assert reschedule.relevant_task_ids == [close.id]


def test_reschedule_suppressed_at_low_level():
    high = _task_ctx(title="high", priority="High", deadline=NOW + timedelta(hours=10))
    low = _task_ctx(title="low", priority="Low", deadline=NOW + timedelta(hours=11))
    result = generate_recommendations(_evaluation(level="Low"), _signals(), [high, low])
    assert not any(r.type == "Reschedule" for r in result)


# --- Explicit conflict: Reschedule vs StudyBlock on the same task ---


def test_reschedule_and_study_block_conflict_drops_study_block():
    high = _task_ctx(
        title="high", priority="High", deadline=NOW + timedelta(hours=10), scheduled_hours=1.0
    )
    # `low` is both a Reschedule candidate (Medium priority, colliding
    # with `high`) AND, independently, an important task (assessment
    # type) with zero scheduled hours -- a StudyBlock candidate for the
    # SAME task.
    low = _task_ctx(
        title="low", priority="Medium", type_="Quiz", deadline=NOW + timedelta(hours=11),
        scheduled_hours=0.0,
    )
    result = generate_recommendations(_evaluation(), _signals(), [high, low])
    types = {r.type for r in result}
    assert "Reschedule" in types
    assert "StudyBlock" not in types


def test_study_block_for_a_different_task_survives_a_reschedule_conflict():
    high = _task_ctx(
        title="high", priority="High", deadline=NOW + timedelta(hours=10), scheduled_hours=1.0
    )
    low = _task_ctx(title="low", priority="Low", deadline=NOW + timedelta(hours=11))
    other = _task_ctx(
        title="other", priority="High", deadline=NOW + timedelta(hours=20), scheduled_hours=0.0
    )
    result = generate_recommendations(_evaluation(), _signals(), [high, low, other])
    study_block = next(r for r in result if r.type == "StudyBlock")
    assert study_block.relevant_task_ids == [other.id]


# --- Allowed coexistence (explicitly required, same task) ---


def test_priority_and_study_block_coexist_for_the_same_task():
    task = _task_ctx(title="Both", priority="High", type_="Quiz", scheduled_hours=0.0)
    result = generate_recommendations(
        _evaluation(), _signals(high_priority_due_soon_count=2), [task]
    )
    types_and_ids = {r.type: r.relevant_task_ids for r in result}
    assert task.id in types_and_ids["Priority"]
    assert task.id in types_and_ids["StudyBlock"]


def test_priority_and_split_coexist_for_the_same_task():
    task = _task_ctx(title="Both", priority="High", estimate_hours=8.0, unscheduled_hours=6.0)
    result = generate_recommendations(
        _evaluation(), _signals(high_priority_due_soon_count=2), [task]
    )
    types_and_ids = {r.type: r.relevant_task_ids for r in result}
    assert task.id in types_and_ids["Priority"]
    assert task.id in types_and_ids["Split"]


def test_recovery_and_split_coexist_for_the_same_task():
    task = _task_ctx(
        title="Both", is_overdue_backlog=True, is_due_soon_72h=True,
        estimate_hours=8.0, unscheduled_hours=6.0,
    )
    result = generate_recommendations(
        _evaluation(), _signals(overdue_backlog_count=3), [task]
    )
    types_and_ids = {r.type: r.relevant_task_ids for r in result}
    assert task.id in types_and_ids["Recovery"]
    assert task.id in types_and_ids["Split"]


# --- Max count + rank ordering ---


def test_max_recommendations_truncates_to_5_in_rank_order():
    high = _task_ctx(title="high", priority="High", deadline=NOW + timedelta(hours=10))
    low = _task_ctx(title="low", priority="Low", deadline=NOW + timedelta(hours=11))
    important_zero_sched = _task_ctx(
        title="important", priority="High", type_="Quiz", deadline=NOW + timedelta(hours=20),
        scheduled_hours=0.0,
    )
    big_unscheduled = _task_ctx(
        title="big", priority="Medium", deadline=NOW + timedelta(hours=30),
        estimate_hours=8.0, unscheduled_hours=6.0,
    )
    backlog = _task_ctx(title="backlog", is_overdue_backlog=True, is_due_soon_72h=False)
    signals = _signals(
        long_continuous_session_flag=True,
        overdue_backlog_count=3,
        high_priority_due_soon_count=2,
    )
    result = generate_recommendations(
        _evaluation(), signals, [high, low, important_zero_sched, big_unscheduled, backlog]
    )
    assert len(result) <= MAX_RECOMMENDATIONS
    ranks = [r.rank for r in result]
    assert ranks == sorted(ranks)


def test_rank_order_is_break_recovery_priority_studyblock_split_reschedule():
    assert RECOMMENDATION_TYPE_RANK == {
        "Break": 1,
        "Recovery": 2,
        "Priority": 3,
        "StudyBlock": 4,
        "Split": 5,
        "Reschedule": 6,
    }


# --- Gate-aware wording ---


def test_no_recommendation_wording_leaks_ungated_level():
    high = _task_ctx(title="high", priority="High", deadline=NOW + timedelta(hours=10))
    low = _task_ctx(title="low", priority="Low", deadline=NOW + timedelta(hours=11))
    important = _task_ctx(
        title="important", priority="High", type_="Quiz", deadline=NOW + timedelta(hours=5),
        scheduled_hours=0.0,
    )
    big = _task_ctx(
        title="big", estimate_hours=8.0, unscheduled_hours=6.0, deadline=NOW + timedelta(hours=15)
    )
    backlog = _task_ctx(title="backlog", is_overdue_backlog=True, is_due_soon_72h=False)
    signals = _signals(
        long_continuous_session_flag=True,
        overdue_backlog_count=3,
        high_priority_due_soon_count=2,
    )
    result = generate_recommendations(
        _gated_evaluation(), signals, [high, low, important, big, backlog]
    )
    banned = ("Low", "Moderate", "High", "Critical")
    for rec in result:
        for word in banned:
            assert word not in rec.explanation
            assert word not in rec.title


# --- No clinical/diagnostic language ---


def test_no_clinical_language_in_any_template():
    high = _task_ctx(title="high", priority="High", deadline=NOW + timedelta(hours=10))
    low = _task_ctx(title="low", priority="Low", deadline=NOW + timedelta(hours=11))
    important = _task_ctx(
        title="important", priority="High", type_="Quiz", deadline=NOW + timedelta(hours=5),
        scheduled_hours=0.0,
    )
    big = _task_ctx(
        title="big", estimate_hours=8.0, unscheduled_hours=6.0, deadline=NOW + timedelta(hours=15)
    )
    backlog = _task_ctx(title="backlog", is_overdue_backlog=True, is_due_soon_72h=False)
    signals = _signals(
        long_continuous_session_flag=True,
        overdue_backlog_count=3,
        high_priority_due_soon_count=2,
    )
    result = generate_recommendations(_evaluation(), signals, [high, low, important, big, backlog])
    banned_words = (
        "stress", "anxiety", "depress", "burnout", "burn out", "illness",
        "disorder", "diagnos", "mental health", "trauma",
    )
    for rec in result:
        text = (rec.title + " " + rec.explanation).lower()
        for word in banned_words:
            assert word not in text


# --- Determinism / no mutation ---


def test_generate_recommendations_is_deterministic_across_calls():
    high = _task_ctx(title="high", priority="High", deadline=NOW + timedelta(hours=10))
    low = _task_ctx(title="low", priority="Low", deadline=NOW + timedelta(hours=11))
    signals = _signals(high_priority_due_soon_count=2)
    first = generate_recommendations(_evaluation(), signals, [high, low])
    second = generate_recommendations(_evaluation(), signals, [high, low])
    assert [(r.type, r.relevant_task_ids) for r in first] == [
        (r.type, r.relevant_task_ids) for r in second
    ]


def test_no_recommendation_ever_has_a_mutation_shaped_proposed_change():
    # proposed_change is preview data only -- never a direct field-write
    # shape ("status": "Completed" etc.) that could be mistaken for an
    # auto-apply instruction.
    high = _task_ctx(title="high", priority="High", deadline=NOW + timedelta(hours=10))
    important = _task_ctx(
        title="important", priority="High", type_="Quiz", scheduled_hours=0.0,
    )
    signals = _signals(long_continuous_session_flag=True, high_priority_due_soon_count=2)
    result = generate_recommendations(_evaluation(), signals, [high, important])
    for rec in result:
        if rec.proposed_change is not None:
            assert "status" not in rec.proposed_change


def test_empty_task_context_and_zero_signals_produces_no_recommendations():
    result = generate_recommendations(_evaluation(), _signals(), [])
    assert result == []
