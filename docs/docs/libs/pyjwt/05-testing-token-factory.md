---
date: 2026-10-24 12:00:00
tags:
  - python
  - libraries
  - pyjwt
  - jwt
  - security
  - testing
---

# PyJWT — Testing: Token Factory & Negative Matrix

Test the service from [04](./04-integration-fastapi.md) with [Pytest](../pytest/index.md) and the Starlette `TestClient` (the [HTTPX](../httpx/index.md) client underneath): a token factory, a matrix of rejected tokens, 401 vs 403 checks, refresh rotation, and time control. JWKS rotation, deployed-API smoke tests and CI gates are in [06](./06-testing-jwks-ci.md).

## Test Setup and Token Factory

The factory builds tokens with PyJWT directly, independent of `TokenService`, so a bug in the service cannot hide itself. A claim set to `None` is removed, which makes "missing claim" cases one-liners.

```ini
# pytest.ini
[pytest]
filterwarnings =
    error::jwt.warnings.InsecureKeyLengthWarning
```

```python
# tests/conftest.py
import base64
import hashlib
import hmac
import json
import uuid
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from cryptography.hazmat.primitives import serialization as ser
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app.auth import AuthConfig, TokenService
from app.main import create_app

ISSUER, AUDIENCE = "https://auth.example.test", "orders-api"


def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def timestamp(value: datetime) -> int:
    return int(value.timestamp())


class KeyPair:
    def __init__(self) -> None:
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.private_pem = key.private_bytes(
            ser.Encoding.PEM, ser.PrivateFormat.PKCS8, ser.NoEncryption()
        )
        self.public_pem = key.public_key().public_bytes(
            ser.Encoding.PEM, ser.PublicFormat.SubjectPublicKeyInfo
        )


@pytest.fixture(scope="session")
def keys() -> KeyPair:
    return KeyPair()


@pytest.fixture(scope="session")
def other_keys() -> KeyPair:
    return KeyPair()


def default_claims(**overrides) -> dict:
    """Valid access-token claims; `claim=None` removes a claim."""
    now = datetime.now(timezone.utc)
    claims = {
        "iss": ISSUER, "aud": AUDIENCE, "sub": "user-1", "scope": "orders:read",
        "iat": now, "nbf": now, "exp": now + timedelta(minutes=5),
        "jti": uuid.uuid4().hex, "token_use": "access", **overrides,
    }
    return {k: v for k, v in claims.items() if v is not None}


class TokenFactory:
    def __init__(self, keys: KeyPair, other: KeyPair) -> None:
        self.keys, self.other = keys, other

    def __call__(self, *, key=None, alg="RS256", headers=None, **overrides) -> str:
        return jwt.encode(
            default_claims(**overrides), key or self.keys.private_pem,
            algorithm=alg, headers=headers,
        )

    def wrong_key(self, **overrides) -> str:
        return self(key=self.other.private_pem, **overrides)

    def unsigned(self, **overrides) -> str:
        return jwt.encode(default_claims(**overrides), None, algorithm="none")

    def tampered(self, **new_claims) -> str:
        """Valid header and signature, payload swapped for different claims."""
        header, _, signature = self().split(".")
        payload = b64(json.dumps(default_claims(**new_claims), default=timestamp).encode())
        return f"{header}.{payload}.{signature}"

    def hs256_with_public_key(self) -> str:
        """Hand-built HS256 token signed with the RSA public key (PyJWT refuses to create it)."""
        header = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
        body = b64(json.dumps(default_claims(), default=timestamp).encode())
        mac = hmac.new(self.keys.public_pem, f"{header}.{body}".encode(), hashlib.sha256)
        return f"{header}.{body}.{b64(mac.digest())}"


@pytest.fixture
def make_token(keys, other_keys) -> TokenFactory:
    return TokenFactory(keys, other_keys)


@pytest.fixture
def service(keys) -> TokenService:
    config = AuthConfig(issuer=ISSUER, audience=AUDIENCE)
    return TokenService(config, verify_key=keys.public_pem, private_key=keys.private_pem)


@pytest.fixture
def client(service) -> TestClient:
    return TestClient(create_app(service))


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
```

