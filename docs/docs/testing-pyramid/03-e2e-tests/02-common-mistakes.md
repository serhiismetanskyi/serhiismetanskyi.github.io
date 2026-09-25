---
date: 2026-07-18
tags:
  - testing
  - test-strategy
  - e2e-testing
---

# E2E Tests — Common Mistakes

## Mistake 1: Fragile DOM-Path Selectors

Selectors copied from Chrome DevTools describe the DOM structure, not the user intent.
Any layout refactor breaks them — even if the feature still works perfectly.

```python
import pytest
from playwright.sync_api import Page, expect


@pytest.mark.e2e
class TestCreateTaskBad:
    """Bad: selectors describe DOM structure, not user intent."""

    def test_create_task(self, page: Page) -> None:
        page.goto("http://localhost:3000/tasks")
        page.locator(
            "#root > div.layout > main > div.toolbar > button:nth-child(2)"
        ).click()
        page.locator(
            "div.modal-body > form > input.form-control-lg"
        ).fill("Fix payment bug")
        page.locator(
            "div.modal-footer > button.btn-primary"
        ).click()
        assert page.locator("td.task-title").first.is_visible()  # no retry


@pytest.mark.e2e
class TestCreateTaskGood:
    """Good: locators describe what the user sees and does."""

    def test_create_task(self, page: Page) -> None:
        page.goto("http://localhost:3000/tasks")
        page.get_by_role("button", name="New Task").click()
        page.get_by_label("Title").fill("Fix payment bug")
        page.get_by_role("button", name="Create").click()
        expect(page.get_by_text("Fix payment bug")).to_be_visible()
```

**Rule for stable selectors:**
- `get_by_role`, `get_by_label`, `get_by_text` — preferred
- `data-testid` attribute (`[data-testid="create-btn"]`) — reliable fallback
- Unique IDs (`#login-form`) — fine
- DOM-path (`div > section:nth-child(2) > button`) — avoid

A simple check: if the selector still works after wrapping the component in a new `<div>`, it's stable enough.

---

## Mistake 2: No Wait for Async Operations

Clicking a button and immediately checking the result before the API call finishes.
Raw `assert` checks once and moves on — no retry.

```python
@pytest.mark.e2e
class TestAsyncBad:
    def test_save_profile(self, page: Page) -> None:
        page.get_by_role("button", name="Save").click()
        # API might still be in-flight
        assert page.locator(".toast-success").is_visible()  # flaky!


@pytest.mark.e2e
class TestAsyncGood:
    def test_save_profile(self, page: Page) -> None:
        page.get_by_role("button", name="Save").click()
        # Retries until visible or timeout — stable
        expect(page.get_by_text("Profile saved")).to_be_visible()
```

**Rule:** always use `expect(locator).to_be_visible()` from `playwright.sync_api`.
Never use raw `assert locator.is_visible()` for state after async operations.

---

## Mistake 3: Testing Field Validation Through E2E

Every validation rule gets an E2E test: empty email, short password, invalid phone.
Each takes 5–30 seconds. That's the unit test job — runs in milliseconds.

```python
@pytest.mark.e2e
class TestRegistrationValidationBad:
    """Bad: validation rules checked through browser — 30s+ per test."""

    def test_empty_email_shows_error(self, page: Page) -> None:
        page.goto("http://localhost:3000/register")
        page.get_by_role("button", name="Sign Up").click()
        expect(page.get_by_text("Email is required")).to_be_visible()

    def test_short_password_shows_error(self, page: Page) -> None:
        page.goto("http://localhost:3000/register")
        page.get_by_label("Password").fill("abc")
        page.get_by_role("button", name="Sign Up").click()
        expect(page.get_by_text("at least 8 characters")).to_be_visible()

    # ... 8 more validation rules, each a separate E2E test
```

The validator is already covered in milliseconds at the unit level.
The only E2E test needed here is that the **form submits successfully** when valid.

```python
@pytest.mark.e2e
class TestRegistrationGood:
    """Good: E2E only checks the successful happy path."""

    def test_valid_registration_redirects_to_onboarding(
        self, page: Page,
    ) -> None:
        page.goto("http://localhost:3000/register")
        page.get_by_label("Email").fill("newuser@company.com")
        page.get_by_label("Password").fill("Str0ng!Pass")
        page.get_by_role("button", name="Sign Up").click()
        expect(page).to_have_url("/onboarding")
```

---

## Checklist

| Check | Bad Pattern | Fix |
|-------|-------------|-----|
| Locator stability | nth-child, deep CSS path | `get_by_role`, `get_by_label`, `data-testid` |
| Async waits | `assert .is_visible()` | `expect(...).to_be_visible()` |
| Test scope | Validation rules in E2E | Move to unit `parametrize` |
| Test count | 200 E2E tests | Keep only critical user flows |
| Shared login state | Login in every test | `logged_in_page` fixture |
| Selector after refactor | Breaks on layout change | If it survives a `<div>` wrap, it's stable |
