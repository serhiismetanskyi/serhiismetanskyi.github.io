---
date: 2026-09-12
tags:
  - python
  - libraries
  - fastapi
  - api
---

# FastAPI — Dependencies & Middleware

## Dependency Injection Basics

```python
from fastapi import Depends, FastAPI

app = FastAPI()


async def common_params(skip: int = 0, limit: int = 100):
    return {"skip": skip, "limit": limit}


@app.get("/items")
async def list_items(params: dict = Depends(common_params)):
    return params
```

`Depends()` resolves the function, caches the result per request, and injects it. Sync dependencies run in a threadpool; async ones run in the event loop.

---

## Yield Dependencies (Teardown)

```python
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

engine = create_async_engine("postgresql+asyncpg://user:pass@localhost/db")
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session
```

Code after `yield` runs after the response is sent — use for closing connections, releasing locks, cleanup.

---

## Dependency Chains

```python
from fastapi import Depends, HTTPException, status


async def get_current_user(db=Depends(get_db)):
    user = "alice"
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    return user


async def get_admin_user(user=Depends(get_current_user)):
    if user != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    return user


@app.get("/admin/dashboard")
async def admin_dashboard(admin=Depends(get_admin_user)):
    return {"admin": admin}
```

Dependencies form a DAG — resolved top-down, cached per request.

---

## Class-Based Dependencies

```python
from fastapi import Depends, Query


class Pagination:
    def __init__(
        self,
        page: int = Query(default=1, ge=1),
        size: int = Query(default=20, ge=1, le=100),
    ):
        self.offset = (page - 1) * size
        self.limit = size


@app.get("/items")
async def list_items(pagination: Pagination = Depends()):
    return {"offset": pagination.offset, "limit": pagination.limit}
```

When `Depends()` has no argument, FastAPI uses the type annotation as the dependency.

---

## Dependency Scopes

```python
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException


async def verify_api_key(x_api_key: str = Header()):
    if x_api_key != "secret":
        raise HTTPException(status_code=403, detail="Invalid API key")


router = APIRouter(prefix="/protected", dependencies=[Depends(verify_api_key)])
app = FastAPI(dependencies=[Depends(verify_api_key)])
```

| Scope | Where | Effect |
|-------|-------|--------|
| Endpoint | `@app.get(..., dependencies=[])` | Single route |
| Router | `APIRouter(dependencies=[])` | All routes in router |
| App | `FastAPI(dependencies=[])` | All routes globally |

---

## Lifespan Context Manager

```python
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy.ext.asyncio import create_async_engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db_engine = create_async_engine("postgresql+asyncpg://...")
    yield
    await app.state.db_engine.dispose()


app = FastAPI(lifespan=lifespan)
```

Everything before `yield` runs at **startup**, everything after at **shutdown**. Use `app.state` to store shared resources.

---

## Middleware

```python
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://frontend.example.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_timing_header(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Process-Time"] = f"{time.perf_counter() - start:.4f}"
    return response
```

| Middleware | Purpose |
|-----------|---------|
| `CORSMiddleware` | Cross-origin resource sharing |
| `TrustedHostMiddleware` | Host header validation |
| `GZipMiddleware` | Response compression |
| Custom `@app.middleware("http")` | Logging, timing, auth checks |

---

## Exception Handlers

```python
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI()


class AppError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        self.code = code
        self.message = message
        self.status = status


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    return JSONResponse(
        status_code=exc.status, content={"error": exc.code, "message": exc.message},
    )
```
