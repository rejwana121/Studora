"""Schema tests for app.schemas.study_session, plus Core-level database
tests proving the study_sessions table's structural/constraint guarantees.

No service/router exists yet (Phase 5 checkpoint 2 scope is model+schemas+
migration only) — most tests here exercise Pydantic validation directly
against StudySessionCreate/StudySessionRead. The database tests use their
own throwaway in-memory SQLite engine (same pattern established in
test_study_block_schemas.py) with the full SQLModel metadata (tasks FKs
to subjects; study_sessions FKs to tasks — SQLite's FK enforcement needs
every referenced table to exist even for NULL-valued columns).
"""
import uuid
from datetime import UTC, datetime, timedelta

import pytest
import sqlalchemy as sa
from pydantic import ValidationError
from sqlalchemy import event, inspect
from sqlmodel import SQLModel

from app.models.study_session import StudySession
from app.models.task import Task
from app.schemas.study_session import StudySessionCreate, StudySessionRead

AWARE_START = datetime(2026, 8, 1, 9, 0, tzinfo=UTC)
AWARE_END = datetime(2026, 8, 1, 10, 0, tzinfo=UTC)


# =====================================================================
# Pydantic schema tests
# =====================================================================


def test_create_accepts_none_task_id():
    session = StudySessionCreate(task_id=None)
    assert session.task_id is None


def test_create_accepts_task_id():
    task_id = uuid.uuid4()
    session = StudySessionCreate(task_id=task_id)
    assert session.task_id == task_id


def test_create_defaults_task_id_to_none_when_omitted():
    session = StudySessionCreate()
    assert session.task_id is None


def test_create_rejects_unknown_field():
    with pytest.raises(ValidationError):
        StudySessionCreate(bogus="x")


@pytest.mark.parametrize(
    "field,value",
    [
        ("id", str(uuid.uuid4())),
        ("user_id", str(uuid.uuid4())),
        ("started_at", AWARE_START.isoformat()),
        ("ended_at", AWARE_END.isoformat()),
        ("active_duration_seconds", 120),
        ("status", "Active"),
        ("break_taken", True),
        ("active_segment_started_at", AWARE_START.isoformat()),
        ("created_at", AWARE_START.isoformat()),
        ("updated_at", AWARE_START.isoformat()),
    ],
)
def test_create_rejects_client_owned_fields(field, value):
    with pytest.raises(ValidationError):
        StudySessionCreate(**{field: value})


class _StudySessionRow:
    def __init__(self):
        self.id = uuid.uuid4()
        self.task_id = None
        self.started_at = AWARE_START
        self.ended_at = None
        self.active_duration_seconds = 0
        self.status = "Active"
        self.break_taken = False
        self.active_segment_started_at = AWARE_START
        self.created_at = AWARE_START
        self.updated_at = AWARE_START


def test_read_builds_from_orm_attributes():
    row = _StudySessionRow()
    read = StudySessionRead.model_validate(row)
    assert read.id == row.id
    assert read.status == "Active"
    assert read.active_duration_seconds == 0
    assert read.break_taken is False


def test_read_omits_active_segment_started_at():
    assert "active_segment_started_at" not in StudySessionRead.model_fields


def test_read_omits_user_id():
    assert "user_id" not in StudySessionRead.model_fields


# =====================================================================
# Core-level database tests — NOT schema tests.
#
# Each uses its own throwaway in-memory SQLite engine (no fixture reuse,
# no real Supabase/Postgres) with foreign_keys=ON and the full SQLModel
# metadata (same pattern as test_study_block_schemas.py).
# =====================================================================


