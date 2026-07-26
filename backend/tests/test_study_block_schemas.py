"""Schema tests for app.schemas.study_block, plus Core-level database tests
proving the study_blocks table's structural/constraint guarantees.

No service/router exists yet (Phase 5 checkpoint 1 scope is model+schemas+
migration only) — most tests here exercise Pydantic validation directly
against StudyBlockCreate/StudyBlockUpdate/StudyBlockRead. The database
tests at the bottom use their own throwaway in-memory SQLite engine (same
pattern as test_subtask_schemas.py's server-default test) to prove table
shape, the ends_at > starts_at CHECK constraint, the composite index, the
task_id FK's ON DELETE SET NULL option, and the actual detach-on-delete
behavior end to end.
"""
import uuid
from datetime import UTC, datetime, timedelta, timezone, tzinfo

import pytest
import sqlalchemy as sa
from pydantic import ValidationError
from sqlalchemy import event, inspect
from sqlmodel import SQLModel

from app.models.study_block import StudyBlock
from app.models.task import Task
from app.schemas.study_block import StudyBlockCreate, StudyBlockRead, StudyBlockUpdate

AWARE_START = datetime(2026, 8, 1, 9, 0, tzinfo=UTC)
AWARE_END = datetime(2026, 8, 1, 10, 0, tzinfo=UTC)
NAIVE_DATETIME = datetime(2026, 8, 1, 9, 0)


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


PATHOLOGICAL_DATETIME = datetime(2026, 8, 1, 9, 0, tzinfo=_TzWithNoOffset())


def _valid_create_kwargs(**overrides) -> dict:
    kwargs = {"starts_at": AWARE_START, "ends_at": AWARE_END}
    kwargs.update(overrides)
    return kwargs


# --- StudyBlockCreate: happy path ---


def test_create_accepts_valid_payload():
    block = StudyBlockCreate(**_valid_create_kwargs())
    assert block.starts_at == AWARE_START
    assert block.ends_at == AWARE_END
    assert block.task_id is None


def test_create_allows_null_task_id():
    block = StudyBlockCreate(**_valid_create_kwargs(task_id=None))
    assert block.task_id is None


def test_create_accepts_task_id():
    task_id = uuid.uuid4()
    block = StudyBlockCreate(**_valid_create_kwargs(task_id=task_id))
    assert block.task_id == task_id


# --- StudyBlockCreate: timezone-awareness ---


def test_create_rejects_naive_starts_at():
    with pytest.raises(ValidationError):
        StudyBlockCreate(**_valid_create_kwargs(starts_at=NAIVE_DATETIME))


def test_create_rejects_naive_ends_at():
    with pytest.raises(ValidationError):
        StudyBlockCreate(**_valid_create_kwargs(ends_at=NAIVE_DATETIME))


def test_create_rejects_pathological_naive_tzinfo():
    with pytest.raises(ValidationError):
        StudyBlockCreate(**_valid_create_kwargs(starts_at=PATHOLOGICAL_DATETIME))


def test_create_normalizes_non_utc_aware_datetime_to_utc():
    # Same instant as AWARE_START, expressed in a +06:00 offset.
    offset_start = AWARE_START.astimezone(timezone(timedelta(hours=6)))
    block = StudyBlockCreate(**_valid_create_kwargs(starts_at=offset_start))
    assert block.starts_at == AWARE_START
    assert block.starts_at.tzinfo == UTC


# --- StudyBlockCreate: ends_at > starts_at ---


def test_create_rejects_ends_at_equal_to_starts_at():
    with pytest.raises(ValidationError):
        StudyBlockCreate(starts_at=AWARE_START, ends_at=AWARE_START)


def test_create_rejects_ends_at_before_starts_at():
    with pytest.raises(ValidationError):
        StudyBlockCreate(starts_at=AWARE_END, ends_at=AWARE_START)


# --- StudyBlockCreate: extra fields ---


