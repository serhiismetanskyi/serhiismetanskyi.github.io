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

# PyJWT — Security Pitfalls & Hardening

The ways JWT authentication goes wrong, what PyJWT does about each, and what remains your job. General API-security theory lives in [OWASP API Security](../../owasp-api-security/index.md) and [Auth, Config & Security Headers](../../code-security/04-auth-config-headers.md); this page covers the PyJWT-specific part and gives each attack a runnable test.

## Threat Overview

| Threat | Cause | Defence | Test |
|--------|-------|---------|------|
| Token trusted without verification | `verify_signature=False`, decoding without a key | Never use it outside tests | grep in CI |
| `alg: none` | Verifier accepts unsigned tokens | `algorithms=[...]` allow-list; PyJWT never verifies `none` | `test_alg_none_is_rejected` |
| Algorithm confusion (RS256 → HS256) | Public key used as HMAC secret | Single-family allow-list; PyJWT refuses PEM/JWK/DER keys as HMAC secrets | `test_algorithm_confusion_is_stopped` |
| Token for another service accepted | `aud` / `iss` not checked | `audience=`, `issuer=`, `require` | [05](./05-testing-token-factory.md) matrix |
| Token lives forever | No `exp` | `options={"require": ["exp"]}` | matrix: `missing-exp` |
| Stolen token reuse | Long lifetime, no revocation | Short access tokens, `jti` deny-list, refresh rotation | `test_revocation_by_jti` |
| Weak HMAC secret | Short or guessable key | 32+ random bytes, `enforce_minimum_key_length` | `test_short_hmac_key_warns` |
| Attacker-chosen key or URL | `kid`, `jku`, `x5u`, `jwk` header trusted | Fixed key set; PyJWT never fetches header URLs | `test_jku_header_is_never_fetched` |
| Data leak | Sensitive claims, tokens in logs or URLs | Minimal payload, redaction | caplog test in [05](./05-testing-token-factory.md) |

## Always Pass `algorithms`

`jwt.decode` without `algorithms=` raises `DecodeError`. The list must be a list you control: hard-coded, or configured in the same place as the key. Do not build it from `get_unverified_header(token)["alg"]`: that hands the attacker the choice.

A bare string is not an allow-list: the check is `alg in algorithms`, which for a string is a substring test.

Test module for this page (`test_pitfalls.py`), part 1:

```python
# test_pitfalls.py
import base64
import hashlib
import hmac
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import jwt
import pytest
from cryptography.hazmat.primitives import serialization as ser
from cryptography.hazmat.primitives.asymmetric import rsa

SECRET = "x" * 32                        # placeholder: 32 bytes for HS256


def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


@pytest.fixture(scope="module")
def rsa_pair():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private = key.private_bytes(ser.Encoding.PEM, ser.PrivateFormat.PKCS8, ser.NoEncryption())
    public = key.public_key().public_bytes(ser.Encoding.PEM, ser.PublicFormat.SubjectPublicKeyInfo)
    return private, public


def test_payload_is_readable_without_the_key():
    token = jwt.encode({"sub": "u1", "email": "ann@example.test"}, SECRET, algorithm="HS256")
    claims = jwt.decode(token, options={"verify_signature": False})
    assert claims["email"] == "ann@example.test"


def test_algorithms_is_required():
    token = jwt.encode({"sub": "u1"}, SECRET, algorithm="HS256")
    with pytest.raises(jwt.DecodeError, match="algorithms"):
        jwt.decode(token, SECRET)


def test_algorithms_must_be_a_list():
    token = jwt.encode({"sub": "u1"}, SECRET, algorithm="HS256")
    # a bare string is matched as a substring: this is NOT an allow-list
    assert jwt.decode(token, SECRET, algorithms="HS256 RS256") == {"sub": "u1"}
```

## `alg: none`

