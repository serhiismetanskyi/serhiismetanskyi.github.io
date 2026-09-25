---
date: 2026-09-17
tags:
  - python
  - libraries
  - playwright
  - ui-testing
---

# Playwright — API Testing

Playwright can send HTTP requests directly via `APIRequestContext` — no browser needed.

## Use Cases

| Scenario | Why Playwright API |
|----------|-------------------|
| Test REST endpoints | Fast, no browser overhead |
| Seed server state before UI test | Create users/data via API, then verify in UI |
| Validate side effects after UI action | User clicks "Delete" in UI → verify via API |
| Auth via API, then test UI | Login through API (fast), reuse session in browser |

---

## Setup — APIRequestContext Fixture

```python
import os
from typing import Generator

import pytest
from playwright.sync_api import Playwright, APIRequestContext

API_TOKEN = os.environ.get("API_TOKEN", "")


@pytest.fixture(scope="session")
def api(playwright: Playwright) -> Generator[APIRequestContext, None, None]:
    """Session-scoped API client with shared auth and base URL."""
    ctx = playwright.request.new_context(
        base_url="https://api.example.com",
        extra_http_headers={
            "Authorization": f"Bearer {API_TOKEN}",
            "Accept": "application/json",
        },
    )
    yield ctx
    ctx.dispose()  # release resources
```

---

## HTTP Methods

```python
from playwright.sync_api import APIRequestContext, expect


def test_list_users(api: APIRequestContext):
    resp = api.get("/users", params={"page": 1, "per_page": 10})
    assert resp.ok  # status < 400
    expect(resp).to_be_ok()  # assertion style equivalent
    users = resp.json()
    assert len(users) > 0


def test_create_user(api: APIRequestContext):
    resp = api.post("/users", data={
        "name": "Alice",
        "email": "alice@example.com",
    })
    assert resp.status == 201
    body = resp.json()
    assert body["name"] == "Alice"


def test_update_user(api: APIRequestContext):
    resp = api.put("/users/1", data={"name": "Alice Updated"})
    assert resp.ok


def test_patch_user(api: APIRequestContext):
    resp = api.patch("/users/1", data={"role": "admin"})
    assert resp.ok
    assert resp.json()["role"] == "admin"


def test_delete_user(api: APIRequestContext):
    resp = api.delete("/users/99")
    assert resp.status == 204
```

### Response Object

| Attribute | Returns |
|-----------|---------|
| `resp.ok` | `True` if status < 400 |
| `resp.status` | HTTP status code |
| `resp.json()` | Parsed JSON body |
| `resp.text()` | Body as string |
| `resp.body()` | Raw response body as bytes |
| `resp.headers` | Response headers dict (lowercase keys) |
| `resp.url` | Final URL (after redirects) |
| `resp.dispose()` | Release response body (free memory for large responses) |

---

## Setup & Teardown with Fixtures

```python
import pytest
from playwright.sync_api import APIRequestContext


@pytest.fixture(autouse=True)
def test_repo(api: APIRequestContext):
    """Create a test resource before tests, clean up after."""
    resp = api.post("/repos", data={"name": "test-repo"})
    assert resp.ok
    yield
    api.delete("/repos/test-repo")
```

---

## Mixed: API + UI in One Test

Seed data via API, verify through browser UI:

```python
from playwright.sync_api import Page, APIRequestContext, expect


def test_created_item_appears_in_ui(api: APIRequestContext, page: Page):
    # arrange: create resource via API (fast, reliable)
    resp = api.post("/items", data={"title": "New Item", "status": "active"})
    assert resp.ok
    item_id = resp.json()["id"]

    # act: navigate to UI and verify
    page.goto(f"/items")
    item_row = page.get_by_role("row").filter(has_text="New Item")
    expect(item_row).to_be_visible()

    # cleanup via API
    api.delete(f"/items/{item_id}")
```

UI action → API validation:

```python
def test_delete_button_removes_item(api: APIRequestContext, page: Page):
    # seed via API
    resp = api.post("/items", data={"title": "To Delete"})
    item_id = resp.json()["id"]

    # act in UI
    page.goto("/items")
    row = page.get_by_role("row").filter(has_text="To Delete")
    row.get_by_role("button", name="Delete").click()

    # assert via API — item no longer exists
    check = api.get(f"/items/{item_id}")
    assert check.status == 404
```

---

## Reuse Auth State Between API and Browser

Login via API (fast), reuse cookies/tokens in browser context:

```python
import pytest
from playwright.sync_api import Playwright, Browser, BrowserContext


@pytest.fixture(scope="session")
def auth_state(playwright: Playwright):
    """Authenticate via API once, share state across all tests."""
    ctx = playwright.request.new_context(base_url="https://example.com")
    ctx.post("/api/login", data={"user": "admin", "pass": "secret"})
    state = ctx.storage_state()  # captures cookies + localStorage
    ctx.dispose()
    return state


@pytest.fixture
def auth_page(browser: Browser, auth_state: dict):
    """Browser page pre-loaded with auth cookies."""
    context = browser.new_context(storage_state=auth_state)
    page = context.new_page()
    yield page
    context.close()
```

---

## Best Practices

- **Use `api` fixture for setup/teardown** — faster than UI for data seeding.
- **Keep API and UI assertions separate** — test one layer at a time where possible.
- **Session-scoped auth** — authenticate once via API, share storage state.
- **Assert `resp.ok`** before accessing body — fail fast on errors.
- **Clean up test data** in fixture teardown — prevent state leakage.
