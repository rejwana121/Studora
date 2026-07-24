import uuid

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import ExpiredSignatureError, JWTError, jwt
from pydantic import BaseModel

from app.core.config import settings
from app.core.errors import ApiError

_bearer_scheme = HTTPBearer(auto_error=False)


class CurrentUser(BaseModel):
    id: uuid.UUID
    email: str | None = None


def _unauthorized(message: str) -> ApiError:
    return ApiError(status_code=401, code="UNAUTHENTICATED", message=message)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> CurrentUser:
    """Verify a Supabase-issued JWT and derive the caller's identity server-side.

    The client never supplies user_id as an authorization input (PRD §13) —
    every downstream query must filter by this dependency's `id`, never a
    client-provided field.
    """
    if credentials is None:
        raise _unauthorized("Missing bearer token")

    if not settings.supabase_jwt_secret:
        raise _unauthorized("Server auth is not configured")

    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.supabase_jwt_secret,
            algorithms=[settings.supabase_jwt_algorithm],
            audience=settings.supabase_jwt_audience,
        )
    except ExpiredSignatureError as exc:
        raise _unauthorized("Session expired") from exc
    except JWTError as exc:
        raise _unauthorized("Invalid token") from exc

    sub = payload.get("sub")
    if not sub:
        raise _unauthorized("Token missing subject claim")

    try:
        user_id = uuid.UUID(str(sub))
    except ValueError as exc:
        raise _unauthorized("Token subject is not a valid user id") from exc

    return CurrentUser(id=user_id, email=payload.get("email"))
