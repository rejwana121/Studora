import logging
import uuid
from typing import Any

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.core.config import settings
from app.core.errors import ApiError

_logger = logging.getLogger(__name__)

_bearer_scheme = HTTPBearer(auto_error=False)

# Supabase's project-level JWKS cache. A module-level singleton so a fetch
# happens at most once per `lifespan` window, not on every authenticated
# request; PyJWKClient itself refetches automatically when it sees a `kid`
# it doesn't recognize (key rotation), per its own internal cache logic.
_jwks_client: jwt.PyJWKClient | None = None


def _get_jwks_client() -> jwt.PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        jwks_url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
        _jwks_client = jwt.PyJWKClient(jwks_url, cache_keys=True, lifespan=600)
    return _jwks_client


def reset_jwks_client() -> None:
    """Test-only hook: force the next verification to rebuild the JWKS client/cache."""
    global _jwks_client
    _jwks_client = None


class CurrentUser(BaseModel):
    id: uuid.UUID
    email: str | None = None


def _unauthorized(message: str) -> ApiError:
    return ApiError(status_code=401, code="UNAUTHENTICATED", message=message)


def _decode_es256(token: str, issuer: str) -> dict[str, Any]:
    """Active Supabase signing key. Public key comes only from the project's
    own JWKS, selected by the token's `kid` — never from a client-supplied
    value, and never reused as an HMAC secret (that would allow the classic
    RS/ES-to-HS algorithm-confusion forgery)."""
    signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=["ES256"],
        audience=settings.supabase_jwt_audience,
        issuer=issuer,
    )


def _decode_legacy_hs256(token: str, issuer: str) -> dict[str, Any]:
    """Optional fallback for tokens issued before this project rotated to
    ES256, only reachable when an operator has explicitly configured the
    legacy secret — never required, never guessed, never logged."""
    return jwt.decode(
        token,
        settings.supabase_legacy_jwt_secret,
        algorithms=["HS256"],
        audience=settings.supabase_jwt_audience,
        issuer=issuer,
    )


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
    if not settings.supabase_url:
        raise _unauthorized("Server auth is not configured")

    token = credentials.credentials
    issuer = f"{settings.supabase_url.rstrip('/')}/auth/v1"

    try:
        header = jwt.get_unverified_header(token)
    except jwt.exceptions.DecodeError as exc:
        raise _unauthorized("Malformed token") from exc

    # The token's own `alg` header only ever selects *which* fixed,
    # pre-approved verification path runs — each path below still passes an
    # explicit, hardcoded `algorithms=[...]` allowlist into jwt.decode(),
    # which independently rejects any mismatch. This is what prevents
    # algorithm-confusion: nothing here lets the token pick its own trust.
    alg = header.get("alg")

    try:
        if alg == "ES256":
            payload = _decode_es256(token, issuer)
        elif alg == "HS256" and settings.supabase_legacy_jwt_secret:
            payload = _decode_legacy_hs256(token, issuer)
        else:
            raise _unauthorized("Unsupported token algorithm")
    except jwt.exceptions.ExpiredSignatureError as exc:
        raise _unauthorized("Session expired") from exc
    except jwt.exceptions.PyJWKClientError as exc:
        raise _unauthorized("Unknown signing key") from exc
    except jwt.exceptions.PyJWTError as exc:
        _logger.warning("token validation failed: %s", type(exc).__name__)
        raise _unauthorized("Invalid token") from exc

    sub = payload.get("sub")
    if not sub:
        raise _unauthorized("Token missing subject claim")

    try:
        user_id = uuid.UUID(str(sub))
    except ValueError as exc:
        raise _unauthorized("Token subject is not a valid user id") from exc

    return CurrentUser(id=user_id, email=payload.get("email"))
