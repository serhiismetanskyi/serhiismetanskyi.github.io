---
date: 2026-09-22
tags:
  - python
  - libraries
  - requests
  - api-testing
---

# Requests — Fundamentals & Methods

## Installation

```bash
uv add requests
```

---

## GET — Read Data

### Basic GET

```python
import requests

r = requests.get("https://api.example.com/users", timeout=(3.05, 10))
r.raise_for_status()  # raises HTTPError on 4xx/5xx
users = r.json()      # parse JSON body into a Python dict/list
```

### Query Parameters

`params=` encodes values into the URL automatically.

```python
# results in: /users?page=2&per_page=25&role=admin
r = requests.get(
    "https://api.example.com/users",
    params={"page": 2, "per_page": 25, "role": "admin"},
    timeout=(3.05, 10),
)
```

For repeated keys use a list of tuples:

```python
# results in: ?tag=python&tag=http&sort=stars
params = [("tag", "python"), ("tag", "http"), ("sort", "stars")]
r = requests.get(url, params=params, timeout=(3.05, 10))
```

---

## POST — Create Data

### JSON Body (most common)

```python
# json= auto-sets Content-Type: application/json and serializes the dict
r = requests.post(
    "https://api.example.com/users",
    json={"name": "Alice", "email": "alice@example.com"},
    timeout=(3.05, 10),
)
created = r.json()
```

### Form Data

```python
# data= sends application/x-www-form-urlencoded (HTML form format)
r = requests.post(
    url,
    data={"username": "alice", "password": "secret"},
    timeout=(3.05, 10),
)
```

### Raw Body

```python
r = requests.post(
    url,
    data=b"raw bytes here",
    headers={"Content-Type": "application/octet-stream"},
    timeout=(3.05, 10),
)
```

---

## PUT / PATCH / DELETE

```python
# PUT replaces the entire resource
r = requests.put(
    url,
    json={"name": "Alice Updated", "email": "a@example.com"},
    timeout=(3.05, 10),
)

# PATCH updates only the provided fields
r = requests.patch(url, json={"email": "new@example.com"}, timeout=(3.05, 10))

# DELETE removes the resource
r = requests.delete(f"https://api.example.com/users/{user_id}", timeout=(3.05, 10))
r.raise_for_status()
```

---

## Headers

### Custom Headers

```python
headers = {
    "Authorization": "Bearer eyJhbGciOi...",
    "Accept": "application/json",
    "X-Request-ID": "abc-123",  # custom tracing header
}
r = requests.get(url, headers=headers, timeout=(3.05, 10))
```

### Reading Response Headers

```python
r.headers["Content-Type"]                          # "application/json; charset=utf-8"
r.headers.get("X-RateLimit-Remaining", "unknown")  # safe access with default
# response headers are case-insensitive: r.headers["content-type"] works too
```

---

## Cookies

```python
# send cookies explicitly
r = requests.get(url, cookies={"session_id": "abc123"}, timeout=(3.05, 10))

# read cookies from response
session_cookie = r.cookies.get("session_id")
```

---

## Sessions — Connection Pooling

A `Session` reuses TCP connections, shares headers and cookies across requests.

```python
import requests

with requests.Session() as s:
    s.headers.update({
        "Authorization": "Bearer TOKEN",
        "Accept": "application/json",
    })

    # both requests reuse the same TCP connection
    users = s.get("https://api.example.com/users", timeout=(3.05, 10))
    users.raise_for_status()

    s.patch(
        f"https://api.example.com/users/{users.json()[0]['id']}",
        json={"role": "admin"},
        timeout=(3.05, 10),
    )
```

| Without Session | With Session |
|-----------------|--------------|
| New TCP + TLS handshake per request | One handshake, reuses connection |
| Headers repeated manually | Set once on session |
| Cookies lost between calls | Cookies persist automatically |

Per-request headers merge with session headers; per-request value wins on conflict.

---

## Response Object

| Attribute | Returns |
|-----------|---------|
| `r.status_code` | `200`, `404`, `500` |
| `r.ok` | `True` if status < 400 |
| `r.json()` | Parsed JSON -> dict/list |
| `r.text` / `r.content` | Body as str / bytes |
| `r.headers` | Case-insensitive dict |
| `r.cookies` | Response cookies |
| `r.url` | Final URL after redirects |
| `r.elapsed` | Round-trip `timedelta` |
| `r.raise_for_status()` | Raises `HTTPError` on 4xx/5xx |

Prefer `r.raise_for_status()` over manual `if r.status_code == ...` checks.
