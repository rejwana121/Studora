import uuid

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_session
from app.schemas.subject import SubjectCreate, SubjectRead, SubjectUpdate
from app.services.subject import create_subject, get_owned_subject, list_subjects, update_subject

router = APIRouter(prefix="/subjects", tags=["subjects"])


@router.get("", response_model=list[SubjectRead])
def read_subjects(
    include_archived: bool = False,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[SubjectRead]:
    subjects = list_subjects(session, current_user.id, include_archived, limit, offset)
    return [SubjectRead.model_validate(s, from_attributes=True) for s in subjects]


@router.post("", response_model=SubjectRead, status_code=201)
def create_subject_route(
    data: SubjectCreate,
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> SubjectRead:
    subject = create_subject(session, current_user.id, data)
    return SubjectRead.model_validate(subject, from_attributes=True)


@router.patch("/{subject_id}", response_model=SubjectRead)
def patch_subject(
    subject_id: uuid.UUID,
    changes: SubjectUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> SubjectRead:
    subject = get_owned_subject(session, current_user.id, subject_id)
    subject = update_subject(session, subject, changes)
    return SubjectRead.model_validate(subject, from_attributes=True)
