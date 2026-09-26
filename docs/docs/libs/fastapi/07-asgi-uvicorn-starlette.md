---
date: 2026-09-13
tags:
  - python
  - libraries
  - fastapi
  - api
---

# ASGI vs WSGI, Uvicorn, Starlette, Litestar

## Why This Matters

When you run FastAPI in production, you are not running "just FastAPI". You run:
- an ASGI application interface
- an ASGI server (usually Uvicorn)
- a framework stack where FastAPI is built on Starlette

Understanding this stack helps with performance, debugging, and architecture choices.

---

## ASGI vs WSGI

### Quick Comparison

| Topic | WSGI | ASGI |
|---|---|---|
| Execution model | Synchronous request-response | Async event-driven |
| Concurrency | Threads/processes per request | Event loop + non-blocking I/O |
| Protocols | HTTP only | HTTP + WebSocket + lifespan |
| Long-lived connections | Poor fit | Native fit |
| Real-time apps | Limited | First-class support |
| Typical Python frameworks | Flask, classic Django | FastAPI, Starlette, Litestar |

### Conceptual Interface

WSGI app shape:

```python
def app(environ, start_response):
    ...
```

ASGI app shape:

```python
async def app(scope, receive, send):
    ...
```

Where:
- `scope` = connection metadata (protocol, path, headers)
- `receive` = incoming events/messages
- `send` = outgoing events/messages

### Lifespan Support

ASGI includes startup/shutdown lifecycle events (commonly called lifespan). This is critical for:
- opening DB pools at startup
- warming caches/models
- graceful shutdown and cleanup

---

## Uvicorn Role in FastAPI

Uvicorn is an ASGI server implementation. It is responsible for:
- accepting network connections
- parsing HTTP protocol details
- running your ASGI app in an event loop
- forwarding requests/events to FastAPI/Starlette

Typical commands:

```bash
# local development
uv run uvicorn app.main:app --reload

# production-like run
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

### Why `uvicorn[standard]`

`uvicorn[standard]` installs optimized extras (like faster parser/event-loop integrations), which is usually preferred for real deployments.

---

## How FastAPI Uses Starlette

FastAPI is built on top of Starlette.

Starlette provides core web primitives:
- routing and endpoint dispatch
- Request/Response objects
- middleware pipeline
- WebSocket handling
- background tasks
- ASGI lifespan support

FastAPI adds:
- dependency injection (`Depends`)
- Pydantic-based validation/serialization
- OpenAPI schema generation
- `/docs` and `/redoc`
- security helpers (OAuth2/API key patterns)

Practical takeaway: when you debug middleware order, websockets, or low-level request behavior, you are often debugging Starlette-level behavior.

---

## Minimal ASGI/FastAPI Flow

```text
Client
  -> Uvicorn (ASGI server)
  -> Starlette routing/middleware
  -> FastAPI dependency + validation layer
  -> Endpoint function
  -> Response serialization
  -> back to client
```

---

## When to Consider Litestar (formerly Starlite)

Litestar is another ASGI-first framework. Consider it when:
- you want more built-in batteries for large backend platforms
- you prioritize strict typing and explicit architecture patterns
- you benchmark and see better fit/perf for your workload

Stay with FastAPI when:
- ecosystem maturity and community examples are a priority
- onboarding speed for teams matters
- your current stack already depends on FastAPI conventions

### Migration Mindset

Do not migrate by hype. Decide via:
1. measurable bottleneck (latency, throughput, maintainability)
2. proof-of-concept benchmark
3. migration cost and ecosystem impact

---

## Decision Checklist

- Need WebSockets/streaming/async I/O heavy workloads? -> ASGI stack.
- Need simple sync HTTP app and existing WSGI ecosystem? -> WSGI can still be enough.
- Running FastAPI in prod? -> treat Uvicorn/ASGI/Starlette as first-class architecture components.
- Evaluating Litestar? -> benchmark before switching.

---

---

## See also
- [FastAPI — Overview](index.md)
- [Dependencies & Middleware](02-dependencies-middleware.md)
- [Production Patterns](06-production-patterns.md)
- [WebSocket Testing](../../test-automation-framework/04-api-testing/02-grpc-websocket.md)
