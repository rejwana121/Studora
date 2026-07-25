"""Pure schema-level tests for app.schemas.task — no DB, no HTTP client.

No service/router exists yet (Phase 4 checkpoint 2 scope is model+schemas+
migration only); these tests exercise Pydantic validation directly against
TaskCreate/TaskUpdate/TaskSubjectSnapshot.
"""
import math
import uuid
from datetime import UTC, datetime, timedelta, timezone, tzinfo

import pytest
from pydantic import ValidationError

from app.schemas.task import TaskCreate, TaskListQuery, TaskSubjectSnapshot, TaskUpdate

AWARE_DEADLINE = datetime(2026, 8, 1, 12, 0, tzinfo=UTC)
NAIVE_DEADLINE = datetime(2026, 8, 1, 12, 0)


class _TzWithNoOffset(tzinfo):
    """tzinfo IS set, but utcoffset() returns None — Python's own
    definition of "naive" (see datetime docs) is broader than a bare
    `tzinfo is None` check, so the validators must check both."""

    def utcoffset(self, dt):
        return None

    def dst(self, dt):
        return None

    def tzname(self, dt):
        return None


PATHOLOGICAL_DEADLINE = datetime(2026, 8, 1, 12, 0, tzinfo=_TzWithNoOffset())


def _valid_create_kwargs(**overrides) -> dict:
    kwargs = {
        "title": "Read Chapter 3",
        "type": "Assignment",
        "deadline": AWARE_DEADLINE,
        "priority": "Medium",
    }
    kwargs.update(overrides)
    return kwargs


# --- deadline: naive rejection, aware acceptance + UTC normalization ---


def test_create_rejects_naive_deadline():
    with pytest.raises(ValidationError):
        TaskCreate(**_valid_create_kwargs(deadline=NAIVE_DEADLINE))


def test_update_rejects_naive_deadline():
    with pytest.raises(ValidationError):
        TaskUpdate(deadline=NAIVE_DEADLINE)


def test_create_normalizes_aware_deadline_to_utc():
    plus_six = timezone(timedelta(hours=6))
    local = datetime(2026, 8, 1, 18, 0, tzinfo=plus_six)  # == 12:00 UTC
    task = TaskCreate(**_valid_create_kwargs(deadline=local))
    assert task.deadline == AWARE_DEADLINE
    assert task.deadline.utcoffset() == timedelta(0)


def test_update_normalizes_aware_deadline_to_utc():
    plus_six = timezone(timedelta(hours=6))
    local = datetime(2026, 8, 1, 18, 0, tzinfo=plus_six)  # == 12:00 UTC
    update = TaskUpdate(deadline=local)
    assert update.deadline == AWARE_DEADLINE
    assert update.deadline.utcoffset() == timedelta(0)


def test_update_allows_omitted_deadline():
    update = TaskUpdate(title="New title")
    assert update.deadline is None


# --- estimate_hours: zero/negative/NaN/inf rejected, positive accepted ---


@pytest.mark.parametrize("bad_value", [0, -1, -0.5, math.nan, math.inf, -math.inf])
def test_create_rejects_invalid_estimate_hours(bad_value):
    with pytest.raises(ValidationError):
        TaskCreate(**_valid_create_kwargs(estimate_hours=bad_value))


@pytest.mark.parametrize("bad_value", [0, -1, -0.5, math.nan, math.inf, -math.inf])
def test_update_rejects_invalid_estimate_hours(bad_value):
    with pytest.raises(ValidationError):
        TaskUpdate(estimate_hours=bad_value)


def test_create_accepts_positive_estimate_hours():
    task = TaskCreate(**_valid_create_kwargs(estimate_hours=2.5))
    assert task.estimate_hours == 2.5


def test_update_accepts_positive_estimate_hours():
    update = TaskUpdate(estimate_hours=3)
    assert update.estimate_hours == 3


# --- enum validation ---


def test_create_rejects_invalid_type():
    with pytest.raises(ValidationError):
        TaskCreate(**_valid_create_kwargs(type="Homework"))


def test_create_rejects_invalid_priority():
    with pytest.raises(ValidationError):
        TaskCreate(**_valid_create_kwargs(priority="Urgent"))


def test_update_rejects_invalid_status():
    with pytest.raises(ValidationError):
        TaskUpdate(status="Archived")


def test_update_accepts_valid_status():
    update = TaskUpdate(status="Completed")
    assert update.status == "Completed"


