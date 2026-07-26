import uuid
from datetime import UTC, datetime

from sqlmodel import Session, select

from app.core.errors import ApiError
from app.models.subtask import Subtask
from app.schemas.subtask import SubtaskCreate, SubtaskUpdate


def create_subtask(
    session: Session, user_id: uuid.UUID, task_id: uuid.UUID, data: SubtaskCreate
) -> Subtask:
    subtask = Subtask(task_id=task_id, user_id=user_id, title=data.title)
    session.add(subtask)
    session.commit()
    session.refresh(subtask)
    return subtask


def list_subtasks(session: Session, user_id: uuid.UUID, task_id: uuid.UUID) -> list[Subtask]:
    """Ordered by (created_at, id) for deterministic detail-response order —
    same tiebreak reasoning as Subject/Task list ordering elsewhere. Filters
    on both task_id and user_id even though task_id alone (already scoped to
    an owned task by the caller) would suffice — belt-and-suspenders using
    the denormalized user_id column, per its own stated reason for existing
    (data dictionary §9.4)."""
    statement = (
        select(Subtask)
        .where(Subtask.task_id == task_id, Subtask.user_id == user_id)
        .order_by(Subtask.created_at, Subtask.id)
    )
    return list(session.exec(statement))


def build_subtask_map(
    session: Session, user_id: uuid.UUID, task_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[Subtask]]:
    """Bulk loader for GET /tasks/today — one query for however many tasks
    are being serialized, instead of one list_subtasks call per task.
    Mirrors app.services.task.build_subject_snapshot_map's short-circuit
    (no query at all when there are no ids to look up)."""
    if not task_ids:
        return {}
    statement = (
        select(Subtask)
        .where(Subtask.user_id == user_id, Subtask.task_id.in_(task_ids))
        .order_by(Subtask.created_at, Subtask.id)
    )
    by_task: dict[uuid.UUID, list[Subtask]] = {}
    for subtask in session.exec(statement):
        by_task.setdefault(subtask.task_id, []).append(subtask)
    return by_task


def get_owned_subtask(
    session: Session, user_id: uuid.UUID, task_id: uuid.UUID, subtask_id: uuid.UUID
) -> Subtask:
    """Scopes the lookup to (id, task_id, user_id) in one query — a subtask
    that exists but belongs to another user, or exists under a different
    task, is indistinguishable from one that doesn't exist at all, so all
    three cases raise the same 404."""
    subtask = session.exec(
        select(Subtask).where(
            Subtask.id == subtask_id,
            Subtask.task_id == task_id,
            Subtask.user_id == user_id,
        )
    ).first()
    if subtask is None:
        raise ApiError(404, "NOT_FOUND", "Subtask not found")
    return subtask


def update_subtask(session: Session, subtask: Subtask, changes: SubtaskUpdate) -> Subtask:
    data = changes.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(subtask, field, value)
    subtask.updated_at = datetime.now(UTC)
    session.add(subtask)
    session.commit()
    session.refresh(subtask)
    return subtask


def delete_subtask(session: Session, subtask: Subtask) -> None:
    session.delete(subtask)
    session.commit()
