import base64
import json
import time
import uuid

import jwt as pyjwt
from cryptography.hazmat.primitives.asymmetric import ec

from app.core.config import settings

from .conftest import TEST_ISSUER, TEST_KID, make_legacy_token, make_token


def _get(client, token: str):
    return client.get("/api/v1/profile", headers={"Authorization": f"Bearer {token}"})


def _unverified_alg_token(alg: str) -> str:
    """A token whose header claims an unapproved `alg`, with no real
    signature — enough to exercise the pre-decode algorithm allowlist,
    since that check must reject it before any signature verification."""

    def b64(obj: dict) -> str:
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b"=").decode("ascii")

    header = b64({"alg": alg, "typ": "JWT", "kid": TEST_KID})
    payload = b64(
        {"sub": str(uuid.uuid4()), "aud": settings.supabase_jwt_audience, "iss": TEST_ISSUER}
    )
    return f"{header}.{payload}.fake-signature"


def test_valid_es256_token_accepted(client):
    response = _get(client, make_token())
    assert response.status_code == 200


def test_wrong_issuer_rejected(client):
    response = _get(client, make_token(iss="https://someone-elses-project.supabase.co/auth/v1"))
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_wrong_audience_rejected(client):
    response = _get(client, make_token(aud="not-authenticated"))
    assert response.status_code == 401


def test_expired_token_rejected(client):
    now = int(time.time())
    response = _get(client, make_token(iat=now - 7200, exp=now - 10))
    assert response.status_code == 401


def test_unknown_kid_rejected(client):
    other_key = ec.generate_private_key(ec.SECP256R1())
    now = int(time.time())

    token = pyjwt.encode(
        {
            "sub": str(uuid.uuid4()),
            "aud": settings.supabase_jwt_audience,
            "iss": TEST_ISSUER,
            "iat": now,
            "exp": now + 3600,
        },
        other_key,
        algorithm="ES256",
        headers={"kid": "some-unknown-kid"},
    )
    response = _get(client, token)
    assert response.status_code == 401


def test_invalid_signature_rejected(client):
    wrong_key = ec.generate_private_key(ec.SECP256R1())
    now = int(time.time())

    # Correct kid (so JWKS lookup succeeds), but signed with a different
    # private key than the one behind that kid — signature must fail.
    token = pyjwt.encode(
        {
            "sub": str(uuid.uuid4()),
            "aud": settings.supabase_jwt_audience,
            "iss": TEST_ISSUER,
            "iat": now,
            "exp": now + 3600,
        },
        wrong_key,
        algorithm="ES256",
        headers={"kid": TEST_KID},
    )
    response = _get(client, token)
    assert response.status_code == 401


def test_unsupported_algorithm_rejected(client):
    response = _get(client, _unverified_alg_token("RS256"))
    assert response.status_code == 401


def test_none_algorithm_rejected(client):
    response = _get(client, _unverified_alg_token("none"))
    assert response.status_code == 401


def test_malformed_subject_rejected(client):
    response = _get(client, make_token(sub="not-a-uuid"))
    assert response.status_code == 401


def test_legacy_hs256_accepted_when_secret_configured(client):
    response = _get(client, make_legacy_token())
    assert response.status_code == 200


def test_legacy_hs256_rejected_when_no_secret_configured(client):
    settings.supabase_legacy_jwt_secret = ""
    response = _get(client, make_legacy_token())
    assert response.status_code == 401


def test_missing_token_rejected(client):
    response = client.get("/api/v1/profile")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"