An unsigned token has an empty signature segment and `"alg": "none"` in the header. A vulnerable verifier reads `alg` from the token and skips the check. PyJWT rejects it twice: `"none"` is not in your allow-list (`InvalidAlgorithmError`), and even if you list it, the `none` algorithm's `verify` always fails (`InvalidSignatureError`).

```python
# test_pitfalls.py (continued)
def test_alg_none_is_rejected():
    unsigned = jwt.encode({"sub": "admin"}, None, algorithm="none")
    with pytest.raises(jwt.InvalidAlgorithmError):
        jwt.decode(unsigned, SECRET, algorithms=["HS256"])
    with pytest.raises(jwt.InvalidSignatureError):       # even when "none" is allowed
        jwt.decode(unsigned, None, algorithms=["none"])
```

## Algorithm Confusion

An RS256 service verifies with a public key, which is public. If the verifier also accepts HS256 and passes the same key to `decode`, an attacker can sign an HS256 token using the **public key bytes as the HMAC secret**. Two layers stop it in PyJWT:

1. `algorithms=["RS256"]` rejects the HS256 header (`InvalidAlgorithmError`).
2. Even if HS256 is allowed, the HMAC key preparation refuses anything that looks like an asymmetric key (PEM, SSH, DER, X.509, JWK JSON) with `InvalidKeyError`. The same check makes `jwt.encode(..., public_pem, algorithm="HS256")` fail, so the forged token below has to be assembled by hand.

```python
# test_pitfalls.py (continued)
def forge_hs256_with_public_key(public_pem: bytes) -> str:
    header = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body = b64(json.dumps({"sub": "admin"}).encode())
    mac = hmac.new(public_pem, f"{header}.{body}".encode(), hashlib.sha256)
    return f"{header}.{body}.{b64(mac.digest())}"


def test_algorithm_confusion_is_stopped(rsa_pair):
    _, public = rsa_pair
    forged = forge_hs256_with_public_key(public)
    with pytest.raises(jwt.InvalidAlgorithmError):                       # the allow-list
        jwt.decode(forged, public, algorithms=["RS256"])
    with pytest.raises(jwt.InvalidKeyError, match="asymmetric key"):     # PyJWT's key-type check
        jwt.decode(forged, public, algorithms=["RS256", "HS256"])
    with pytest.raises(jwt.InvalidKeyError):                             # it will not sign either
        jwt.encode({"sub": "admin"}, public, algorithm="HS256")
```

The key check is a safety net, not a design. Keep each key bound to one algorithm family: `["RS256"]` with an RSA key, `["HS256"]` with a secret. Never mix HS* and RS*/ES* in one `algorithms` list.

## Claims, Lifetimes and Clock Skew

| Control | Setting |
|---------|---------|
| Audience | `audience="orders-api"`; one audience per API, so a token minted for another service fails |
| Issuer | `issuer="https://auth.example.test"`; exact match |
| Expiry | `options={"require": ["exp"]}`; without `require` a token lacking `exp` never expires |
| Other mandatory claims | `require` also `iat`, `nbf`, `sub`, `jti` if your code reads them |
| Access-token lifetime | 5 to 15 minutes |
| Refresh-token lifetime | Hours to days, server-tracked, rotated on use |
| `leeway` | 5 to 30 seconds |

Validity window: a token is accepted while `nbf - leeway <= now < exp + leeway`. Every second of `leeway` extends the life of a stolen token by a second, so fix the clocks (NTP) before widening it.

## `jti` and Revocation

A JWT cannot be recalled once issued. Options, from cheapest to strictest:

| Approach | Mechanism | Cost |
|----------|-----------|------|
| Short expiry | Let tokens die | None, but revocation delay equals lifetime |
| Deny-list of `jti` | Store `jti` until `exp`, check on every request | One cache lookup per request (Redis `SET jti 1 EX ttl`) |
| Per-user token version | `ver` claim compared with a stored counter | One lookup; revokes all of a user's tokens |
| Opaque session token | Not a JWT | Full server control |

