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

# PyJWT — FastAPI Integration & Token Service

A FastAPI service that issues access and refresh tokens and validates Bearer tokens. FastAPI conventions follow [FastAPI](../fastapi/index.md); claims are validated with [Pydantic](../pydantic/index.md). The tests for this code are in [05 Testing: Token Factory & Negative Matrix](./05-testing-token-factory.md) and [06 Testing: JWKS Rotation, Smoke Tests & CI](./06-testing-jwks-ci.md).

```bash
uv add "pyjwt[crypto]" fastapi pydantic
uv add --dev pytest freezegun httpx2        # httpx2: the client behind fastapi.testclient (Starlette 1.x)
```

```text
app/__init__.py
app/auth.py          token issuing and verification
app/main.py          FastAPI app and dependencies
tests/__init__.py
tests/conftest.py    keys, token factory, client      (05)
tests/jwks_server.py local fake JWKS endpoint         (06)
tests/test_*.py
pytest.ini
```

## Issuing and Verifying Tokens

`TokenService` is the only code that calls PyJWT. It takes the verification key as a PEM key, a `PyJWK` or a `PyJWKClient`, and an injectable clock for issuing.

```python
# app/auth.py
from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt

ACCESS, REFRESH = "access", "refresh"
REQUIRED = ["exp", "iat", "nbf", "iss", "aud", "sub", "jti", "token_use"]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class AuthConfig:
    issuer: str
    audience: str
    algorithm: str = "RS256"
    access_ttl: timedelta = timedelta(minutes=15)
    refresh_ttl: timedelta = timedelta(days=7)
    leeway: timedelta = timedelta(seconds=10)


class TokenService:
    """`verify_key`: PEM public key, PyJWK or PyJWKClient. `private_key` is needed to issue."""

    def __init__(
        self,
        config: AuthConfig,
        *,
        verify_key: Any,
        private_key: str | bytes | None = None,
        kid: str | None = None,
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        self.config, self.verify_key, self.private_key = config, verify_key, private_key
        self.kid, self.clock = kid, clock

    def _issue(self, sub: str, token_use: str, ttl: timedelta, **extra: Any) -> str:
        now = self.clock()
        claims = {
            "iss": self.config.issuer, "aud": self.config.audience, "sub": sub,
            "iat": now, "nbf": now, "exp": now + ttl,
            "jti": uuid.uuid4().hex, "token_use": token_use, **extra,
        }
        headers = {"kid": self.kid} if self.kid else None
        return jwt.encode(claims, self.private_key, algorithm=self.config.algorithm, headers=headers)

    def issue_pair(self, sub: str, scopes: list[str]) -> dict[str, str]:
        return {
            "access_token": self._issue(sub, ACCESS, self.config.access_ttl, scope=" ".join(scopes)),
            "refresh_token": self._issue(sub, REFRESH, self.config.refresh_ttl),
            "token_type": "bearer",
        }

    def verify(self, token: str, *, token_use: str = ACCESS) -> dict[str, Any]:
        key = self.verify_key
        if isinstance(key, jwt.PyJWKClient):
            key = key.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            key,
            algorithms=[self.config.algorithm],
            audience=self.config.audience,
            issuer=self.config.issuer,
            leeway=self.config.leeway,
            options={"require": REQUIRED},
        )
        if claims["token_use"] != token_use:           # a refresh token is not an access token
            raise jwt.InvalidTokenError("unexpected token_use")
        return claims
```

## FastAPI Bearer Dependency

| Situation | Response | `WWW-Authenticate` |
|-----------|----------|--------------------|
| No header, or a scheme other than Bearer | 401 `{"detail": "Not authenticated"}` | `Bearer` |
| Any `InvalidTokenError`, unknown `kid`, claims that fail the Pydantic model | 401, same body | `Bearer error="invalid_token"` |
| Valid token without the required scope | 403 `{"detail": "Insufficient scope"}` | `Bearer error="insufficient_scope", scope="..."` |
| JWKS endpoint unreachable | 503 | none |
| Key misconfiguration (`InvalidKeyError`) | 500, not caught | none |

The dependency is a plain `def`, so FastAPI runs it in a threadpool: the blocking JWKS fetch of `PyJWKClient` does not stall the event loop.

