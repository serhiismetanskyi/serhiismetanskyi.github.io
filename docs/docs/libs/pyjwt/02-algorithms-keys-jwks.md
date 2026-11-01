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

# PyJWT — Algorithms, Keys & JWKS

Which signing algorithm to pick, how keys are formatted and generated, how to verify tokens from an identity provider through its JWKS endpoint, and how `kid` and key rotation work. Requires `uv add "pyjwt[crypto]"` for everything except HS256/384/512.

## Choosing an Algorithm

| `alg` | Family | Key | Signature (base64url chars) | Use when |
|-------|--------|-----|-----------------------------|----------|
| `HS256` / `HS384` / `HS512` | HMAC, symmetric | One shared secret | 43 / 64 / 86 | Issuer and verifier are the same service or trust each other completely |
| `RS256` / `RS384` / `RS512` | RSA PKCS#1 v1.5 | RSA key pair, 2048 bits or more | 342 (2048-bit key) | Widest interoperability: most identity providers sign with RS256 |
| `PS256` / `PS384` / `PS512` | RSA-PSS | RSA key pair | same as RS* | RSA required, probabilistic padding preferred |
| `ES256` / `ES384` / `ES512` | ECDSA P-256 / P-384 / P-521 | EC key pair | 86 / 128 / 176 | Short tokens, small keys; the curve must match the algorithm |
| `EdDSA` | Ed25519 (Ed448 keys also accepted) | Ed25519 key pair | 86 | Modern default for new systems you control on both ends |
| `none` | Unsigned | `None` | empty | Never accept it; used only to build negative tests |

Also registered: `ES256K` (secp256k1) and `ES521` (same curve and hash as `ES512`). `jwt.PyJWS().get_algorithms()` lists everything the installed build supports. Without the `cryptography` package that list contains only `HS256`, `HS384`, `HS512` and `none`.

Decision rules:

- **Other services verify your tokens** → asymmetric. Only the issuer holds the private key; verifiers get the public key (or a JWKS URL) and cannot mint tokens.
- **One service issues and verifies** → HS256 is acceptable with a 32-byte or longer random secret, but anyone able to verify can also forge.
- **You consume an identity provider** → use whatever it publishes (usually RS256, sometimes ES256) and pin it with `algorithms=[...]`.
- **Greenfield, both ends yours** → EdDSA or ES256. If a partner library lacks EdDSA, use ES256 or RS256.

Without `cryptography`, asymmetric operations fail clearly: `encode` raises `NotImplementedError` ("Do you have cryptography installed?"), `decode` raises `InvalidAlgorithmError`, and `PyJWK` raises `MissingCryptographyError`.

## Generating Keys

Generate throwaway keys with `cryptography`; never commit real keys.

```python
import jwt
from cryptography.hazmat.primitives import serialization as ser
from cryptography.hazmat.primitives.asymmetric import ec, ed25519, rsa

rsa_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
ec_key = ec.generate_private_key(ec.SECP256R1())          # ES256
ed_key = ed25519.Ed25519PrivateKey.generate()             # EdDSA


def private_pem(key) -> bytes:
    return key.private_bytes(ser.Encoding.PEM, ser.PrivateFormat.PKCS8, ser.NoEncryption())


def public_pem(key) -> bytes:
    return key.public_key().public_bytes(ser.Encoding.PEM, ser.PublicFormat.SubjectPublicKeyInfo)


for alg, key in [("RS256", rsa_key), ("PS256", rsa_key), ("ES256", ec_key), ("EdDSA", ed_key)]:
    token = jwt.encode({"sub": "u1"}, private_pem(key), algorithm=alg)
    print(alg, jwt.decode(token, public_pem(key), algorithms=[alg]))
```

Command-line equivalent for RSA:

```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```

### Accepted key forms

| Form | Sign | Verify |
|------|------|--------|
| PEM private key, PKCS#8 (PEM header without `RSA`) | yes | n/a |
| PEM private key, PKCS#1 (PEM header with `RSA`) | yes | n/a |
| PEM public key, SPKI (`BEGIN PUBLIC KEY`) | n/a | yes |
| PEM public key, PKCS#1 (`BEGIN RSA PUBLIC KEY`) | n/a | yes |
| OpenSSH `ssh-rsa ...` public key | n/a | yes |
| `cryptography` key object | yes | yes |
| `PyJWK` | yes (private JWK) | yes |
| DER bytes, X.509 certificate PEM, encrypted PEM | no: load with `cryptography` first | no: load with `cryptography` first |