`default_claims` stamps `iat`, `nbf` and `exp` from the real clock (valid for five minutes), so tests stay independent of the current date. Session-scoped RSA keys keep the suite fast; use a throwaway pair per test session, never a key from a real environment.

## Negative-Test Matrix

One table of builders, one parametrised test. Each row is a token the API must refuse; every refusal must look identical to the caller.

```python
# tests/test_api_auth.py
from datetime import datetime, timedelta, timezone

import pytest

from tests.conftest import bearer


def ago(**kw):
    return datetime.now(timezone.utc) - timedelta(**kw)


def ahead(**kw):
    return datetime.now(timezone.utc) + timedelta(**kw)


REJECTED = {
    "expired": lambda mk: mk(exp=ago(minutes=1)),
    "not-yet-valid": lambda mk: mk(nbf=ahead(minutes=5)),
    "future-iat": lambda mk: mk(iat=ahead(minutes=5)),
    "wrong-audience": lambda mk: mk(aud="other-api"),
    "wrong-issuer": lambda mk: mk(iss="https://evil.example"),
    "issuer-prefix": lambda mk: mk(iss="https://auth.example.test.evil"),
    "missing-exp": lambda mk: mk(exp=None),
    "missing-jti": lambda mk: mk(jti=None),
    "missing-aud": lambda mk: mk(aud=None),
    "sub-not-a-string": lambda mk: mk(sub=42),
    "refresh-used-as-access": lambda mk: mk(token_use="refresh"),
    "wrong-signature": lambda mk: mk.wrong_key(),
    "tampered-payload": lambda mk: mk.tampered(sub="admin", scope="orders:read orders:write"),
    "alg-none": lambda mk: mk.unsigned(),
    "hs256-signed-with-public-key": lambda mk: mk.hs256_with_public_key(),
    "not-a-jwt": lambda mk: "abc.def.ghi",
    "empty": lambda mk: "",
}


@pytest.mark.parametrize("build", REJECTED.values(), ids=list(REJECTED))
def test_bad_token_is_401(client, make_token, build):
    response = client.get("/orders", headers=bearer(build(make_token)))
    assert response.status_code == 401
    assert response.headers["www-authenticate"].startswith("Bearer")
    assert response.json() == {"detail": "Not authenticated"}   # no hint about *why*
```

| Matrix row | PyJWT exception behind the 401 |
|------------|--------------------------------|
| `expired` | `ExpiredSignatureError` |
| `not-yet-valid`, `future-iat` | `ImmatureSignatureError` |
| `wrong-audience` | `InvalidAudienceError` |
| `wrong-issuer`, `issuer-prefix` | `InvalidIssuerError` |
| `missing-*` | `MissingRequiredClaimError` |
| `sub-not-a-string` | `InvalidSubjectError` |
| `refresh-used-as-access` | `InvalidTokenError` raised by `TokenService` |
| `wrong-signature`, `tampered-payload` | `InvalidSignatureError` |
| `alg-none`, `hs256-signed-with-public-key` | `InvalidAlgorithmError` |
| `not-a-jwt`, `empty` | `DecodeError` |

Add a row whenever a bug or advisory teaches you a new shape of bad token.

## API-Level Checks: 401 vs 403

```python
# tests/test_api_auth.py (continued)
def test_valid_token(client, make_token):
    response = client.get("/orders", headers=bearer(make_token()))
    assert response.status_code == 200
    assert response.json()["owner"] == "user-1"


def test_clock_skew_within_leeway_is_accepted(client, make_token):
    assert client.get("/orders", headers=bearer(make_token(exp=ago(seconds=5)))).status_code == 200


def test_missing_header_is_401_without_error_code(client):
    response = client.get("/orders")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_wrong_scheme_is_401(client, make_token):
    response = client.get("/orders", headers={"Authorization": f"Basic {make_token()}"})
    assert response.status_code == 401


def test_missing_scope_is_403(client, make_token):
    response = client.post("/orders", headers=bearer(make_token()))      # has orders:read only
    assert response.status_code == 403
    assert 'error="insufficient_scope"' in response.headers["www-authenticate"]


def test_refresh_rotation_rejects_reuse(client, service):
    pair = service.issue_pair("user-1", ["orders:read"])
    first = client.post("/auth/refresh", json={"refresh_token": pair["refresh_token"]})
    assert first.status_code == 200
    again = client.post("/auth/refresh", json={"refresh_token": pair["refresh_token"]})
    assert again.status_code == 401


def test_access_token_cannot_refresh(client, service):
    pair = service.issue_pair("user-1", ["orders:read"])
    response = client.post("/auth/refresh", json={"refresh_token": pair["access_token"]})
    assert response.status_code == 401


def test_logs_do_not_contain_the_token(client, make_token, caplog):
    token = make_token(exp=ago(minutes=1))
    with caplog.at_level("DEBUG"):
        client.get("/orders", headers=bearer(token))
    assert token not in caplog.text
    assert token.split(".")[1] not in caplog.text
```

