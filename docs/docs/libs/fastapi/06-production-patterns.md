---
date: 2026-09-13
tags:
  - python
  - libraries
  - fastapi
  - api
---

# FastAPI — Production Patterns

## Project Structure

```
app/
├── main.py              # FastAPI app, lifespan, router includes
├── config.py            # Pydantic Settings
├── database.py          # engine, session factory, get_db
├── models/              # SQLAlchemy ORM models
├── schemas/             # Pydantic request/response models
├── api/                 # routers (thin HTTP layer)
├── services/            # business logic
└── repositories/        # DB access layer
```

| Layer | Responsibility |
|-------|---------------|
| `api/` | HTTP only — parse request, call service, return response |
| `services/` | Business logic, orchestration, validation rules |
| `repositories/` | Database queries, ORM operations |
| `schemas/` | Input/output contracts (Pydantic) |
| `models/` | DB table definitions (SQLAlchemy) |

---

## Configuration with Pydantic Settings

```python
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_name: str = "My Service"
    debug: bool = False
    database_url: str
    secret_key: str
    access_token_expire_minutes: int = 30


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

`@lru_cache` ensures settings are loaded once. Inject via `Depends(get_settings)`.

---

## Background Tasks

```python
from fastapi import BackgroundTasks, FastAPI

app = FastAPI()


async def send_welcome_email(email: str):
    ...


@app.post("/users")
async def create_user(email: str, background_tasks: BackgroundTasks):
    background_tasks.add_task(send_welcome_email, email)
    return {"message": "User created, email will be sent"}
```

| Use case | Tool |
|----------|------|
| Quick fire-and-forget | `BackgroundTasks` (built-in) |
| Heavy/long-running jobs | Celery, ARQ, or Dramatiq |
| Scheduled tasks | APScheduler or Celery Beat |

---

## WebSocket

```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

app = FastAPI()


class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        self.active.remove(ws)

    async def broadcast(self, message: str):
        for conn in self.active:
            await conn.send_text(message)


manager = ConnectionManager()


@app.websocket("/ws/{room}")
async def websocket_endpoint(ws: WebSocket, room: str):
    await manager.connect(ws)
    try:
        while True:
            data = await ws.receive_text()
            await manager.broadcast(f"[{room}] {data}")
    except WebSocketDisconnect:
        manager.disconnect(ws)
```

---

## Error Handling & Logging

```python
import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger("app")


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"error": "validation", "detail": exc.errors()})


@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info("→ %s %s", request.method, request.url.path)
    response = await call_next(request)
    logger.info("← %s %d", request.url.path, response.status_code)
    return response
```

---

## Health Checks

```python
from fastapi import Depends, FastAPI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

app = FastAPI()

# get_db is an app dependency that yields AsyncSession.
@app.get("/health")
async def liveness():
    return {"status": "ok"}


@app.get("/health/ready")
async def readiness(db: AsyncSession = Depends(get_db)):
    await db.execute(text("SELECT 1"))
    return {"status": "ready"}
```

| Endpoint | Purpose |
|----------|---------|
| `/health` | Liveness — is the process running? |
| `/health/ready` | Readiness — are dependencies available? |

---

## Deployment

```dockerfile
FROM python:3.13-slim
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN pip install uv && uv sync --frozen --no-dev
COPY app/ app/
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

```yaml
services:
  api:
    build: .
    ports: ["8000:8000"]
    env_file: [.env]
    depends_on: { db: { condition: service_healthy } }
  db:
    image: postgres:17
    environment: { POSTGRES_DB: mydb, POSTGRES_USER: user, POSTGRES_PASSWORD: pass }
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U user"], interval: 5s, retries: 5 }
```

| Setting | Dev | Production |
|---------|-----|-----------|
| `--reload` | Yes | No |
| `--workers` | 1 | CPU cores × 2 + 1 |
| `--log-level` | debug | info |
| Reverse proxy | None | Nginx / Traefik |
| HTTPS | Optional | Required |