```python
from cryptography import x509
from cryptography.hazmat.primitives.serialization import load_der_public_key, load_pem_private_key

private_key = load_pem_private_key(open("private.pem", "rb").read(), password=b"passphrase")
public_key = x509.load_pem_x509_certificate(open("cert.pem", "rb").read()).public_key()
public_key = load_der_public_key(open("public.der", "rb").read())
```

Pass the resulting key objects straight to `encode` / `decode`. An EC key whose curve does not match the algorithm (a P-384 key with `ES256`) raises `InvalidKeyError`.

## JWK, `PyJWK` and `PyJWKSet`

A JWK is a key as JSON (RFC 7517); a JWKS is `{"keys": [...]}`.

```python
import json

from jwt.algorithms import RSAAlgorithm

jwk = json.loads(RSAAlgorithm.to_jwk(rsa_key.public_key()))
jwk.update(kid="2026-10", use="sig", alg="RS256")
print(sorted(jwk))                     # ['alg', 'e', 'key_ops', 'kid', 'kty', 'n', 'use']

key = jwt.PyJWK.from_dict(jwk)         # also PyJWK.from_json(str)
print(key.key_id, key.key_type, key.algorithm_name, key.public_key_use)    # 2026-10 RSA RS256 sig

token = jwt.encode({"sub": "u1"}, private_pem(rsa_key), algorithm="RS256", headers={"kid": "2026-10"})
print(jwt.decode(token, key, algorithms=["RS256"]))      # a PyJWK can be passed as the key

jwks = jwt.PyJWKSet.from_dict({"keys": [jwk]})
print(jwks["2026-10"].key_id, [k.key_id for k in jwks])  # lookup by kid, iterable
```

| Class / helper | Purpose |
|----------------|---------|
| `PyJWK(jwk_dict, algorithm=None)` | Wraps one JWK. `.key` is the `cryptography` key (or HMAC bytes), `.algorithm_name`, `.key_id`, `.key_type`, `.public_key_use` |
| `PyJWKSet(keys)` / `.from_dict` / `.from_json` | A set; `jwks[kid]` raises `KeyError`, iteration yields `PyJWK`. Unusable members are skipped; none usable raises `PyJWKSetError` |
| `RSAAlgorithm.to_jwk(key, as_dict=False)`, `ECAlgorithm.to_jwk`, `OKPAlgorithm.to_jwk`, `HMACAlgorithm.to_jwk` | Export a key as JWK (JSON string, or dict with `as_dict=True`) |
| `*.from_jwk(jwk)` | Import a JWK into a key object |

If a JWK has no `alg`, PyJWT infers it from `kty` (and `crv`):

| `kty` / `crv` | Inferred `alg` |
|---------------|----------------|
| `RSA` | `RS256` |
| `EC` P-256 / P-384 / P-521 / secp256k1 | `ES256` / `ES384` / `ES512` / `ES256K` |
| `OKP` Ed25519 | `EdDSA` |
| `oct` | `HS256` |

A PS256 key therefore needs `"alg": "PS256"` in the JWK (or `PyJWK(jwk, algorithm="PS256")`). A `PyJWK` is bound to its algorithm: a token whose header `alg` differs raises `InvalidAlgorithmError`, even if you did not pass `algorithms=`.

## `PyJWKClient`

`PyJWKClient` downloads a JWKS over HTTP(S) and returns the key that matches a token's `kid`.

```python
import jwt

jwks_client = jwt.PyJWKClient("https://idp.example.test/.well-known/jwks.json", lifespan=3600, timeout=5)


def verify(token: str) -> dict:
    signing_key = jwks_client.get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key,
        algorithms=["RS256"],
        audience="orders-api",
        issuer="https://idp.example.test/",
        options={"require": ["exp", "iss", "aud", "sub"]},
    )
```

| Constructor argument | Default | Meaning |
|----------------------|---------|---------|
| `uri` | required | JWKS URL; only `http` and `https` are accepted (`PyJWKClientError` otherwise) |
| `cache_jwk_set` | `True` | Cache the whole JWKS (tier 1) |
| `lifespan` | `300` | Seconds the cached JWKS stays valid; must be greater than 0 |
| `cache_keys` | `False` | Also keep an LRU cache of individual keys by `kid` (tier 2) |
| `max_cached_keys` | `16` | Size of that LRU cache |
| `cooldown_duration` | `30` | Minimum seconds between forced refreshes caused by an unknown `kid`; `0` disables the cooldown |
| `timeout` | `30` | HTTP timeout in seconds |
| `headers` | `None` | Extra request headers |
| `ssl_context` | `None` | Custom `ssl.SSLContext` (private CA, mTLS) |

