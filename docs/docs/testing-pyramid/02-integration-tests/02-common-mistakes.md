---
date: 2026-07-17
tags:
  - testing
  - test-strategy
  - integration-testing
---

# Integration Tests — Common Mistakes

## Mistake 1: Shared State Between Tests

One test creates data, another assumes it exists.
Works locally, breaks on CI, breaks when `pytest-randomly` shuffles order.

```python
from collections.abc import Generator

import pytest
from playwright.sync_api import APIRequestContext


@pytest.mark.integration
class TestSharedStateBad:
    """Bad: second test depends on data created by the first."""

    def test_add_note(self, api_context: APIRequestContext) -> None:
        response = api_context.post(
            "/notes",
            data={"author": "alice", "text": "Reproduced on staging"},
        )
        assert response.status == 201

    def test_list_includes_alice_note(
        self, api_context: APIRequestContext,
    ) -> None:
        # Only passes if test_add_note ran first — order-dependent
        response = api_context.get("/notes")
        notes = response.json()
        assert any(note["author"] == "alice" for note in notes)
```

The fix: clean state before and after every test.

```python
@pytest.mark.integration
class TestSharedStateGood:
    """Good: each test creates its own data and cleans up."""

    @pytest.fixture(autouse=True)
    def clean_notes(self, api_context: APIRequestContext) -> Generator[None, None, None]:
        api_context.delete("/notes")
        yield
        api_context.delete("/notes")

    def test_add_and_list_note(self, api_context: APIRequestContext) -> None:
        api_context.post(
            "/notes",
            data={"author": "bob", "text": "Fixed in commit a1b2c3"},
        )
        response = api_context.get("/notes")
        assert len(response.json()) == 1
        assert response.json()[0]["author"] == "bob"

    def test_empty_list_when_no_notes(
        self, api_context: APIRequestContext,
    ) -> None:
        response = api_context.get("/notes")
        assert response.json() == []
```

**Rule:** integration tests must be **order-independent**.
Add `pytest-randomly` to the CI run to catch ordering issues early.

---

## Mistake 2: Mocking Too Much (Integration Test in a Trench Coat)

If the database, the HTTP layer, and the serializer are all mocked in an "integration" test —
what is actually being integrated? Nothing. It's a unit test pretending to be something else.

```python
from unittest.mock import MagicMock, patch

import pytest

from myapp.services.order_service import create_order  # type: ignore[import]


@pytest.mark.integration
class TestOrderServiceOverMocked:
    """Bad: everything is mocked — no real integration happens."""

    @patch("myapp.db.session")
    @patch("myapp.serializers.OrderSerializer")
    @patch("myapp.services.payment_gateway.charge")
    def test_create_order(self, mock_charge, mock_serializer, mock_session) -> None:
        mock_session.add = MagicMock()
        mock_serializer.return_value.data = {"id": "1", "status": "paid"}
        mock_charge.return_value = {"success": True}
        # Tests the mock configuration, not the actual integration
        result = create_order(user_id="1", amount=50.0)
        assert result["status"] == "paid"
```

If you want to mock, do it at the unit level.
At the integration level, let the components actually talk to each other.

**Rule:** mock only at the **external boundary** (third-party APIs, external payment, SMS).
The database, internal services, and HTTP layer should be real.

---

## Mistake 3: No Cleanup After Test Failure

A test creates data, the assertion fails, cleanup never runs.
Next test run finds leftover data and fails for an unrelated reason.

```python
@pytest.mark.integration
class TestCleanupBad:
    def test_create_user(self, api_context: APIRequestContext) -> None:
        api_context.post("/users", data={"email": "test@example.com"})
        response = api_context.get("/users")
        assert len(response.json()) == 1   # if this fails, cleanup never runs
        api_context.delete("/users")        # cleanup at the end — skipped on failure
```

Fix: use `yield` fixtures so teardown always runs.

```python
@pytest.mark.integration
class TestCleanupGood:
    @pytest.fixture(autouse=True)
    def reset_users(self, api_context: APIRequestContext) -> Generator[None, None, None]:
        api_context.delete("/users")   # before
        yield
        api_context.delete("/users")   # after — always runs, even on failure

    def test_create_user(self, api_context: APIRequestContext) -> None:
        api_context.post("/users", data={"email": "test@example.com"})
        response = api_context.get("/users")
        assert len(response.json()) == 1
```

---

## Checklist

| Check | Bad Pattern | Fix |
|-------|-------------|-----|
| Test isolation | Depends on previous test's data | `autouse` fixture with `yield` cleanup |
| Order independence | Fails when shuffled | Add `pytest-randomly` to CI |
| Mock scope | Everything mocked | Only mock external 3rd-party boundaries |
| Cleanup on failure | Cleanup at end of test body | Use `yield` in fixture, not manual teardown |
| Unique test data | Hardcoded shared IDs | Generate unique IDs per test (`uuid.uuid4()`) |