def _make_engine():
    engine = sa.create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def _enable_sqlite_foreign_keys(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    SQLModel.metadata.create_all(engine)
    return engine


def _insert_task(conn, *, task_id, user_id):
    conn.execute(
        sa.insert(Task.__table__).values(
            id=task_id,
            user_id=user_id,
            subject_id=None,
            title="Read Chapter 3",
            type="Assignment",
            deadline=AWARE_END,
            priority="Medium",
            estimate_hours=None,
            status="Pending",
            notes=None,
            completed_at=None,
            reschedule_count=0,
            created_at=AWARE_START,
            updated_at=AWARE_START,
        )
    )


def _base_row(**overrides) -> dict:
    """A valid Active-session column-value dict. `overrides` is merged
    via a plain dict literal (`{**defaults, **overrides}`-style), not
    passed as duplicate call-site keywords, so callers can freely
    override any field — including ones this function also defaults —
    without a Python-level duplicate-keyword-argument error."""
    values = {
        "id": uuid.uuid4(),
        "user_id": uuid.uuid4(),
        "task_id": None,
        "started_at": AWARE_START,
        "ended_at": None,
        "active_duration_seconds": 0,
        "status": "Active",
        "break_taken": False,
        "active_segment_started_at": AWARE_START,
        "active_duration_seconds_at_last_break": None,
        "created_at": AWARE_START,
        "updated_at": AWARE_START,
    }
    values.update(overrides)
    return values


def _valid_row_for_status(status: str, **overrides) -> dict:
    """A column-value dict satisfying every CHECK constraint for the
    given status, so individual tests can mutate exactly one field away
    from valid to prove rejection (or use as-is to prove acceptance)."""
    if status == "Active":
        defaults = {"status": "Active", "ended_at": None, "active_segment_started_at": AWARE_START}
    elif status == "Paused":
        defaults = {"status": "Paused", "ended_at": None, "active_segment_started_at": None}
    elif status in ("Finished", "Cancelled"):
        defaults = {"status": status, "ended_at": AWARE_END, "active_segment_started_at": None}
    else:
        raise ValueError(f"unhandled status {status!r}")
    # Plain dict-literal merge (not duplicate call-site keywords) — overrides
    # always wins, even when overriding a key also present in defaults.
    return _base_row(**{**defaults, **overrides})


def _insert(conn, values: dict):
    conn.execute(sa.insert(StudySession.__table__).values(**values))


# --- table shape ---


def test_study_sessions_table_has_expected_columns():
    engine = _make_engine()
    try:
        columns = {col.name for col in StudySession.__table__.columns}
        assert columns == {
            "id",
            "user_id",
            "task_id",
            "started_at",
            "ended_at",
            "active_duration_seconds",
            "status",
            "break_taken",
            "active_segment_started_at",
            "active_duration_seconds_at_last_break",
            "created_at",
            "updated_at",
        }
    finally:
        engine.dispose()


def test_task_id_column_is_nullable():
    engine = _make_engine()
    try:
        insp = inspect(engine)
        columns = {col["name"]: col for col in insp.get_columns("study_sessions")}
        assert columns["task_id"]["nullable"] is True
    finally:
        engine.dispose()


def test_task_id_foreign_key_uses_on_delete_set_null():
    engine = _make_engine()
    try:
        insp = inspect(engine)
        fks = insp.get_foreign_keys("study_sessions")
        task_fk = next(fk for fk in fks if fk["referred_table"] == "tasks")
        assert task_fk["options"].get("ondelete", "").upper() == "SET NULL"
    finally:
        engine.dispose()


def test_user_id_index_exists():
    engine = _make_engine()
    try:
        insp = inspect(engine)
        indexes = insp.get_indexes("study_sessions")
        matching = [ix for ix in indexes if ix["column_names"] == ["user_id"] and not ix["unique"]]
        assert len(matching) == 1
    finally:
        engine.dispose()


# --- server defaults ---


def test_active_duration_seconds_server_default_is_zero_when_omitted():
    engine = _make_engine()
    try:
        user_id = uuid.uuid4()
        session_id = uuid.uuid4()
        with engine.begin() as conn:
            conn.execute(
                sa.insert(StudySession.__table__).values(
                    id=session_id,
                    user_id=user_id,
                    task_id=None,
                    started_at=AWARE_START,
                    ended_at=None,
                    # active_duration_seconds intentionally omitted
                    status="Active",
                    break_taken=False,
                    active_segment_started_at=AWARE_START,
                    created_at=AWARE_START,
                    updated_at=AWARE_START,
                )
            )
        with engine.connect() as conn:
            row = conn.execute(
                sa.select(StudySession.__table__.c.active_duration_seconds).where(
                    StudySession.__table__.c.id == session_id
                )
            ).one()
        assert row.active_duration_seconds == 0
    finally:
        engine.dispose()


def test_break_taken_server_default_is_false_when_omitted():
    engine = _make_engine()
    try:
        user_id = uuid.uuid4()
        session_id = uuid.uuid4()
        with engine.begin() as conn:
            conn.execute(
                sa.insert(StudySession.__table__).values(
                    id=session_id,
                    user_id=user_id,
                    task_id=None,
                    started_at=AWARE_START,
                    ended_at=None,
                    active_duration_seconds=0,
                    status="Active",
                    # break_taken intentionally omitted
                    active_segment_started_at=AWARE_START,
                    created_at=AWARE_START,
                    updated_at=AWARE_START,
                )
            )
        with engine.connect() as conn:
            row = conn.execute(
                sa.select(StudySession.__table__.c.break_taken).where(
                    StudySession.__table__.c.id == session_id
                )
            ).one()
        assert row.break_taken is False
    finally:
        engine.dispose()


# --- break baseline column (Checkpoint 6) ---


def test_break_baseline_column_is_nullable():
    engine = _make_engine()
    try:
        insp = inspect(engine)
        columns = {col["name"]: col for col in insp.get_columns("study_sessions")}
        assert columns["active_duration_seconds_at_last_break"]["nullable"] is True
    finally:
        engine.dispose()


def test_break_baseline_defaults_to_none_when_omitted():
    engine = _make_engine()
    try:
        user_id = uuid.uuid4()
        session_id = uuid.uuid4()
        with engine.begin() as conn:
            conn.execute(
                sa.insert(StudySession.__table__).values(
                    id=session_id,
                    user_id=user_id,
                    task_id=None,
                    started_at=AWARE_START,
                    ended_at=None,
                    active_duration_seconds=0,
                    status="Active",
                    break_taken=False,
                    active_segment_started_at=AWARE_START,
                    # active_duration_seconds_at_last_break intentionally omitted
                    created_at=AWARE_START,
                    updated_at=AWARE_START,
                )
            )
        with engine.connect() as conn:
            row = conn.execute(
                sa.select(StudySession.__table__.c.active_duration_seconds_at_last_break).where(
                    StudySession.__table__.c.id == session_id
                )
            ).one()
        assert row.active_duration_seconds_at_last_break is None
    finally:
        engine.dispose()


# --- detach-on-task-delete behavior ---


def test_deleting_linked_task_leaves_study_session_and_sets_task_id_null():
    engine = _make_engine()
    try:
        user_id = uuid.uuid4()
        task_id = uuid.uuid4()
        session_id = uuid.uuid4()

        with engine.begin() as conn:
            _insert_task(conn, task_id=task_id, user_id=user_id)
            row = _valid_row_for_status(
                "Active", user_id=user_id, task_id=task_id, id=session_id
            )
            _insert(conn, row)

        with engine.begin() as conn:
            conn.execute(sa.delete(Task.__table__).where(Task.__table__.c.id == task_id))

        with engine.connect() as conn:
            row = conn.execute(
                sa.select(StudySession.__table__.c.task_id).where(
                    StudySession.__table__.c.id == session_id
                )
            ).one()
        assert row.task_id is None
    finally:
        engine.dispose()


# --- CHECK constraints: acceptance of every valid status shape ---


@pytest.mark.parametrize("status", ["Active", "Paused", "Finished", "Cancelled"])
def test_check_constraints_allow_valid_row_for_each_status(status):
    engine = _make_engine()
    try:
        with engine.begin() as conn:
            _insert(conn, _valid_row_for_status(status))
    finally:
        engine.dispose()


# --- CHECK constraints: rejections ---


def test_check_rejects_negative_active_duration_seconds():
    engine = _make_engine()
    try:
        with pytest.raises(sa.exc.IntegrityError):
            with engine.begin() as conn:
                _insert(conn, _valid_row_for_status("Active", active_duration_seconds=-1))
    finally:
        engine.dispose()


def test_check_rejects_invalid_status_value():
    engine = _make_engine()
    try:
        with pytest.raises(sa.exc.IntegrityError):
            with engine.begin() as conn:
                _insert(
                    conn,
                    _base_row(status="Bogus", ended_at=None, active_segment_started_at=AWARE_START),
                )
    finally:
        engine.dispose()


def test_check_rejects_active_status_with_non_null_ended_at():
    engine = _make_engine()
    try:
        with pytest.raises(sa.exc.IntegrityError):
            with engine.begin() as conn:
                _insert(conn, _valid_row_for_status("Active", ended_at=AWARE_END))
    finally:
        engine.dispose()


def test_check_rejects_finished_status_with_null_ended_at():
    engine = _make_engine()
    try:
        with pytest.raises(sa.exc.IntegrityError):
            with engine.begin() as conn:
                _insert(conn, _valid_row_for_status("Finished", ended_at=None))
    finally:
        engine.dispose()


def test_check_rejects_active_status_with_null_segment_anchor():
    engine = _make_engine()
    try:
        with pytest.raises(sa.exc.IntegrityError):
            with engine.begin() as conn:
                _insert(conn, _valid_row_for_status("Active", active_segment_started_at=None))
    finally:
        engine.dispose()


def test_check_rejects_paused_status_with_non_null_segment_anchor():
    engine = _make_engine()
    try:
        with pytest.raises(sa.exc.IntegrityError):
            with engine.begin() as conn:
                row = _valid_row_for_status("Paused", active_segment_started_at=AWARE_START)
                _insert(conn, row)
    finally:
        engine.dispose()


def test_check_rejects_ended_at_before_started_at():
    engine = _make_engine()
    try:
        with pytest.raises(sa.exc.IntegrityError):
            with engine.begin() as conn:
                _insert(
                    conn,
                    _valid_row_for_status(
                        "Finished", ended_at=AWARE_START - timedelta(hours=1)
                    ),
                )
    finally:
        engine.dispose()


# --- CHECK constraints: break baseline (Checkpoint 6) ---


def _valid_break_taken_row(**overrides) -> dict:
    """An Active row with a break already taken — baseline present and
    consistent with `break_taken=True`, satisfying every CHECK
    constraint by default so individual tests can mutate exactly one
    field away from valid."""
    defaults = {
        "break_taken": True,
        "active_duration_seconds": 3200,
        "active_duration_seconds_at_last_break": 3200,
    }
    return _valid_row_for_status("Active", **{**defaults, **overrides})


def test_check_allows_break_baseline_equal_to_duration():
    engine = _make_engine()
    try:
        with engine.begin() as conn:
            _insert(conn, _valid_break_taken_row())
    finally:
        engine.dispose()


def test_check_allows_break_baseline_less_than_duration():
    engine = _make_engine()
    try:
        with engine.begin() as conn:
            _insert(
                conn,
                _valid_break_taken_row(
                    active_duration_seconds=4000, active_duration_seconds_at_last_break=3200
                ),
            )
    finally:
        engine.dispose()


def test_check_rejects_negative_break_baseline():
    engine = _make_engine()
    try:
        with pytest.raises(sa.exc.IntegrityError):
            with engine.begin() as conn:
                _insert(conn, _valid_break_taken_row(active_duration_seconds_at_last_break=-1))
    finally:
        engine.dispose()


def test_check_rejects_break_baseline_exceeding_duration():
    engine = _make_engine()
    try:
        with pytest.raises(sa.exc.IntegrityError):
            with engine.begin() as conn:
                _insert(
                    conn,
                    _valid_break_taken_row(
                        active_duration_seconds=100, active_duration_seconds_at_last_break=101
                    ),
                )
    finally:
        engine.dispose()


def test_check_rejects_break_taken_true_with_null_baseline():
    engine = _make_engine()
    try:
        with pytest.raises(sa.exc.IntegrityError):
            with engine.begin() as conn:
                _insert(
                    conn,
                    _valid_break_taken_row(active_duration_seconds_at_last_break=None),
                )
    finally:
        engine.dispose()


def test_check_rejects_break_taken_false_with_non_null_baseline():
    engine = _make_engine()
    try:
        with pytest.raises(sa.exc.IntegrityError):
            with engine.begin() as conn:
                _insert(
                    conn,
                    _valid_row_for_status(
                        "Active",
                        break_taken=False,
                        active_duration_seconds=3200,
                        active_duration_seconds_at_last_break=3200,
                    ),
                )
    finally:
        engine.dispose()


def test_check_allows_break_taken_false_with_null_baseline():
    engine = _make_engine()
    try:
        with engine.begin() as conn:
            _insert(conn, _valid_row_for_status("Active"))
    finally:
        engine.dispose()


@pytest.mark.parametrize("status", ["Paused", "Finished", "Cancelled"])
def test_check_allows_break_taken_row_for_every_non_active_status(status):
    engine = _make_engine()
    try:
        with engine.begin() as conn:
            row = _valid_row_for_status(
                status,
                break_taken=True,
                active_duration_seconds=3200,
                active_duration_seconds_at_last_break=3200,
            )
            _insert(conn, row)
    finally:
        engine.dispose()


# --- CHECK constraint preservation: prior constraints still present ---


def test_check_constraint_names_include_prior_and_new_constraints():
    engine = _make_engine()
    try:
        insp = inspect(engine)
        names = {c["name"] for c in insp.get_check_constraints("study_sessions")}
        assert names == {
            "ck_study_sessions_duration_non_negative",
            "ck_study_sessions_status_enum",
            "ck_study_sessions_ended_at_matches_status",
            "ck_study_sessions_segment_anchor_matches_status",
            "ck_study_sessions_ended_not_before_started",
            "ck_study_sessions_break_baseline_non_negative",
            "ck_study_sessions_break_baseline_not_exceeding_duration",
            "ck_study_sessions_break_baseline_matches_break_taken",
        }
    finally:
        engine.dispose()


# --- partial unique index: one unfinished session per user ---


def test_second_unfinished_session_for_same_user_is_rejected():
    engine = _make_engine()
    try:
        user_id = uuid.uuid4()
        with pytest.raises(sa.exc.IntegrityError):
            with engine.begin() as conn:
                _insert(conn, _valid_row_for_status("Active", user_id=user_id))
                _insert(conn, _valid_row_for_status("Paused", user_id=user_id))
    finally:
        engine.dispose()


def test_different_users_may_each_have_an_unfinished_session():
    engine = _make_engine()
    try:
        user_a = uuid.uuid4()
        user_b = uuid.uuid4()
        with engine.begin() as conn:
            _insert(conn, _valid_row_for_status("Active", user_id=user_a))
            _insert(conn, _valid_row_for_status("Paused", user_id=user_b))
    finally:
        engine.dispose()


def test_new_session_allowed_after_prior_session_finished():
    engine = _make_engine()
    try:
        user_id = uuid.uuid4()
        first_id = uuid.uuid4()

        with engine.begin() as conn:
            _insert(conn, _valid_row_for_status("Active", user_id=user_id, id=first_id))

        with engine.begin() as conn:
            conn.execute(
                sa.update(StudySession.__table__)
                .where(StudySession.__table__.c.id == first_id)
                .values(
                    status="Finished",
                    ended_at=AWARE_END,
                    active_segment_started_at=None,
                )
            )

        with engine.begin() as conn:
            _insert(conn, _valid_row_for_status("Active", user_id=user_id))
    finally:
        engine.dispose()
