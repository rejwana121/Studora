from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_session
from app.schemas.profile import ProfileRead, ProfileUpdate
from app.services.profile import get_or_create_profile, update_profile

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=ProfileRead)
def read_profile(
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ProfileRead:
    profile = get_or_create_profile(session, current_user.id, current_user.email)
    return ProfileRead.model_validate(profile, from_attributes=True)


@router.patch("", response_model=ProfileRead)
def patch_profile(
    changes: ProfileUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ProfileRead:
    profile = get_or_create_profile(session, current_user.id, current_user.email)
    profile = update_profile(session, profile, changes)
    return ProfileRead.model_validate(profile, from_attributes=True)
