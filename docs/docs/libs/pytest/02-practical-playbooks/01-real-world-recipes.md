---
date: 2026-09-21
tags:
  - python
  - libraries
  - pytest
  - testing
---

# Pytest Playbook — Real-World Recipes

Copy-paste templates for common testing scenarios.

## 1) FastAPI Endpoint Test

```python
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_user(async_client: AsyncClient) -> None:
    """Assumes async_client fixture from conftest.py (see below)."""
    payload = {"email": "alice@example.com", "name": "Alice"}
    response = await async_client.post("/users", json=payload)
    assert response.status_code == 201
    assert response.json()["email"] == payload["email"]
```

FastAPI `conftest.py` fixture:

```python
import pytest
from httpx import ASGITransport, AsyncClient
from myapp.main import app


@pytest.fixture
async def async_client():
    """Test client that talks directly to the ASGI app (no network)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
```

## 2) Service Test with Repository Mock

```python
def test_checkout_total(mocker):
    # mocker.Mock() creates a lightweight stand-in for the repository
    repo = mocker.Mock()
    repo.get_items.return_value = [{"price": 10}, {"price": 5}]
    service = CheckoutService(repo=repo)

    assert service.total("order-1") == 15
    repo.get_items.assert_called_once_with("order-1")
```

## 3) SQLAlchemy Rollback Per Test

```python
import pytest
from sqlalchemy.orm import Session


@pytest.fixture
def db_session(engine):
    """Each test runs inside a transaction that rolls back on teardown."""
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
    yield session
    session.close()
    transaction.rollback()
    connection.close()
```

## 4) CLI Test (Click / Typer)

```python
from click.testing import CliRunner
from myapp.cli import app


def test_cli_dry_run():
    runner = CliRunner()
    result = runner.invoke(app, ["sync", "--dry-run"])
    assert result.exit_code == 0
    assert "completed" in result.output.lower()
```

## 5) Background Task Trigger

```python
def test_enqueues_job(mocker):
    # verify the task is dispatched, not that email is actually sent
    enqueue = mocker.patch("myapp.tasks.enqueue_email")
    send_welcome_email("alice@example.com")
    enqueue.assert_called_once_with("alice@example.com")
```

## 6) Retry Logic

```python
from myapp.exceptions import ServiceUnavailable


def test_retry_on_503(mocker):
    # side_effect list: first call raises, second returns success
    call = mocker.Mock(side_effect=[ServiceUnavailable(), {"ok": True}])
    result = fetch_with_retry(call, retries=2)
    assert result["ok"] is True
    assert call.call_count == 2
```

## 7) Contract Shape Test

```python
def test_user_response_has_required_fields(client):
    """Guard against accidental field removal in API responses."""
    response = client.get("/users/1")
    body = response.json()
    assert response.status_code == 200
    # <= checks subset: all required keys must be present
    assert {"id", "email", "name"} <= set(body.keys())
```

## 8) Time Freeze

```python
def test_token_expiry(freezer):
    """Requires pytest-freezegun. Modern alternative: time-machine (faster, C-based)."""
    freezer.move_to("2026-04-01T10:00:00Z")
    token = issue_token(ttl_seconds=60)

    freezer.move_to("2026-04-01T10:01:01Z")  # 61s later
    assert is_token_expired(token) is True
```

## Quick Checklist

- Prefer fixture-driven setup over inline setup.
- Mock boundaries (HTTP, DB adapters, SMTP), not core business logic.
- Name tests as `test_<action>_<expected_result>`.
- Use deterministic data (fixed IDs, fixed timestamps).
- Import what you use — keep examples self-contained.
