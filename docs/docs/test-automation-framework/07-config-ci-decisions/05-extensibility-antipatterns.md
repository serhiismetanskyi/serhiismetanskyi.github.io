---
date: 2026-07-25
tags:
  - test-automation
  - architecture
  - ci-cd
---

# Framework Extensibility & Anti-Patterns

## Framework Extensibility

A good framework grows without rewriting its core.

### Custom pytest Plugins

Encapsulate framework-level behaviour in a local plugin:

```python
# framework/plugin.py
import pytest
import logging

log = logging.getLogger(__name__)


def pytest_runtest_setup(item: pytest.Item) -> None:
    log.info("Starting test: %s", item.nodeid)


def pytest_runtest_teardown(item: pytest.Item, nextitem) -> None:
    log.info("Finished test: %s", item.nodeid)


def pytest_runtest_logreport(report: pytest.TestReport) -> None:
    if report.when == "call":
        status = "PASSED" if report.passed else "FAILED"
        log.info("Test %s: %s in %.2fs", status, report.nodeid, report.duration)
```

Register in `conftest.py`:
```python
pytest_plugins = ["framework.plugin"]
```

### Custom Reporters

```python
# framework/reporters/slack_reporter.py
import pytest
import httpx
import logging

log = logging.getLogger(__name__)


class SlackReporter:
    def __init__(self, webhook_url: str) -> None:
        self._webhook = webhook_url
        self._failures: list[str] = []

    def record_failure(self, nodeid: str) -> None:
        self._failures.append(nodeid)

    def send_summary(self, total: int, duration: float) -> None:
        if not self._failures:
            return
        message = (
            f":x: *Test failures*: {len(self._failures)}/{total}\n"
            f"Duration: {duration:.1f}s\n"
            + "\n".join(f"• `{f}`" for f in self._failures[:10])
        )
        httpx.post(self._webhook, json={"text": message})
        log.info("Slack report sent: %d failures", len(self._failures))
```

### Replaceable Components

Design core components as interfaces (protocols in Python):

```python
from typing import Protocol


class HttpDriverProtocol(Protocol):
    def get(self, path: str, **kwargs) -> object: ...
    def post(self, path: str, **kwargs) -> object: ...
    def close(self) -> None: ...
```

Tests depend on the protocol, not the implementation.
Swap real HTTP driver for a mock driver in unit tests of framework components.

### Modularity Rules

- Each module has one responsibility
- No circular imports between framework layers
- Core layer has zero test-domain knowledge
- New protocol support (gRPC, MQTT) adds a new driver, touches nothing else

---

## Anti-Patterns

### God Page Object

```python
# Bad — 200+ methods in one class
class ApplicationPage:
    def login(self): ...
    def logout(self): ...
    def create_product(self): ...
    def update_product(self): ...
    def delete_product(self): ...
    def create_order(self): ...
    def get_user_profile(self): ...
    # ... 190 more methods
```

Fix: one page object per page or significant component.

### Hardcoded Test Data

```python
# Bad — hardcoded values cause collisions and coupling
def test_create_user():
    response = api.post("/users", json={"email": "john@test.com"})
    assert response.status_code == 201

# Good — unique every run
def test_create_user():
    email = f"john-{uuid.uuid4().hex[:8]}@test.com"
    response = api.post("/users", json={"email": email})
    assert response.status_code == 201
```

### Tight Coupling to UI Implementation

```python
# Bad — breaks every time class is renamed
page.locator(".btn-primary.col-md-6.submit-action")

# Good — stable semantic selector
page.get_by_test_id("checkout-submit")
```

### Flaky Tests Ignored

Ignoring flaky tests is a policy decision to accept broken CI.
Every flaky test must be either fixed or quarantined with a tracking ticket.
Silence = acceptance of degraded feedback quality.

### No Abstraction in Tests

```python
# Bad — HTTP construction mixed into test
def test_user_can_update_email(api_token):
    import httpx
    client = httpx.Client(base_url="https://api.example.com")
    headers = {"Authorization": f"Bearer {api_token}"}
    user = client.post("/users", headers=headers, json={"email": "u@e.com"}).json()
    response = client.patch(
        f"/users/{user['id']}",
        headers=headers,
        json={"email": "new@e.com"},
    )
    assert response.status_code == 200

# Good — tests describe intent, not protocol
def test_user_can_update_email(api_client, user_factory):
    user = user_factory.create()
    api_client.users.update(user["id"], email="new@example.com")
    updated = api_client.users.get(user["id"])
    assert updated["email"] == "new@example.com"
```

### Test Implementation Coupling

```python
# Bad — test knows internal implementation details
def test_discount_applied(order_service, mocker):
    mocker.patch.object(order_service, "_calculate_discount_internally")
    # Testing that a private method was called = implementation test, not behaviour test

# Good — test verifies observable outcome
def test_discount_applied(order_service):
    order = order_service.create(items=["SKU-001"], promo_code="SAVE20")
    assert order["total"] == order["subtotal"] * 0.8
```
