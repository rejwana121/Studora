"""Batch 2A tests for app.services.workload.signals — Deadline, Importance,
and Feasibility extraction only. Uses the raw `engine`/`Session` fixture
(no HTTP client) and constructs Task/StudyBlock rows directly, same
pattern as tests/test_planner_service.py's `_query_window` tests.

Covers: rolling-window boundaries (overdue/24h/48h/72h edges), Study Block
interval clipping and overlap/touch merging, the per-task non-negative
clamp and cross-task surplus/deficit isolation, missing-estimate handling,
ownership isolation, zero-data behavior, relevant_task_ids composition,
and the exact 2-query bound as row counts grow.
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import event
from sqlmodel import Session

from app.models.study_block import StudyBlock
from app.models.task import Task
from app.services.workload.signals import (
    _clipped_scheduled_hours,
    _merge_intervals,
    extract_deadline_importance_feasibility_signals,
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
