import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_session
from app.schemas.task import TaskCreate, TaskListQuery, TaskRead, TaskUpdate
from app.services.subtask import list_subtasks
from app.services.task import (
    build_subject_snapshot_map,
    create_task,
    delete_task,
    get_owned_task,
    list_tasks,
    serialize_task,
    update_task,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=list[TaskRead])
def read_tasks(
    query: Annotated[TaskListQuery, Query()],
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[TaskRead]:
    tasks = list_tasks(session, current_user.id, query)
    snapshots = build_subject_snapshot_map(session, current_user.id, tasks)
    return [serialize_task(t, snapshots.get(t.subject_id)) for t in tasks]


@router.post("", response_model=TaskRead, status_code=201)
def create_task_route(
    data: TaskCreate,
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> TaskRead:
    task = create_task(session, current_user.id, data)
    snapshots = build_subject_snapshot_map(session, current_user.id, [task])
    return serialize_task(task, snapshots.get(task.subject_id))


@router.get("/{task_id}", response_model=TaskRead)
def read_task(
    task_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> TaskRead:
    task = get_owned_task(session, current_user.id, task_id)
    snapshots = build_subject_snapshot_map(session, current_user.id, [task])
    subtasks = list_subtasks(session, current_user.id, task.id)
    return serialize_task(task, snapshots.get(task.subject_id), subtasks)


@router.patch("/{task_id}", response_model=TaskRead)
def patch_task(
    task_id: uuid.UUID,
    changes: TaskUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> TaskRead:
    task = get_owned_task(session, current_user.id, task_id)
    task = update_task(session, current_user.id, task, changes)
    snapshots = build_subject_snapshot_map(session, current_user.id, [task])
    subtasks = list_subtasks(session, current_user.id, task.id)
    return serialize_task(task, snapshots.get(task.subject_id), subtasks)


@router.delete("/{task_id}", status_code=204)
def delete_task_route(
    task_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    task = get_owned_task(session, current_user.id, task_id)
    delete_task(session, task)
