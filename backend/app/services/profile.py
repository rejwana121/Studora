import uuid
from datetime import UTC, datetime

from sqlmodel import Session

from app.core.errors import ApiError
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

    # Identity comes only from `profile.id`, itself derived server-side from
    # the verified JWT (see get_or_create_profile) — the client never
    # supplies a user id. `avatar_path` already passed shape validation in
    # ProfileUpdate; this is the sole ownership check, run here because this
    # is the only place the authenticated user's own id is available.
    if "avatar_path" in data and data["avatar_path"] is not None:
        expected_path = f"{profile.id}/avatar"
        if data["avatar_path"] != expected_path:
            raise ApiError(
                422,
                "VALIDATION_ERROR",
                "avatar_path must be the authenticated user's own avatar path",
                field="avatar_path",
            )

    for field, value in data.items():
        setattr(profile, field, value)
    profile.updated_at = datetime.now(UTC)
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return profile
