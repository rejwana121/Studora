import uuid
from datetime import UTC, datetime

from sqlmodel import Session

from app.models.profile import Profile
from app.schemas.profile import ProfileUpdate


def get_or_create_profile(
    session: Session, user_id: uuid.UUID, email: str | None = None
) -> Profile:
    """First authenticated call for a user provisions their profile row.

    Replaces a Supabase DB trigger (not available without dashboard/console
    access from this environment) with an idempotent server-side upsert —
    every subsequent call is a plain read.
    """
    profile = session.get(Profile, user_id)
    if profile is not None:
        return profile

    display_name = email.split("@")[0] if email else None
    profile = Profile(id=user_id, display_name=display_name)
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return profile


def update_profile(session: Session, profile: Profile, changes: ProfileUpdate) -> Profile:
    data = changes.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(profile, field, value)
    profile.updated_at = datetime.now(UTC)
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return profile
