---
date: 2026-07-17
tags:
  - testing
  - test-strategy
  - integration-testing
---

# Integration Tests — Concept & Examples

## What They Test

How components work **together**. The pieces are real — no mocks for the parts being integrated.

```
Test → HTTP request → Service → Database → Response → assert
```

Common scenarios:
- API endpoint processes a request and returns JSON
- Service reads and writes a real database
- One service calls another service
- Message goes through a queue and is consumed

---

## Properties

| Property | Value |
|----------|-------|
| Speed | 0.1–1 s per test |
| Count | Hundreds on a real project |
| Feedback | Seconds — find contract breaks between layers |
| Tool | pytest + Playwright `APIRequestContext` |

---

## Tool: Playwright APIRequestContext

Playwright ships with a built-in HTTP client for API testing.
No extra libraries. Same fixture infrastructure as E2E tests.
One toolchain, two levels of the pyramid.

```python
import pytest
from playwright.sync_api import APIRequestContext, Playwright


@pytest.fixture(scope="session")
def api_context(playwright: Playwright) -> APIRequestContext:
    context = playwright.request.new_context(
        base_url="http://localhost:8000",
    )
    yield context
    context.dispose()
```

---

## Example: Task API

```python
from collections.abc import Generator

import pytest
from playwright.sync_api import APIRequestContext


@pytest.fixture(autouse=True)
def clean_tasks(api_context: APIRequestContext) -> Generator[None, None, None]:
    api_context.delete("/tasks")
    yield
    api_context.delete("/tasks")


@pytest.mark.integration
class TestTasksAPI:
    def test_new_task_starts_with_open_status(
        self, api_context: APIRequestContext,
    ) -> None:
        response = api_context.post("/tasks", data={
            "title": "Checkout timeout on Safari",
            "assignee": "alice",
        })
        assert response.status == 201
        body = response.json()
        assert body["status"] == "open"
        assert body["assignee"] == "alice"

    def test_move_task_to_in_progress(
        self, api_context: APIRequestContext,
    ) -> None:
        create_response = api_context.post(
            "/tasks",
            data={"title": "Add rate limiting to /api/auth"},
        )
        task_id = create_response.json()["id"]
        update_response = api_context.patch(
            f"/tasks/{task_id}", data={"status": "in_progress"},
        )
        assert update_response.json()["status"] == "in_progress"
        assert update_response.json()["title"] == "Add rate limiting to /api/auth"

    @pytest.mark.parametrize("task_id, expected_status", [
        ("task_999", 404),
        ("nonexistent", 404),
        ("", 404),
    ])
    def test_get_invalid_task_returns_404(
        self,
        api_context: APIRequestContext,
        task_id: str,
        expected_status: int,
    ) -> None:
        response = api_context.get(f"/tasks/{task_id}")
        assert response.status == expected_status

    def test_unassigned_task_has_null_assignee(
        self, api_context: APIRequestContext,
    ) -> None:
        response = api_context.post(
            "/tasks",
            data={"title": "Investigate flaky test in CI"},
        )
        assert response.status == 201
        assert response.json()["assignee"] is None
```

Real HTTP requests to a running service. If someone renames a field or breaks the
status logic — the test catches it before users do.

---

## What Integration Tests Catch

| Bug Type | Example |
|----------|---------|
| Field rename | `status` renamed to `state` in response |
| Wrong HTTP status | Returns 200 instead of 201 on create |
| Missing field | `assignee` not included in response body |
| DB constraint | Duplicate unique key error surfaces |
| Auth leak | Endpoint accessible without token |

---

## Scope: What to Mock vs What Not to Mock

| Component | In Integration Test |
|-----------|---------------------|
| Database | Real (use test DB or Testcontainers) |
| HTTP service under test | Real |
| Third-party payment API | Mock — don't charge real cards in tests |
| Email service | Mock — don't send real emails |
| Internal service under test | Real |

The rule: mock at the **system boundary** (external payment, external email, SMS).
Keep everything internal real — that's what integration testing is for.
