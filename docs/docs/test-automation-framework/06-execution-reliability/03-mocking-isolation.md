---
date: 2026-07-24
tags:
  - test-automation
  - architecture
---

# Mocking & Test Isolation

## Mock vs Stub vs Fake vs Spy

| Type | Definition | Returns | Verifies calls |
|------|-----------|---------|----------------|
| **Mock** | Pre-programmed with expectations | Configured values | Yes |
| **Stub** | Canned responses only | Fixed values | No |
| **Fake** | Working lightweight implementation | Real-ish values | No |
| **Spy** | Wraps real object, records calls | Real values | Yes |

---

## When to Use Each

### Stub — External Service with Known Response

```python
from unittest.mock import patch


def test_user_creation_sends_welcome_email(user_service):
    with patch("framework.email.EmailClient.send") as stub:
        stub.return_value = {"status": "queued", "id": "msg-123"}
        user = user_service.register(email="new@example.com")

    assert user["email"] == "new@example.com"
    # No verification on stub — just needed to not fail
```

### Mock — Verify Interaction Happened

```python
from unittest.mock import MagicMock, patch


def test_failed_payment_triggers_notification(order_service):
    with patch("framework.notifications.NotificationClient") as mock_client:
        mock_client.return_value.send_alert = MagicMock()

        order_service.process_payment(order_id="ord-001", amount=99.99)

        mock_client.return_value.send_alert.assert_called_once_with(
            event="payment_failed",
            order_id="ord-001",
        )
```

### Fake — In-Memory Database or Cache

```python
class FakeCache:
    def __init__(self) -> None:
        self._store: dict = {}

    def get(self, key: str) -> str | None:
        return self._store.get(key)

    def set(self, key: str, value: str, ttl: int | None = None) -> None:
        self._store[key] = value

    def delete(self, key: str) -> None:
        self._store.pop(key, None)


@pytest.fixture
def cache() -> FakeCache:
    return FakeCache()
```

A fake is a real implementation of an interface that stores data in memory.
Appropriate when the real implementation (Redis, Memcached) would slow tests.

---

## pytest-mock Usage

```python
def test_order_created_event_published(order_service, mocker):
    mock_publisher = mocker.patch("framework.events.EventPublisher.publish")

    order = order_service.create(user_id="u-001", items=["SKU-001"])

    mock_publisher.assert_called_once_with(
        event="order.created",
        payload={"order_id": order["id"], "user_id": "u-001"},
    )
```

`mocker.patch` from `pytest-mock` automatically resets after the test.
No manual `patch.stop()` or context manager needed.

---

## Isolation at Service Boundary

For integration tests, replace only external third-party services.
Do not mock your own code in integration tests — that defeats the purpose.

```
Integration test scope:
┌────────────────────────────────────────┐
│  Your API  →  Your DB  →  Your Logic   │
│  ↕ (real)     ↕ (real)    ↕ (real)     │
│  [External Payment Gateway] → MOCKED   │
│  [External Email Service]   → MOCKED   │
└────────────────────────────────────────┘
```

### WireMock / respx for HTTP Mocking

```python
import respx
import httpx


@respx.mock
def test_payment_gateway_timeout_handled(order_service):
    respx.post("https://payment.external.com/charge").mock(
        side_effect=httpx.TimeoutException("timeout")
    )

    result = order_service.charge(amount=100, token="tok_test")

    assert result["status"] == "PAYMENT_TIMEOUT"
    assert result["retry_after_seconds"] == 30
```

---

## Over-Mocking Risk

Over-mocking tests the mock, not the code.

**Signs of over-mocking:**
- More `patch()` calls than lines of business logic
- Test passes even when the underlying logic is wrong
- Mocked return values never resemble real data

**Rule of thumb:**
```
Mock external dependencies (HTTP, DB, cache, email, queue).
Do NOT mock your own classes, functions, or modules.
```

If you need to mock your own code to test it, the code needs refactoring —
likely a dependency injection problem.

---

## Testcontainers — Real Services in Tests

For integration tests requiring real DB, Redis, or Kafka:

```python
import pytest
from testcontainers.postgres import PostgresContainer


@pytest.fixture(scope="session")
def postgres_container():
    with PostgresContainer("postgres:16") as pg:
        yield pg


@pytest.fixture(scope="session")
def db_url(postgres_container) -> str:
    return postgres_container.get_connection_url()
```

Testcontainers start a real Postgres in Docker, run tests against it, stop it.
No mocking. No shared state with other developers. Fully isolated.

---
## See also
- [Kafka — Testing Kafka-Based Systems](../../tools/kafka/05-testing-kafka-systems.md)
- [Redis — Testing Setup & Isolation](../../databases/redis/06-testing-setup-isolation.md)
- [RabbitMQ — Testing RabbitMQ-Based Systems](../../tools/rabbitmq/04-testing.md)
- [Modular Integration vs Unit — What Each Test Catches](../../testing-pyramid/05-modular-integration-vs-unit/03-what-each-test-catches.md)
