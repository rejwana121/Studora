"""Schema tests for app.schemas.study_session_break, plus Core-level
database tests proving the study_session_breaks table's structural/
constraint guarantees.

No service/router exists yet (Phase 5 checkpoint 3 scope is model+schemas+
migration only) — most tests here exercise Pydantic validation directly
against StudySessionBreakCreate/StudySessionBreakRead. The database tests
at the bottom use their own throwaway in-memory SQLite engine (same
pattern as test_study_block_schemas.py/test_study_session_schemas.py),
proving table shape, both indexes, the session_id FK's ON DELETE CASCADE
option, the three CHECK constraints, that multiple break events per
session are allowed (no invented uniqueness rule), and that deleting the
parent session cascades to its break rows.
"""
import uuid
from datetime import UTC, datetime

import pytest
import sqlalchemy as sa
from pydantic import ValidationError
from sqlalchemy import event, inspect
from sqlmodel import SQLModel

from app.models.study_session import StudySession
from app.models.study_session_break import StudySessionBreak
from app.schemas.study_session import StudySessionRead
from app.schemas.study_session_break import (
    SessionBreakActionResult,
    StudySessionBreakCreate,
    StudySessionBreakRead,
)

AWARE_START = datetime(2026, 8, 1, 9, 0, tzinfo=UTC)


def _valid_create_kwargs(**overrides) -> dict:
    kwargs = {"action": "TakeBreak"}
    kwargs.update(overrides)
    return kwargs


# --- StudySessionBreakCreate: happy path ---


def test_create_accepts_take_break_with_no_duration():
    create = StudySessionBreakCreate(**_valid_create_kwargs())
    assert create.action == "TakeBreak"
    assert create.duration_minutes is None


def test_create_accepts_take_break_with_duration():
    create = StudySessionBreakCreate(**_valid_create_kwargs(duration_minutes=10))
    assert create.duration_minutes == 10


def test_create_accepts_snooze_with_duration():
    create = StudySessionBreakCreate(action="Snooze", duration_minutes=10)
    assert create.action == "Snooze"
    assert create.duration_minutes == 10


def test_create_accepts_snooze_with_no_duration():
    create = StudySessionBreakCreate(action="Snooze")
    assert create.duration_minutes is None


def test_create_accepts_dismiss_with_no_duration():
    create = StudySessionBreakCreate(action="Dismiss")
    assert create.action == "Dismiss"
    assert create.duration_minutes is None


# --- StudySessionBreakCreate: action enum ---


def test_create_rejects_invalid_action():
    with pytest.raises(ValidationError):
        StudySessionBreakCreate(action="Cancel")


def test_create_rejects_missing_action():
    with pytest.raises(ValidationError):
        StudySessionBreakCreate()


# --- StudySessionBreakCreate: duration_minutes semantics ---


def test_create_rejects_dismiss_with_duration():
    with pytest.raises(ValidationError):
        StudySessionBreakCreate(action="Dismiss", duration_minutes=10)


@pytest.mark.parametrize("action", ["TakeBreak", "Snooze"])
def test_create_rejects_zero_duration(action):
    with pytest.raises(ValidationError):
        StudySessionBreakCreate(action=action, duration_minutes=0)


@pytest.mark.parametrize("action", ["TakeBreak", "Snooze"])
def test_create_rejects_negative_duration(action):
    with pytest.raises(ValidationError):
        StudySessionBreakCreate(action=action, duration_minutes=-5)


# --- StudySessionBreakCreate: extra/client-owned fields ---


def test_create_rejects_unknown_field():
    with pytest.raises(ValidationError):
        StudySessionBreakCreate(**_valid_create_kwargs(bogus="x"))


@pytest.mark.parametrize(
    "field,value",
    [
        ("id", str(uuid.uuid4())),
        ("session_id", str(uuid.uuid4())),
        ("user_id", str(uuid.uuid4())),
        ("prompted_at", AWARE_START.isoformat()),
    ],
)
def test_create_rejects_client_owned_fields(field, value):
    with pytest.raises(ValidationError):
        StudySessionBreakCreate(**_valid_create_kwargs(**{field: value}))


# --- StudySessionBreakRead ---


class _StudySessionBreakRow:
    def __init__(self):
        self.id = uuid.uuid4()
        self.session_id = uuid.uuid4()
        self.user_id = uuid.uuid4()
        self.prompted_at = AWARE_START
        self.action = "TakeBreak"
        self.duration_minutes = 10


def test_read_builds_from_orm_attributes():
    row = _StudySessionBreakRow()
    read = StudySessionBreakRead.model_validate(row)
    assert read.id == row.id
    assert read.session_id == row.session_id
    assert read.prompted_at == AWARE_START
    assert read.action == "TakeBreak"
    assert read.duration_minutes == 10


