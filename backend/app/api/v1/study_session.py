import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_session
from app.models.study_session import StudySession
from app.schemas.study_session import (
    SessionAction,
    StudySessionCreate,
    StudySessionListQuery,
    StudySessionRead,
)
from app.services.study_block import build_task_snapshot_map
from app.services.study_session import (
    finish_session,
    list_sessions,
    pause_session,
    resume_session,
    serialize_study_session,
    start_session,
)
from app.services.task import build_subject_snapshot_map

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _serialize_with_snapshot(
    session: Session, user_id: uuid.UUID, session_row: StudySession
) -> StudySessionRead:
    task_map = build_task_snapshot_map(session, user_id, [session_row.task_id])
    task = task_map.get(session_row.task_id) if session_row.task_id is not None else None
    subject_map = build_subject_snapshot_map(session, user_id, [task] if task is not None else [])
    subject = subject_map.get(task.subject_id) if task is not None and task.subject_id else None
    return serialize_study_session(session_row, task, subject)


@router.post("/start", response_model=StudySessionRead, status_code=201)
def start_session_route(
    data: StudySessionCreate | None = None,
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> StudySessionRead:
    data = data if data is not None else StudySessionCreate()
    session_row = start_session(session, current_user.id, data)
    return _serialize_with_snapshot(session, current_user.id, session_row)


@router.patch("/{session_id}/pause", response_model=StudySessionRead)
def pause_session_route(
    session_id: uuid.UUID,
    action: SessionAction | None = None,
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> StudySessionRead:
    session_row = pause_session(session, current_user.id, session_id)
    return _serialize_with_snapshot(session, current_user.id, session_row)


@router.patch("/{session_id}/resume", response_model=StudySessionRead)
def resume_session_route(
    session_id: uuid.UUID,
    action: SessionAction | None = None,
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> StudySessionRead:
    session_row = resume_session(session, current_user.id, session_id)
    return _serialize_with_snapshot(session, current_user.id, session_row)


@router.patch("/{session_id}/finish", response_model=StudySessionRead)
def finish_session_route(
    session_id: uuid.UUID,
    action: SessionAction | None = None,
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> StudySessionRead:
    session_row = finish_session(session, current_user.id, session_id)
    return _serialize_with_snapshot(session, current_user.id, session_row)


@router.get("", response_model=list[StudySessionRead])
def read_sessions(
    query: Annotated[StudySessionListQuery, Query()],
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[StudySessionRead]:
    rows = list_sessions(session, current_user.id, query)
    task_map = build_task_snapshot_map(session, current_user.id, [r.task_id for r in rows])
    subject_map = build_subject_snapshot_map(session, current_user.id, list(task_map.values()))

    def _task_and_subject(row: StudySession):
        task = task_map.get(row.task_id) if row.task_id is not None else None
        subject = subject_map.get(task.subject_id) if task is not None and task.subject_id else None
        return task, subject

    return [serialize_study_session(r, *_task_and_subject(r)) for r in rows]
