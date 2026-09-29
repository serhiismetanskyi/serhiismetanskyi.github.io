---
date: 2026-09-13
tags:
  - python
  - libraries
  - httpx
  - api-testing
---

# HTTPX — Modern Python HTTP Client

Async-capable HTTP client with full sync support. Drop-in `requests` replacement with HTTP/2, type hints, and granular timeouts.

## Installation

```bash
uv add httpx
uv add httpx[http2]   # enable HTTP/2 support
```

## When to Use What

| Library | Best for |
|---------|----------|
| `requests` | Scripts, CLI tools, simple sync calls |
| `httpx` | FastAPI test clients, async apps, HTTP/2, high-concurrency |
| `aiohttp` | WebSocket clients, custom event loops, async-first legacy |

## Section Map

| File | Topics |
|------|--------|
| [01 Fundamentals](./01-fundamentals.md) | Client, methods, params, headers, cookies, response, errors |
| [02 Async Patterns](./02-async-patterns.md) | AsyncClient, concurrency, streaming, event hooks |
| [03 Advanced Config](./03-advanced-config.md) | Timeouts, retries, proxy, auth, HTTP/2, SSL, pool limits, FastAPI testing |

## Cheat Sheet

### HTTP Methods

```python
import httpx

# one-off requests (new connection each time — prefer Client for multiple)
r = httpx.get(url, params={"q": "test"}, timeout=10)
r = httpx.post(url, json={"name": "Alice"}, timeout=10)
r = httpx.put(url, json=data, timeout=10)
r = httpx.patch(url, json=partial, timeout=10)
r = httpx.delete(url, timeout=10)
```

### Client (Connection Pooling)

```python
import httpx

# sync client — reuses TCP connections, shares headers
with httpx.Client(base_url="https://api.example.com", timeout=10) as client:
    client.headers["Authorization"] = f"Bearer {token}"
    users = client.get("/users").raise_for_status().json()
    client.post("/users", json={"name": "Bob"}).raise_for_status()
```

### Async Client

```python
import httpx

async with httpx.AsyncClient(base_url="https://api.example.com", timeout=10) as client:
    resp = await client.get("/users")
    resp.raise_for_status()
    users = resp.json()
```

### Response Object

| Attribute | Returns |
|-----------|---------|
| `r.status_code` | `200`, `404`, `500` |
| `r.json()` | Parsed JSON |
| `r.text` | Body as `str` |
| `r.content` | Body as `bytes` |
| `r.headers` | Case-insensitive dict |
| `r.cookies` | Response cookies |
| `r.url` | Final URL after redirects |
| `r.elapsed` | Round-trip `timedelta` |
| `r.http_version` | `"HTTP/1.1"` or `"HTTP/2"` |
| `r.raise_for_status()` | Raises `HTTPStatusError` on 4xx/5xx |
| `r.is_success` | `True` if 2xx |
| `r.is_redirect` | `True` if 3xx |

### Timeout (Granular)

```python
# separate connect / read / write / pool timeouts
timeout = httpx.Timeout(10.0, connect=5.0)
client = httpx.Client(timeout=timeout)
```

### Quick Rules

1. **Use `Client` / `AsyncClient`** — connection pooling, shared config.
2. **Always set timeout** — httpx defaults to 5s, but be explicit.
3. **Use `json=`** instead of manual serialization.
4. **Call `raise_for_status()`** — fail fast on errors.
5. **Prefer async for I/O-bound workloads** — `AsyncClient` + `asyncio.gather`.
6. **Enable HTTP/2** where supported — `httpx.Client(http2=True)`.
7. **Use event hooks** for logging/metrics — not manual wrappers.

---
## See also
- [Digital Garden: Knowledge Base](../../index.md)
- [Python Guide for Automation QA](../../python-guide/index.md)
- [Test Automation Framework](../../test-automation-framework/index.md)
- [CI/CD](../../ci-cd-approaches/index.md)
- [Tools — Practical Reference Guides](../../tools/index.md)
- [Python Libraries](../index.md)