# --- title: trimming and blank rejection ---


def test_create_strips_title_whitespace():
    task = TaskCreate(**_valid_create_kwargs(title="  Read Chapter 3  "))
    assert task.title == "Read Chapter 3"


def test_create_rejects_blank_title():
    with pytest.raises(ValidationError):
        TaskCreate(**_valid_create_kwargs(title="   "))


def test_update_strips_title_whitespace():
    update = TaskUpdate(title="  Finish lab report  ")
    assert update.title == "Finish lab report"


def test_update_rejects_blank_title():
    with pytest.raises(ValidationError):
        TaskUpdate(title="   ")


# --- extra / client-owned fields rejected ---


@pytest.mark.parametrize(
    "field,value",
    [
        ("user_id", str(uuid.uuid4())),
        ("completed_at", AWARE_DEADLINE.isoformat()),
        ("reschedule_count", 5),
    ],
)
def test_create_rejects_client_owned_fields(field, value):
    with pytest.raises(ValidationError):
        TaskCreate(**_valid_create_kwargs(**{field: value}))


@pytest.mark.parametrize(
    "field,value",
    [
        ("user_id", str(uuid.uuid4())),
        ("completed_at", AWARE_DEADLINE.isoformat()),
        ("reschedule_count", 5),
    ],
)
def test_update_rejects_client_owned_fields(field, value):
    with pytest.raises(ValidationError):
        TaskUpdate(**{field: value})


# --- TaskSubjectSnapshot color_token allowlist ---


def test_subject_snapshot_accepts_allowed_color_token():
    snapshot = TaskSubjectSnapshot(
        id=uuid.uuid4(), name="Physics", color_token="teal", archived=False
    )
    assert snapshot.color_token == "teal"


def test_subject_snapshot_rejects_color_outside_allowlist():
    with pytest.raises(ValidationError):
        TaskSubjectSnapshot(id=uuid.uuid4(), name="Physics", color_token="blue", archived=False)


# --- deadline: tzinfo set but utcoffset() None is still "naive" ---


def test_create_rejects_tzinfo_with_none_utcoffset():
    with pytest.raises(ValidationError):
        TaskCreate(**_valid_create_kwargs(deadline=PATHOLOGICAL_DEADLINE))


def test_update_rejects_tzinfo_with_none_utcoffset():
    with pytest.raises(ValidationError):
        TaskUpdate(deadline=PATHOLOGICAL_DEADLINE)


# --- TaskUpdate: empty body / invalid-null rejection ---


def test_update_rejects_empty_body():
    with pytest.raises(ValidationError):
        TaskUpdate()


@pytest.mark.parametrize("field", ["title", "type", "deadline", "priority", "status"])
def test_update_rejects_null_for_non_nullable_field(field):
    with pytest.raises(ValidationError):
        TaskUpdate(**{field: None})


@pytest.mark.parametrize("field", ["subject_id", "estimate_hours", "notes"])
def test_update_allows_null_for_nullable_field(field):
    update = TaskUpdate(**{field: None})
    assert getattr(update, field) is None


# --- TaskListQuery ---


def test_list_query_defaults():
    query = TaskListQuery()
    assert query.sort == "deadline_asc"
    assert query.limit == 20
    assert query.offset == 0
    assert query.status is None


def test_list_query_rejects_unknown_field():
    with pytest.raises(ValidationError):
        TaskListQuery(bogus="x")


def test_list_query_rejects_naive_due_before():
    with pytest.raises(ValidationError):
        TaskListQuery(due_before=NAIVE_DEADLINE)


def test_list_query_rejects_naive_due_after():
    with pytest.raises(ValidationError):
        TaskListQuery(due_after=NAIVE_DEADLINE)


def test_list_query_rejects_tzinfo_with_none_utcoffset_due_before():
    with pytest.raises(ValidationError):
        TaskListQuery(due_before=PATHOLOGICAL_DEADLINE)


def test_list_query_normalizes_aware_due_before_to_utc():
    plus_six = timezone(timedelta(hours=6))
    local = datetime(2026, 8, 1, 18, 0, tzinfo=plus_six)  # == 12:00 UTC
    query = TaskListQuery(due_before=local)
    assert query.due_before == AWARE_DEADLINE
    assert query.due_before.utcoffset() == timedelta(0)


def test_list_query_rejects_invalid_sort_token():
    with pytest.raises(ValidationError):
        TaskListQuery(sort="bogus")
