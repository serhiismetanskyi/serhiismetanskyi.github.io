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

# PyJWT — Encode, Decode & Claims

How a token is built, what `jwt.decode` checks and in which order, which exception each failure raises, and how to map those exceptions to HTTP responses. Examples use HS256 with placeholder secrets; algorithms and keys are in [02](./02-algorithms-keys-jwks.md).

```python
import base64
import json
from datetime import datetime, timedelta, timezone

import jwt

SECRET = "placeholder-secret-use-32-random-bytes-or-more"
```

## Token Structure

A compact JWT is three base64url segments joined by dots: `header.payload.signature`. The signature covers the first two segments exactly as transmitted.

| Part | Content | Example (decoded) |
|------|---------|-------------------|
| Header | JSON object: `alg`, `typ`, optional `kid` | `{"alg":"HS256","kid":"k1","typ":"JWT"}` |
| Payload | JSON object of claims | `{"sub":"u1","exp":1893499200}` |
| Signature | Raw bytes of the MAC or signature, base64url | 43 characters for HS256 |

```python
token = jwt.encode({"sub": "u1", "exp": 1893499200}, SECRET, algorithm="HS256", headers={"kid": "k1"})


def segment(part: str) -> dict:
    return json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))


header, payload, signature = token.split(".")
print(segment(header))      # {'alg': 'HS256', 'kid': 'k1', 'typ': 'JWT'}
print(segment(payload))     # {'sub': 'u1', 'exp': 1893499200}
```

Reading the payload needs no key. That is why nothing secret belongs in it. In tests, `jwt.decode(token, options={"verify_signature": False})` does the same thing and returns the claims without checking anything: use it to assert on what a service issued, never to authenticate.

## `jwt.encode`

```text
jwt.encode(payload, key, algorithm="HS256", headers=None, json_encoder=None, sort_headers=True) -> str
```

| Parameter | Behaviour |
|-----------|-----------|
| `payload` | Must be a `dict`, otherwise `TypeError`. The dict is copied, not modified |
| `key` | Secret string/bytes for HS*, PEM or `cryptography` private key for RS*/PS*/ES*/EdDSA, or a `PyJWK` |
| `algorithm` | Defaults to `HS256` when omitted. With a `PyJWK` key the key's algorithm is the default. `"none"` produces an unsigned token. An unknown name raises `NotImplementedError` |
| `headers` | Extra header fields (`kid`, `typ`, ...). A `headers["alg"]` wins over `algorithm`. `{"typ": None}` removes `typ` |
| `json_encoder` | A `json.JSONEncoder` subclass for payload and header values that `json` cannot serialise (`UUID`, `Decimal`, ...) |
| `sort_headers` | Sort header keys for stable output (default `True`) |

```python
import uuid


class Encoder(json.JSONEncoder):
    def default(self, o):
        return str(o) if isinstance(o, uuid.UUID) else super().default(o)


token = jwt.encode({"sub": uuid.UUID(int=1)}, SECRET, algorithm="HS256", json_encoder=Encoder)
print(jwt.decode(token, SECRET, algorithms=["HS256"]))     # {'sub': '00000000-0000-0000-0000-000000000001'}
```

### Time claims

`exp`, `iat` and `nbf` are NumericDate values: seconds since the Unix epoch (RFC 7519).

| Value passed to `encode` | Stored as |
|--------------------------|-----------|
| timezone-aware `datetime` | Integer seconds, converted to UTC |
| naive `datetime` | Integer seconds, **interpreted as UTC** (a local-time naive value is silently shifted) |
| `int` or `float` | Stored unchanged (a float is accepted by `decode`) |

```python
now = datetime.now(timezone.utc)
token = jwt.encode(
    {"iat": now, "nbf": now, "exp": now + timedelta(minutes=15)}, SECRET, algorithm="HS256"
)
```

Always build times from `datetime.now(timezone.utc)`. `iss` must be a string: `encode` raises `TypeError` otherwise.

## `jwt.decode` and `jwt.decode_complete`

```text
jwt.decode(
    token, key, algorithms=None, options=None,
    audience=None, subject=None, issuer=None, leeway=0,
) -> dict
```

| Parameter | Behaviour |
|-----------|-----------|
| `token` | `str` or `bytes`; anything else raises `DecodeError` |
| `key` | Verification key: secret, PEM public key, `cryptography` public key or `PyJWK` |
| `algorithms` | **Required** list of allowed `alg` values (`DecodeError` if missing). With a `PyJWK` key it defaults to that key's algorithm |
| `options` | Per-call overrides, see the table below |
| `audience` | Expected audience: a string, or an iterable where any match is enough |
| `issuer` | Expected issuer: a string, or a container of allowed issuers |
| `subject` | Expected `sub` value |
| `leeway` | Clock-skew tolerance in seconds (`float`) or a `timedelta` |

`decode_complete` takes the same arguments and returns `{"header": ..., "payload": ..., "signature": ...}`, which is how you read `kid` or `typ` after verification:

