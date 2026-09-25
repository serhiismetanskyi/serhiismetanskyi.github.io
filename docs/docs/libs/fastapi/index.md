---
date: 2026-09-11
tags:
  - python
  - libraries
  - fastapi
  - api
---

# FastAPI — Modern Async Web Framework

High-performance Python web framework built on Starlette and Pydantic. Automatic OpenAPI docs, type-safe request validation, async-first design, and dependency injection out of the box.

## Installation

```bash
uv add fastapi
uv add "uvicorn[standard]"     # ASGI server with uvloop & httptools
uv add pydantic-settings        # env-based configuration
uv add python-multipart         # form/file uploads
uv add python-jose[cryptography] # JWT tokens
uv add passlib[bcrypt]          # password hashing
```

## When to Use What

| Feature | Best for |
|---------|----------|
| Path operations (`@app.get`) | Standard REST endpoints |
| `Depends()` | Shared logic: auth, DB sessions, config |
| `BackgroundTasks` | Quick fire-and-forget work (emails, logs) |
| WebSocket | Real-time bidirectional communication |
| `APIRouter` | Splitting routes into modules |
| Lifespan events | App-level startup/shutdown (DB pools, caches) |

## Section Map

| File | Topics |
|------|--------|
| [01 App & Routing](./01-app-routing.md) | App config, path/query params, request/response models, status codes |
| [02 Dependencies & Middleware](./02-dependencies-middleware.md) | Depends, yield deps, middleware, lifespan, CORS |
| [03 Database Integration](./03-database-integration.md) | Async SQLAlchemy, session management, CRUD patterns, repositories |
| [04 Auth & Security](./04-auth-security.md) | OAuth2, JWT, password hashing, role-based access, API keys |
| [05 Testing](./05-testing.md) | TestClient, async tests, dependency overrides, fixtures, coverage |
| [06 Production Patterns](./06-production-patterns.md) | Project structure, background tasks, WebSocket, error handling, deploy |
| [07 ASGI, Uvicorn, Starlette](./07-asgi-uvicorn-starlette.md) | ASGI vs WSGI, Uvicorn role, FastAPI-Starlette stack, when to consider Litestar |

## Quick Start

```python
from fastapi import FastAPI

app = FastAPI(title="My API", version="0.1.0")


@app.get("/")
async def root():
    return {"message": "Hello, FastAPI"}


@app.get("/items/{item_id}")
async def read_item(item_id: int, q: str | None = None):
    return {"item_id": item_id, "q": q}
```

```bash
uvicorn main:app --reload
```

| URL | Purpose |
|-----|---------|
| `http://127.0.0.1:8000` | API root |
| `http://127.0.0.1:8000/docs` | Swagger UI (interactive) |
| `http://127.0.0.1:8000/redoc` | ReDoc (read-only docs) |
| `http://127.0.0.1:8000/openapi.json` | Raw OpenAPI schema |

## Response Model Cheat Sheet

| Return type | What happens |
|-------------|-------------|
| `dict` / `list` | JSON-serialized as-is |
| Pydantic model | Validated + serialized via `model_dump()` |
| `Response` / `JSONResponse` | Full control over headers, status, body |
| `StreamingResponse` | Stream large files or SSE |
| `FileResponse` | Serve static files |

## Quick Rules

1. **Use async `def`** — for I/O-bound endpoints; sync `def` runs in a threadpool.
2. **Type everything** — path params, query params, body models get auto-validated.
3. **Use `Depends()`** — never instantiate shared resources inside endpoints.
4. **Keep routes thin** — move business logic to service layer.
5. **Use `APIRouter`** — one router per domain/module.
6. **Use Pydantic models for I/O** — separate request and response schemas.
7. **Lifespan over events** — use `lifespan` context manager, not deprecated `on_event`.

---
## See also
- [Digital Garden: Knowledge Base](../../index.md)
- [Python Guide for Automation QA](../../python-guide/index.md)
- [Test Automation Framework](../../test-automation-framework/index.md)
- [CI/CD](../../ci-cd-approaches/index.md)
- [Tools — Practical Reference Guides](../../tools/index.md)
- [Python Libraries](../index.md)

