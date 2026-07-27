from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_session
from app.schemas.planner import CalendarQuery, CalendarResponse, DayQuery, DayView
from app.services.planner import get_calendar, get_day
from app.services.profile import get_or_create_profile

router = APIRouter(prefix="/planner", tags=["planner"])


@router.get("/calendar", response_model=CalendarResponse)
def read_calendar(
    query: Annotated[CalendarQuery, Query()],
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> CalendarResponse:
    profile = get_or_create_profile(session, current_user.id, current_user.email)
    return get_calendar(session, current_user.id, query, profile.timezone)


@router.get("/day", response_model=DayView)
def read_day(
    query: Annotated[DayQuery, Query()],
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> DayView:
    profile = get_or_create_profile(session, current_user.id, current_user.email)
    return get_day(session, current_user.id, query, profile.timezone)
