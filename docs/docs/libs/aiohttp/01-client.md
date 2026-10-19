---
date: 2026-10-19 12:00:00
tags:
  - python
  - libraries
  - aiohttp
  - asyncio
  - api-testing
---

# aiohttp — Client

`ClientSession` is the aiohttp HTTP client. Examples were run on aiohttp 3.14.5 against a local test server; output shown in comments is real.

## Session Lifecycle

A session owns a connection pool, a cookie jar and default settings. Create it **once** inside a running event loop and close it when the application stops.

```python
import aiohttp


async def main() -> None:
    async with aiohttp.ClientSession(
        base_url="https://api.example.com",
        headers={"User-Agent": "my-app/1.0"},
        timeout=aiohttp.ClientTimeout(total=10),
    ) as session:
        async with session.get("/users", params={"page": 1}) as resp:
            users = await resp.json()
```

| Rule | Why |
|------|-----|
| One session per app or upstream | Connections are pooled and reused (keep-alive) |
| Create it inside `async def` | It binds to the running loop |
| Close it (`async with` / `await session.close()`) | Otherwise the log shows `Unclosed client session` |
| Never share one session across threads or event loops | It is not thread-safe |
| Use a relative path with `base_url` | `session.get("/users")` joins to the base URL |

Using a closed session raises `RuntimeError: Session is closed`. In a long-lived service, store the session on the application (see [02 Server](./02-server-websockets.md#shared-client-session)) instead of creating it per request.

## Requests

```python
async with session.get("/hello", params={"q": "x"}) as resp: ...
async with session.post("/echo", json={"a": 1}) as resp: ...
async with session.put("/items/1", json=item) as resp: ...
async with session.patch("/items/1", json=partial) as resp: ...
async with session.delete("/items/1") as resp: ...
async with session.request("OPTIONS", "/items") as resp: ...      # any method
```

| Argument | Meaning |
|----------|---------|
| `params` | Query string (`dict` or list of pairs; repeated keys with a list of tuples) |
| `json` | Serialises to JSON, sets `Content-Type: application/json` |
| `data` | `dict` → form-encoded body; `bytes` / `str` → raw body; `FormData` → multipart; async generator or file object → streamed body |
| `headers` | Per-request headers, merged over the session's |
| `timeout` | A `ClientTimeout` for this request only |
| `allow_redirects`, `max_redirects` | Redirect handling (default: follow, up to 10) |
| `raise_for_status` | `True`, or a callable `async def (resp)` |
| `ssl` | `False` to skip verification (never in production), or an `ssl.SSLContext` |
| `proxy`, `proxy_auth` | Per-request proxy |

### Forms and files

```python
form = aiohttp.FormData()
form.add_field("file", open("report.csv", "rb"), filename="report.csv", content_type="text/csv")
form.add_field("note", "monthly")

async with session.post("/upload", data=form) as resp:
    print(await resp.json())     # {'file': ['report.csv', '<content>'], 'note': [None, 'monthly']}

async with session.post("/form", data={"a": "1", "b": "2"}) as resp:   # application/x-www-form-urlencoded
    print(await resp.json())     # {'a': '1', 'b': '2'}
```

## Responses

```python
async with session.get("/hello", params={"q": "x"}) as resp:
    print(resp.status)            # 200
    print(resp.ok)                # True for status < 400
    print(resp.content_type)      # 'application/json'
    print(resp.headers["Content-Type"])
    data = await resp.json()      # coroutine
    # await resp.text(), await resp.read() (bytes)
```

- The body methods are **coroutines**: `await resp.json()`. Forgetting `await` returns a coroutine object.
- `resp.json()` checks the `Content-Type`. A `text/plain` reply raises `aiohttp.ContentTypeError` (status 200 in that case!). Use `await resp.json(content_type=None)` to parse anyway; if the body is not JSON you then get `json.JSONDecodeError`.
- Outside the `async with` block the connection is released and the body is gone: reading it afterwards raises `ClientConnectionError`. Read what you need *inside* the block.
- Redirect history is on `resp.history`; the final URL is `resp.url`.

## Status Codes and Errors

An HTTP 404 or 500 does **not** raise by default:

```python
async with session.get("/boom") as resp:
    print(resp.status, resp.ok, await resp.text())     # 404 False nope
```

Raise on error statuses per request, per session, or by hand:

```python
async with session.get("/boom", raise_for_status=True) as resp: ...        # per request
session = aiohttp.ClientSession(raise_for_status=True)                     # every request
resp.raise_for_status()                                                    # manual
# aiohttp.ClientResponseError: status=404, message='Not Found'
```

`ClientResponseError` carries `.status`, `.message`, `.headers`, `.request_info`.

### Exception hierarchy

| Exception | Raised when |
|-----------|-------------|
| `aiohttp.ClientError` | Base class of all client errors |
| `ClientResponseError` | Bad status with `raise_for_status`, bad headers or payload |
| `ContentTypeError` | `resp.json()` on a non-JSON content type (subclass of `ClientResponseError`) |
| `ClientConnectionError` | Connection problems (base) |
| `ClientConnectorError` | Cannot connect (refused, DNS). Also an `OSError` |
| `ServerDisconnectedError`, `ClientPayloadError` | Connection dropped while talking or reading the body |
| `asyncio.TimeoutError` (= `TimeoutError` on Python 3.11+) | Any `ClientTimeout` limit hit |
| `InvalidURL` | Malformed URL |

```python
try:
    async with session.get(url, raise_for_status=True) as resp:
        return await resp.json()
except aiohttp.ClientResponseError as exc:        # server answered with 4xx/5xx
    ...
except (aiohttp.ClientConnectionError, asyncio.TimeoutError):   # network or timeout
    ...
```

## Timeouts

The default is `ClientTimeout(total=300, sock_connect=30)`. Set your own; all values are seconds:

```python
timeout = aiohttp.ClientTimeout(total=30, connect=5, sock_read=10)
```

| Field | Limits |
|-------|--------|
| `total` | The whole request including connection, redirects and reading the body |
| `connect` | Time to get a connection from the pool *and* connect to the server |
| `sock_connect` | Only the TCP connection |
| `sock_read` | Gap between two chunks of data (good for streaming) |

Set it on the session (`ClientSession(timeout=...)`) or override per request (`session.get(url, timeout=aiohttp.ClientTimeout(total=0.2))`). On expiry you get `TimeoutError`; a `total` limit on a streaming download kills long downloads, so use `sock_read` for those.

## Redirects

```python
async with session.get("/redirect", allow_redirects=False) as resp:
    print(resp.status, resp.headers["Location"])     # 302 /hello

async with session.get("/redirect") as resp:         # followed by default
    print(resp.status, [h.status for h in resp.history], resp.url)   # 200 [302] http://.../hello
```

## Cookies

The session keeps cookies between requests in its jar. By default aiohttp **ignores cookies from servers addressed by IP address** (a rule meant for browsers), which surprises people testing against `127.0.0.1`:

```python
async with aiohttp.ClientSession(base_url=base) as s:
    await s.get("/setck")
    async with s.get("/ck") as r:
        print(await r.text())          # 'none'  — cookie was dropped

jar = aiohttp.CookieJar(unsafe=True)   # accept cookies for IP hosts
async with aiohttp.ClientSession(base_url=base, cookie_jar=jar) as s:
    await s.get("/setck")
    async with s.get("/ck") as r:
        print(await r.text())          # 'abc'
```

Use `unsafe=True` only in tests or for known internal hosts. For hostnames the default jar works as expected.

## Authentication

For bearer tokens and API keys set a header. For HTTP Basic, aiohttp 3.14 deprecates `auth=aiohttp.BasicAuth(...)` (removal in aiohttp 4.0) in favour of an explicit header:

```python
session = aiohttp.ClientSession(
    headers={"Authorization": f"Bearer {token}"},
)

basic = aiohttp.ClientSession(
    headers={"Authorization": aiohttp.encode_basic_auth("user", "pass")},
)
```

With the old form you get `DeprecationWarning: BasicAuth is deprecated and will be removed in aiohttp 4.0`. Keep tokens out of the code: read them from the environment or a secret manager.

## Streaming

### Reading a body line by line or in chunks

```python
async with session.get("/stream") as resp:
    async for line in resp.content:                   # b'line0\n', b'line1\n', ...
        handle(line)

async with session.get("/big") as resp, open("big.bin", "wb") as f:
    async for chunk in resp.content.iter_chunked(16_384):
        f.write(chunk)                                # constant memory
```

Blocking `f.write` in an async function is fine for small files; for large files use a thread (`await asyncio.to_thread(f.write, chunk)`) so the loop stays responsive.

### Uploading from a generator

```python
async def chunks():
    for part in parts:
        yield part

async with session.post("/ingest", data=chunks()) as resp: ...
```

## Connection Pool

```python
connector = aiohttp.TCPConnector(
    limit=50,              # total simultaneous connections (default 100)
    limit_per_host=10,     # per host (default 0 = unlimited)
    ttl_dns_cache=300,     # seconds (default 10)
    keepalive_timeout=30,
)
async with aiohttp.ClientSession(connector=connector) as session: ...
```

- A request waits for a free slot when the pool is full; that waiting counts against `ClientTimeout.total` and `connect`.
- A session closes the connector you pass in by default (`connector_owner=True`). Set `connector_owner=False` only when several sessions deliberately share one connector; then you must close it yourself.
- `ssl=False` on the connector disables certificate checks: development only.

## Concurrency

`asyncio.gather` runs requests concurrently. Bound it with a semaphore so you do not open thousands of sockets at once:

```python
import asyncio


async def fetch_all(session: aiohttp.ClientSession, ids: list[int]) -> list[dict]:
    sem = asyncio.Semaphore(10)

    async def one(i: int) -> dict:
        async with sem:
            async with session.get(f"/items/{i}", raise_for_status=True) as resp:
                return await resp.json()

    return await asyncio.gather(*(one(i) for i in ids))
```

In a run of ten calls with `Semaphore(3)` the server saw a peak of exactly 3 concurrent requests. To keep going when some calls fail, use `gather(..., return_exceptions=True)`; the result mixes values and exception objects (`['ClientResponseError', '99']`). With `asyncio.TaskGroup` (Python 3.11+) the first failure cancels the others.

## Retries

aiohttp does not retry. A small helper covers the common case: retry network errors and 5xx, never 4xx:

```python
import asyncio

import aiohttp


async def fetch_with_retry(session: aiohttp.ClientSession, path: str, attempts: int = 3) -> str:
    for attempt in range(1, attempts + 1):
        try:
            async with session.get(path, raise_for_status=True) as resp:
                return await resp.text()
        except aiohttp.ClientResponseError as exc:
            if exc.status < 500 or attempt == attempts:
                raise
        except (aiohttp.ClientConnectionError, asyncio.TimeoutError):
            if attempt == attempts:
                raise
        await asyncio.sleep(0.2 * 2 ** attempt)      # exponential backoff; add jitter in real code
    raise AssertionError("unreachable")
```

Retry only **idempotent** methods (GET, PUT, DELETE) unless the API supports idempotency keys. For jitter, backoff libraries and circuit breakers see [Resilience](../resilience/index.md). This helper is tested in [03 Testing](./03-testing.md).

## Tracing Requests

`TraceConfig` hooks into the request lifecycle: use it for timing, logging and metrics without touching call sites.

```python
import time

trace = aiohttp.TraceConfig()


async def on_start(session, ctx, params):
    ctx.t0 = time.perf_counter()


async def on_end(session, ctx, params):
    elapsed = time.perf_counter() - ctx.t0
    print(params.method, params.url.path, params.response.status, f"{elapsed:.3f}s")   # GET / 200 0.004s


trace.on_request_start.append(on_start)
trace.on_request_end.append(on_end)

async with aiohttp.ClientSession(base_url=base, trace_configs=[trace]) as session: ...
```

Other signals include `on_request_exception`, `on_request_redirect`, `on_connection_create_start`, `on_dns_resolvehost_start` and `on_response_chunk_received`. For OpenTelemetry there is an `opentelemetry-instrumentation-aiohttp-client` package built on this mechanism (see [OpenTelemetry](../opentelemetry/index.md)).

## Common Mistakes

| Mistake | Effect | Fix |
|---------|--------|-----|
| New `ClientSession` per request | No connection reuse, slow, socket churn | One shared session |
| Not closing the session | `Unclosed client session` warning, leaked sockets | `async with` or `close()` |
| `resp.json()` without `await` | A coroutine object instead of data | `await resp.json()` |
| Reading the body after leaving `async with` | `ClientConnectionError` | Read inside the block |
| Assuming 404/500 raises | Error body is parsed as data | `raise_for_status=True` |
| `resp.json()` on `text/plain` | `ContentTypeError` | `json(content_type=None)` or fix the server |
| Default timeout (5 min) | Hung calls hold resources | Set `ClientTimeout` |
| `gather` over thousands of URLs | Too many sockets, server errors | Semaphore plus `TCPConnector(limit=...)` |
| `BasicAuth(...)` in new code | `DeprecationWarning`, breaks in aiohttp 4 | `encode_basic_auth()` header |
| Cookies against `127.0.0.1` vanish | Login flow fails in tests | `CookieJar(unsafe=True)` in tests |

---
## See also
- [aiohttp — Async HTTP Client & Server](./index.md)
- [aiohttp — Server & WebSockets](./02-server-websockets.md)
- [aiohttp — Testing](./03-testing.md)
- [HTTPX — Async Patterns](../httpx/02-async-patterns.md)
- [Resilience](../resilience/index.md)
- [OpenTelemetry](../opentelemetry/index.md)
