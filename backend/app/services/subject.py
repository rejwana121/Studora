import uuid
from datetime import UTC, datetime

from sqlmodel import Session, select

from app.core.errors import ApiError
from app.models.subject import Subject
from app.schemas.subject import SubjectCreate, SubjectUpdate


def create_subject(session: Session, user_id: uuid.UUID, data: SubjectCreate) -> Subject:
    subject = Subject(user_id=user_id, name=data.name, color_token=data.color_token)
    session.add(subject)
    session.commit()
    session.refresh(subject)
    return subject


def list_subjects(
    session: Session,
    user_id: uuid.UUID,
    include_archived: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> list[Subject]:
    statement = select(Subject).where(Subject.user_id == user_id)
    if not include_archived:
        statement = statement.where(Subject.archived_at.is_(None))
    statement = statement.order_by(Subject.created_at, Subject.id).offset(offset).limit(limit)
    return list(session.exec(statement))


def get_owned_subject(session: Session, user_id: uuid.UUID, subject_id: uuid.UUID) -> Subject:
    """Scopes the lookup to (id, user_id) in one query — a subject that
    exists but belongs to another user is indistinguishable from one that
    doesn't exist at all, so both raise the same 404."""
    subject = session.exec(
        select(Subject).where(Subject.id == subject_id, Subject.user_id == user_id)
    ).first()
    if subject is None:
        raise ApiError(404, "NOT_FOUND", "Subject not found")
    return subject


def update_subject(session: Session, subject: Subject, changes: SubjectUpdate) -> Subject:
    data = changes.model_dump(exclude_unset=True, exclude={"archived"})
    for field, value in data.items():
        setattr(subject, field, value)

    if changes.archived is True and subject.archived_at is None:
        subject.archived_at = datetime.now(UTC)
    elif changes.archived is False:
        subject.archived_at = None

    subject.updated_at = datetime.now(UTC)
    session.add(subject)
    session.commit()
    session.refresh(subject)
    return subject
