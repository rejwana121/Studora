import uuid
from datetime import UTC, datetime

from sqlalchemy import case
from sqlmodel import Session, select

from app.core.errors import ApiError
from app.models.subject import Subject
from app.models.task import Task
from app.schemas.task import TaskCreate, TaskListQuery, TaskRead, TaskSubjectSnapshot, TaskUpdate

_PRIORITY_RANK = case(
    (Task.priority == "Low", 0),
    (Task.priority == "Medium", 1),
    (Task.priority == "High", 2),
    else_=1,
)

# Fixed SQLAlchemy expression tuples only — `query.sort` is constrained to
# this dict's keys by TaskListQuery's Literal type before it ever reaches
# this lookup, so there is no path from user input to raw column-name/SQL
# construction.
_SORT_EXPRESSIONS: dict[str, tuple] = {
    "deadline_asc": (Task.deadline.asc(), _PRIORITY_RANK.desc(), Task.created_at.asc()),
    "deadline_desc": (Task.deadline.desc(), _PRIORITY_RANK.desc(), Task.created_at.asc()),
    "priority_asc": (_PRIORITY_RANK.asc(), Task.deadline.asc(), Task.created_at.asc()),
    "priority_desc": (_PRIORITY_RANK.desc(), Task.deadline.asc(), Task.created_at.asc()),
    "created_at_asc": (Task.created_at.asc(), Task.deadline.asc(), _PRIORITY_RANK.desc()),
    "created_at_desc": (Task.created_at.desc(), Task.deadline.asc(), _PRIORITY_RANK.desc()),
}


def _as_utc_instant(value: datetime) -> datetime:
    """Canonicalizes a datetime for instant-equality comparison across
    dialects. Every deadline accepted by the schema layer is already
    tz-aware UTC by the time it reaches this service — but SQLite's
    DateTime(timezone=True) type doesn't reify timezone on read, so a
    value freshly loaded from the (test) SQLite engine comes back naive
    even though its wall-clock value is still UTC (the only zone this
    app ever writes). A naive value is therefore treated as already-UTC,
    never reinterpreted in another zone; an aware value is normalized to
    UTC in case it arrives in another offset representing the same instant.
    """
    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _validate_subject_ownership(
    session: Session, user_id: uuid.UUID, subject_id: uuid.UUID | None
) -> None:
    """A subject_id that doesn't exist or belongs to another user is a
    body-validation problem on the Task request, not a missing-Task
    problem — 422, not 404. Archived subjects are still valid link
    targets (see TaskSubjectSnapshot.archived)."""
    if subject_id is None:
        return
    owned = session.exec(
        select(Subject.id).where(Subject.id == subject_id, Subject.user_id == user_id)
    ).first()
    if owned is None:
        raise ApiError(422, "VALIDATION_ERROR", "subject not found", field="subject_id")


def create_task(session: Session, user_id: uuid.UUID, data: TaskCreate) -> Task:
    _validate_subject_ownership(session, user_id, data.subject_id)
    task = Task(
        user_id=user_id,
        subject_id=data.subject_id,
        title=data.title,
        type=data.type,
        deadline=data.deadline,
        priority=data.priority,
        estimate_hours=data.estimate_hours,
        notes=data.notes,
    )
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


def list_tasks(session: Session, user_id: uuid.UUID, query: TaskListQuery) -> list[Task]:
    statement = select(Task).where(Task.user_id == user_id)
    if query.status is not None:
        statement = statement.where(Task.status == query.status)
    if query.subject_id is not None:
        statement = statement.where(Task.subject_id == query.subject_id)
    if query.type is not None:
        statement = statement.where(Task.type == query.type)
    if query.due_before is not None:
        statement = statement.where(Task.deadline <= query.due_before)
    if query.due_after is not None:
        statement = statement.where(Task.deadline >= query.due_after)
    if query.search:
        statement = statement.where(Task.title.ilike(f"%{query.search}%"))
    statement = (
        statement.order_by(*_SORT_EXPRESSIONS[query.sort], Task.id)
        .offset(query.offset)
        .limit(query.limit)
    )
    return list(session.exec(statement))


def get_owned_task(session: Session, user_id: uuid.UUID, task_id: uuid.UUID) -> Task:
    """Scopes the lookup to (id, user_id) in one query — a task that
    exists but belongs to another user is indistinguishable from one
    that doesn't exist at all, so both raise the same 404."""
    task = session.exec(select(Task).where(Task.id == task_id, Task.user_id == user_id)).first()
    if task is None:
        raise ApiError(404, "NOT_FOUND", "Task not found")
    return task


def update_task(session: Session, user_id: uuid.UUID, task: Task, changes: TaskUpdate) -> Task:
    provided = changes.model_dump(exclude_unset=True)

    if "subject_id" in provided:
        _validate_subject_ownership(session, user_id, provided["subject_id"])

    if "deadline" in provided and _as_utc_instant(provided["deadline"]) != _as_utc_instant(
        task.deadline
    ):
        task.reschedule_count += 1

    new_status = provided.pop("status", None)
    for field, value in provided.items():
        setattr(task, field, value)

    if new_status is not None and new_status != task.status:
        if new_status == "Completed":
            task.completed_at = datetime.now(UTC)
        elif task.status == "Completed":
            task.completed_at = None
        task.status = new_status

    task.updated_at = datetime.now(UTC)
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


def delete_task(session: Session, task: Task) -> None:
    session.delete(task)
    session.commit()


def build_subject_snapshot_map(
    session: Session, user_id: uuid.UUID, tasks: list[Task]
) -> dict[uuid.UUID, Subject]:
    subject_ids = {t.subject_id for t in tasks if t.subject_id is not None}
    if not subject_ids:
        return {}
    subjects = session.exec(
        select(Subject).where(Subject.user_id == user_id, Subject.id.in_(subject_ids))
    ).all()
    return {s.id: s for s in subjects}


def serialize_task(task: Task, subject: Subject | None) -> TaskRead:
    snapshot = None
    if subject is not None:
        snapshot = TaskSubjectSnapshot(
            id=subject.id,
            name=subject.name,
            color_token=subject.color_token,
            archived=subject.archived_at is not None,
        )
    return TaskRead(
        id=task.id,
        subject_id=task.subject_id,
        subject=snapshot,
        title=task.title,
        type=task.type,
        deadline=task.deadline,
        priority=task.priority,
        estimate_hours=task.estimate_hours,
        status=task.status,
        notes=task.notes,
        completed_at=task.completed_at,
        reschedule_count=task.reschedule_count,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )
