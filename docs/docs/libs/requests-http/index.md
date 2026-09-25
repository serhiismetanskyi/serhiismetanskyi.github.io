---
date: 2026-09-22
tags:
  - python
  - libraries
  - requests
  - api-testing
---

# Requests — Python HTTP Client

Standard synchronous HTTP client for Python. Simple API, connection pooling, auth, retries.

> For async or HTTP/2, use `httpx` — same API style, adds `async/await` and multiplexing.

## When to Use What

| Library | Best for |
|---------|----------|
| `requests` | Scripts, CLI tools, sync apps, low-concurrency API calls |
| `httpx` | FastAPI test clients, async apps, HTTP/2, high-concurrency |
| `aiohttp` | Async-first apps, WebSocket clients, custom event loops |

## Section Map

| File | Topics |
|------|--------|
| [01 Fundamentals & Methods](./01-fundamentals-methods.md) | GET/POST/PUT/PATCH/DELETE, params, headers, cookies, sessions, response |
| [02 Advanced Patterns](./02-advanced-patterns.md) | Auth, retries, timeouts, streaming, uploads, proxies, error handling |

## Cheat Sheet

### HTTP Methods

| Method | Code | Use case |
|--------|------|----------|
| GET | `requests.get(url, params={"q": "test"})` | Read / search |
| POST | `requests.post(url, json={"name": "a"})` | Create |
| PUT | `requests.put(url, json=data)` | Full replace |
| PATCH | `requests.patch(url, json=partial)` | Partial update |
| DELETE | `requests.delete(url)` | Remove |
| HEAD | `requests.head(url)` | Headers only |

### Response Object

| Attribute | Returns |
|-----------|---------|
| `r.status_code` | `200`, `404`, `500` |
| `r.ok` | `True` if status < 400 |
| `r.json()` | Parsed JSON -> `dict` / `list` |
| `r.text` | Body as `str` (decoded) |
| `r.content` | Body as `bytes` (raw) |
| `r.headers` | Response headers (case-insensitive dict) |
| `r.url` | Final URL after redirects |
| `r.elapsed` | `timedelta` of round-trip time |
| `r.raise_for_status()` | Raises `HTTPError` if 4xx/5xx |

### Session (Connection Pooling)

```python
import requests

# Session reuses TCP connection and shares headers across calls
with requests.Session() as s:
    s.headers.update({"Authorization": "Bearer TOKEN"})
    r = s.get("https://api.example.com/users", timeout=(3.05, 10))
    r.raise_for_status()
```

### Timeout + Retry

```python
from urllib3.util.retry import Retry
from requests.adapters import HTTPAdapter

# retry on transient server errors with exponential backoff
retry = Retry(total=3, backoff_factor=0.5, status_forcelist=[502, 503, 504])
adapter = HTTPAdapter(max_retries=retry)

with requests.Session() as s:
    s.mount("https://", adapter)  # attach retry logic to all HTTPS calls
    s.mount("http://", adapter)
    r = s.get("https://api.example.com/data", timeout=(3.05, 10))
```

### Auth

```python
from requests.auth import HTTPBasicAuth

# basic auth — two equivalent forms
requests.get(url, auth=HTTPBasicAuth("user", "pass"), timeout=(3.05, 10))
requests.get(url, auth=("user", "pass"), timeout=(3.05, 10))  # shortcut

# bearer token via header
requests.get(url, headers={"Authorization": "Bearer TOKEN"}, timeout=(3.05, 10))
```

### File Upload

```python
# always open in binary mode ("rb") for uploads
with open("report.pdf", "rb") as f:
    requests.post(url, files={"file": ("report.pdf", f, "application/pdf")}, timeout=(3.05, 30))
```

### Quick Rules

1. **Always set timeout** — `timeout=(connect, read)` prevents hangs.
2. **Use Session** for multiple calls to the same host — reuses TCP connections.
3. **Use `json=`** instead of `data=json.dumps(...)` — auto-sets Content-Type.
4. **Call `r.raise_for_status()`** — fail fast instead of silent 4xx/5xx.
5. **Use Retry adapter** — transient 502/503/504 happen; retry with backoff.
6. **Stream large responses** — `stream=True` + `iter_content()` to avoid OOM.
7. **Never `verify=False`** in production — security risk.

---
## See also
- [Digital Garden: Knowledge Base](../../index.md)
- [Python Guide for Automation QA](../../python-guide/index.md)
- [Test Automation Framework](../../test-automation-framework/index.md)
- [CI/CD](../../ci-cd-approaches/index.md)
- [Tools — Practical Reference Guides](../../tools/index.md)
- [Python Libraries](../index.md)