Key by `jti`, **not** by the raw token string: the same valid token can be written in more than one encoded form (for example with trailing `=` padding on a segment, which PyJWT accepts), so a deny-list of token strings can be bypassed. PyJWT only checks that `jti` is a string; reuse tracking is yours.

```python
# test_pitfalls.py (continued)
class RevocationList:
    """In-memory sketch. In production use Redis (SET jti 1 EX ttl) or a DB table."""

    def __init__(self) -> None:
        self._revoked: dict[str, float] = {}

    def revoke(self, claims: dict) -> None:
        self._revoked[claims["jti"]] = claims["exp"]

    def is_revoked(self, jti: str) -> bool:
        now = time.time()
        self._revoked = {j: exp for j, exp in self._revoked.items() if exp > now}   # purge
        return jti in self._revoked


def test_revocation_by_jti():
    token = jwt.encode({"jti": "abc", "exp": int(time.time()) + 60}, SECRET, algorithm="HS256")
    claims = jwt.decode(token, SECRET, algorithms=["HS256"], options={"require": ["jti", "exp"]})
    revoked = RevocationList()
    assert not revoked.is_revoked(claims["jti"])
    revoked.revoke(claims)
    assert revoked.is_revoked(claims["jti"])
```

## Refresh-Token Pattern

| Rule | Why |
|------|-----|
| Access token short-lived, refresh token long-lived with a different `token_use` claim | A stolen access token expires fast; one cannot be replayed as the other |
| **Rotate on every use**: each refresh returns a new refresh token and invalidates the old `jti` | Limits the window of a stolen refresh token |
| **Reuse detection**: a refresh token presented twice means theft; revoke the whole token family | The legitimate client and the thief now collide |
| Store refresh state server-side (`jti`, user, family, expiry) | Required for revocation |
| Send refresh tokens only to one endpoint (cookie `Path=/auth`) | Smaller exposure |
| Re-check user status (disabled, role change) at refresh time | Access tokens are stale by up to their lifetime |

A working implementation with rotation and reuse rejection is in [04](./04-integration-fastapi.md).

## Where to Store Tokens

| Storage | XSS | CSRF | Verdict |
|---------|-----|------|---------|
| `localStorage` / `sessionStorage` | Any injected script can read the token | Not sent automatically, so no CSRF | Avoid for refresh tokens and long-lived access tokens |
| In-memory JS variable | Readable only while the page lives | None | Good for the access token; lost on reload |
| Cookie `HttpOnly; Secure; SameSite` | JS cannot read it; XSS can still issue requests | Cookies are sent automatically: needs `SameSite` and CSRF protection on unsafe methods | Best for the refresh token in browsers |
| Mobile keystore / keychain | OS-protected | None | Use the platform store |
| URL query string | Lands in logs, history and `Referer` | n/a | Never |

```python
from fastapi import FastAPI, Response

app = FastAPI()


@app.post("/auth/login")
def login(response: Response):
    response.set_cookie(
        "refresh_token", "<token>",
        httponly=True, secure=True, samesite="strict", max_age=7 * 24 * 3600, path="/auth",
    )
    return {"access_token": "<token>", "token_type": "bearer"}
```

## Secrets and Keys

- Load HS secrets and private keys from the environment or a secret manager; never from the repository ([Secrets & Leak Prevention](../../code-security/01-secrets-leak-prevention.md)).
- Use different keys per environment, and different `iss` / `aud`, so a staging token is useless in production.
- Generate with `secrets.token_bytes(32)` (64 for HS512). Short keys trigger `InsecureKeyLengthWarning`; `enforce_minimum_key_length` makes it an error.
- Support rotation by key id: look up the secret by `kid` in a dict you own.

```python
# test_pitfalls.py (continued)
def test_short_hmac_key_warns():
    # pytest.ini promotes the warning to an error:
    #   [pytest]
    #   filterwarnings = error::jwt.warnings.InsecureKeyLengthWarning
    with pytest.raises(jwt.InsecureKeyLengthWarning):
        jwt.encode({"sub": "u1"}, "short", algorithm="HS256")
    strict = jwt.PyJWT({"enforce_minimum_key_length": True})
    with pytest.raises(jwt.InvalidKeyError):
        strict.encode({"sub": "u1"}, "short", algorithm="HS256")
```

