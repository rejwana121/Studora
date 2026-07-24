import base64
import time
import uuid
from collections.abc import Generator

import jwt as pyjwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.core import security
from app.core.config import settings
from app.db.session import get_session
from app.main import app

TEST_SUPABASE_URL = "https://test-project.supabase.co"
TEST_ISSUER = f"{TEST_SUPABASE_URL}/auth/v1"
TEST_KID = "test-kid-1"
TEST_LEGACY_SECRET = "test-legacy-hs256-secret-do-not-use-in-production"

# One ES256 key pair for the whole test session — stands in for Supabase's
# active project signing key. The matching public key is served (mocked,
# never over the network) from the JWKS endpoint below.
_TEST_PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())


def _b64url_uint(n: int) -> str:
    return base64.urlsafe_b64encode(n.to_bytes(32, "big")).rstrip(b"=").decode("ascii")


def _jwks_payload() -> dict:
    numbers = _TEST_PRIVATE_KEY.public_key().public_numbers()
    return {
        "keys": [
            {
                "kty": "EC",
                "crv": "P-256",
                "x": _b64url_uint(numbers.x),
                "y": _b64url_uint(numbers.y),
                "kid": TEST_KID,
                "alg": "ES256",
                "use": "sig",
            }
        ]
    }


@pytest.fixture(autouse=True)
def _configure_test_settings(monkeypatch: pytest.MonkeyPatch) -> Generator[None, None, None]:
    settings.supabase_url = TEST_SUPABASE_URL
    settings.supabase_legacy_jwt_secret = TEST_LEGACY_SECRET
    security.reset_jwks_client()
    # Replaces the JWKS client's HTTP fetch with the in-memory payload above —
    # no test in this suite touches the network.
    monkeypatch.setattr(security.jwt.PyJWKClient, "fetch_data", lambda self: _jwks_payload())
    yield
    security.reset_jwks_client()


@pytest.fixture()
def engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    yield engine
    SQLModel.metadata.drop_all(engine)


@pytest.fixture()
def client(engine) -> Generator[TestClient, None, None]:
    def override_get_session() -> Generator[Session, None, None]:
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    yield TestClient(app)
    app.dependency_overrides.clear()


def make_token(
    user_id: uuid.UUID | None = None,
    email: str | None = "student@example.com",
    **claim_overrides,
) -> str:
    """Mint an ES256 token signed with the test project key, matching
    TEST_KID — the "current active Supabase signing key" shape."""
    now = int(time.time())
    payload = {
        "sub": str(user_id or uuid.uuid4()),
        "email": email,
        "aud": settings.supabase_jwt_audience,
        "iss": TEST_ISSUER,
        "iat": now,
        "exp": now + 3600,
    }
    payload.update(claim_overrides)
    return pyjwt.encode(payload, _TEST_PRIVATE_KEY, algorithm="ES256", headers={"kid": TEST_KID})


def make_legacy_token(
    user_id: uuid.UUID | None = None,
    email: str | None = "student@example.com",
    **claim_overrides,
) -> str:
    """Mint an HS256 token signed with the legacy secret — pre-rotation shape."""
    now = int(time.time())
    payload = {
        "sub": str(user_id or uuid.uuid4()),
        "email": email,
        "aud": settings.supabase_jwt_audience,
        "iss": TEST_ISSUER,
        "iat": now,
        "exp": now + 3600,
    }
    payload.update(claim_overrides)
    return pyjwt.encode(payload, TEST_LEGACY_SECRET, algorithm="HS256")


def auth_headers(
    user_id: uuid.UUID | None = None, email: str | None = "student@example.com"
) -> dict:
    return {"Authorization": f"Bearer {make_token(user_id, email)}"}
