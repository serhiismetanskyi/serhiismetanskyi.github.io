---
date: 2026-10-19 12:00:00
tags:
  - python
  - libraries
  - aiohttp
  - asyncio
  - testing
---

# aiohttp — Testing

Two things need tests: **server code** (handlers, middlewares, WebSockets) and **client code** (the functions that call other services). Both are tested best against a real aiohttp server on a random local port, not by mocking the HTTP layer. Everything below ran on aiohttp 3.14.5, `pytest` 9.1, `pytest-asyncio` 1.4 and `pytest-aiohttp` 1.1.1: **8 passed** in 0.03 s, no network access.

## Setup

```bash
uv add --dev pytest pytest-asyncio pytest-aiohttp
```

```ini
# pytest.ini
[pytest]
asyncio_mode = auto
```

`pytest-aiohttp` provides the fixtures and builds on `pytest-asyncio`. With the default `strict` mode the same suite fails (`5 failed, 3 errors`), because async fixtures and tests need explicit markers. Use `asyncio_mode = auto` so `async def` tests and async fixtures work without decorators.

| Fixture | Gives you |
|---------|-----------|
| `aiohttp_client(app)` | A started test server plus a `TestClient` bound to it. `await client.get("/path")` returns a normal `ClientResponse` |
| `aiohttp_server(app)` | A started `TestServer` only: `server.make_url("/")` gives the URL to point your own client at |
| `aiohttp_raw_server(handler)` | A server around a bare handler, without an `Application` |
| `unused_tcp_port` | A free port number (provided by `pytest-asyncio`) |

Both fixtures start the app through the normal startup path, so `cleanup_ctx` runs, and close it after the test.

## The Code Under Test

The server (`app.py`) from [02 Server](./02-server-websockets.md): a factory `make_app()` with `GET /users/{uid}`, `POST /users`, `/ws`, an `errors` and a `stamp` middleware, a `cleanup_ctx` that creates the in-memory `db_key` dict, and `client_max_size=1024`.

The client code (`client_code.py`), which gets the session from the caller so a test can hand in a session pointing at a fake server:

```python
import asyncio

import aiohttp


async def fetch_user(session: aiohttp.ClientSession, uid: int) -> dict:
    async with session.get(f"/users/{uid}") as resp:
        resp.raise_for_status()
        return await resp.json()


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
        await asyncio.sleep(0)          # real code: exponential backoff with jitter
    raise AssertionError("unreachable")
```

## Testing the Server

```python
import aiohttp
import pytest
from aiohttp import web

from app import db_key, make_app
from client_code import fetch_user, fetch_with_retry


async def test_get_user(aiohttp_client):
    client = await aiohttp_client(make_app())
    resp = await client.get("/users/1")
    assert resp.status == 200
    assert await resp.json() == {"name": "Ann"}
    assert resp.headers["X-Handled"] == "1"          # middleware ran


async def test_create_then_read(aiohttp_client):
    client = await aiohttp_client(make_app())
    created = await client.post("/users", json={"name": "Bob"})
    assert created.status == 201
    location = created.headers["Location"]
    assert (await (await client.get(location)).json()) == {"name": "Bob"}


async def test_state_can_be_inspected(aiohttp_client):
    app = make_app()
    client = await aiohttp_client(app)
    await client.post("/users", json={"name": "Eve"})
    assert app[db_key][2] == {"name": "Eve"}         # look inside the app


async def test_payload_too_large(aiohttp_client):
    client = await aiohttp_client(make_app())
    resp = await client.post("/users", data=b"x" * 5000)
    assert resp.status == 413


async def test_websocket(aiohttp_client):
    client = await aiohttp_client(make_app())
    async with client.ws_connect("/ws") as ws:
        await ws.send_str("hi")
        assert (await ws.receive()).data == "echo:hi"
```

Why this works:

- `make_app()` is a factory, so every test gets a fresh app and a fresh database.
- The test client is a real HTTP client talking to a real socket, so routing, middlewares, status codes, headers and WebSockets are exercised end to end.
- The app object is available in the test (`app[db_key]`) to assert on state without an extra endpoint.

### What to test on a server

| Behaviour | Example assertion |
|-----------|-------------------|
| Happy path and body | `status == 200`, `await resp.json() == {...}` |
| Not found / bad input | `GET /users/9` → 404, `POST` with bad JSON → 400, path `/users/abc` → 404 |
| Created resources | `201` plus `Location` header that can be fetched |
| Middleware | Response header present, `RuntimeError` in a handler → `500 {"error": "internal"}` |
| Limits | Body above `client_max_size` → 413 |
| Startup / cleanup | State exists after startup; resources released after the fixture ends |
| WebSocket | Send a message, assert the reply; close and assert the handler ends |

## Testing the Client with a Fake Upstream

Instead of patching `ClientSession`, start a tiny fake server that behaves like the upstream, and give your code a session pointing at it:

```python
@pytest.fixture
async def upstream(aiohttp_server):
    calls = {"flaky": 0}

    async def user(request):
        return web.json_response({"id": int(request.match_info["uid"])})

    async def flaky(request):
        calls["flaky"] += 1
        return web.Response(status=503) if calls["flaky"] < 3 else web.Response(text="ok")

    async def missing(request):
        raise web.HTTPNotFound()

    app = web.Application()
    app.add_routes([web.get("/users/{uid}", user), web.get("/flaky", flaky), web.get("/missing", missing)])
    server = await aiohttp_server(app)
    server.calls = calls
    return server


@pytest.fixture
async def session(upstream):
    async with aiohttp.ClientSession(base_url=upstream.make_url("/")) as s:
        yield s


async def test_fetch_user(session):
    assert await fetch_user(session, 7) == {"id": 7}


async def test_retry_on_5xx(session, upstream):
    assert await fetch_with_retry(session, "/flaky") == "ok"
    assert upstream.calls["flaky"] == 3                 # two failures, third succeeds


async def test_no_retry_on_404(session):
    with pytest.raises(aiohttp.ClientResponseError) as err:
        await fetch_with_retry(session, "/missing")
    assert err.value.status == 404
```

Because the fake is a real server, you can also test **timeouts** (a handler that `await asyncio.sleep(...)` plus a short `ClientTimeout`), **slow or dropped connections**, redirects, cookies (remember `CookieJar(unsafe=True)` for `127.0.0.1`), and streaming bodies with the real client code path. Counting calls on the fake (`calls["flaky"]`) proves the retry logic ran the expected number of times.

## `aioresponses` and Version Compatibility

`aioresponses` mocks the client in-process (`m.get(url, payload=...)`) and is popular for quick tests. It patches aiohttp internals, so it depends on the aiohttp version. With `aioresponses` 0.7.9 and aiohttp 3.14.5 every mocked request failed:

```text
TypeError: ClientResponse.__init__() missing 1 required keyword-only argument: 'stream_writer'
```

Check that the pair is supported before relying on it, and pin both in `uv.lock`. The fake-upstream approach above has no such coupling and also covers real socket behaviour, so prefer it for new code. If a library *you* use calls aiohttp internally and you cannot reach its session, a mock is the fallback.

## What About Timing

- Keep sleeps near zero in tests (`await asyncio.sleep(0)` in a retry helper, or inject the delay as a parameter), and test the backoff formula separately as a pure function.
- Use short `ClientTimeout` values (0.1-0.5 s) against a handler that sleeps 1-2 s to prove timeouts are handled.
- Never assert on wall-clock time; assert on call counts and outcomes.

## CI Checklist

1. `asyncio_mode = auto` in `pytest.ini` (or `pyproject.toml`) and `pytest-aiohttp` in the dev dependencies.
2. Servers built with factories; no global app, no global `ClientSession`.
3. Read the test output for `Unclosed client session` messages and fix them: unclosed sessions and sockets are the most common leak in async code.
4. Tests bind to `127.0.0.1` with a random port (the fixtures do this) so they can run in parallel and in CI containers.
5. Retry, timeout and error-mapping paths each have a test against the fake upstream.
6. Pin `aiohttp` and any mocking library in the lock file and upgrade them together.

## Common Mistakes

| Mistake | Effect | Fix |
|---------|--------|-----|
| `asyncio_mode = strict` with `pytest-aiohttp` | `async` fixtures error out | `asyncio_mode = auto` |
| Module-level `app = web.Application()` | Shared state between tests | `make_app()` factory |
| Mocking `ClientSession.get` by hand | Misses `async with`, headers, status handling | Fake upstream server |
| Using `aioresponses` without checking compatibility | `TypeError: ... 'stream_writer'` on newer aiohttp | Fake upstream, or matching versions |
| Sleeping for real in retry tests | Slow suite | Inject the delay |
| Not closing the client session in a fixture | `Unclosed client session` warnings | `async with ClientSession()` in an async fixture |

---
## See also
- [aiohttp — Async HTTP Client & Server](./index.md)
- [aiohttp — Client](./01-client.md)
- [aiohttp — Server & WebSockets](./02-server-websockets.md)
- [Pytest](../pytest/index.md)
- [Resilience](../resilience/index.md)