def test_create_rejects_unknown_field():
    with pytest.raises(ValidationError):
        StudyBlockCreate(**_valid_create_kwargs(bogus="x"))


@pytest.mark.parametrize(
    "field,value",
    [
        ("id", str(uuid.uuid4())),
        ("user_id", str(uuid.uuid4())),
        ("created_at", AWARE_START.isoformat()),
        ("updated_at", AWARE_START.isoformat()),
    ],
)
def test_create_rejects_client_owned_fields(field, value):
    with pytest.raises(ValidationError):
        StudyBlockCreate(**_valid_create_kwargs(**{field: value}))


# --- StudyBlockUpdate: empty body / explicit nulls ---


def test_update_rejects_empty_body():
    with pytest.raises(ValidationError):
        StudyBlockUpdate()


def test_update_rejects_null_starts_at():
    with pytest.raises(ValidationError):
        StudyBlockUpdate(starts_at=None)


def test_update_rejects_null_ends_at():
    with pytest.raises(ValidationError):
        StudyBlockUpdate(ends_at=None)


def test_update_allows_explicit_null_task_id():
    update = StudyBlockUpdate(task_id=None, starts_at=AWARE_START)
    assert update.task_id is None


def test_update_allows_partial_single_field_starts_at():
    update = StudyBlockUpdate(starts_at=AWARE_START)
    assert update.starts_at == AWARE_START
    assert update.ends_at is None


def test_update_allows_partial_single_field_ends_at():
    update = StudyBlockUpdate(ends_at=AWARE_END)
    assert update.ends_at == AWARE_END
    assert update.starts_at is None


def test_update_rejects_ends_at_not_after_starts_at_when_both_present():
    with pytest.raises(ValidationError):
        StudyBlockUpdate(starts_at=AWARE_END, ends_at=AWARE_START)


def test_update_rejects_naive_starts_at():
    with pytest.raises(ValidationError):
        StudyBlockUpdate(starts_at=NAIVE_DATETIME)


def test_update_rejects_naive_ends_at():
    with pytest.raises(ValidationError):
        StudyBlockUpdate(ends_at=NAIVE_DATETIME)


def test_update_rejects_unknown_field():
    with pytest.raises(ValidationError):
        StudyBlockUpdate(starts_at=AWARE_START, bogus="x")


@pytest.mark.parametrize(
    "field,value",
    [
        ("id", str(uuid.uuid4())),
        ("user_id", str(uuid.uuid4())),
        ("created_at", AWARE_START.isoformat()),
        ("updated_at", AWARE_START.isoformat()),
    ],
)
def test_update_rejects_client_owned_fields(field, value):
    with pytest.raises(ValidationError):
        StudyBlockUpdate(**{field: value})


# --- StudyBlockRead ---


class _StudyBlockRow:
    def __init__(self):
        self.id = uuid.uuid4()
        self.task_id = None
        self.starts_at = AWARE_START
        self.ends_at = AWARE_END
        self.created_at = AWARE_START
        self.updated_at = AWARE_START


def test_read_builds_from_orm_attributes():
    row = _StudyBlockRow()
    read = StudyBlockRead.model_validate(row)
    assert read.id == row.id
    assert read.task_id is None
    assert read.starts_at == AWARE_START
    assert read.ends_at == AWARE_END


# =====================================================================
# Core-level database tests — NOT schema tests.
#
# Each uses its own throwaway in-memory SQLite engine (no fixture reuse,
# no real Supabase/Postgres) with foreign_keys=ON, mirroring conftest.py's
# `engine` fixture setup. Proves: table/columns exist, the composite
# index exists, the task_id FK reports ON DELETE SET NULL, the CHECK
# constraint actually rejects an invalid row, and deleting a linked task
# leaves the StudyBlock row intact with task_id set to NULL.
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

    # Full metadata (not just [Task, StudyBlock]) — tasks.subject_id FKs to
    # subjects, and SQLite's FK enforcement needs the referenced table to
    # exist even when the column value being inserted is NULL.
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


