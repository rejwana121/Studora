import uuid
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from jose import jwt
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings
from app.db.session import get_session
from app.main import app

TEST_JWT_SECRET = "test-jwt-secret-do-not-use-in-production"


@pytest.fixture(autouse=True)
def _configure_test_settings() -> None:
    settings.supabase_jwt_secret = TEST_JWT_SECRET


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


def make_token(user_id: uuid.UUID | None = None, email: str | None = "student@example.com") -> str:
    payload = {
        "sub": str(user_id or uuid.uuid4()),
        "email": email,
        "aud": settings.supabase_jwt_audience,
    }
    return jwt.encode(payload, TEST_JWT_SECRET, algorithm=settings.supabase_jwt_algorithm)


def auth_headers(
    user_id: uuid.UUID | None = None, email: str | None = "student@example.com"
) -> dict:
    return {"Authorization": f"Bearer {make_token(user_id, email)}"}
