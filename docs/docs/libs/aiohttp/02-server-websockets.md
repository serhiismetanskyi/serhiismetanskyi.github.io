---
date: 2026-10-19 12:00:00
tags:
  - python
  - libraries
  - aiohttp
  - asyncio
  - websocket
---

# aiohttp — Server & WebSockets

`aiohttp.web` is a small async web framework: routes, handlers, middlewares, shared application state and WebSockets. There is no ORM, validation layer or OpenAPI generation; for those use [FastAPI](../fastapi/index.md). Examples were run on aiohttp 3.14.5; the outputs shown are from real requests to a local instance.

## Application, Routes and Handlers

A handler is an `async def` taking a `web.Request` and returning a `web.Response` (or raising an HTTP exception):

```python
import json

from aiohttp import web

routes = web.RouteTableDef()


@routes.get(r"/users/{uid:\d+}")
async def get_user(request: web.Request) -> web.Response:
    uid = int(request.match_info["uid"])
    user = request.app[db_key].get(uid)
    if user is None:
        raise web.HTTPNotFound(
            text=json.dumps({"error": "no user"}), content_type="application/json"
        )
    return web.json_response(user)


@routes.post("/users")
async def create_user(request: web.Request) -> web.Response:
    try:
        body = await request.json()
    except json.JSONDecodeError:
        raise web.HTTPBadRequest(text="bad json")
    uid = max(request.app[db_key], default=0) + 1
    request.app[db_key][uid] = body
    return web.json_response({"id": uid}, status=201, headers={"Location": f"/users/{uid}"})
```

| Part | Notes |
|------|-------|
| `@routes.get/post/put/patch/delete(path)` | Decorators on a `RouteTableDef`; register with `app.add_routes(routes)` |
| `web.get(path, handler)` | Same without decorators: `app.add_routes([web.get("/hello", hello)])` |
| `{name}` / `{name:regex}` | Path variable, read from `request.match_info["name"]`. `/users/abc` against `{uid:\d+}` gives a **404** |
| `request.query` | Query parameters (`request.query.get("q")`) |
| `await request.json()` / `.text()` / `.post()` / `.read()` | Body (`.post()` parses form data) |
| `request.headers`, `request.cookies` | Headers and cookies |
| `web.json_response(data, status=, headers=)` | JSON body with the right content type |
| `raise web.HTTPNotFound(...)` etc. | HTTP errors are **exceptions** you raise; they are also responses |

Requests to unknown paths return 404 and unsupported methods return 405 automatically.

## Application State with `AppKey`

Shared objects (database pool, settings, an HTTP client) live on the application and are looked up with a typed key:

```python
from aiohttp import web

db_key = web.AppKey("db", dict)
app = web.Application()
app[db_key] = {1: {"name": "Ann"}}
```

Plain string keys still work but emit `NotAppKeyWarning`; `AppKey` lets type checkers know the value type. Inside a handler read it with `request.app[db_key]`.

## Startup and Cleanup: `cleanup_ctx`

Use one async generator per resource. Code before `yield` runs at startup, code after at shutdown, in reverse order:

```python
async def db_ctx(app: web.Application):
    app[db_key] = {1: {"name": "Ann"}}      # startup: open pool
    yield
    app[db_key].clear()                      # shutdown: close pool


def make_app() -> web.Application:
    app = web.Application(client_max_size=1024 * 1024)
    app.cleanup_ctx.append(db_ctx)
    app.add_routes(routes)
    return app
```

Build the app in a **factory function** (`make_app()`), not at import time: tests create a fresh app per test, and nothing starts until the app runs. The older `on_startup` / `on_cleanup` lists exist, but `cleanup_ctx` keeps open and close next to each other and cleans up even when a later startup step fails: with contexts `a` and `b`, where `b` raises at startup, the run recorded `a-start, b-start, a-clean`.

### Shared client session

A service that calls other HTTP services should own one `ClientSession` for its whole life:

```python
import aiohttp
from aiohttp import web

session_key = web.AppKey("session", aiohttp.ClientSession)
upstream_key = web.AppKey("upstream", str)


async def client_ctx(app: web.Application):
    async with aiohttp.ClientSession(
        app[upstream_key], timeout=aiohttp.ClientTimeout(total=5)
    ) as session:
        app[session_key] = session
        yield                                # session is closed on shutdown


async def proxy(request: web.Request) -> web.Response:
    session = request.app[session_key]
    async with session.get("/item", params={"n": request.query["n"]}) as resp:
        return web.json_response(await resp.json())
```

Run with `app[upstream_key] = "https://api.example.com"` and `app.cleanup_ctx.append(client_ctx)`. The session exists before the first request and is closed after the last.

## Middleware

A middleware wraps every handler. Decorate with `@web.middleware`; middlewares run in list order (first = outermost):

```python
@web.middleware
async def errors(request: web.Request, handler):
    try:
        return await handler(request)
    except web.HTTPException:
        raise                                   # 404, 400, ... pass through unchanged
    except Exception:
        return web.json_response({"error": "internal"}, status=500)


@web.middleware
async def stamp(request: web.Request, handler):
    resp = await handler(request)
    resp.headers["X-Handled"] = "1"
    return resp


app = web.Application(middlewares=[errors, stamp])
```

With these two middlewares a handler that raises `RuntimeError` returns `500 {'error': 'internal'}` and every normal response carries `X-Handled: 1`. Let `web.HTTPException` pass through, otherwise your 404s become 500s. For authentication, request IDs, metrics and error mapping prefer middlewares to repeated code in handlers.

## Request Size Limits

`web.Application(client_max_size=...)` caps the body read by `request.json()`, `.read()`, `.post()`. The default is **1 MiB**; a larger body gets `413 Payload Too Large`:

```python
app = web.Application(client_max_size=1024)        # POST of 5000 bytes → 413
```

Raise it deliberately for upload endpoints, or stream the body with `request.content.iter_chunked(...)` instead of reading it whole.

## Responses

| Class | Use |
|-------|-----|
| `web.Response(text=, body=, status=, headers=, content_type=)` | Ordinary response |
| `web.json_response(data)` | JSON |
| `web.FileResponse(path)` | Serve a file efficiently |
| `web.StreamResponse()` | Stream chunks: `await resp.prepare(request)`, `await resp.write(b"...")`, `await resp.write_eof()` |
| `web.HTTPFound("/new")` etc. | Redirects (raise them) |

Static files: `app.router.add_static("/static", path="static")`. Sub-applications for modules: `app.add_subapp("/api/v1", api_app)`.

## WebSockets

A WebSocket handler upgrades the connection and loops over messages:

```python
from aiohttp import WSMsgType, web


@routes.get("/ws")
async def websocket(request: web.Request) -> web.WebSocketResponse:
    ws = web.WebSocketResponse(heartbeat=10)
    await ws.prepare(request)
    async for msg in ws:
        if msg.type == WSMsgType.TEXT:
            await ws.send_str("echo:" + msg.data)
        elif msg.type == WSMsgType.ERROR:
            break
    return ws
```

Client side:

```python
async with session.ws_connect("/ws") as ws:
    await ws.send_str("hi")
    msg = await ws.receive()
    print(msg.data)                  # echo:hi
    await ws.close()
```

| Item | Notes |
|------|-------|
| `heartbeat=10` | Sends a ping every 10 s and closes a dead connection; use it behind proxies that drop idle sockets |
| `msg.type` | `TEXT`, `BINARY`, `PING`, `PONG`, `CLOSE`, `CLOSING`, `CLOSED`, `ERROR` |
| `send_json(obj)` / `receive_json()` | JSON helpers |
| `await ws.close()` | Close handshake; the `async for` loop ends when the peer closes |
| Broadcast | Keep a `set` of `WebSocketResponse` in `app[...]`, remove on disconnect, and `await asyncio.gather(*(w.send_str(m) for w in clients), return_exceptions=True)` |
| Authentication | Check the token **before** `ws.prepare()` and raise `web.HTTPUnauthorized` |

Remember to close every open WebSocket at shutdown (an `on_shutdown` handler), otherwise `web.run_app` waits for them until its `shutdown_timeout`.

For protocol-level details and test strategies see [WebSocket](../../api-architectures/04-websocket/index.md).

## Running

```python
if __name__ == "__main__":
    web.run_app(make_app(), host="0.0.0.0", port=8080)
```

`run_app` handles SIGINT/SIGTERM, runs the startup and cleanup hooks, and stops accepting connections on shutdown. Useful parameters: `shutdown_timeout` (default 60 s, how long to wait for in-flight handlers), `keepalive_timeout` (75 s), `access_log` (a logger or `None`), `ssl_context`, `path` / `sock` for Unix sockets, `handler_cancellation=False` (set `True` to cancel handlers when the client disconnects).

In production run several processes behind a reverse proxy (one container per process, or Gunicorn with `aiohttp.GunicornWebWorker`; check the aiohttp deployment docs for the exact app-factory syntax), and put TLS on the proxy.

## Common Mistakes

| Mistake | Effect | Fix |
|---------|--------|-----|
| Blocking call in a handler (`requests`, `time.sleep`, heavy CPU) | Every request stalls | `await` async APIs, `asyncio.to_thread()`, or a process pool |
| Building `web.Application()` at import time | Hard to test, side effects on import | `make_app()` factory |
| Module-level globals for DB or sessions | Leaks between tests, no clean shutdown | `app[key]` and `cleanup_ctx` |
| Catching `Exception` in middleware without re-raising `HTTPException` | 404 and 400 become 500 | `except web.HTTPException: raise` |
| Forgetting `await` on `request.json()` | A coroutine instead of data | `await request.json()` |
| Reading huge bodies with `request.read()` | Memory use, or 413 at the default limit | Stream, or raise `client_max_size` knowingly |
| Not closing WebSockets on shutdown | Slow stop (waits for `shutdown_timeout`) | `on_shutdown` closes them |
| Untyped string keys in `app[...]` | Warnings, no type safety | `web.AppKey` |

---
## See also
- [aiohttp — Async HTTP Client & Server](./index.md)
- [aiohttp — Client](./01-client.md)
- [aiohttp — Testing](./03-testing.md)
- [FastAPI](../fastapi/index.md)
- [WebSocket](../../api-architectures/04-websocket/index.md)
