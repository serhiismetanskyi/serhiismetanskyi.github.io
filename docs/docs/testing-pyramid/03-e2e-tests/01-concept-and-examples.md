---
date: 2026-07-18
tags:
  - testing
  - test-strategy
  - e2e-testing
---

# E2E Tests — Concept & Examples

## What They Test

The whole application, from the user's perspective. A real browser, real clicks,
real page content. Playwright launches Chromium, navigates the app, and checks
what the user would actually see and do.

```
Test → Playwright → Browser → App (frontend + backend + DB) → assert visible state
```

---

## Properties

| Property | Value |
|----------|-------|
| Speed | 5–30 s per test |
| Count | Tens — critical flows only |
| Feedback | Minutes — run after integration in CI |
| Tool | Playwright (browser mode) |

Most expensive to run and maintain. Keep only tests that represent
critical user flows where a failure would directly impact the business.

---

## What to Cover with E2E

- Login / logout / session expiry
- Core purchase or onboarding flow
- Critical data creation flow (create order, submit form, upload file)
- Permission boundaries (user can't see admin area)

**What not to cover with E2E:**
- Field-level form validation — unit test job
- API response format — integration test job
- Every error message variant — parametrize unit tests

---

## Stable Locators

Playwright locators find elements the way a user would.
They survive refactoring better than DOM-path selectors.

| Locator | Example | Stability |
|---------|---------|-----------|
| `get_by_role` | `get_by_role("button", name="Sign In")` | High |
| `get_by_label` | `get_by_label("Email")` | High |
| `get_by_text` | `get_by_text("Welcome back")` | Medium |
| `data-testid` | `locator('[data-testid="submit-btn"]')` | High |
| CSS by ID | `locator("#login-form")` | High |
| DOM-path CSS | `locator("div > section:nth-child(2) > form > button")` | Very low |

---

## Example: Login Flow

```python
import re

import pytest
from playwright.sync_api import Page, expect


@pytest.mark.e2e
class TestLoginFlow:
    def test_successful_login_redirects_to_dashboard(self, page: Page) -> None:
        page.goto("http://localhost:3000/login")
        page.get_by_label("Email").fill("qa@company.com")
        page.get_by_label("Password").fill("securepass123")
        page.get_by_role("button", name="Sign In").click()
        expect(page.get_by_role("heading", name="Dashboard")).to_be_visible()
        expect(page).to_have_url(re.compile(r".*/dashboard"))

    def test_wrong_password_shows_error(self, page: Page) -> None:
        page.goto("http://localhost:3000/login")
        page.get_by_label("Email").fill("qa@company.com")
        page.get_by_label("Password").fill("wrongpass")
        page.get_by_role("button", name="Sign In").click()
        expect(page.get_by_text("Invalid credentials")).to_be_visible()
        expect(page).to_have_url(re.compile(r".*/login"))
```

---

## Example: Logged-in User Flow with Shared Fixture

```python
@pytest.fixture()
def logged_in_page(page: Page) -> Page:
    page.goto("http://localhost:3000/login")
    page.get_by_label("Email").fill("qa@company.com")
    page.get_by_label("Password").fill("securepass123")
    page.get_by_role("button", name="Sign In").click()
    expect(page.get_by_role("heading", name="Dashboard")).to_be_visible()
    return page


@pytest.mark.e2e
class TestTaskBoard:
    def test_create_task_appears_on_board(self, logged_in_page: Page) -> None:
        logged_in_page.get_by_role("link", name="Tasks").click()
        logged_in_page.get_by_role("button", name="New Task").click()
        logged_in_page.get_by_label("Title").fill("Fix checkout timeout")
        logged_in_page.get_by_label("Assignee").select_option("alice")
        logged_in_page.get_by_role("button", name="Create").click()

        expect(logged_in_page.get_by_text("Fix checkout timeout")).to_be_visible()
        expect(logged_in_page.get_by_text("alice")).to_be_visible()
```

---

## `expect` vs `assert` — Critical Difference

| | `expect(locator).to_be_visible()` | `assert locator.is_visible()` |
|---|---|---|
| Retries | Yes, up to timeout | No — checks once |
| Network delays | Handled automatically | Fails if page still loading |
| Flakiness | Low | High |

Always use `expect` from `playwright.sync_api` for state assertions in E2E tests.