## No Sensitive Data in the Payload; JWS vs JWE

A JWT as PyJWT produces it is a **JWS**: signed, readable by anyone. Do not put passwords, API keys, full PII, internal IDs you consider secret, or authorization data that must stay hidden from the client in claims. Keep claims to identifiers (`sub`, `jti`), `scope`/`roles`, and timing.

PyJWT does not implement JWE (encrypted JWTs). If you truly need an encrypted token, use a JOSE library that supports JWE, such as `jwcrypto` or `joserfc`, or keep the data server-side and issue an opaque reference.

## `kid`, `jku`, `x5u`, `jwk` Headers

Header fields are attacker-controlled until the signature is verified.

| Header | Risk | PyJWT behaviour | Your rule |
|--------|------|-----------------|-----------|
| `kid` | Injected into a file path, SQL or shell used for key lookup | Must be a string, otherwise `InvalidTokenError`; PyJWT does nothing else with it | Use it only as a key into an in-memory dict or an allow-list; no string-built paths or queries |
| `jku` / `x5u` | Points the verifier at an attacker's key set | **Ignored**: PyJWT never fetches header URLs | Take the JWKS URL from configuration; never from the token |
| `jwk` / `x5c` | Embeds the attacker's own key | Ignored | Never verify with a key taken from the token |
| `crit` | Extension the verifier does not understand | Unknown extensions raise `InvalidTokenError` | Nothing to add |

`PyJWKClient` additionally restricts the URL scheme to `http` / `https` and refuses redirects.

```python
# test_pitfalls.py (continued)
KEYS = {"2026-10": SECRET}


def resolve_key(token: str) -> str:
    kid = jwt.get_unverified_header(token).get("kid")     # kid must be a str, else InvalidTokenError
    try:
        return KEYS[kid]
    except KeyError:
        raise jwt.InvalidTokenError("unknown kid") from None


def test_kid_is_only_a_lookup_key():
    good = jwt.encode({"sub": "u1"}, SECRET, algorithm="HS256", headers={"kid": "2026-10"})
    assert jwt.decode(good, resolve_key(good), algorithms=["HS256"]) == {"sub": "u1"}
    for kid in ("../../etc/passwd", "1' OR '1'='1"):
        bad = jwt.encode({"sub": "u1"}, SECRET, algorithm="HS256", headers={"kid": kid})
        with pytest.raises(jwt.InvalidTokenError):
            resolve_key(bad)
    header = b64(json.dumps({"alg": "HS256", "kid": 5}).encode())     # hand-built: encode() refuses it
    with pytest.raises(jwt.InvalidTokenError):
        resolve_key(f"{header}.{b64(b'{}')}.{b64(b'sig')}")


def test_unknown_crit_extension_is_rejected():
    token = jwt.encode({"sub": "u1"}, SECRET, algorithm="HS256",
                       headers={"crit": ["exp-ext"], "exp-ext": 1})
    with pytest.raises(jwt.InvalidTokenError, match="Unsupported critical extension"):
        jwt.decode(token, SECRET, algorithms=["HS256"])


def test_jku_header_is_never_fetched():
    token = jwt.encode({"sub": "u1"}, SECRET, algorithm="HS256",
                       headers={"jku": "https://attacker.example/jwks.json"})
    assert jwt.decode(token, SECRET, algorithms=["HS256"]) == {"sub": "u1"}


def test_jwks_client_rejects_other_schemes_and_redirects():
    with pytest.raises(jwt.PyJWKClientError, match="scheme"):
        jwt.PyJWKClient("file:///etc/passwd")

    class Redirect(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(302)
            self.send_header("Location", "http://127.0.0.1:1/jwks.json")
            self.end_headers()

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Redirect)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        client = jwt.PyJWKClient(f"http://127.0.0.1:{server.server_port}/jwks.json", timeout=2)
        with pytest.raises(jwt.PyJWKClientConnectionError):
            client.get_signing_key("any")
    finally:
        server.shutdown()
        server.server_close()
```