Methods: `get_signing_key_from_jwt(token)`, `get_signing_key(kid)`, `get_signing_keys(refresh=False)`, `get_jwk_set(refresh=False)`, `fetch_data()` (the HTTP call; override it in tests).

How the lookup behaves:

1. `get_signing_key_from_jwt` reads `kid` from the unverified header and calls `get_signing_key(kid)`.
2. The JWKS comes from the tier-1 cache; it is fetched when empty or older than `lifespan`.
3. Only keys with `use` equal to `sig` (or no `use`) **and** a `kid` are candidates.
4. If the `kid` is not found, the JWKS is re-fetched **once**, unless a successful fetch happened less than `cooldown_duration` seconds ago. Then `PyJWKClientError` (`Unable to find a signing key that matches ...`) is raised. A freshly rotated key may therefore wait up to the cooldown before it is picked up.
5. A failed fetch keeps the previously cached JWKS; the cache is not wiped by an outage.

| Failure | Exception |
|---------|-----------|
| Token has no `kid`, or `kid` not in the JWKS | `PyJWKClientError` |
| Malformed token | `DecodeError` |
| Endpoint unreachable, HTTP error, timeout | `PyJWKClientConnectionError` |
| Response is not a JSON object | `PyJWKClientError` |
| JWKS has no usable keys | `PyJWKSetError` |

Operational notes:

- **Create one client per process** (module level or application state). A client per request defeats the cache and hammers the IdP.
- **`cache_keys=True` never expires keys** by time: a key removed from the JWKS stays trusted until evicted from the LRU. Leave it off unless profiling shows key parsing matters.
- **The client is synchronous** (`urllib`). In an async app call it from a threadpool (`def` dependencies in FastAPI, or `await asyncio.to_thread(...)`).
- **Redirects are refused** and the URL scheme is restricted, so a poisoned JWKS URL cannot bounce the client to `file://` or an internal host. Take the URL from configuration or the discovery document, never from a token header.
- `lifespan` is also your **revocation delay for keys**: a key retired at the IdP stays valid in your cache until it expires or you call `get_signing_keys(refresh=True)`.

## `kid` and Key Rotation

`kid` tells the verifier which key signed the token. The issuer publishes several public keys at once so rotation does not invalidate live tokens.

| Step | Issuer | Verifier |
|------|--------|----------|
| 1 | Generate key B, publish A and B in the JWKS | Picks B up on the first unknown `kid` (after the cooldown) |
| 2 | Start signing with B (`kid` = B) | Verifies A-signed and B-signed tokens |
| 3 | Wait for the longest token lifetime (refresh tokens included) plus the verifiers' `lifespan` | Old A-signed tokens expire |
| 4 | Remove A from the JWKS | Cache drops A at the next refresh |

Rules: `kid` values are unique and never reused; the signing code sets `headers={"kid": ...}`; the verifier treats `kid` as an opaque lookup string (see [03](./03-security-pitfalls-hardening.md)). Local rotation tests are in [06](./06-testing-jwks-ci.md); a service that verifies through `PyJWKClient` is in [04](./04-integration-fastapi.md).

## Verifying Identity-Provider Tokens

Most providers expose OpenID Connect discovery at `{issuer}/.well-known/openid-configuration`; its `jwks_uri` field is the JWKS URL. Prefer discovery to a hard-coded URL.

| Provider style | Typical JWKS URL shape |
|----------------|------------------------|
| Auth0-style | `https://{tenant}.{region}.auth0.com/.well-known/jwks.json` |
| Amazon Cognito | `https://cognito-idp.{region}.amazonaws.com/{userPoolId}/.well-known/jwks.json` |
| Keycloak | `https://{host}/realms/{realm}/protocol/openid-connect/certs` |
| Microsoft Entra ID | `https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys` |

