---
date: 2026-07-23
tags:
  - test-automation
  - architecture
  - ui-testing
---

# UI Testing — Wait Strategies, Retry & Selector Abstraction

## Wait Strategies

The #1 cause of flaky UI tests is improper waiting.
`sleep()` is never a wait strategy — it is a flakiness source with a timer.

### Playwright Auto-Wait

Playwright auto-waits for elements to be actionable before interacting.
"Actionable" means: visible, enabled, stable (not animating), attached to DOM.

```python
# Playwright waits for element to be actionable automatically
page.click('[data-testid="submit"]')  # waits until button is clickable
page.fill('[data-testid="email"]', "user@example.com")  # waits until input is editable
```

No explicit wait needed for most interactions.

### Explicit Waits — When Auto-Wait Is Not Enough

```python
from playwright.sync_api import Page, expect


def wait_for_toast(page: Page, message: str, timeout: int = 5000) -> None:
    toast = page.get_by_test_id("toast-notification")
    expect(toast).to_contain_text(message, timeout=timeout)


def wait_for_table_loaded(page: Page, timeout: int = 10000) -> None:
    loading_spinner = page.get_by_test_id("table-loading")
    expect(loading_spinner).not_to_be_visible(timeout=timeout)


def wait_for_url(page: Page, pattern: str, timeout: int = 10000) -> None:
    page.wait_for_url(pattern, timeout=timeout)
```

### Network-Aware Waiting

Wait for a specific network response before asserting:

```python
def test_search_results_loaded(page):
    with page.expect_response("**/api/search**") as response_info:
        page.fill('[data-testid="search-input"]', "widget")
        page.click('[data-testid="search-submit"]')

    response = response_info.value
    assert response.status == 200
    expect(page.get_by_test_id("search-results")).to_be_visible()
```

---

## Retry Logic

### Playwright Built-In Retry (for flakiness from async UI)

```python
# pytest.ini or pyproject.toml
# [tool.pytest.ini_options]
# retries = 2  # pytest-retry

from playwright.sync_api import expect

# expect() retries assertions up to the configured timeout
expect(page.get_by_test_id("order-status")).to_have_text("CONFIRMED", timeout=10000)
```

### Custom Retry Decorator (for API calls)

```python
import time
import logging
from functools import wraps
from typing import Callable, TypeVar

log = logging.getLogger(__name__)
T = TypeVar("T")


def retry(max_attempts: int = 3, delay: float = 1.0, exceptions: tuple = (Exception,)):
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        def wrapper(*args, **kwargs) -> T:
            last_exception = None
            for attempt in range(1, max_attempts + 1):
                try:
                    return func(*args, **kwargs)
                except exceptions as exc:
                    last_exception = exc
                    log.warning(
                        "Attempt %d/%d failed for %s: %s",
                        attempt, max_attempts, func.__name__, exc,
                    )
                    if attempt < max_attempts:
                        time.sleep(delay)
            raise last_exception  # type: ignore[misc]
        return wrapper
    return decorator
```

Usage:
```python
@retry(max_attempts=3, delay=0.5)
def wait_for_order_status(api_client, order_id: str, expected: str) -> None:
    order = api_client.orders.get(order_id)
    assert order["status"] == expected, f"Expected {expected}, got {order['status']}"
```

---

## Selector Abstraction Layer

Centralise all selectors. Tests never contain raw selector strings.

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class LoginSelectors:
    username_input: str = '[data-testid="username"]'
    password_input: str = '[data-testid="password"]'
    submit_button: str = '[data-testid="submit"]'
    error_message: str = '[data-testid="error-msg"]'
    forgot_password_link: str = '[data-testid="forgot-password"]'


@dataclass(frozen=True)
class DashboardSelectors:
    welcome_heading: str = '[data-testid="welcome-heading"]'
    user_menu: str = '[data-testid="user-menu"]'
    logout_button: str = '[data-testid="logout"]'
```

Benefits:
- Selector changes affect one file, not every test
- IDE autocomplete catches typos before test run
- Selectors are documented by their dataclass field name

---

## Network Interception for Faster UI Tests

Stub slow external calls in UI tests to reduce execution time:

```python
def test_payment_page_shows_error_on_gateway_failure(page):
    page.route("**/api/payments/**", lambda route: route.fulfill(
        status=502,
        content_type="application/json",
        body='{"error": "Gateway unavailable"}',
    ))

    # Navigate to checkout
    page.goto("/checkout")
    page.get_by_test_id("pay-button").click()

    expect(page.get_by_test_id("payment-error")).to_contain_text(
        "Payment service unavailable"
    )
```

---

## Screenshot on Failure

```python
import pytest
from pathlib import Path


@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    report = outcome.get_result()

    if report.when == "call" and report.failed:
        page = item.funcargs.get("page")
        if page:
            screenshot_dir = Path("test-results/screenshots")
            screenshot_dir.mkdir(parents=True, exist_ok=True)
            screenshot_path = screenshot_dir / f"{item.nodeid.replace('/', '_')}.png"
            page.screenshot(path=str(screenshot_path))
```