The rule behind the status codes: **401** means "I do not know who you are" (bad, missing or expired credentials); **403** means "I know who you are and the answer is no". A forged or expired token is never a 403.

## Controlling Time

PyJWT reads the clock with `datetime.now(tz=timezone.utc)` during `decode`, so `freezegun` moves it. Issuing is under your control: inject the clock.

| Technique | Use for | Note |
|-----------|---------|------|
| Build timestamps relative to now (`exp=ago(minutes=1)`) | Most negative cases | No extra dependency; used in the matrix above |
| `freezegun` (`freeze_time`, `tick`) | Expiry, `nbf` and `leeway` boundaries across several requests | Patches `datetime`; PyJWT's own `decode` sees the frozen time |
| Injected `clock` in `TokenService` | Issuing tokens "from the past" or "from the future" | Verification still uses the real clock unless frozen |
| `leeway` | Skew tolerance | Test both sides of the boundary |

```python
# tests/test_time.py
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from freezegun import freeze_time

from tests.conftest import bearer


def test_token_expires_when_the_clock_moves(client, make_token):
    with freeze_time("2030-01-01 12:00:00") as clock:
        headers = bearer(make_token())                  # iat/nbf/exp come from the frozen clock
        assert client.get("/orders", headers=headers).status_code == 200
        clock.tick(timedelta(minutes=5, seconds=9))     # inside exp + 10 s leeway
        assert client.get("/orders", headers=headers).status_code == 200
        clock.tick(timedelta(seconds=2))
        assert client.get("/orders", headers=headers).status_code == 401


def test_injected_clock_issues_a_token_in_the_past(service):
    long_ago = datetime(2020, 1, 1, tzinfo=timezone.utc)
    service.clock = lambda: long_ago
    token = service.issue_pair("user-1", [])["access_token"]
    claims = jwt.decode(token, options={"verify_signature": False})
    assert claims["iat"] == int(long_ago.timestamp())
    with pytest.raises(jwt.ExpiredSignatureError):
        service.verify(token)
```

A token is expired from the exact second `exp` onward (`exp <= now - leeway`), so boundary tests should step to `exp + leeway` rather than `exp + leeway - 1`.

## Quick Rules

1. **Build test tokens with PyJWT directly** in a factory, with `None` meaning "remove this claim".
2. **Keep a parametrised matrix of rejected tokens**, assert 401, the `WWW-Authenticate` header and an identical generic body; add a row for every new bad shape.
3. **Assert 403 only for a valid token without permission**; a forged or expired token is never a 403.
4. **Use relative timestamps for most cases, `freezegun` for boundaries**, and inject the clock when issuing.
5. **Assert that logs never contain the token.**

---
## See also
- [PyJWT — JSON Web Tokens in Python](./index.md)
- [01 Encode, Decode & Claims](./01-encode-decode-claims.md)
- [03 Security Pitfalls & Hardening](./03-security-pitfalls-hardening.md)
- [04 FastAPI Integration & Token Service](./04-integration-fastapi.md)
- [06 Testing: JWKS Rotation, Smoke Tests & CI](./06-testing-jwks-ci.md)
- [Pytest](../pytest/index.md)
- [HTTPX — Modern Python HTTP Client](../httpx/index.md)
- [FastAPI](../fastapi/index.md)
- [Pydantic — Data Validation](../pydantic/index.md)
