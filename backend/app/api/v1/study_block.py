import uuid

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_session
from app.models.study_block import StudyBlock
from app.schemas.study_block import StudyBlockCreate, StudyBlockRead, StudyBlockUpdate
from app.services.study_block import (
    build_task_snapshot_map,
    create_study_block,
    delete_study_block,
    get_owned_study_block,
    serialize_study_block,
    update_study_block,
)
from app.services.task import build_subject_snapshot_map

router = APIRouter(prefix="/study-blocks", tags=["study-blocks"])


def _serialize_with_snapshot(
    session: Session, user_id: uuid.UUID, block: StudyBlock
) -> StudyBlockRead:
    task_map = build_task_snapshot_map(session, user_id, [block.task_id])
    task = task_map.get(block.task_id) if block.task_id is not None else None
    subject_map = build_subject_snapshot_map(session, user_id, [task] if task is not None else [])
    subject = subject_map.get(task.subject_id) if task is not None and task.subject_id else None
    return serialize_study_block(block, task, subject)


@router.post("", response_model=StudyBlockRead, status_code=201)
def create_study_block_route(
    data: StudyBlockCreate,
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> StudyBlockRead:
    block = create_study_block(session, current_user.id, data)
    return _serialize_with_snapshot(session, current_user.id, block)


@router.patch("/{block_id}", response_model=StudyBlockRead)
def patch_study_block(
    block_id: uuid.UUID,
    changes: StudyBlockUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> StudyBlockRead:
    block = get_owned_study_block(session, current_user.id, block_id)
    block = update_study_block(session, current_user.id, block, changes)
    return _serialize_with_snapshot(session, current_user.id, block)


@router.delete("/{block_id}", status_code=204)
def delete_study_block_route(
    block_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    block = get_owned_study_block(session, current_user.id, block_id)
    delete_study_block(session, block)
