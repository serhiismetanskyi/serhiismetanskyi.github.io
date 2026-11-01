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

# PyJWT — Testing: JWKS Rotation, Smoke Tests & CI

Tests that need more than the in-process app from [05](./05-testing-token-factory.md): key rotation against a real local JWKS server, forged-token smoke tests against a deployed API, and the CI gates around them. Setup, `conftest.py` and the token factory are in [05](./05-testing-token-factory.md).

## JWKS Rotation with a Local Server

A real HTTP server on `127.0.0.1` exercises the actual `PyJWKClient` code: fetching, caching, unknown-`kid` refresh. No mocking of PyJWT, no network.

```python
# tests/jwks_server.py
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from cryptography.hazmat.primitives import serialization as ser
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.algorithms import RSAAlgorithm


class SigningKey:
    def __init__(self, kid: str) -> None:
        self.kid = kid
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.private_pem = key.private_bytes(
            ser.Encoding.PEM, ser.PrivateFormat.PKCS8, ser.NoEncryption()
        )
        self.jwk = json.loads(RSAAlgorithm.to_jwk(key.public_key()))
        self.jwk.update(kid=kid, use="sig", alg="RS256")


class FakeJWKS:
    """A JWKS endpoint on 127.0.0.1 whose key set a test can change."""

    def __init__(self) -> None:
        self.keys: list[SigningKey] = []
        self.requests = 0
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                outer.requests += 1
                body = json.dumps({"keys": [k.jwk for k in outer.keys]}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.server.server_port}/.well-known/jwks.json"

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()
```

```python
# tests/test_jwks.py
import jwt
import pytest
from fastapi.testclient import TestClient

from app.auth import AuthConfig, TokenService
from app.main import create_app
from tests.conftest import AUDIENCE, ISSUER, bearer, default_claims
from tests.jwks_server import FakeJWKS, SigningKey


@pytest.fixture
def jwks():
    server = FakeJWKS()
    yield server
    server.close()


@pytest.fixture
def api(jwks):
    # cooldown_duration=0: an unknown kid refreshes the key set immediately
    jwks_client = jwt.PyJWKClient(jwks.url, cooldown_duration=0, timeout=2)
    config = AuthConfig(issuer=ISSUER, audience=AUDIENCE)
    return TestClient(create_app(TokenService(config, verify_key=jwks_client)))


def token_signed_by(key: SigningKey) -> str:
    return jwt.encode(
        default_claims(), key.private_pem, algorithm="RS256", headers={"kid": key.kid}
    )


def status(api, token: str) -> int:
    return api.get("/orders", headers=bearer(token)).status_code


def test_key_rotation_with_overlap(api, jwks):
    old, new = SigningKey("2026-10"), SigningKey("2026-11")
    jwks.keys = [old]
    assert status(api, token_signed_by(old)) == 200
    assert status(api, token_signed_by(old)) == 200
    assert jwks.requests == 1                         # second call served from the cache

    assert status(api, token_signed_by(new)) == 401   # not published yet
    jwks.keys = [old, new]                            # IdP publishes the new key
    assert status(api, token_signed_by(new)) == 200   # unknown kid triggered a refresh
    assert status(api, token_signed_by(old)) == 200   # overlap: both are valid

    jwks.keys = [new]                                 # old key retired at the IdP
    assert status(api, token_signed_by(old)) == 200   # stale cache until `lifespan` passes
    api.app.state.tokens.verify_key.get_signing_keys(refresh=True)
    assert status(api, token_signed_by(old)) == 401   # now rejected
    assert status(api, token_signed_by(new)) == 200


def test_unknown_kid_is_401(api, jwks):
    jwks.keys = [SigningKey("a")]
    assert status(api, token_signed_by(SigningKey("b"))) == 401


def test_unreachable_jwks_is_503(make_token):
    client = jwt.PyJWKClient("http://127.0.0.1:1/jwks.json", timeout=1)
    config = AuthConfig(issuer=ISSUER, audience=AUDIENCE)
    api = TestClient(create_app(TokenService(config, verify_key=client)))
    token = jwt.encode(default_claims(), make_token.keys.private_pem, algorithm="RS256",
                       headers={"kid": "a"})
    assert status(api, token) == 503
```

`cooldown_duration=0` matters in tests: with the default of 30 seconds, an unknown `kid` right after the first fetch does not trigger a refresh and the new key is not found. The cache and cooldown use a monotonic clock, so do not rely on freezing time here.

When HTTP is more than a test needs, subclass the client and override `fetch_data`:

```python
# tests/test_static_jwks.py
import jwt

from app.auth import AuthConfig, TokenService
from tests.conftest import AUDIENCE, ISSUER, default_claims
from tests.jwks_server import SigningKey


class StaticJWKSClient(jwt.PyJWKClient):
    """No HTTP: serves whatever `self.document` holds."""

    def __init__(self, keys):
        super().__init__("https://idp.example.test/jwks.json", cooldown_duration=0)
        self.document = {"keys": [k.jwk for k in keys]}

    def fetch_data(self):
        self.jwk_set_cache.put(self.document)
        return self.document


def test_static_jwks():
    key = SigningKey("k1")
    svc = TokenService(AuthConfig(ISSUER, AUDIENCE), verify_key=StaticJWKSClient([key]))
    token = jwt.encode(default_claims(), key.private_pem, algorithm="RS256", headers={"kid": "k1"})
    assert svc.verify(token)["sub"] == "user-1"
```

Monkeypatching `PyJWKClient.get_signing_key_from_jwt` also works for unit tests of the dependency, but it skips the code path that fails in production (caching, refresh, `kid` lookup); keep at least one test on the real client.

## Security Smoke Tests Against a Deployed API

Forged tokens need no valid credentials, so these checks can run against staging or a preview environment with `httpx` ([HTTPX](../httpx/index.md)); the same file works with `requests`.

```python
# tests/test_smoke_security.py
import os

import httpx
import pytest

from tests.conftest import bearer

API_URL = os.environ.get("API_URL")
pytestmark = pytest.mark.skipif(not API_URL, reason="API_URL not set")


@pytest.fixture
def http():
    with httpx.Client(base_url=API_URL, timeout=5) as client:
        yield client


@pytest.mark.parametrize("path", ["/orders"])
def test_requires_authentication(http, path):
    response = http.get(path)
    assert response.status_code == 401
    assert response.headers["www-authenticate"].startswith("Bearer")


def test_forged_tokens_are_rejected(http, make_token):
    for token in (make_token.wrong_key(), make_token.unsigned(), make_token.hs256_with_public_key()):
        assert http.get("/orders", headers=bearer(token)).status_code == 401


def test_error_body_is_generic(http, make_token):
    response = http.get("/orders", headers=bearer(make_token.unsigned()))
    assert response.json() == {"detail": "Not authenticated"}
    assert "jwt" not in response.text.lower() and "Traceback" not in response.text
```

Run with `API_URL=https://staging.example.test uv run pytest tests/test_smoke_security.py`. Checklists for broader API testing: [OWASP API Security](../../owasp-api-security/index.md).

## CI

```bash
uv run pytest -q                                           # warnings-as-errors for weak keys via pytest.ini
! git grep -nE "verify_signature.{0,6}False" -- app/       # no unverified decoding in application code
```

| Gate | Purpose |
|------|---------|
| `filterwarnings = error::jwt.warnings.InsecureKeyLengthWarning` | A test key shorter than the minimum fails the build |
| The matrix and rotation tests on every commit | They are offline and fast |
| `grep` for `verify_signature` set to false in `app/` | Unverified decoding belongs to tests only |
| Dependency audit | Catch outdated PyJWT ([Dependency Security](../../code-security/02-dependency-security.md)) |
| Smoke tests with `API_URL` after deploy | Forged-token behaviour on the real stack |

## Quick Rules

1. **Test rotation against a real local JWKS server** with `cooldown_duration=0`; keep at least one test on the real `PyJWKClient`.
2. **Assert the stale-cache window** (a retired key still verifies until `lifespan` passes or you force a refresh); it is your key-revocation delay.
3. **Run forged-token smoke tests after each deploy**; they need no credentials.
4. **Promote `InsecureKeyLengthWarning` to an error** and gate `verify_signature=False` out of application code.
5. **Audit dependencies in CI** so an outdated PyJWT fails the build.

---
## See also
- [PyJWT — JSON Web Tokens in Python](./index.md)
- [02 Algorithms, Keys & JWKS](./02-algorithms-keys-jwks.md)
- [03 Security Pitfalls & Hardening](./03-security-pitfalls-hardening.md)
- [04 FastAPI Integration & Token Service](./04-integration-fastapi.md)
- [05 Testing: Token Factory & Negative Matrix](./05-testing-token-factory.md)
- [Pytest](../pytest/index.md)
- [HTTPX — Modern Python HTTP Client](../httpx/index.md)
- [OWASP API Security](../../owasp-api-security/index.md)
- [Code Security](../../code-security/index.md)