## Logging and Transport

- Never log a token, an `Authorization` header or a full `PyJWT` exception message together with the token. Log the exception class, the `jti` and the `sub`.
- Redact `Authorization` and `Set-Cookie` in access logs, proxies and error trackers.
- Send tokens only in the `Authorization: Bearer` header or an `HttpOnly` cookie, only over TLS.
- Tokens in URLs end up in logs, browser history and `Referer` headers.

## PyJWT Security Advisories

PyJWT publishes advisories at `github.com/jpadilla/pyjwt/security/advisories`. At a high level:

| Area | Examples | Fixed in |
|------|----------|----------|
| Key confusion: asymmetric key material accepted as an HMAC secret | CVE-2022-29217 (non-blocklisted key formats); later bypasses through JWK, JWKS, DER, BOM and whitespace-mutated PEM forms | 2.4.0; 2.13.0 and 2.14.0 |
| Issuer matching | CVE-2024-53861 (partial `iss` match) | 2.10.1 |
| Header extensions | Unknown `crit` entries accepted | 2.12.0 |
| `PyJWK` / `PyJWKClient` | Algorithm allow-list bypass with `PyJWK` keys, URL scheme allow-list (SSRF), unbounded JWKS refresh on unknown `kid`, redirects followed, empty HMAC key via `oct` JWK | 2.13.0 and 2.14.0 |
| Parser robustness | Deeply nested payloads raising `RecursionError`, unbounded decoding of unused segments | 2.13.0 to 2.15.0 |
| Revocation | Non-canonical signature segments bypassing a raw-token deny-list | 2.14.0 |

Practical consequence: run a current 2.x release, set a lower bound in `pyproject.toml`, and let dependency auditing flag old versions ([Dependency Security](../../code-security/02-dependency-security.md)).

## Quick Rules

1. **`algorithms=[...]` is a list, fixed in code or config, one key family per call.**
2. **Reject unsigned tokens by never listing `none`**; test it.
3. **Require `exp` and check `aud` and `iss`** on every decode.
4. **Access tokens in minutes, refresh tokens rotated with reuse detection**, state kept server-side.
5. **Revoke by `jti`**, not by the token string, and expire deny-list entries at `exp`.
6. **Browser refresh tokens in `HttpOnly; Secure; SameSite` cookies**; nothing long-lived in `localStorage`.
7. **HMAC secrets are 32+ random bytes from a secret store**, different per environment; make `InsecureKeyLengthWarning` an error in tests.
8. **Treat `kid` as a lookup key and ignore `jku`, `x5u`, `jwk`, `x5c`.**
9. **Keep payloads free of secrets**; use JWE or an opaque token when data must be hidden.
10. **Never log tokens; keep PyJWT up to date.**

---
## See also
- [PyJWT — JSON Web Tokens in Python](./index.md)
- [01 Encode, Decode & Claims](./01-encode-decode-claims.md)
- [02 Algorithms, Keys & JWKS](./02-algorithms-keys-jwks.md)
- [04 FastAPI Integration & Token Service](./04-integration-fastapi.md)
- [05 Testing: Token Factory & Negative Matrix](./05-testing-token-factory.md)
- [06 Testing: JWKS Rotation, Smoke Tests & CI](./06-testing-jwks-ci.md)
- [OWASP API Security](../../owasp-api-security/index.md)
- [Auth, Config & Security Headers](../../code-security/04-auth-config-headers.md)
- [Secrets & Leak Prevention](../../code-security/01-secrets-leak-prevention.md)
- [Dependency Security](../../code-security/02-dependency-security.md)
- [Security & Observability (API architectures)](../../api-architectures/05-cross-cutting/01-security-observability.md)
