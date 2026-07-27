import uuid
from collections.abc import Iterable
from datetime import UTC, datetime

from sqlmodel import Session, select

from app.core.errors import ApiError
from app.models.study_block import StudyBlock
from app.models.subject import Subject
from app.models.task import Task
from app.schemas.study_block import (
    StudyBlockCreate,
    StudyBlockRead,
    StudyBlockTaskSnapshot,
    StudyBlockUpdate,
)
from app.schemas.task import TaskSubjectSnapshot


def _as_utc_instant(value: datetime) -> datetime:
    """Same canonicalization as app.services.task._as_utc_instant — a value
    freshly loaded from the (test) SQLite engine comes back naive even
    though its wall-clock value is already UTC, so a naive value is
    treated as already-UTC rather than reinterpreted in another zone."""
    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _validate_task_ownership(
    session: Session, user_id: uuid.UUID, task_id: uuid.UUID | None
) -> None:
    """A task_id that doesn't exist or belongs to another user is a
    body-validation problem on the StudyBlock request, not a missing-block
    problem — 422, not 404. Same reasoning as Task.subject_id's existing
    _validate_subject_ownership."""
    if task_id is None:
        return
    owned = session.exec(select(Task.id).where(Task.id == task_id, Task.user_id == user_id)).first()
    if owned is None:
        raise ApiError(422, "VALIDATION_ERROR", "task not found", field="task_id")


def create_study_block(session: Session, user_id: uuid.UUID, data: StudyBlockCreate) -> StudyBlock:
    _validate_task_ownership(session, user_id, data.task_id)
    block = StudyBlock(
        user_id=user_id,
        task_id=data.task_id,
        starts_at=data.starts_at,
        ends_at=data.ends_at,
    )
    session.add(block)
    session.commit()
    session.refresh(block)
    return block


def get_owned_study_block(session: Session, user_id: uuid.UUID, block_id: uuid.UUID) -> StudyBlock:
    """Scopes the lookup to (id, user_id) in one query — a block that
    exists but belongs to another user is indistinguishable from one that
    doesn't exist at all, so both raise the same 404."""
    block = session.exec(
        select(StudyBlock).where(StudyBlock.id == block_id, StudyBlock.user_id == user_id)
    ).first()
    if block is None:
        raise ApiError(404, "NOT_FOUND", "Study block not found")
    return block


def update_study_block(
    session: Session, user_id: uuid.UUID, block: StudyBlock, changes: StudyBlockUpdate
) -> StudyBlock:
    """Strictly idempotent for a no-op value resubmission (Checkpoint 4
    design review, approved): every provided field is compared against the
    currently stored value first. If nothing actually differs, the row is
    returned untouched — no write, no `updated_at` bump. If anything
    differs, every provided field is applied and `updated_at` is bumped
    exactly once. The `starts_at`/`ends_at` ordering check always runs
    against the *effective final pair* (stored value for whichever side
    wasn't provided in this PATCH), not just the two provided fields."""
    provided = changes.model_dump(exclude_unset=True)

    if "task_id" in provided:
        _validate_task_ownership(session, user_id, provided["task_id"])

    effective_starts_at = provided.get("starts_at", block.starts_at)
    effective_ends_at = provided.get("ends_at", block.ends_at)
    if _as_utc_instant(effective_ends_at) <= _as_utc_instant(effective_starts_at):
        raise ApiError(422, "VALIDATION_ERROR", "ends_at must be after starts_at", field="ends_at")

    changed = False
    for field, value in provided.items():
        current = getattr(block, field)
        if field in ("starts_at", "ends_at"):
            differs = _as_utc_instant(value) != _as_utc_instant(current)
        else:
            differs = value != current
        if differs:
            setattr(block, field, value)
            changed = True

    if not changed:
        return block

    block.updated_at = datetime.now(UTC)
    session.add(block)
    session.commit()
    session.refresh(block)
    return block


def delete_study_block(session: Session, block: StudyBlock) -> None:
    session.delete(block)
    session.commit()


def build_task_snapshot_map(
    session: Session, user_id: uuid.UUID, task_ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, Task]:
    ids = {t for t in task_ids if t is not None}
    if not ids:
        return {}
    tasks = session.exec(select(Task).where(Task.user_id == user_id, Task.id.in_(ids))).all()
    return {t.id: t for t in tasks}


def serialize_study_block(
    block: StudyBlock, task: Task | None, subject: Subject | None
) -> StudyBlockRead:
    """Every datetime placed into the response is passed through
    `_as_utc_instant` first — a value freshly loaded from the (test)
    SQLite engine comes back naive, and a naive datetime serializes to
    JSON without a UTC offset, which a mobile client could misread as
    local time. This is a response-correctness requirement, not just a
    test artifact: the API contract must always return timezone-aware
    instants regardless of which database dialect served the read."""
    task_snapshot = None
    if task is not None:
        subject_snapshot = None
        if subject is not None:
            subject_snapshot = TaskSubjectSnapshot(
                id=subject.id,
                name=subject.name,
                color_token=subject.color_token,
                archived=subject.archived_at is not None,
            )
        task_snapshot = StudyBlockTaskSnapshot(
            id=task.id,
            title=task.title,
            type=task.type,
            deadline=_as_utc_instant(task.deadline),
            priority=task.priority,
            status=task.status,
            subject=subject_snapshot,
        )
    return StudyBlockRead(
        id=block.id,
        task_id=block.task_id,
        task=task_snapshot,
        starts_at=_as_utc_instant(block.starts_at),
        ends_at=_as_utc_instant(block.ends_at),
        created_at=_as_utc_instant(block.created_at),
        updated_at=_as_utc_instant(block.updated_at),
    )
