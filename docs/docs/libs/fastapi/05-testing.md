---
date: 2026-09-13
tags:
  - python
  - libraries
  - fastapi
  - api
---

# FastAPI — Testing

## TestClient Basics

```python
from fastapi import FastAPI
from fastapi.testclient import TestClient

app = FastAPI()


@app.get("/health")
async def health():
    return {"status": "ok"}


def test_health():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

`TestClient` wraps httpx and runs async endpoints synchronously. No server needed.

---

## Async Testing with httpx

```python
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.mark.anyio
async def test_health(async_client: AsyncClient):
    response = await async_client.get("/health")
    assert response.status_code == 200
```

Use `pytest-anyio` for async test support. Required when testing real async DB sessions.

---

## Dependency Overrides

```python
from fastapi import Depends

async def get_db():
    yield "real_db"


def test_override_db():
    async def mock_db():
        yield "test_db"

    app.dependency_overrides[get_db] = mock_db
    client = TestClient(app)
    response = client.get("/data")
    assert response.json() == {"db": "test_db"}
    app.dependency_overrides.clear()
```

| Pattern | Use |
|---------|-----|
| `app.dependency_overrides[dep] = mock` | Replace any `Depends()` |
| `app.dependency_overrides.clear()` | Reset after test |
| Override `get_current_user` | Test as specific user/role |
| Override `get_db` | Inject test DB session |

---

## Test Database Setup

```python
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base, get_db
from app.main import app

test_engine = create_async_engine("sqlite+aiosqlite:///./test.db")
TestSession = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture(autouse=True)
async def setup_db():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def client(setup_db):
    async with TestSession() as session:
        async def override():
            yield session

        app.dependency_overrides[get_db] = override
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            yield c
        app.dependency_overrides.clear()
```

---

## Testing Auth Endpoints

```python
@pytest.fixture
async def auth_headers(client: AsyncClient):
    response = await client.post(
        "/auth/token",
        data={"username": "alice@test.com", "password": "secret123"},
    )
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.anyio
async def test_protected(client: AsyncClient, auth_headers: dict):
    response = await client.get("/me", headers=auth_headers)
    assert response.status_code == 200


@pytest.mark.anyio
async def test_unauthorized(client: AsyncClient):
    response = await client.get("/me")
    assert response.status_code == 401
```

---

## Testing with Mocked User

```python
from app.auth import get_current_user
from app.models import User


def test_as_admin():
    async def mock_user():
        return User(id=1, name="Admin", email="admin@test.com", role="admin")

    app.dependency_overrides[get_current_user] = mock_user
    client = TestClient(app)
    response = client.get("/admin/dashboard")
    assert response.status_code == 200
    app.dependency_overrides.clear()
```

---

## Testing Files & WebSocket

```python
def test_upload():
    client = TestClient(app)
    response = client.post(
        "/upload",
        files={"file": ("report.csv", b"name,value\nalice,100", "text/csv")},
    )
    assert response.json()["filename"] == "report.csv"


def test_websocket():
    client = TestClient(app)
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"message": "hello"})
        assert ws.receive_json()["message"] == "hello"
```

---

## Test Organization

```
tests/
├── conftest.py          # shared fixtures (db, client, auth)
├── test_auth.py         # auth endpoints
├── test_users.py        # user CRUD
├── test_items.py        # item endpoints
└── test_websocket.py    # WebSocket tests
```