```python
token = jwt.encode({"sub": "u1"}, SECRET, algorithm="HS256", headers={"kid": "k1", "typ": "at+jwt"})
decoded = jwt.decode_complete(token, SECRET, algorithms=["HS256"])
print(decoded["header"])     # {'alg': 'HS256', 'kid': 'k1', 'typ': 'at+jwt'}
print(decoded["payload"])    # {'sub': 'u1'}
```

`jwt.get_unverified_header(token)` returns the header without verifying anything. Its only legitimate use is picking the verification key (`kid`) before `decode`. Never use its `alg` to choose `algorithms`.

```python
print(jwt.get_unverified_header(token)["kid"])     # k1
```

## Registered Claims and How PyJWT Checks Them

| Claim | Meaning | Check in `decode` | Exception |
|-------|---------|-------------------|-----------|
| `exp` | Expiry | Present and `exp <= now - leeway` means expired (a token is already invalid at the exact second `exp`). Non-numeric value raises `DecodeError` | `ExpiredSignatureError` |
| `nbf` | Not before | `nbf > now + leeway`; non-numeric value raises `DecodeError` | `ImmatureSignatureError` |
| `iat` | Issued at | `iat > now + leeway` (token from the future); non-numeric value | `ImmatureSignatureError`, `InvalidIssuedAtError` |
| `iss` | Issuer | Compared **only if `issuer=` is passed**; exact match (a list of issuers is a membership test); non-string value; claim absent | `InvalidIssuerError`, `MissingRequiredClaimError` |
| `aud` | Audience | See below | `InvalidAudienceError`, `MissingRequiredClaimError` |
| `sub` | Subject | If present it must be a string; must equal `subject=` when passed (since 2.10) | `jwt.exceptions.InvalidSubjectError` |
| `jti` | Token ID | If present it must be a string (since 2.10). PyJWT does not track reuse | `jwt.exceptions.InvalidJTIError` |

Rules that surprise people:

- **Absent claims are skipped.** `exp`, `nbf`, `iat`, `sub` and `jti` are checked only if the token contains them. A token without `exp` never expires unless you add `options={"require": ["exp"]}`.
- **`require` checks presence only**, and a claim set to `null` counts as missing (`MissingRequiredClaimError`, with the claim name in `.claim`). Value checks still come from `verify_*`.
- **`aud`:** if the token has an `aud` and you pass no `audience=`, `decode` raises `InvalidAudienceError`. If you pass `audience=` and the token has none, it raises `MissingRequiredClaimError`. The token's `aud` may be a string or a list; one overlap with `audience` is enough. `options={"strict_aud": True}` demands a single string on both sides with exact equality.
- **`iss`:** passing `issuer=` also makes the claim mandatory. Matching is exact, so `https://a.example` does not accept `https://a.example.evil`.
- **Order of checks:** `require`, then `iat`, `nbf`, `exp`, `iss`, `aud`, `sub`, `jti`; the first failure raises. The signature is verified before any claim check.
- `decode` returns time claims as the integers stored in the token.

### `options`

| Option | Default | Effect |
|--------|---------|--------|
| `verify_signature` | `True` | `False` skips the signature check **and** flips every `verify_*` default below to `False`, `algorithms` is no longer required |
| `require` | `[]` | Claims that must be present |
| `verify_exp`, `verify_nbf`, `verify_iat` | `True` | Time checks |
| `verify_aud`, `verify_iss` | `True` | Audience and issuer checks |
| `verify_sub`, `verify_jti` | `True` | Type and subject checks |
| `strict_aud` | `False` | Single-value audience, exact match |
| `enforce_minimum_key_length` | `False` | Raise `InvalidKeyError` instead of warning for short keys (see [02](./02-algorithms-keys-jwks.md)) |

```python
import time

expired = jwt.encode({"sub": "u1", "exp": int(time.time()) - 60}, SECRET, algorithm="HS256")

try:
    jwt.decode(expired, SECRET, algorithms=["HS256"])
except jwt.ExpiredSignatureError:
    print("expired")                                       # expired

print(jwt.decode(expired, SECRET, algorithms=["HS256"], leeway=120))      # exp is within the leeway
print(jwt.decode(expired, SECRET, algorithms=["HS256"], options={"verify_exp": False}))
```

Disabling a `verify_*` option is a test tool (for example, reading the claims of an expired token). In production code it is a bug waiting to happen.

### `leeway`

`leeway` moves the boundary of `exp` later and of `nbf` and `iat` earlier. It accepts seconds or a `timedelta`. Use 5 to 30 seconds for servers whose clocks drift; a minute or more makes stolen tokens live longer.

```python
claims = jwt.decode(expired, SECRET, algorithms=["HS256"], leeway=timedelta(minutes=2))
```

## The `PyJWT` Object

`jwt.encode`, `jwt.decode` and `jwt.decode_complete` are bound methods of a module-level `jwt.PyJWT()` instance. Create your own instance to set defaults once:

```python
strict = jwt.PyJWT(options={"require": ["exp", "iat", "sub"], "enforce_minimum_key_length": True})

token = strict.encode({"sub": "u1", "iat": 1, "exp": 4102444800}, SECRET, algorithm="HS256")
print(strict.decode(token, SECRET, algorithms=["HS256"]))
```

| Detail | Behaviour |
|--------|-----------|
| Merging | Instance options are merged with defaults; per-call `options` are merged on top, and the instance is not modified |
| `verify_signature=False` in options | The other `verify_*` flags default to `False` unless you set them explicitly |
| Raw (non-JSON) payloads | `jwt.PyJWS().encode(b"raw bytes", key, algorithm="HS256")` signs arbitrary bytes; `PyJWS().decode(...)` returns the bytes |

## Exceptions

```text
PyJWTError
├── InvalidKeyError                    wrong key type/format, empty or short HMAC key (enforced)
├── PyJWKError
│   └── MissingCryptographyError       algorithm needs the cryptography package
├── PyJWKSetError                      JWKS has no usable keys
├── PyJWKClientError                   no matching key, bad JWKS response
│   └── PyJWKClientConnectionError     JWKS endpoint unreachable
└── InvalidTokenError                  base class for every bad token
    ├── DecodeError                    malformed token, missing algorithms=, bad exp type
    │   └── InvalidSignatureError
    ├── ExpiredSignatureError
    ├── ImmatureSignatureError         nbf or iat in the future
    ├── InvalidIssuedAtError
    ├── InvalidAlgorithmError          alg not in algorithms=, or unknown alg
    ├── InvalidAudienceError
    ├── InvalidIssuerError
    ├── InvalidSubjectError
    ├── InvalidJTIError
    └── MissingRequiredClaimError      has a .claim attribute
```

All of these are importable from `jwt` except `InvalidSubjectError`, `InvalidJTIError` and `MissingCryptographyError`, which live in `jwt.exceptions`. Catch `InvalidTokenError` for "the caller sent a bad token", and `PyJWKClientError` separately for key-lookup problems.

### Mapping to HTTP

| Exception | Meaning | Status | Notes |
|-----------|---------|--------|-------|
| Any `InvalidTokenError` subclass | Token is unacceptable | **401** | `WWW-Authenticate: Bearer error="invalid_token"` |
| No credentials / wrong scheme | Not authenticated | **401** | `WWW-Authenticate: Bearer` without an error code |
| Valid token, missing scope or role | Authenticated but not allowed | **403** | Raised by your authorization code, not by PyJWT. RFC 6750 uses `error="insufficient_scope"` |
| `PyJWKClientError` (unknown `kid`, token without `kid`) | Token references a key the IdP does not publish | **401** | Caller-caused |
| `PyJWKClientConnectionError` | JWKS endpoint down or slow | **503** | Server-side; do not blame the caller |
| `InvalidKeyError`, `MissingCryptographyError`, `PyJWKSetError` | Misconfigured keys on the server | **500** | Alert, do not return details |
| Payload fails your Pydantic model | Token is signed but not shaped as expected | **401** | Validate claims with a model after `decode` |

The FastAPI dependency that applies this mapping is in [04](./04-integration-fastapi.md). Keep the response body generic for every 401: `{"detail": "Not authenticated"}`. Log the exception **class name**, never the token or the full message. Some APIs return a distinct code for expiry so clients know to refresh; that leaks nothing, because `exp` is readable in the payload.

```python
def classify(exc: Exception) -> int:
    if isinstance(exc, jwt.PyJWKClientConnectionError):
        return 503
    if isinstance(exc, (jwt.InvalidTokenError, jwt.PyJWKClientError)):
        return 401
    return 500


print(classify(jwt.ExpiredSignatureError()))                # 401
print(classify(jwt.PyJWKClientConnectionError("down")))     # 503
print(classify(jwt.InvalidKeyError("bad key")))             # 500
```

## Quick Rules

1. **`algorithms=[...]` is a list you control**; `get_unverified_header` is for picking a key by `kid`, never an algorithm.
2. **`require` the claims you rely on** (`exp` first); an absent claim is otherwise skipped silently.
3. **Pass `audience=` and `issuer=`** wherever tokens come from a shared identity provider.
4. **Build times with `datetime.now(timezone.utc)`**; a naive `datetime` is treated as UTC.
5. **Keep `leeway` in seconds**, not minutes.
6. **`options={"verify_signature": False}` is for inspection in tests**, never for authentication.
7. **Catch `InvalidTokenError` (401), `PyJWKClientConnectionError` (503) and let key errors surface (500).**
8. **Return one generic 401 body** and log only the exception class.

---
## See also
- [PyJWT — JSON Web Tokens in Python](./index.md)
- [02 Algorithms, Keys & JWKS](./02-algorithms-keys-jwks.md)
- [03 Security Pitfalls & Hardening](./03-security-pitfalls-hardening.md)
- [FastAPI](../fastapi/index.md)
- [Pydantic — Data Validation](../pydantic/index.md)
- [OWASP API Security](../../owasp-api-security/index.md)