```python
import httpx
import jwt


def discover_jwks_uri(issuer: str) -> str:
    url = issuer.rstrip("/") + "/.well-known/openid-configuration"
    doc = httpx.get(url, timeout=5).raise_for_status().json()
    if doc["issuer"] != issuer:                      # OIDC Discovery: must match exactly
        raise ValueError("issuer mismatch in discovery document")
    return doc["jwks_uri"]


class IdPVerifier:
    def __init__(self, issuer: str, audience: str, algorithms=("RS256",)) -> None:
        self.issuer, self.audience, self.algorithms = issuer, audience, list(algorithms)
        self.jwks = jwt.PyJWKClient(discover_jwks_uri(issuer), lifespan=3600, timeout=5)

    def verify(self, token: str) -> dict:
        key = self.jwks.get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            key,
            algorithms=self.algorithms,
            audience=self.audience,
            issuer=self.issuer,
            leeway=30,
            options={"require": ["exp", "iss", "aud", "sub"]},
        )
```

Set `issuer` to the exact string the provider puts in `iss` (trailing slash included) and `audience` to the value it puts in `aud` for your API. A mismatch in either gives `InvalidIssuerError` / `InvalidAudienceError`. Build `IdPVerifier` once at startup and share it.

## Symmetric vs Asymmetric

| Aspect | HS256 | RS256 / ES256 / EdDSA |
|--------|-------|-----------------------|
| Who can verify | Anyone with the secret, who can therefore also sign | Anyone with the public key; only the issuer can sign |
| Distribution | Secret must reach every verifier | Public key or JWKS URL can be public |
| Rotation | Redeploy secrets everywhere | Publish a new `kid` in the JWKS |
| Speed | Fastest | Slower to sign, especially RSA; verification is fast |
| Token size | Smallest | RS256 adds about 300 characters; ES256 and EdDSA add about 40 |
| Failure mode | Leaked secret forges tokens | Leaked private key forges tokens; public key leak is harmless |

### Key length warnings

| Key | Minimum | Below the minimum |
|-----|---------|-------------------|
| HS256 / HS384 / HS512 | 32 / 48 / 64 bytes (hash output size) | `InsecureKeyLengthWarning` on `encode` and `decode` |
| RSA | 2048 bits | `InsecureKeyLengthWarning` |
| Empty HMAC key | none allowed | `InvalidKeyError` |

Set `options={"enforce_minimum_key_length": True}` (or `jwt.PyJWT(options=...)`) to raise `InvalidKeyError` instead of warning. In a test suite turn the warning into a failure:

```ini
# pytest.ini
[pytest]
filterwarnings =
    error::jwt.warnings.InsecureKeyLengthWarning
```

Generate HMAC secrets with `secrets.token_bytes(32)` (or 64 for HS512), not a human-chosen string.

## Custom Algorithms

`jwt.register_algorithm("NAME", AlgorithmSubclass())` adds an algorithm (implement `prepare_key`, `sign`, `verify`, `to_jwk`, `from_jwk` from `jwt.algorithms.Algorithm`); registering an existing name raises `ValueError`, and `jwt.unregister_algorithm("NAME")` removes it. Use it for tests that need a deliberately broken or exotic algorithm, not to add production crypto.

## Quick Rules

1. **Install `pyjwt[crypto]`** for anything but HS*; check `get_algorithms()` if an algorithm is "not supported".
2. **Asymmetric keys when verifiers are separate from the issuer**; HS256 only inside one trust boundary.
3. **HMAC secrets of at least 32 bytes** (48 for HS384, 64 for HS512), random, from a secret store. Treat `InsecureKeyLengthWarning` as an error in tests.
4. **Pin the algorithm** to what the key is for: `algorithms=["RS256"]` with an RSA key, never a mixed HS/RS list.
5. **One `PyJWKClient` per process**, `timeout` set, `lifespan` chosen as your key-retirement delay; keep `cache_keys` off by default.
6. **Take the JWKS URL from config or OIDC discovery**, never from the token.
7. **Rotate with overlap**: publish the new `kid`, switch signing, retire the old key after the longest token lifetime plus verifier cache `lifespan`.
8. **Match `issuer` and `audience` exactly** to what the identity provider issues.

---
## See also
- [PyJWT — JSON Web Tokens in Python](./index.md)
- [01 Encode, Decode & Claims](./01-encode-decode-claims.md)
- [03 Security Pitfalls & Hardening](./03-security-pitfalls-hardening.md)
- [04 FastAPI Integration & Token Service](./04-integration-fastapi.md)
- [06 Testing: JWKS Rotation, Smoke Tests & CI](./06-testing-jwks-ci.md)
- [HTTPX — Modern Python HTTP Client](../httpx/index.md)
- [OWASP API Security](../../owasp-api-security/index.md)
- [Auth, Config & Security Headers](../../code-security/04-auth-config-headers.md)
