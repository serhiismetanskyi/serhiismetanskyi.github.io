---
date: 2026-09-14
tags:
  - python
  - libraries
  - httpx
  - api-testing
---

# HTTPX — Fundamentals

## Client vs Module-Level Functions

```python
import httpx

# module-level: new connection per request (fine for one-off scripts)
r = httpx.get("https://api.example.com/users", timeout=10)

# Client: reuses connections, shares config (use for multiple requests)
with httpx.Client(base_url="https://api.example.com", timeout=10) as client:
    r = client.get("/users")
```

Always prefer `Client` for production code — connection pooling, shared headers, cookies.

---

## GET — Read Data

```python
import httpx

with httpx.Client(timeout=10) as client:
    # basic GET
    r = client.get("https://api.example.com/users")
    r.raise_for_status()
    users = r.json()

    # query parameters — encoded automatically
    r = client.get("https://api.example.com/users", params={
        "page": 2,
        "per_page": 25,
        "role": "admin",
    })

    # repeated keys
    r = client.get(url, params=[("tag", "python"), ("tag", "http")])
```

---

## POST — Create Data

```python
# JSON body (most common) — auto-sets Content-Type
r = client.post("/users", json={"name": "Alice", "email": "alice@example.com"})

# form data — application/x-www-form-urlencoded
r = client.post("/login", data={"username": "alice", "password": "secret"})

# raw binary
r = client.post("/upload", content=b"raw bytes", headers={"Content-Type": "application/octet-stream"})
```

Note: httpx uses `content=` for raw bytes (not `data=b"..."` like requests).

---

## PUT / PATCH / DELETE

```python
# PUT replaces the entire resource
r = client.put(f"/users/{user_id}", json={"name": "Updated", "email": "a@test.com"})

# PATCH updates only provided fields
r = client.patch(f"/users/{user_id}", json={"role": "admin"})

# DELETE removes the resource
r = client.delete(f"/users/{user_id}")
r.raise_for_status()
```

---

## Headers

```python
# set on client — shared across all requests
with httpx.Client(headers={
    "Authorization": f"Bearer {token}",
    "Accept": "application/json",
}) as client:
    r = client.get("/me")

# per-request override (merges with client headers)
r = client.get("/admin", headers={"X-Request-ID": "abc-123"})

# read response headers (case-insensitive)
content_type = r.headers["content-type"]
rate_limit = r.headers.get("x-ratelimit-remaining")
```

---

## Cookies

```python
# send cookies explicitly
r = client.get(url, cookies={"session_id": "abc123"})

# read from response
session = r.cookies.get("session_id")

# Client auto-persists cookies across requests (like a browser)
with httpx.Client() as client:
    client.get("https://example.com/login")   # sets cookie
    client.get("https://example.com/profile")  # cookie sent automatically
```

---

## Response Object

```python
r = client.get("/users/1")

r.status_code         # 200
r.is_success          # True (2xx) — httpx-specific
r.is_client_error     # True (4xx)
r.is_server_error     # True (5xx)
r.json()              # parsed JSON body
r.text                # decoded string
r.content             # raw bytes
r.headers             # case-insensitive headers
r.url                 # final URL after redirects
r.elapsed             # round-trip timedelta
r.http_version        # "HTTP/1.1" or "HTTP/2"
r.raise_for_status()  # raises HTTPStatusError on 4xx/5xx
```

Note: httpx does **not** follow redirects by default — use `follow_redirects=True` on client or per-request.

---

## Error Handling

| Exception | Trigger |
|-----------|---------|
| `httpx.HTTPError` | Base class for all errors |
| `httpx.RequestError` | Network failure (DNS, connection, timeout) |
| `httpx.TimeoutException` | Any timeout exceeded |
| `httpx.ConnectTimeout` | Connect phase timeout |
| `httpx.ReadTimeout` | Read phase timeout |
| `httpx.WriteTimeout` | Write phase timeout |
| `httpx.PoolTimeout` | No connection available in pool |
| `httpx.HTTPStatusError` | Raised by `raise_for_status()` on 4xx/5xx |

### Robust Pattern

```python
import logging

import httpx

log = logging.getLogger(__name__)


def fetch_user(user_id: str, client: httpx.Client) -> dict:
    url = f"/users/{user_id}"
    try:
        r = client.get(url)
        r.raise_for_status()
        return r.json()
    except httpx.TimeoutException:
        log.error("Timeout: %s", url)
        raise
    except httpx.RequestError as exc:
        # DNS failure, connection refused, network unreachable
        log.error("Request failed: %s — %s", url, exc)
        raise
    except httpx.HTTPStatusError as exc:
        log.error("HTTP %s: %s", exc.response.status_code, url)
        raise
```

---

## File Uploads

```python
with open("report.pdf", "rb") as f:
    r = client.post("/upload", files={"file": ("report.pdf", f, "application/pdf")})

with open("photo.jpg", "rb") as f:  # file + form fields
    r = client.post("/upload", data={"title": "My Photo"}, files={"file": f})
```

## Key Differences from `requests`

| Feature | `requests` | `httpx` |
|---------|-----------|--------|
| Async | No | `AsyncClient` |
| HTTP/2 | No | `http2=True` |
| Redirects | Auto-follow | Explicit opt-in |
| Raw body | `data=b"..."` | `content=b"..."` |
| Timeout default | None | 5 seconds |
| Type hints | Partial | Full |
