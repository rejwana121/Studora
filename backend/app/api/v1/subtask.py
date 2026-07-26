import uuid

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_session
from app.schemas.subtask import SubtaskCreate, SubtaskRead, SubtaskUpdate
from app.services.subtask import create_subtask, delete_subtask, get_owned_subtask, update_subtask
from app.services.task import get_owned_task

router = APIRouter(prefix="/tasks/{task_id}/subtasks", tags=["subtasks"])


@router.post("", response_model=SubtaskRead, status_code=201)
def create_subtask_route(
    task_id: uuid.UUID,
    data: SubtaskCreate,
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> SubtaskRead:
    get_owned_task(session, current_user.id, task_id)
    subtask = create_subtask(session, current_user.id, task_id, data)
    return SubtaskRead.model_validate(subtask, from_attributes=True)


@router.patch("/{subtask_id}", response_model=SubtaskRead)
def patch_subtask_route(
    task_id: uuid.UUID,
    subtask_id: uuid.UUID,
    changes: SubtaskUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> SubtaskRead:
    get_owned_task(session, current_user.id, task_id)
    subtask = get_owned_subtask(session, current_user.id, task_id, subtask_id)
    subtask = update_subtask(session, subtask, changes)
    return SubtaskRead.model_validate(subtask, from_attributes=True)


@router.delete("/{subtask_id}", status_code=204)
def delete_subtask_route(
    task_id: uuid.UUID,
    subtask_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    get_owned_task(session, current_user.id, task_id)
    subtask = get_owned_subtask(session, current_user.id, task_id, subtask_id)
    delete_subtask(session, subtask)
