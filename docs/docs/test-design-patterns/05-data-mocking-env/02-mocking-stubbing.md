---
date: 2026-07-13
tags:
  - test-automation
  - design-patterns
  - mocking
  - test-data
---

# Mocking and Stubbing

## Types

### Mock

A mock is a test double that records calls and allows assertions on how it was used.
It verifies **behaviour**: was the method called? With what arguments? How many times?

```python
from unittest.mock import MagicMock, patch

def test_sends_email_on_registration(user_service):
    with patch("services.email.EmailClient.send") as mock_send:
        user_service.register(email="a@b.com", password="secret")
        mock_send.assert_called_once_with(
            to="a@b.com",
            subject="Welcome",
        )
```

Use when: verifying that a side-effect was triggered (email, webhook, audit log).

### Stub

A stub returns pre-defined responses without recording calls.
It verifies **state**: given this input, does the system produce the right output?

```python
from unittest.mock import patch

def test_returns_user_from_cache(user_service):
    cached_user = {"id": "1", "email": "a@b.com"}
    with patch("services.cache.CacheClient.get", return_value=cached_user):
        result = user_service.get_user("1")
    assert result["email"] == "a@b.com"
```

Use when: isolating external dependencies that return data (cache, DB, remote API).

### Fake

A fake is a lightweight working implementation of a dependency, not a recording tool.

```python
class InMemoryUserRepository:
    def __init__(self) -> None:
        self._store: dict[str, dict] = {}

    def save(self, user: dict) -> None:
        self._store[user["id"]] = user

    def get(self, user_id: str) -> dict | None:
        return self._store.get(user_id)

    def delete(self, user_id: str) -> None:
        self._store.pop(user_id, None)
```

Use when: replacing a DB or external API for a full test suite run without infrastructure.

---

## Comparison

| Type | Records calls | Returns data | Has logic | Use case |
|---|---|---|---|---|
| Mock | Yes | Configurable | No | Verify side-effects |
| Stub | No | Pre-defined | No | Isolate data sources |
| Fake | No | Computed | Yes | Replace infrastructure |
| Spy | Yes | Real | Real | Observe real behaviour |

---

## Use Cases

### External Dependencies

Replace outbound HTTP calls:

```python
import httpx
import pytest
from pytest_httpx import HTTPXMock

def test_calls_payment_gateway(httpx_mock: HTTPXMock, order_service):
    httpx_mock.add_response(
        method="POST",
        url="https://payments.example.com/charge",
        json={"status": "ok", "transaction_id": "tx-1"},
    )
    result = order_service.charge(amount=100)
    assert result["transaction_id"] == "tx-1"
```

### Failure Simulation

Inject errors to test resilience:

```python
from unittest.mock import patch
import httpx

def test_retries_on_503(order_service):
    call_count = 0

    def flaky_response(request):
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            return httpx.Response(503)
        return httpx.Response(200, json={"status": "ok"})

    with patch("httpx.Client.post", side_effect=flaky_response):
        result = order_service.charge(amount=100)

    assert result["status"] == "ok"
    assert call_count == 3
```

---

## Risks

| Risk | Description | Mitigation |
|---|---|---|
| Over-mocking | Tests pass but real system is broken | Contract tests + integration tests |
| Mock drift | Mock returns data real API no longer returns | Consumer-driven contract tests |
| False confidence | All mocked = no real wiring verified | Integration layer with real dependencies |
| Mocking internals | Testing implementation not behaviour | Mock at the boundary (HTTP, DB), not internals |

---

## Decision Guide

| Scenario | Use |
|---|---|
| Verify email was sent | Mock |
| Isolate DB call, return data | Stub |
| Replace DB for full suite | Fake |
| Simulate network failure | Stub / HTTPXMock |
| Test real DB queries | Testcontainers (real DB) |
