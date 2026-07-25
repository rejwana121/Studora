"""Focused schema tests for app.schemas.subtask, plus one isolated
in-memory SQLite server-default test.

No service/router exists yet (Phase 4 checkpoint 3 scope is model+schemas+
migration only); most tests here exercise Pydantic validation directly
against SubtaskCreate/SubtaskUpdate/SubtaskRead. One throwaway Core-level
SQLite test is included separately at the bottom to prove the model's
server_default behavior — see that section's own docstring.
"""
import uuid
from datetime import UTC, datetime

import pytest
import sqlalchemy as sa
from pydantic import ValidationError
from sqlmodel import SQLModel

from app.models.subtask import Subtask
from app.schemas.subtask import SubtaskCreate, SubtaskRead, SubtaskUpdate

NOW = datetime(2026, 7, 25, 12, 0, tzinfo=UTC)


# --- title: trimming and blank rejection (SubtaskCreate) ---


def test_create_strips_title_whitespace():
    subtask = SubtaskCreate(title="  Read Chapter 3  ")
    assert subtask.title == "Read Chapter 3"


def test_create_rejects_blank_title():
    with pytest.raises(ValidationError):
        SubtaskCreate(title="   ")


# --- title: trimming and blank rejection (SubtaskUpdate) ---


def test_update_strips_title_whitespace():
    update = SubtaskUpdate(title="  Finish problem set  ")
    assert update.title == "Finish problem set"


def test_update_rejects_blank_title():
    with pytest.raises(ValidationError):
        SubtaskUpdate(title="   ")


def test_update_allows_omitted_title():
    update = SubtaskUpdate(is_complete=True)
    assert update.title is None


# --- is_complete (SubtaskUpdate) ---


def test_update_accepts_is_complete_true():
    update = SubtaskUpdate(is_complete=True)
    assert update.is_complete is True


def test_update_accepts_is_complete_false():
    update = SubtaskUpdate(is_complete=False)
    assert update.is_complete is False


def test_update_allows_omitted_is_complete():
    update = SubtaskUpdate(title="New title")
    assert update.is_complete is None


# --- extra / client-owned fields rejected ---


@pytest.mark.parametrize(
    "field,value",
    [
        ("id", str(uuid.uuid4())),
        ("task_id", str(uuid.uuid4())),
        ("user_id", str(uuid.uuid4())),
        ("is_complete", True),
        ("created_at", NOW.isoformat()),
        ("updated_at", NOW.isoformat()),
    ],
)
def test_create_rejects_client_owned_fields(field, value):
    with pytest.raises(ValidationError):
        SubtaskCreate(title="Read Chapter 3", **{field: value})


@pytest.mark.parametrize(
    "field,value",
    [
        ("id", str(uuid.uuid4())),
        ("task_id", str(uuid.uuid4())),
        ("user_id", str(uuid.uuid4())),
        ("created_at", NOW.isoformat()),
        ("updated_at", NOW.isoformat()),
    ],
)
def test_update_rejects_client_owned_fields(field, value):
    with pytest.raises(ValidationError):
        SubtaskUpdate(**{field: value})


# --- extra / arbitrary unknown fields rejected ---


def test_create_rejects_unknown_field():
    with pytest.raises(ValidationError):
        SubtaskCreate(title="Read Chapter 3", bogus="x")


def test_update_rejects_unknown_field():
    with pytest.raises(ValidationError):
        SubtaskUpdate(bogus="x")


# --- SubtaskRead: built from ORM-style attributes, task_id/user_id omitted ---


class _SubtaskRow:
    def __init__(self):
        self.id = uuid.uuid4()
        self.title = "Read Chapter 3"
        self.is_complete = False
        self.created_at = NOW
        self.updated_at = NOW


def test_read_builds_from_orm_attributes():
    row = _SubtaskRow()
    read = SubtaskRead.model_validate(row)
    assert read.id == row.id
    assert read.title == row.title
    assert read.is_complete is False


def test_read_omits_task_id_and_user_id():
    assert "task_id" not in SubtaskRead.model_fields
    assert "user_id" not in SubtaskRead.model_fields


# =====================================================================
# Throwaway Core-level test — NOT a schema test.
#
# Proves the Subtask table's is_complete column (Column(Boolean(),
# server_default=false())) actually defaults to False at the database
# layer when omitted from a raw SQLAlchemy Core INSERT, i.e. when no
# Pydantic/SQLModel Python-side default ever runs. Uses its own
# throwaway in-memory SQLite engine (no fixture reuse, no real
# Supabase/Postgres); the engine is disposed at the end of the test.
# =====================================================================


def test_is_complete_server_default_is_false_when_omitted_from_core_insert():
    engine = sa.create_engine("sqlite://")
    try:
        SQLModel.metadata.create_all(engine, tables=[Subtask.__table__])

        task_id = uuid.uuid4()
        user_id = uuid.uuid4()
        subtask_id = uuid.uuid4()

        with engine.begin() as conn:
            conn.execute(
                sa.insert(Subtask.__table__).values(
                    id=subtask_id,
                    task_id=task_id,
                    user_id=user_id,
                    title="Read Chapter 3",
                    created_at=NOW,
                    updated_at=NOW,
                    # is_complete intentionally omitted — server_default=false()
                    # must supply it.
                )
            )

        with engine.connect() as conn:
            row = conn.execute(
                sa.select(Subtask.__table__.c.is_complete).where(
                    Subtask.__table__.c.id == subtask_id
                )
            ).one()

        assert row.is_complete is False
    finally:
        engine.dispose()
