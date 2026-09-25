---
date: 2026-09-14
tags:
  - python
  - libraries
  - httpx
  - api-testing
---

# HTTPX — Advanced Configuration

## Timeouts (Granular)

Default is 5 seconds. Use `httpx.Timeout(default, connect=..., read=..., write=..., pool=...)` on the client, or override per request with `timeout=` on the call.

**Phases:** `connect` (TCP + TLS handshake), `read` / `write` (time between chunks), `pool` (wait for a pooled connection).

```python
import httpx

client = httpx.Client(timeout=httpx.Timeout(10.0, connect=5.0))
r = client.get("/slow-endpoint", timeout=30.0)
```

---

## Transport & Retries

```python
import httpx

transport = httpx.HTTPTransport(retries=3)  # connection failures only
client = httpx.Client(transport=transport, timeout=10)
```

`retries` covers **connection** failures (DNS, refused, reset), not HTTP status codes. For 429/502/503 use backoff (e.g. `tenacity`):

```python
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=0.5),
    retry=retry_if_exception_type(httpx.HTTPStatusError),
)
def fetch_with_retry(client: httpx.Client, url: str) -> dict:
    r = client.get(url)
    r.raise_for_status()
    return r.json()
```

---

## HTTP/2

Multiplexes requests over one connection (lower latency). Install: `uv add httpx[http2]`. Falls back to HTTP/1.1 if the server lacks HTTP/2.

```python
import httpx

with httpx.Client(http2=True, timeout=10) as client:
    r = client.get("https://api.example.com/users")
    print(r.http_version)  # "HTTP/2" when supported
```

---

## Connection Pool Limits

```python
import httpx

limits = httpx.Limits(max_connections=100, max_keepalive_connections=20)
client = httpx.Client(limits=limits, timeout=10)
```

`max_connections` (default 100) caps simultaneous connections; `max_keepalive_connections` (20) and `keepalive_expiry` (5s) control idle reuse.

---

## Proxy

`httpx.Client(proxy="http://host:8080")` for HTTP proxies. SOCKS5: `proxy="socks5://host:1080"` with `uv add httpx[socks]`.

---

## Authentication

```python
import httpx

client = httpx.Client(auth=("user", "pass"))
client = httpx.Client(auth=httpx.DigestAuth("user", "pass"))
client = httpx.Client(headers={"Authorization": f"Bearer {token}"})
```

### Custom Auth

```python
import httpx


class APIKeyAuth(httpx.Auth):
    def __init__(self, api_key: str) -> None:
        self._key = api_key

    def auth_flow(self, request: httpx.Request):
        request.headers["X-API-Key"] = self._key
        yield request


client = httpx.Client(auth=APIKeyAuth("my-secret-key"))
```

---

## SSL / TLS

Since httpx 0.28, prefer `httpx.SSLContext` for custom CA and client certs; pass `ssl_context=` to the client.

- **Default:** system trust store (`httpx.Client()`).
- **Custom CA / mTLS:** `SSLContext(verify="ca.pem", cert="client.pem")` → `ssl_context=ctx`.
- **Dev only:** `verify=False` — never in production (MITM).

```python
import httpx

ctx = httpx.SSLContext(verify="/path/to/ca.pem", cert="/path/to/client.pem")
client = httpx.Client(ssl_context=ctx)
```

---

## FastAPI Test Client

```python
import httpx
import pytest
import pytest_asyncio
from myapp.main import app


@pytest_asyncio.fixture
async def client():
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac


@pytest.mark.asyncio
async def test_create_user(client: httpx.AsyncClient):
    r = await client.post("/users", json={"name": "Alice", "email": "a@test.com"})
    assert r.status_code == 201
    assert r.json()["name"] == "Alice"
```

---

## Best Practices

1. Use granular `httpx.Timeout()` for production control.
2. Use `HTTPTransport(retries=...)` for transient connection errors only.
3. Use backoff libraries (e.g. `tenacity`) for HTTP-level retries (429/5xx).
4. Tune `httpx.Limits()` to match expected concurrency.
5. Enable `http2=True` for latency-sensitive APIs when servers support it.
6. Use `ASGITransport` for FastAPI/async app tests (in-process, no real network).
7. Use `httpx.SSLContext` for custom CA and mutual TLS.
8. Prefer a custom `Auth` subclass for reusable non-basic schemes.
9. Never `verify=False` outside local/dev.