def test_read_has_no_user_id_field():
    assert "user_id" not in StudySessionBreakRead.model_fields


# --- SessionBreakActionResult (Checkpoint 6) ---


def _session_read(**overrides):
    values = {
        "id": uuid.uuid4(),
        "task_id": None,
        "started_at": AWARE_START,
        "ended_at": None,
        "active_duration_seconds": 0,
        "status": "Active",
        "break_taken": False,
        "created_at": AWARE_START,
        "updated_at": AWARE_START,
    }
    values.update(overrides)
    return StudySessionRead(**values)


def test_action_result_builds_from_nested_schema_instances():
    session_read = _session_read()
    break_read = StudySessionBreakRead.model_validate(_StudySessionBreakRow())
    result = SessionBreakActionResult(session=session_read, break_event=break_read)
    assert result.session.id == session_read.id
    assert result.break_event.id == break_read.id


def test_action_result_session_carries_break_eligible():
    session_read = _session_read(break_eligible=True)
    break_read = StudySessionBreakRead.model_validate(_StudySessionBreakRow())
    result = SessionBreakActionResult(session=session_read, break_event=break_read)
    assert result.session.break_eligible is True


# =====================================================================
# Core-level database tests — NOT schema tests.
#
# Each uses its own throwaway in-memory SQLite engine (no fixture reuse,
# no real Supabase/Postgres) with foreign_keys=ON, mirroring conftest.py's
# `engine` fixture setup and test_study_block_schemas.py/
# test_study_session_schemas.py. Proves: table/columns exist, both
# indexes exist, the session_id FK reports ON DELETE CASCADE, the three
# CHECK constraints actually reject/accept the right rows, multiple break
# events are allowed for the same session, and deleting the parent
# session cascades to its break rows.
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

    # Full metadata (not just [StudySession, StudySessionBreak]) — matches
    # the established pattern in test_study_block_schemas.py.
    SQLModel.metadata.create_all(engine)
    return engine


def _insert_session(conn, *, session_id, user_id):
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
            created_at=AWARE_START,
            updated_at=AWARE_START,
        )
    )


def _break_row(**overrides) -> dict:
    values = {
        "id": uuid.uuid4(),
        "session_id": uuid.uuid4(),
        "user_id": uuid.uuid4(),
        "prompted_at": AWARE_START,
        "action": "TakeBreak",
        "duration_minutes": None,
    }
    values.update(overrides)
    return values


def test_study_session_breaks_table_has_expected_columns():
    engine = _make_engine()
    try:
        columns = {col.name for col in StudySessionBreak.__table__.columns}
        assert columns == {
            "id",
            "session_id",
            "user_id",
            "prompted_at",
            "action",
            "duration_minutes",
        }
    finally:
        engine.dispose()


def test_session_id_foreign_key_uses_on_delete_cascade():
    engine = _make_engine()
    try:
        insp = inspect(engine)
        fks = insp.get_foreign_keys("study_session_breaks")
        session_fk = next(fk for fk in fks if fk["referred_table"] == "study_sessions")
        assert session_fk["options"].get("ondelete", "").upper() == "CASCADE"
    finally:
        engine.dispose()


def test_session_id_index_exists():
    engine = _make_engine()
    try:
        insp = inspect(engine)
        indexes = insp.get_indexes("study_session_breaks")
        matching = [ix for ix in indexes if ix["column_names"] == ["session_id"]]
        assert len(matching) == 1
    finally:
        engine.dispose()


def test_user_id_index_exists():
    engine = _make_engine()
    try:
        insp = inspect(engine)
        indexes = insp.get_indexes("study_session_breaks")
        matching = [ix for ix in indexes if ix["column_names"] == ["user_id"]]
        assert len(matching) == 1
    finally:
        engine.dispose()


def test_action_enum_check_rejects_invalid_value():
    engine = _make_engine()
    try:
        user_id = uuid.uuid4()
        session_id = uuid.uuid4()
        with pytest.raises(sa.exc.IntegrityError):
            with engine.begin() as conn:
                _insert_session(conn, session_id=session_id, user_id=user_id)
                conn.execute(
                    sa.insert(StudySessionBreak.__table__).values(
                        **_break_row(session_id=session_id, user_id=user_id, action="Cancel")
                    )
                )
    finally:
        engine.dispose()


@pytest.mark.parametrize("action", ["TakeBreak", "Snooze", "Dismiss"])
def test_action_enum_check_allows_valid_values(action):
    engine = _make_engine()
    try:
        user_id = uuid.uuid4()
        session_id = uuid.uuid4()
        with engine.begin() as conn:
            _insert_session(conn, session_id=session_id, user_id=user_id)
            conn.execute(
                sa.insert(StudySessionBreak.__table__).values(
                    **_break_row(
                        session_id=session_id,
                        user_id=user_id,
                        action=action,
                        duration_minutes=None,
                    )
                )
            )
    finally:
        engine.dispose()