def test_study_blocks_table_has_expected_columns():
    engine = _make_engine()
    try:
        columns = {col.name for col in StudyBlock.__table__.columns}
        assert columns == {
            "id",
            "user_id",
            "task_id",
            "starts_at",
            "ends_at",
            "created_at",
            "updated_at",
        }
    finally:
        engine.dispose()


def test_task_id_column_is_nullable():
    engine = _make_engine()
    try:
        insp = inspect(engine)
        columns = {col["name"]: col for col in insp.get_columns("study_blocks")}
        assert columns["task_id"]["nullable"] is True
    finally:
        engine.dispose()


def test_task_id_foreign_key_uses_on_delete_set_null():
    engine = _make_engine()
    try:
        insp = inspect(engine)
        fks = insp.get_foreign_keys("study_blocks")
        task_fk = next(fk for fk in fks if fk["referred_table"] == "tasks")
        assert task_fk["options"].get("ondelete", "").upper() == "SET NULL"
    finally:
        engine.dispose()


def test_user_id_starts_at_composite_index_exists():
    engine = _make_engine()
    try:
        insp = inspect(engine)
        indexes = insp.get_indexes("study_blocks")
        matching = [ix for ix in indexes if ix["column_names"] == ["user_id", "starts_at"]]
        assert len(matching) == 1
    finally:
        engine.dispose()


def test_ends_at_must_be_after_starts_at_check_constraint_rejects_invalid_row():
    engine = _make_engine()
    try:
        user_id = uuid.uuid4()
        with pytest.raises(sa.exc.IntegrityError):
            with engine.begin() as conn:
                conn.execute(
                    sa.insert(StudyBlock.__table__).values(
                        id=uuid.uuid4(),
                        user_id=user_id,
                        task_id=None,
                        starts_at=AWARE_END,
                        ends_at=AWARE_START,  # invalid: ends_at <= starts_at
                        created_at=AWARE_START,
                        updated_at=AWARE_START,
                    )
                )
    finally:
        engine.dispose()


def test_ends_at_must_be_after_starts_at_check_constraint_allows_valid_row():
    engine = _make_engine()
    try:
        user_id = uuid.uuid4()
        block_id = uuid.uuid4()
        with engine.begin() as conn:
            conn.execute(
                sa.insert(StudyBlock.__table__).values(
                    id=block_id,
                    user_id=user_id,
                    task_id=None,
                    starts_at=AWARE_START,
                    ends_at=AWARE_END,
                    created_at=AWARE_START,
                    updated_at=AWARE_START,
                )
            )
        with engine.connect() as conn:
            row = conn.execute(
                sa.select(StudyBlock.__table__.c.id).where(
                    StudyBlock.__table__.c.id == block_id
                )
            ).one()
        assert row.id == block_id
    finally:
        engine.dispose()


def test_deleting_linked_task_leaves_study_block_and_sets_task_id_null():
    engine = _make_engine()
    try:
        user_id = uuid.uuid4()
        task_id = uuid.uuid4()
        block_id = uuid.uuid4()

        with engine.begin() as conn:
            _insert_task(conn, task_id=task_id, user_id=user_id)
            conn.execute(
                sa.insert(StudyBlock.__table__).values(
                    id=block_id,
                    user_id=user_id,
                    task_id=task_id,
                    starts_at=AWARE_START,
                    ends_at=AWARE_END,
                    created_at=AWARE_START,
                    updated_at=AWARE_START,
                )
            )

        with engine.begin() as conn:
            conn.execute(sa.delete(Task.__table__).where(Task.__table__.c.id == task_id))

        with engine.connect() as conn:
            row = conn.execute(
                sa.select(StudyBlock.__table__.c.task_id).where(
                    StudyBlock.__table__.c.id == block_id
                )
            ).one()

        assert row.task_id is None
    finally:
        engine.dispose()
