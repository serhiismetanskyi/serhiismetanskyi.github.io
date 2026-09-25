---
date: 2026-09-22
tags:
  - python
  - libraries
  - requests
  - api-testing
---

# Requests — Advanced Patterns & Best Practices

## Authentication

### Basic Auth

```python
import requests
from requests.auth import HTTPBasicAuth

# two equivalent forms
r = requests.get(url, auth=HTTPBasicAuth("user", "pass"), timeout=(3.05, 10))
r = requests.get(url, auth=("user", "pass"), timeout=(3.05, 10))  # shortcut
```

### Bearer Token

```python
import requests

# set token once on session — reused for all subsequent calls
with requests.Session() as s:
    s.headers["Authorization"] = f"Bearer {access_token}"
    r = s.get("https://api.example.com/me", timeout=(3.05, 10))
    r.raise_for_status()
```

### Custom Auth Class

```python
import requests
from requests.auth import AuthBase


class APIKeyAuth(AuthBase):
    def __init__(self, api_key: str) -> None:
        self._key = api_key

    def __call__(self, r: requests.PreparedRequest) -> requests.PreparedRequest:
        r.headers["X-API-Key"] = self._key
        return r

r = requests.get(url, auth=APIKeyAuth("my-secret-key"), timeout=(3.05, 10))
```

---

## Timeouts

**Always set timeouts.** Without them, a stalled server blocks your process forever.

```python
r = requests.get(url, timeout=10)           # 10s for both connect and read
r = requests.get(url, timeout=(3.05, 10))   # 3.05s connect, 10s read (recommended)
```

| Param | Meaning |
|-------|---------|
| `timeout=N` | Single value — applies to both connect and read |
| `timeout=(connect, read)` | Tuple — separate limits |
| No timeout | **Dangerous** — can hang indefinitely |

---

## Retries with Backoff

```python
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

retry_strategy = Retry(
    total=3,                                   # max retry attempts
    backoff_factor=0.5,                        # delays: 0.5s, 1s, 2s
    status_forcelist=[429, 502, 503, 504],     # retry on these statuses
    allowed_methods=["GET", "PUT", "DELETE"],   # exclude POST to avoid duplicates
    raise_on_status=False,
)
adapter = HTTPAdapter(max_retries=retry_strategy)

with requests.Session() as s:
    s.mount("https://", adapter)  # attach retry to all HTTPS requests
    s.mount("http://", adapter)
    r = s.get("https://api.example.com/data", timeout=(3.05, 10))
```

`backoff_factor` calculates delay as `factor * 2^(attempt-1)`. Exclude POST from `allowed_methods` to prevent duplicate side effects.

---

## Error Handling

### Exception Hierarchy

| Exception | Trigger |
|-----------|---------|
| `RequestException` | Base class (catch-all) |
| `ConnectionError` | DNS failure, refused, reset |
| `Timeout` (`ConnectTimeout` / `ReadTimeout`) | Exceeded connect or read limit |
| `HTTPError` | Raised by `raise_for_status()` |
| `TooManyRedirects` | Redirect loop |

### Robust Pattern

```python
import logging

import requests

log = logging.getLogger(__name__)


def fetch_user(user_id: str, base_url: str, session: requests.Session) -> dict:
    url = f"{base_url}/users/{user_id}"
    try:
        r = session.get(url, timeout=(3.05, 10))
        r.raise_for_status()
        return r.json()
    except requests.exceptions.Timeout:
        log.error("Timeout reaching %s", url)
        raise
    except requests.exceptions.ConnectionError:
        # DNS failure, refused connection, network unreachable
        log.error("Connection failed: %s", url)
        raise
    except requests.exceptions.HTTPError as exc:
        # guard: exc.response can be None for some edge cases
        status = exc.response.status_code if exc.response is not None else "unknown"
        log.error("HTTP %s from %s", status, url)
        raise
```

---

## File Uploads

### Single File

```python
# open in binary mode ("rb") — requests reads and sends the bytes
with open("report.pdf", "rb") as f:
    r = requests.post(
        url,
        files={"file": ("report.pdf", f, "application/pdf")},
        timeout=(3.05, 30),  # longer read timeout for large uploads
    )
```

### Multiple Files + Form Fields

```python
with open("a.png", "rb") as fa, open("b.png", "rb") as fb:
    files = [("files", ("a.png", fa, "image/png")), ("files", ("b.png", fb, "image/png"))]
    r = requests.post(url, data={"description": "Batch"}, files=files, timeout=(3.05, 30))
```

---

## Streaming — Large Responses

```python
# stream=True defers body download until iter_content/iter_lines
with requests.get(url, stream=True, timeout=30) as r:
    r.raise_for_status()
    with open("large_file.zip", "wb") as f:
        for chunk in r.iter_content(chunk_size=8192):
            f.write(chunk)
```

For line-by-line text (NDJSON, logs): `r.iter_lines(decode_unicode=True)`.

---

## SSL / TLS & Proxies

| Option | Example |
|--------|---------|
| Verify CA (default) | `verify=True` |
| Custom CA bundle | `verify="/path/to/ca.pem"` |
| Mutual TLS | `cert=("/path/client.cert", "/path/client.key")` |
| Proxy | `proxies={"https": "http://proxy:8080"}` |

**Never `verify=False` in production** — MITM risk.

---

## Best Practices Summary

| Practice | Why |
|----------|-----|
| Always `timeout=(connect, read)` | Prevents indefinite hangs |
| Use `Session` for repeated calls | TCP reuse, shared auth/headers |
| Use `json=`, not `data=json.dumps()` | Auto Content-Type, cleaner |
| `r.raise_for_status()` after every call | Fail fast on 4xx/5xx |
| `Retry` adapter with backoff | Handles transient 502/503/504 |
| `stream=True` for large files | Avoids OOM |
| Never `verify=False` in production | Prevents MITM attacks |
| Log URL + status + elapsed | Production debugging |
| `with` for sessions | Releases connection pool |