def test_duration_positive_check_rejects_zero():
    engine = _make_engine()
    try:
        user_id = uuid.uuid4()
        session_id = uuid.uuid4()
        with pytest.raises(sa.exc.IntegrityError):
            with engine.begin() as conn:
                _insert_session(conn, session_id=session_id, user_id=user_id)
                conn.execute(
                    sa.insert(StudySessionBreak.__table__).values(
                        **_break_row(
                            session_id=session_id,
                            user_id=user_id,
                            action="TakeBreak",
                            duration_minutes=0,
                        )
                    )
                )
    finally:
        engine.dispose()


def test_duration_positive_check_rejects_negative():
    engine = _make_engine()
    try:
        user_id = uuid.uuid4()
        session_id = uuid.uuid4()
        with pytest.raises(sa.exc.IntegrityError):
            with engine.begin() as conn:
                _insert_session(conn, session_id=session_id, user_id=user_id)
                conn.execute(
                    sa.insert(StudySessionBreak.__table__).values(
                        **_break_row(
                            session_id=session_id,
                            user_id=user_id,
                            action="TakeBreak",
                            duration_minutes=-1,
                        )
                    )
                )
    finally:
        engine.dispose()


def test_duration_positive_check_allows_positive_value():
    engine = _make_engine()
    try:
        user_id = uuid.uuid4()
        session_id = uuid.uuid4()
        with engine.begin() as conn:
            _insert_session(conn, session_id=session_id, user_id=user_id)
            conn.execute(
                sa.insert(StudySessionBreak.__table__).values(
                    **_break_row(
                        session_id=session_id,
                        user_id=user_id,
                        action="TakeBreak",
                        duration_minutes=10,
                    )
                )
            )
    finally:
        engine.dispose()


def test_dismiss_duration_null_check_rejects_dismiss_with_duration():
    engine = _make_engine()
    try:
        user_id = uuid.uuid4()
        session_id = uuid.uuid4()
        with pytest.raises(sa.exc.IntegrityError):
            with engine.begin() as conn:
                _insert_session(conn, session_id=session_id, user_id=user_id)
                conn.execute(
                    sa.insert(StudySessionBreak.__table__).values(
                        **_break_row(
                            session_id=session_id,
                            user_id=user_id,
                            action="Dismiss",
                            duration_minutes=10,
                        )
                    )
                )
    finally:
        engine.dispose()


def test_dismiss_duration_null_check_allows_dismiss_with_null_duration():
    engine = _make_engine()
    try:
        user_id = uuid.uuid4()
        session_id = uuid.uuid4()
        with engine.begin() as conn:
            _insert_session(conn, session_id=session_id, user_id=user_id)
            conn.execute(
                sa.insert(StudySessionBreak.__table__).values(
                    **_break_row(
                        session_id=session_id,
                        user_id=user_id,
                        action="Dismiss",
                        duration_minutes=None,
                    )
                )
            )
    finally:
        engine.dispose()


def test_multiple_break_events_allowed_for_same_session():
    engine = _make_engine()
    try:
        user_id = uuid.uuid4()
        session_id = uuid.uuid4()
        with engine.begin() as conn:
            _insert_session(conn, session_id=session_id, user_id=user_id)
            conn.execute(
                sa.insert(StudySessionBreak.__table__).values(
                    **_break_row(session_id=session_id, user_id=user_id, action="Snooze")
                )
            )
            conn.execute(
                sa.insert(StudySessionBreak.__table__).values(
                    **_break_row(session_id=session_id, user_id=user_id, action="Snooze")
                )
            )
        with engine.connect() as conn:
            count = conn.execute(
                sa.select(sa.func.count())
                .select_from(StudySessionBreak.__table__)
                .where(StudySessionBreak.__table__.c.session_id == session_id)
            ).scalar_one()
        assert count == 2
    finally:
        engine.dispose()


def test_deleting_parent_session_cascades_to_break_rows():
    engine = _make_engine()
    try:
        user_id = uuid.uuid4()
        session_id = uuid.uuid4()
        break_id = uuid.uuid4()

        with engine.begin() as conn:
            _insert_session(conn, session_id=session_id, user_id=user_id)
            conn.execute(
                sa.insert(StudySessionBreak.__table__).values(
                    **_break_row(id=break_id, session_id=session_id, user_id=user_id)
                )
            )

        with engine.begin() as conn:
            conn.execute(
                sa.delete(StudySession.__table__).where(
                    StudySession.__table__.c.id == session_id
                )
            )

        with engine.connect() as conn:
            remaining = conn.execute(
                sa.select(StudySessionBreak.__table__.c.id).where(
                    StudySessionBreak.__table__.c.id == break_id
                )
            ).fetchall()

        assert remaining == []
    finally:
        engine.dispose()