```python
# app/main.py
from __future__ import annotations

import logging

import jwt
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ValidationError

from app.auth import REFRESH, TokenService

log = logging.getLogger("auth")
bearer = HTTPBearer(auto_error=False)


class Claims(BaseModel):
    sub: str
    jti: str
    scope: str = ""

    @property
    def scopes(self) -> set[str]:
        return set(self.scope.split())


def unauthorized(error: str | None = None) -> HTTPException:
    challenge = "Bearer" if error is None else f'Bearer error="{error}"'
    return HTTPException(401, "Not authenticated", headers={"WWW-Authenticate": challenge})


def get_tokens(request: Request) -> TokenService:
    return request.app.state.tokens


def current_claims(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    tokens: TokenService = Depends(get_tokens),
) -> Claims:
    if creds is None:
        raise unauthorized()
    try:
        return Claims.model_validate(tokens.verify(creds.credentials))
    except jwt.PyJWKClientConnectionError as exc:           # JWKS endpoint down: not the caller's fault
        raise HTTPException(503, "Identity provider unavailable") from exc
    except (jwt.InvalidTokenError, jwt.PyJWKClientError, ValidationError) as exc:
        log.info("token rejected: %s", type(exc).__name__)    # class name only, never the token
        raise unauthorized("invalid_token") from exc


def require_scope(scope: str):
    def check(claims: Claims = Depends(current_claims)) -> Claims:
        if scope not in claims.scopes:
            challenge = f'Bearer error="insufficient_scope", scope="{scope}"'
            raise HTTPException(403, "Insufficient scope", headers={"WWW-Authenticate": challenge})
        return claims

    return check


class RefreshBody(BaseModel):
    refresh_token: str


def create_app(tokens: TokenService) -> FastAPI:
    app = FastAPI()
    app.state.tokens = tokens
    app.state.used_refresh = set()          # use Redis or a DB table in production

    @app.post("/auth/refresh")
    def refresh(body: RefreshBody, request: Request, svc: TokenService = Depends(get_tokens)):
        try:
            claims = svc.verify(body.refresh_token, token_use=REFRESH)
        except (jwt.InvalidTokenError, jwt.PyJWKClientError) as exc:
            raise unauthorized("invalid_token") from exc
        used: set[str] = request.app.state.used_refresh
        if claims["jti"] in used:                # a rotated token came back: reject (and revoke the family)
            raise unauthorized("invalid_token")
        used.add(claims["jti"])
        return svc.issue_pair(claims["sub"], ["orders:read"])

    @app.get("/orders")
    def list_orders(claims: Claims = Depends(require_scope("orders:read"))):
        return {"owner": claims.sub, "orders": []}

    @app.post("/orders", status_code=201)
    def create_order(claims: Claims = Depends(require_scope("orders:write"))):
        return {"owner": claims.sub}

    return app
```

A login endpoint would call `tokens.issue_pair(user.id, scopes)` after checking the password (hashing: [FastAPI Auth & Security](../fastapi/04-auth-security.md)). Refresh-token rules are in [03](./03-security-pitfalls-hardening.md).

## Design Notes

| Decision | Reason |
|----------|--------|
| One `TokenService` calls `jwt.encode` / `jwt.decode` | Algorithm, issuer, audience, leeway and `require` live in one place; tests inject keys and a clock |
| `token_use` claim (`access` / `refresh`) is required and checked | A refresh token cannot be replayed as an access token, nor the reverse |
| Verification key can be a PEM, a `PyJWK` or a `PyJWKClient` | The same service verifies local test tokens and identity-provider tokens |
| `Claims` Pydantic model after `decode` | A signed token with unexpected claim types is still rejected (401) |
| Generic 401 body, class name in the log | No hint for attackers, no token in logs |
| `def` dependency, one `PyJWKClient` per process | Blocking JWKS fetch runs in the threadpool and is cached |

A login endpoint would call `tokens.issue_pair(user.id, scopes)` after checking the password (hashing: [FastAPI Auth & Security](../fastapi/04-auth-security.md)). Refresh-token rules are in [03](./03-security-pitfalls-hardening.md); key handling and JWKS in [02](./02-algorithms-keys-jwks.md).

## Quick Rules

1. **One `TokenService`** is the only caller of `jwt.encode` / `jwt.decode`; inject the key, algorithm, issuer, audience and clock.
2. **Require every claim you read** (`exp`, `iat`, `nbf`, `iss`, `aud`, `sub`, `jti`, `token_use`) and check `token_use`.
3. **A `def` dependency**, not `async def`, when it may call `PyJWKClient`; one client per process.
4. **401 for every bad token with one generic body; 403 only for a valid token without permission; 503 when the JWKS is down; let key errors surface as 500.**
5. **Rotate refresh tokens** and reject a reused `jti`; keep the state in Redis or a database, not in process memory.

---
## See also
- [PyJWT — JSON Web Tokens in Python](./index.md)
- [01 Encode, Decode & Claims](./01-encode-decode-claims.md)
- [02 Algorithms, Keys & JWKS](./02-algorithms-keys-jwks.md)
- [03 Security Pitfalls & Hardening](./03-security-pitfalls-hardening.md)
- [05 Testing: Token Factory & Negative Matrix](./05-testing-token-factory.md)
- [FastAPI](../fastapi/index.md)
- [Pydantic — Data Validation](../pydantic/index.md)
- [OWASP API Security](../../owasp-api-security/index.md)
- [Auth, Config & Security Headers](../../code-security/04-auth-config-headers.md)
