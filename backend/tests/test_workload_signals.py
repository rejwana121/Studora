"""Tests for app.services.workload.signals — Batch 2A (Deadline,
Importance, Feasibility) and Batch 2B (Backlog, Completion, Study) plus
the `extract_signals()` orchestrator. Uses the raw `engine`/`Session`
fixture (no HTTP client) and constructs Task/Subtask/StudyBlock/
StudySession/StudySessionBreak rows directly, same pattern as
tests/test_planner_service.py's `_query_window` tests.

Batch 2A coverage: rolling-window boundaries (overdue/24h/48h/72h edges),
Study Block interval clipping and overlap/touch merging, the per-task
non-negative clamp and cross-task surplus/deficit isolation,
missing-estimate handling, ownership isolation, zero-data behavior,
relevant_task_ids composition, and the exact 2-query bound as row counts
grow.

Batch 2B coverage: the exact 24h backlog boundary, subtask
ratio/ownership, completion-delay clamping and 14-day edges, active-only
lifetime reschedule sum, the exact 5399s/5400s Active-segment boundary,
proof that Finished/Paused aggregate duration never sets
long_continuous_session_flag, TakeBreak/Snooze/Dismiss/no-event effects
on missed_break_count, the 7-day boundary, deterministic
relevant_task_ids, a realistic full `extract_signals()` fixture, and the
bounded whole-orchestrator query-count proof (6 with break candidates, 5
without).
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import event
from sqlmodel import Session

from app.models.study_block import StudyBlock
from app.models.study_session import StudySession
from app.models.study_session_break import StudySessionBreak
from app.models.subtask import Subtask
from app.models.task import Task
from app.services.workload.signals import (
    _clipped_scheduled_hours,
    _fetch_active_tasks,
    _merge_intervals,
    extract_backlog_completion_study_signals,
    extract_deadline_importance_feasibility_signals,
    extract_signals,
    extract_signals_with_context,
)

NOW = datetime(2026, 8, 1, 12, 0, tzinfo=UTC)


def _task(user_id: uuid.UUID, deadline: datetime, **overrides) -> Task:
    defaults = dict(
        user_id=user_id,
        title="Task",
        type="Assignment",
        deadline=deadline,
        priority="Medium",
        status="Pending",
        estimate_hours=None,
    )
    defaults.update(overrides)
    return Task(**defaults)


def _block(
    user_id: uuid.UUID, task_id: uuid.UUID, starts_at: datetime, ends_at: datetime
) -> StudyBlock:
    return StudyBlock(user_id=user_id, task_id=task_id, starts_at=starts_at, ends_at=ends_at)


def _subtask(user_id: uuid.UUID, task_id: uuid.UUID, **overrides) -> Subtask:
    defaults = dict(user_id=user_id, task_id=task_id, title="Subtask", is_complete=False)
    defaults.update(overrides)
    return Subtask(**defaults)


def _finished_session(
    user_id: uuid.UUID, started_at: datetime, active_duration_seconds: int, **overrides
) -> StudySession:
    defaults = dict(
        user_id=user_id,
        started_at=started_at,
        ended_at=started_at + timedelta(seconds=active_duration_seconds),
        active_duration_seconds=active_duration_seconds,
        status="Finished",
        active_segment_started_at=None,
    )
    defaults.update(overrides)
    return StudySession(**defaults)


def _active_session(
    user_id: uuid.UUID, active_segment_started_at: datetime, **overrides
) -> StudySession:
    defaults = dict(
        user_id=user_id,
        started_at=active_segment_started_at,
        active_duration_seconds=0,
        status="Active",
        active_segment_started_at=active_segment_started_at,
    )
    defaults.update(overrides)
    return StudySession(**defaults)


def _paused_session(
    user_id: uuid.UUID, started_at: datetime, active_duration_seconds: int, **overrides
) -> StudySession:
    defaults = dict(
        user_id=user_id,
        started_at=started_at,
        active_duration_seconds=active_duration_seconds,
        status="Paused",
        active_segment_started_at=None,
    )
    defaults.update(overrides)
    return StudySession(**defaults)


def _break_event(
    user_id: uuid.UUID, session_id: uuid.UUID, action: str, **overrides
) -> StudySessionBreak:
    defaults = dict(user_id=user_id, session_id=session_id, action=action, prompted_at=NOW)
    defaults.update(overrides)
    return StudySessionBreak(**defaults)


# --- _merge_intervals: pure unit tests ---


def test_merge_intervals_empty_list():
    assert _merge_intervals([]) == []


def test_merge_intervals_no_overlap_stays_separate():
    a = (NOW, NOW + timedelta(hours=1))
    b = (NOW + timedelta(hours=2), NOW + timedelta(hours=3))
    assert _merge_intervals([a, b]) == [a, b]


def test_merge_intervals_overlapping_merges():
    a = (NOW, NOW + timedelta(hours=3))
    b = (NOW + timedelta(hours=2), NOW + timedelta(hours=4))
    assert _merge_intervals([a, b]) == [(NOW, NOW + timedelta(hours=4))]


def test_merge_intervals_touching_merges():
    a = (NOW, NOW + timedelta(hours=2))
    b = (NOW + timedelta(hours=2), NOW + timedelta(hours=3))
    assert _merge_intervals([a, b]) == [(NOW, NOW + timedelta(hours=3))]


def test_merge_intervals_out_of_order_input_still_merges():
    a = (NOW + timedelta(hours=2), NOW + timedelta(hours=4))
    b = (NOW, NOW + timedelta(hours=3))
    assert _merge_intervals([a, b]) == [(NOW, NOW + timedelta(hours=4))]


# --- _clipped_scheduled_hours: clipping + merge together ---


def test_clipped_scheduled_hours_block_entirely_before_now_discarded():
    deadline = NOW + timedelta(hours=10)
    task = _task(uuid.uuid4(), deadline, estimate_hours=5.0)
    block = _block(task.user_id, uuid.uuid4(), NOW - timedelta(hours=3), NOW - timedelta(hours=1))
    assert _clipped_scheduled_hours(task, [block], NOW) == 0.0


def test_clipped_scheduled_hours_block_partially_before_now_clips_to_now():
    deadline = NOW + timedelta(hours=10)
    task = _task(uuid.uuid4(), deadline, estimate_hours=5.0)
    block = _block(task.user_id, uuid.uuid4(), NOW - timedelta(hours=2), NOW + timedelta(hours=1))
    assert _clipped_scheduled_hours(task, [block], NOW) == 1.0


def test_clipped_scheduled_hours_block_entirely_after_deadline_discarded():
    deadline = NOW + timedelta(hours=5)
    task = _task(uuid.uuid4(), deadline, estimate_hours=5.0)
    block = _block(
        task.user_id, uuid.uuid4(), deadline + timedelta(hours=1), deadline + timedelta(hours=3)
    )
    assert _clipped_scheduled_hours(task, [block], NOW) == 0.0


def test_clipped_scheduled_hours_block_spanning_deadline_clips_to_deadline():
    deadline = NOW + timedelta(hours=5)
    task = _task(uuid.uuid4(), deadline, estimate_hours=5.0)
    block = _block(
        task.user_id, uuid.uuid4(), deadline - timedelta(hours=1), deadline + timedelta(hours=2)
    )
    assert _clipped_scheduled_hours(task, [block], NOW) == 1.0


def test_clipped_scheduled_hours_overlapping_blocks_not_double_counted():
    deadline = NOW + timedelta(hours=10)
    task = _task(uuid.uuid4(), deadline, estimate_hours=5.0)
    b1 = _block(task.user_id, uuid.uuid4(), NOW + timedelta(hours=1), NOW + timedelta(hours=3))
    b2 = _block(task.user_id, uuid.uuid4(), NOW + timedelta(hours=2), NOW + timedelta(hours=4))
    # Naive sum would be 2h + 2h = 4h; merged is 1h..4h = 3h.
    assert _clipped_scheduled_hours(task, [b1, b2], NOW) == 3.0


def test_clipped_scheduled_hours_touching_blocks_not_double_counted():
    deadline = NOW + timedelta(hours=10)
    task = _task(uuid.uuid4(), deadline, estimate_hours=5.0)
    b1 = _block(task.user_id, uuid.uuid4(), NOW + timedelta(hours=1), NOW + timedelta(hours=2))
    b2 = _block(task.user_id, uuid.uuid4(), NOW + timedelta(hours=2), NOW + timedelta(hours=3))
    assert _clipped_scheduled_hours(task, [b1, b2], NOW) == 2.0


# --- extract_deadline_importance_feasibility_signals: rolling-window boundaries ---


def test_overdue_deadline_before_now_is_overdue(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(_task(user_id, NOW - timedelta(seconds=1)))
        session.commit()
        result = extract_deadline_importance_feasibility_signals(session, user_id, now=NOW)
    assert result["overdue_count"] == 1
    assert result["due_24h_count"] == 0


def test_overdue_deadline_equal_now_is_not_overdue_but_due_now(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(_task(user_id, NOW))
        session.commit()
        result = extract_deadline_importance_feasibility_signals(session, user_id, now=NOW)
    assert result["overdue_count"] == 0
    assert result["due_24h_count"] == 1


def test_due_24h_boundary_inclusive_at_exactly_24h(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(_task(user_id, NOW + timedelta(hours=24)))
        session.commit()
        result = extract_deadline_importance_feasibility_signals(session, user_id, now=NOW)
    assert result["due_24h_count"] == 1


def test_due_24h_boundary_exclusive_just_past_24h(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(_task(user_id, NOW + timedelta(hours=24, seconds=1)))
        session.commit()
        result = extract_deadline_importance_feasibility_signals(session, user_id, now=NOW)
    assert result["due_24h_count"] == 0
    assert result["due_48h_count"] == 1


def test_due_48h_boundary_inclusive_at_exactly_48h(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(_task(user_id, NOW + timedelta(hours=48)))
        session.commit()
        result = extract_deadline_importance_feasibility_signals(session, user_id, now=NOW)
    assert result["due_48h_count"] == 1


def test_due_72h_boundary_inclusive_at_exactly_72h(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(_task(user_id, NOW + timedelta(hours=72)))
        session.commit()
        result = extract_deadline_importance_feasibility_signals(session, user_id, now=NOW)
    assert result["due_72h_count"] == 1
    assert result["cluster_72h"] == 1


def test_due_72h_boundary_exclusive_just_past_72h(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(_task(user_id, NOW + timedelta(hours=72, seconds=1)))
        session.commit()
        result = extract_deadline_importance_feasibility_signals(session, user_id, now=NOW)
    assert result["due_72h_count"] == 0
    assert result["cluster_72h"] == 0


def test_cluster_72h_equals_due_72h_count(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(_task(user_id, NOW + timedelta(hours=10)))
        session.add(_task(user_id, NOW + timedelta(hours=20)))
        session.add(_task(user_id, NOW + timedelta(hours=30)))
        session.commit()
        result = extract_deadline_importance_feasibility_signals(session, user_id, now=NOW)
    assert result["cluster_72h"] == result["due_72h_count"] == 3


def test_completed_and_cancelled_tasks_excluded_from_every_count(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(_task(user_id, NOW - timedelta(hours=1), status="Completed"))
        session.add(_task(user_id, NOW + timedelta(hours=1), status="Cancelled"))
        session.commit()
        result = extract_deadline_importance_feasibility_signals(session, user_id, now=NOW)
    assert result["overdue_count"] == 0
    assert result["due_24h_count"] == 0
    assert result["relevant_task_ids"] == []


# --- high_priority_due_soon_count / assessment_type_due_soon_count ---


def test_high_priority_due_soon_count_filters_correctly(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(_task(user_id, NOW + timedelta(hours=10), priority="High"))
        session.add(_task(user_id, NOW + timedelta(hours=10), priority="Low"))
        session.commit()
        result = extract_deadline_importance_feasibility_signals(session, user_id, now=NOW)
    assert result["high_priority_due_soon_count"] == 1


def test_assessment_type_due_soon_count_filters_correctly(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(_task(user_id, NOW + timedelta(hours=10), type="Midterm"))
        session.add(_task(user_id, NOW + timedelta(hours=10), type="Assignment"))
        session.add(_task(user_id, NOW + timedelta(hours=10), type="Lab"))
        session.commit()
        result = extract_deadline_importance_feasibility_signals(session, user_id, now=NOW)
    assert result["assessment_type_due_soon_count"] == 1


# --- unscheduled_estimate_hours: per-task clamp + cross-task isolation ---


def test_unscheduled_estimate_hours_per_task_non_negative_clamp(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        task = _task(user_id, NOW + timedelta(hours=10), estimate_hours=2.0)
        session.add(task)
        session.flush()
        # Over-scheduled: 5h of blocks against a 2h estimate.
        session.add(_block(user_id, task.id, NOW + timedelta(hours=1), NOW + timedelta(hours=6)))
        session.commit()
        result = extract_deadline_importance_feasibility_signals(session, user_id, now=NOW)
    assert result["unscheduled_estimate_hours"] == 0.0


def test_one_task_surplus_cannot_offset_another_task_deficit(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        # Task A: 1h estimate, 5h scheduled (4h surplus, must not "bank").
        task_a = _task(user_id, NOW + timedelta(hours=10), estimate_hours=1.0, title="A")
        # Task B: 5h estimate, 0h scheduled (5h real deficit).
        task_b = _task(user_id, NOW + timedelta(hours=10), estimate_hours=5.0, title="B")
        session.add(task_a)
        session.add(task_b)
        session.flush()
        session.add(_block(user_id, task_a.id, NOW + timedelta(hours=1), NOW + timedelta(hours=6)))
        session.commit()
        result = extract_deadline_importance_feasibility_signals(session, user_id, now=NOW)
    # A naive global subtraction would compute (1+5) - 5 = 1. Correct
    # per-task sum is max(0, 1-5) + max(0, 5-0) = 0 + 5 = 5.
    assert result["unscheduled_estimate_hours"] == 5.0


def test_unscheduled_estimate_hours_sums_across_multiple_tasks(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(_task(user_id, NOW + timedelta(hours=10), estimate_hours=3.0))
        session.add(_task(user_id, NOW + timedelta(hours=10), estimate_hours=2.0))
        session.commit()
        result = extract_deadline_importance_feasibility_signals(session, user_id, now=NOW)
    assert result["unscheduled_estimate_hours"] == 5.0


# --- missing estimates ---


def test_missing_estimate_task_contributes_no_hours_but_sets_flag_and_stays_relevant(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        task = _task(
            user_id, NOW + timedelta(hours=10), estimate_hours=None, priority="High", type="Quiz"
        )
        session.add(task)
        session.commit()
        session.refresh(task)
        result = extract_deadline_importance_feasibility_signals(session, user_id, now=NOW)
    assert result["had_missing_estimate"] is True
    assert result["unscheduled_estimate_hours"] == 0.0
    assert task.id in result["relevant_task_ids"]
    assert result["due_72h_count"] == 1
    assert result["high_priority_due_soon_count"] == 1
    assert result["assessment_type_due_soon_count"] == 1


def test_no_missing_estimate_flag_when_all_due_soon_tasks_have_estimates(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(_task(user_id, NOW + timedelta(hours=10), estimate_hours=1.0))
        session.commit()
        result = extract_deadline_importance_feasibility_signals(session, user_id, now=NOW)
    assert result["had_missing_estimate"] is False


def test_missing_estimate_on_task_outside_due_soon_window_does_not_set_flag(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        # Overdue, not due-soon -- estimate_hours is irrelevant to the
        # due-soon feasibility cohort.
        session.add(_task(user_id, NOW - timedelta(hours=1), estimate_hours=None))
        session.commit()
        result = extract_deadline_importance_feasibility_signals(session, user_id, now=NOW)
    assert result["had_missing_estimate"] is False


# --- relevant_task_ids ---


def test_relevant_task_ids_is_union_of_overdue_and_due_soon(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        overdue = _task(user_id, NOW - timedelta(hours=1))
        due_soon = _task(user_id, NOW + timedelta(hours=10))
        far_future = _task(user_id, NOW + timedelta(days=30))
        session.add(overdue)
        session.add(due_soon)
        session.add(far_future)
        session.commit()
        session.refresh(overdue)
        session.refresh(due_soon)
        session.refresh(far_future)
        result = extract_deadline_importance_feasibility_signals(session, user_id, now=NOW)
    assert set(result["relevant_task_ids"]) == {overdue.id, due_soon.id}
    assert far_future.id not in result["relevant_task_ids"]


# --- ownership isolation ---


def test_ownership_isolation_across_two_users(engine):
    owner_a = uuid.uuid4()
    owner_b = uuid.uuid4()
    with Session(engine) as session:
        session.add(_task(owner_a, NOW + timedelta(hours=10), estimate_hours=3.0))
        session.add(_task(owner_b, NOW + timedelta(hours=10), estimate_hours=99.0))
        session.commit()
        result_a = extract_deadline_importance_feasibility_signals(session, owner_a, now=NOW)
    assert result_a["due_72h_count"] == 1
    assert result_a["unscheduled_estimate_hours"] == 3.0


def test_ownership_isolation_study_blocks_not_leaked_across_users(engine):
    owner_a = uuid.uuid4()
    owner_b = uuid.uuid4()
    with Session(engine) as session:
        task_a = _task(owner_a, NOW + timedelta(hours=10), estimate_hours=5.0)
        session.add(task_a)
        session.flush()
        # A block whose own user_id doesn't match the task's owner (a
        # data state the real API never produces via normal writes, since
        # StudyBlock creation validates task ownership -- but the
        # extractor must not rely on that invariant alone). The Study
        # Block query filters on StudyBlock.user_id directly (defense in
        # depth, matching app.services.planner._query_window's own
        # pattern), so this cross-owner block must be excluded even
        # though its task_id legitimately belongs to owner_a.
        session.add(_block(owner_b, task_a.id, NOW + timedelta(hours=1), NOW + timedelta(hours=3)))
        session.commit()
        result_a = extract_deadline_importance_feasibility_signals(session, owner_a, now=NOW)
    assert result_a["unscheduled_estimate_hours"] == 5.0


# --- zero-data behavior ---


def test_zero_tasks_returns_all_zero_signals(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        result = extract_deadline_importance_feasibility_signals(session, user_id, now=NOW)
    assert result["overdue_count"] == 0
    assert result["due_24h_count"] == 0
    assert result["due_48h_count"] == 0
    assert result["due_72h_count"] == 0
    assert result["cluster_72h"] == 0
    assert result["high_priority_due_soon_count"] == 0
    assert result["assessment_type_due_soon_count"] == 0
    assert result["unscheduled_estimate_hours"] == 0.0
    assert result["had_missing_estimate"] is False
    assert result["relevant_task_ids"] == []


# --- bounded query count: exactly 2, flat as rows grow ---


def _count_select_statements(engine, fn) -> int:
    statements: list[str] = []

    def _listener(conn, cursor, statement, parameters, context, executemany):
        if statement.strip().upper().startswith("SELECT"):
            statements.append(statement)

    event.listen(engine, "before_cursor_execute", _listener)
    try:
        fn()
    finally:
        event.remove(engine, "before_cursor_execute", _listener)
    return len(statements)


def test_query_count_is_exactly_2_and_flat_as_rows_increase(engine):
    user_id = uuid.uuid4()
    counts = []
    with Session(engine) as session:
        for n in (2, 20):
            for i in range(n):
                task = _task(user_id, NOW + timedelta(hours=1, minutes=i), estimate_hours=1.0)
                session.add(task)
                session.flush()
                session.add(
                    _block(
                        user_id,
                        task.id,
                        NOW + timedelta(minutes=i),
                        NOW + timedelta(minutes=i, hours=1),
                    )
                )
            session.commit()

            def _run():
                extract_deadline_importance_feasibility_signals(session, user_id, now=NOW)

            counts.append(_count_select_statements(engine, _run))

    assert counts == [2, 2]


# =====================================================================
# Batch 2B: Backlog, Completion, Study
# =====================================================================


# --- overdue_backlog_count: exact 24h boundary ---


def test_overdue_backlog_exact_24h_boundary_not_counted(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(_task(user_id, NOW - timedelta(hours=24)))
        session.commit()
        active_tasks = _fetch_active_tasks(session, user_id)
        result = extract_backlog_completion_study_signals(session, user_id, active_tasks, now=NOW)
    assert result["overdue_backlog_count"] == 0


def test_overdue_backlog_just_over_24h_is_counted(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(_task(user_id, NOW - timedelta(hours=24, seconds=1)))
        session.commit()
        active_tasks = _fetch_active_tasks(session, user_id)
        result = extract_backlog_completion_study_signals(session, user_id, active_tasks, now=NOW)
    assert result["overdue_backlog_count"] == 1


def test_overdue_backlog_excludes_completed_and_cancelled(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(_task(user_id, NOW - timedelta(days=10), status="Completed"))
        session.add(_task(user_id, NOW - timedelta(days=10), status="Cancelled"))
        session.commit()
        active_tasks = _fetch_active_tasks(session, user_id)
        result = extract_backlog_completion_study_signals(session, user_id, active_tasks, now=NOW)
    assert result["overdue_backlog_count"] == 0


# --- incomplete_subtask_ratio ---


def test_incomplete_subtask_ratio_zero_subtasks_is_zero(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(_task(user_id, NOW + timedelta(hours=10)))
        session.commit()
        active_tasks = _fetch_active_tasks(session, user_id)
        result = extract_backlog_completion_study_signals(session, user_id, active_tasks, now=NOW)
    assert result["incomplete_subtask_ratio"] == 0.0


def test_incomplete_subtask_ratio_all_complete(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        task = _task(user_id, NOW + timedelta(hours=10))
        session.add(task)
        session.flush()
        session.add(_subtask(user_id, task.id, is_complete=True))
        session.add(_subtask(user_id, task.id, is_complete=True))
        session.commit()
        active_tasks = _fetch_active_tasks(session, user_id)
        result = extract_backlog_completion_study_signals(session, user_id, active_tasks, now=NOW)
    assert result["incomplete_subtask_ratio"] == 0.0


def test_incomplete_subtask_ratio_all_incomplete(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        task = _task(user_id, NOW + timedelta(hours=10))
        session.add(task)
        session.flush()
        session.add(_subtask(user_id, task.id, is_complete=False))
        session.add(_subtask(user_id, task.id, is_complete=False))
        session.commit()
        active_tasks = _fetch_active_tasks(session, user_id)
        result = extract_backlog_completion_study_signals(session, user_id, active_tasks, now=NOW)
    assert result["incomplete_subtask_ratio"] == 1.0


def test_incomplete_subtask_ratio_mixed(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        task = _task(user_id, NOW + timedelta(hours=10))
        session.add(task)
        session.flush()
        session.add(_subtask(user_id, task.id, is_complete=True))
        session.add(_subtask(user_id, task.id, is_complete=False))
        session.add(_subtask(user_id, task.id, is_complete=False))
        session.add(_subtask(user_id, task.id, is_complete=False))
        session.commit()
        active_tasks = _fetch_active_tasks(session, user_id)
        result = extract_backlog_completion_study_signals(session, user_id, active_tasks, now=NOW)
    assert result["incomplete_subtask_ratio"] == 0.75


def test_incomplete_subtask_ratio_excludes_subtasks_of_completed_task(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        completed_task = _task(user_id, NOW - timedelta(hours=1), status="Completed")
        session.add(completed_task)
        session.flush()
        session.add(_subtask(user_id, completed_task.id, is_complete=False))
        session.commit()
        active_tasks = _fetch_active_tasks(session, user_id)
        result = extract_backlog_completion_study_signals(session, user_id, active_tasks, now=NOW)
    assert result["incomplete_subtask_ratio"] == 0.0


def test_incomplete_subtask_ratio_ownership_isolation(engine):
    owner_a = uuid.uuid4()
    owner_b = uuid.uuid4()
    with Session(engine) as session:
        task_a = _task(owner_a, NOW + timedelta(hours=10))
        task_b = _task(owner_b, NOW + timedelta(hours=10))
        session.add(task_a)
        session.add(task_b)
        session.flush()
        session.add(_subtask(owner_a, task_a.id, is_complete=True))
        session.add(_subtask(owner_b, task_b.id, is_complete=False))
        session.commit()
        active_tasks_a = _fetch_active_tasks(session, owner_a)
        result_a = extract_backlog_completion_study_signals(
            session, owner_a, active_tasks_a, now=NOW
        )
    assert result_a["incomplete_subtask_ratio"] == 0.0


# --- recent_completion_delay_avg ---


def test_completion_delay_early_completion_clamped_to_zero(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        deadline = NOW - timedelta(days=1)
        task = _task(
            user_id,
            deadline,
            status="Completed",
            completed_at=deadline - timedelta(hours=3),  # finished 3h early
        )
        session.add(task)
        session.commit()
        active_tasks = _fetch_active_tasks(session, user_id)
        result = extract_backlog_completion_study_signals(session, user_id, active_tasks, now=NOW)
    assert result["recent_completion_delay_avg"] == 0.0


def test_completion_delay_late_completion_is_positive(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        deadline = NOW - timedelta(days=1)
        task = _task(
            user_id, deadline, status="Completed", completed_at=deadline + timedelta(hours=5)
        )
        session.add(task)
        session.commit()
        active_tasks = _fetch_active_tasks(session, user_id)
        result = extract_backlog_completion_study_signals(session, user_id, active_tasks, now=NOW)
    assert result["recent_completion_delay_avg"] == 5.0


def test_completion_delay_averages_early_and_late(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        deadline = NOW - timedelta(days=1)
        # Early (clamped to 0) + 10h late -> average (0 + 10) / 2 = 5.
        session.add(
            _task(
                user_id,
                deadline,
                status="Completed",
                completed_at=deadline - timedelta(hours=2),
                title="early",
            )
        )
        session.add(
            _task(
                user_id,
                deadline,
                status="Completed",
                completed_at=deadline + timedelta(hours=10),
                title="late",
            )
        )
        session.commit()
        active_tasks = _fetch_active_tasks(session, user_id)
        result = extract_backlog_completion_study_signals(session, user_id, active_tasks, now=NOW)
    assert result["recent_completion_delay_avg"] == 5.0


def test_completion_delay_14_day_boundary_inclusive(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        deadline = NOW - timedelta(days=15)
        task = _task(
            user_id,
            deadline,
            status="Completed",
            completed_at=NOW - timedelta(days=14),  # exactly 14 days ago
        )
        session.add(task)
        session.commit()
        active_tasks = _fetch_active_tasks(session, user_id)
        result = extract_backlog_completion_study_signals(session, user_id, active_tasks, now=NOW)
    assert result["recent_completion_delay_avg"] is not None


def test_completion_delay_just_outside_14_day_window_excluded(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        deadline = NOW - timedelta(days=15)
        task = _task(
            user_id,
            deadline,
            status="Completed",
            completed_at=NOW - timedelta(days=14, seconds=1),
        )
        session.add(task)
        session.commit()
        active_tasks = _fetch_active_tasks(session, user_id)
        result = extract_backlog_completion_study_signals(session, user_id, active_tasks, now=NOW)
    assert result["recent_completion_delay_avg"] is None


def test_completion_delay_no_qualifying_completions_returns_none(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(_task(user_id, NOW + timedelta(hours=10)))  # not completed
        session.commit()
        active_tasks = _fetch_active_tasks(session, user_id)
        result = extract_backlog_completion_study_signals(session, user_id, active_tasks, now=NOW)
    assert result["recent_completion_delay_avg"] is None


def test_completion_delay_ownership_isolation(engine):
    owner_a = uuid.uuid4()
    owner_b = uuid.uuid4()
    with Session(engine) as session:
        deadline = NOW - timedelta(days=1)
        session.add(
            _task(owner_a, deadline, status="Completed", completed_at=deadline + timedelta(hours=1))
        )
        session.add(
            _task(
                owner_b, deadline, status="Completed", completed_at=deadline + timedelta(hours=99)
            )
        )
        session.commit()
        active_tasks_a = _fetch_active_tasks(session, owner_a)
        result_a = extract_backlog_completion_study_signals(
            session, owner_a, active_tasks_a, now=NOW
        )
    assert result_a["recent_completion_delay_avg"] == 1.0


# --- reschedule_count_lifetime: active tasks only ---


def test_reschedule_lifetime_sums_active_tasks_only(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(_task(user_id, NOW + timedelta(hours=10), reschedule_count=3, status="Pending"))
        session.add(
            _task(user_id, NOW + timedelta(hours=20), reschedule_count=2, status="InProgress")
        )
        # Completed/Cancelled tasks' reschedule history must NOT be summed.
        session.add(
            _task(user_id, NOW - timedelta(days=1), reschedule_count=100, status="Completed")
        )
        session.add(
            _task(user_id, NOW - timedelta(days=1), reschedule_count=100, status="Cancelled")
        )
        session.commit()
        active_tasks = _fetch_active_tasks(session, user_id)
        result = extract_backlog_completion_study_signals(session, user_id, active_tasks, now=NOW)
    assert result["reschedule_count_lifetime"] == 5


def test_reschedule_lifetime_zero_when_no_active_tasks(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(
            _task(user_id, NOW - timedelta(days=1), reschedule_count=7, status="Completed")
        )
        session.commit()
        active_tasks = _fetch_active_tasks(session, user_id)
        result = extract_backlog_completion_study_signals(session, user_id, active_tasks, now=NOW)
    assert result["reschedule_count_lifetime"] == 0


# --- long_continuous_session_flag ---


def test_long_session_flag_active_segment_5399s_is_false(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(_active_session(user_id, NOW - timedelta(seconds=5399)))
        session.commit()
        active_tasks = _fetch_active_tasks(session, user_id)
        result = extract_backlog_completion_study_signals(session, user_id, active_tasks, now=NOW)
    assert result["long_continuous_session_flag"] is False


def test_long_session_flag_active_segment_5400s_is_true(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(_active_session(user_id, NOW - timedelta(seconds=5400)))
        session.commit()
        active_tasks = _fetch_active_tasks(session, user_id)
        result = extract_backlog_completion_study_signals(session, user_id, active_tasks, now=NOW)
    assert result["long_continuous_session_flag"] is True


def test_long_session_flag_paused_session_aggregate_duration_not_used(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        # Huge aggregate duration, but Paused -> no open segment -> must
        # not set the flag via aggregate duration alone.
        session.add(
            _paused_session(user_id, NOW - timedelta(hours=5), active_duration_seconds=99999)
        )
        session.commit()
        active_tasks = _fetch_active_tasks(session, user_id)
        result = extract_backlog_completion_study_signals(session, user_id, active_tasks, now=NOW)
    assert result["long_continuous_session_flag"] is False


def test_long_session_flag_finished_session_aggregate_duration_not_used(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(
            _finished_session(user_id, NOW - timedelta(hours=5), active_duration_seconds=99999)
        )
        session.commit()
        active_tasks = _fetch_active_tasks(session, user_id)
        result = extract_backlog_completion_study_signals(session, user_id, active_tasks, now=NOW)
    assert result["long_continuous_session_flag"] is False


def test_long_session_flag_no_session_at_all_is_false(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        active_tasks = _fetch_active_tasks(session, user_id)
        result = extract_backlog_completion_study_signals(session, user_id, active_tasks, now=NOW)
    assert result["long_continuous_session_flag"] is False


# --- missed_break_count ---


def test_missed_break_counts_long_finished_session_with_no_break_event(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(
            _finished_session(user_id, NOW - timedelta(days=1), active_duration_seconds=5400)
        )
        session.commit()
        active_tasks = _fetch_active_tasks(session, user_id)
        result = extract_backlog_completion_study_signals(session, user_id, active_tasks, now=NOW)
    assert result["missed_break_count"] == 1


def test_missed_break_takebreak_event_excludes_session(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        s = _finished_session(user_id, NOW - timedelta(days=1), active_duration_seconds=5400)
        session.add(s)
        session.flush()
        session.add(_break_event(user_id, s.id, "TakeBreak", duration_minutes=15))
        session.commit()
        active_tasks = _fetch_active_tasks(session, user_id)
        result = extract_backlog_completion_study_signals(session, user_id, active_tasks, now=NOW)
    assert result["missed_break_count"] == 0


def test_missed_break_snooze_event_still_counts(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        s = _finished_session(user_id, NOW - timedelta(days=1), active_duration_seconds=5400)
        session.add(s)
        session.flush()
        session.add(_break_event(user_id, s.id, "Snooze", duration_minutes=10))
        session.commit()
        active_tasks = _fetch_active_tasks(session, user_id)
        result = extract_backlog_completion_study_signals(session, user_id, active_tasks, now=NOW)
    assert result["missed_break_count"] == 1


def test_missed_break_dismiss_event_still_counts(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        s = _finished_session(user_id, NOW - timedelta(days=1), active_duration_seconds=5400)
        session.add(s)
        session.flush()
        session.add(_break_event(user_id, s.id, "Dismiss"))
        session.commit()
        active_tasks = _fetch_active_tasks(session, user_id)
        result = extract_backlog_completion_study_signals(session, user_id, active_tasks, now=NOW)
    assert result["missed_break_count"] == 1


def test_missed_break_session_under_threshold_not_counted(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(
            _finished_session(user_id, NOW - timedelta(days=1), active_duration_seconds=5399)
        )
        session.commit()
        active_tasks = _fetch_active_tasks(session, user_id)
        result = extract_backlog_completion_study_signals(session, user_id, active_tasks, now=NOW)
    assert result["missed_break_count"] == 0


def test_missed_break_session_exactly_7_days_ago_is_included(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(
            _finished_session(user_id, NOW - timedelta(days=7), active_duration_seconds=5400)
        )
        session.commit()
        active_tasks = _fetch_active_tasks(session, user_id)
        result = extract_backlog_completion_study_signals(session, user_id, active_tasks, now=NOW)
    assert result["missed_break_count"] == 1


def test_missed_break_session_just_past_7_days_excluded(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(
            _finished_session(
                user_id, NOW - timedelta(days=7, seconds=1), active_duration_seconds=5400
            )
        )
        session.commit()
        active_tasks = _fetch_active_tasks(session, user_id)
        result = extract_backlog_completion_study_signals(session, user_id, active_tasks, now=NOW)
    assert result["missed_break_count"] == 0


def test_missed_break_only_finished_sessions_judged_not_active_or_paused(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(_active_session(user_id, NOW - timedelta(hours=3)))
        session.commit()
        active_tasks = _fetch_active_tasks(session, user_id)
        result = extract_backlog_completion_study_signals(session, user_id, active_tasks, now=NOW)
    assert result["missed_break_count"] == 0


def test_missed_break_ownership_isolation_across_sessions_and_breaks(engine):
    owner_a = uuid.uuid4()
    owner_b = uuid.uuid4()
    with Session(engine) as session:
        s_a = _finished_session(owner_a, NOW - timedelta(days=1), active_duration_seconds=5400)
        s_b = _finished_session(owner_b, NOW - timedelta(days=1), active_duration_seconds=5400)
        session.add(s_a)
        session.add(s_b)
        session.flush()
        # owner_b's TakeBreak must never affect owner_a's count.
        session.add(_break_event(owner_b, s_b.id, "TakeBreak", duration_minutes=15))
        session.commit()
        active_tasks_a = _fetch_active_tasks(session, owner_a)
        result_a = extract_backlog_completion_study_signals(
            session, owner_a, active_tasks_a, now=NOW
        )
    assert result_a["missed_break_count"] == 1


# =====================================================================
# extract_signals(): the full orchestrator
# =====================================================================


def test_extract_signals_realistic_combined_fixture(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        overdue = _task(user_id, NOW - timedelta(hours=1), priority="High")
        due_soon = _task(user_id, NOW + timedelta(hours=10), estimate_hours=4.0, type="Quiz")
        session.add(overdue)
        session.add(due_soon)
        session.flush()
        session.add(_subtask(user_id, due_soon.id, is_complete=False))
        session.add(_subtask(user_id, due_soon.id, is_complete=True))
        session.add(
            _task(
                user_id,
                NOW - timedelta(days=1),
                status="Completed",
                completed_at=NOW - timedelta(days=1) + timedelta(hours=2),
            )
        )
        finished = _finished_session(user_id, NOW - timedelta(days=1), active_duration_seconds=5400)
        session.add(finished)
        session.commit()

        result = extract_signals(session, user_id, now=NOW)

    assert result.overdue_count == 1
    assert result.due_72h_count == 1
    # The High-priority task is overdue, not due-soon.
    assert result.high_priority_due_soon_count == 0
    assert result.assessment_type_due_soon_count == 1
    assert result.unscheduled_estimate_hours == 4.0
    assert result.incomplete_subtask_ratio == 0.5
    assert result.recent_completion_delay_avg == 2.0
    assert result.missed_break_count == 1
    assert due_soon.id in result.relevant_task_ids
    assert overdue.id in result.relevant_task_ids


def test_extract_signals_relevant_task_ids_deterministic_and_stably_ordered(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(_task(user_id, NOW + timedelta(hours=5), title="B"))
        session.add(_task(user_id, NOW - timedelta(hours=1), title="A-overdue"))
        session.add(_task(user_id, NOW + timedelta(hours=1), title="C"))
        session.commit()

        first = extract_signals(session, user_id, now=NOW)
        second = extract_signals(session, user_id, now=NOW)

    assert first.relevant_task_ids == second.relevant_task_ids
    # Stable order tied to the underlying (deadline, id) query order, not
    # to Python set/hash iteration order.
    assert len(first.relevant_task_ids) == len(set(first.relevant_task_ids))


def test_extract_signals_accepts_injectable_now(engine):
    user_id = uuid.uuid4()
    fixed_now = datetime(2026, 1, 1, tzinfo=UTC)
    with Session(engine) as session:
        # A task overdue relative to fixed_now but not relative to real
        # wall-clock "now" proves `now` is genuinely used, not ignored.
        session.add(_task(user_id, fixed_now + timedelta(hours=1)))
        session.commit()
        result_before_deadline = extract_signals(session, user_id, now=fixed_now)
        result_after_deadline = extract_signals(
            session, user_id, now=fixed_now + timedelta(hours=2)
        )
    assert result_before_deadline.overdue_count == 0
    assert result_after_deadline.overdue_count == 1


def test_extract_signals_query_count_bounded_5_without_break_candidates(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(_task(user_id, NOW + timedelta(hours=5)))
        session.commit()

        def _run():
            extract_signals(session, user_id, now=NOW)

        count = _count_select_statements(engine, _run)
    assert count == 5


def test_extract_signals_query_count_bounded_6_with_break_candidates(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        s = _finished_session(user_id, NOW - timedelta(days=1), active_duration_seconds=5400)
        session.add(s)
        session.commit()

        def _run():
            extract_signals(session, user_id, now=NOW)

        count = _count_select_statements(engine, _run)
    assert count == 6


def test_extract_signals_query_count_flat_as_rows_increase(engine):
    user_id = uuid.uuid4()
    counts = []
    with Session(engine) as session:
        for n in (2, 20):
            for i in range(n):
                task = _task(user_id, NOW + timedelta(hours=1, minutes=i), estimate_hours=1.0)
                session.add(task)
                session.flush()
                session.add(
                    _block(
                        user_id,
                        task.id,
                        NOW + timedelta(minutes=i),
                        NOW + timedelta(minutes=i, hours=1),
                    )
                )
                session.add(_subtask(user_id, task.id, is_complete=(i % 2 == 0)))
            session.commit()

            def _run():
                extract_signals(session, user_id, now=NOW)

            counts.append(_count_select_statements(engine, _run))

    assert counts == [5, 5]


# =====================================================================
# Batch 3: build_task_context / extract_signals_with_context
# =====================================================================


def test_build_task_context_scopes_to_relevant_task_ids_only(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        due_soon = _task(user_id, NOW + timedelta(hours=10), estimate_hours=3.0)
        far_future = _task(user_id, NOW + timedelta(days=30))
        session.add(due_soon)
        session.add(far_future)
        session.commit()

        signals, task_context = extract_signals_with_context(session, user_id, now=NOW)

    context_ids = {t.id for t in task_context}
    assert due_soon.id in context_ids
    assert far_future.id not in context_ids
    assert context_ids == set(signals.relevant_task_ids)


def test_build_task_context_scheduled_and_unscheduled_hours_match_signals(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        task = _task(user_id, NOW + timedelta(hours=10), estimate_hours=5.0)
        session.add(task)
        session.flush()
        session.add(_block(user_id, task.id, NOW + timedelta(hours=1), NOW + timedelta(hours=3)))
        session.commit()

        signals, task_context = extract_signals_with_context(session, user_id, now=NOW)

    ctx = next(t for t in task_context if t.id == task.id)
    assert ctx.scheduled_hours == 2.0
    assert ctx.unscheduled_hours == 3.0
    assert ctx.unscheduled_hours == signals.unscheduled_estimate_hours


def test_build_task_context_missing_estimate_has_zero_unscheduled_hours(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        task = _task(user_id, NOW + timedelta(hours=10), estimate_hours=None)
        session.add(task)
        session.commit()

        _signals, task_context = extract_signals_with_context(session, user_id, now=NOW)

    ctx = next(t for t in task_context if t.id == task.id)
    assert ctx.had_missing_estimate is True
    assert ctx.unscheduled_hours == 0.0


def test_build_task_context_flags_overdue_and_overdue_backlog(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        just_overdue = _task(user_id, NOW - timedelta(hours=1))
        backlog = _task(user_id, NOW - timedelta(hours=25))
        session.add(just_overdue)
        session.add(backlog)
        session.commit()

        _signals, task_context = extract_signals_with_context(session, user_id, now=NOW)

    just_overdue_ctx = next(t for t in task_context if t.id == just_overdue.id)
    backlog_ctx = next(t for t in task_context if t.id == backlog.id)
    assert just_overdue_ctx.is_overdue is True
    assert just_overdue_ctx.is_overdue_backlog is False
    assert backlog_ctx.is_overdue is True
    assert backlog_ctx.is_overdue_backlog is True


def test_build_task_context_ownership_isolation(engine):
    owner_a = uuid.uuid4()
    owner_b = uuid.uuid4()
    with Session(engine) as session:
        session.add(_task(owner_a, NOW + timedelta(hours=10)))
        session.add(_task(owner_b, NOW + timedelta(hours=10)))
        session.commit()

        _signals_a, task_context_a = extract_signals_with_context(session, owner_a, now=NOW)

    assert len(task_context_a) == 1


def test_extract_signals_with_context_matches_extract_signals(engine):
    """extract_signals() itself must be byte-identical whether called
    directly or via extract_signals_with_context()'s shared internals —
    the Batch 3 refactor must not change its observable behavior."""
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(_task(user_id, NOW + timedelta(hours=10), estimate_hours=2.0))
        session.commit()

        direct = extract_signals(session, user_id, now=NOW)
        via_context, _task_context = extract_signals_with_context(session, user_id, now=NOW)

    assert direct == via_context


def test_extract_signals_with_context_query_count_bounded_5_without_break_candidates(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(_task(user_id, NOW + timedelta(hours=5)))
        session.commit()

        def _run():
            extract_signals_with_context(session, user_id, now=NOW)

        count = _count_select_statements(engine, _run)
    assert count == 5


def test_extract_signals_with_context_query_count_bounded_6_with_break_candidates(engine):
    user_id = uuid.uuid4()
    with Session(engine) as session:
        s = _finished_session(user_id, NOW - timedelta(days=1), active_duration_seconds=5400)
        session.add(s)
        session.commit()

        def _run():
            extract_signals_with_context(session, user_id, now=NOW)

        count = _count_select_statements(engine, _run)
    assert count == 6
