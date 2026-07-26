import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_session
from app.models.task import Task
from app.schemas.task import TaskCreate, TaskListQuery, TaskRead, TaskTodayView, TaskUpdate
from app.services.subtask import build_subtask_map, list_subtasks
from app.services.task import (
    build_subject_snapshot_map,
    create_task,
    delete_task,
    get_owned_task,
    get_today_view,
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


@router.get("/today", response_model=TaskTodayView)
def read_tasks_today(
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> TaskTodayView:
    groups = get_today_view(session, current_user.id)

    unique_tasks = list({t.id: t for group in groups.values() for t in group}.values())
    snapshots = build_subject_snapshot_map(session, current_user.id, unique_tasks)
    subtask_map = build_subtask_map(session, current_user.id, [t.id for t in unique_tasks])

    serialized_by_id: dict[uuid.UUID, TaskRead] = {
        task.id: serialize_task(task, snapshots.get(task.subject_id), subtask_map.get(task.id, []))
        for task in unique_tasks
    }

    def _lookup(tasks: list[Task]) -> list[TaskRead]:
        return [serialized_by_id[t.id] for t in tasks]

    return TaskTodayView(
        overdue=_lookup(groups["overdue"]),
        due_soon=_lookup(groups["due_soon"]),
        pending=_lookup(groups["pending"]),
        high_priority=_lookup(groups["high_priority"]),
    )


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
