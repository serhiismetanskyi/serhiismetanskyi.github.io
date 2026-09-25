---
date: 2026-07-23
tags:
  - test-automation
  - architecture
  - ui-testing
---

# UI Testing — Tools & Patterns

## Tool Selection

### Playwright (recommended for most projects)

| Property | Value |
|----------|-------|
| Language | Python |
| Browsers | Chromium, Firefox, WebKit |
| Speed | Fast — CDP-based, no WebDriver |
| Parallelism | Built-in, process-level isolation |
| Mobile emulation | Yes |
| Network interception | Yes |
| CI support | Excellent |

```python
# pytest-playwright setup
import pytest
from playwright.sync_api import Page, expect


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args):
    return {
        **browser_context_args,
        "viewport": {"width": 1280, "height": 720},
        "locale": "en-US",
        "timezone_id": "UTC",
    }
```

### Selenium

Legacy option. Use Playwright unless the project already relies on Selenium.

| Property | Value |
|----------|-------|
| Language | Python |
| Browsers | All (via WebDriver) |
| Speed | Slower — WebDriver HTTP protocol |
| Parallelism | Requires Selenium Grid or pytest-xdist |
| Network interception | Limited (requires proxy) |

---

## Selector Strategy

Selectors are the primary maintenance cost of UI tests.
Wrong selectors break on every redesign.

### Priority Order (best → worst)

1. `data-testid` attributes — stable, semantically clear
2. ARIA roles + accessible name — resilient to visual changes
3. Label text, placeholder — readable in tests
4. CSS class — fragile, changes with design updates
5. XPath by position — extremely fragile

```python
# Good — semantic and stable
page.get_by_test_id("submit-button")
page.get_by_role("button", name="Submit")
page.get_by_label("Email address")

# Bad — brittle
page.locator(".btn-primary.submit-action")
page.locator("//div[3]/button[1]")
```

### Adding `data-testid` to Application Code

A QA-engineering contract: frontend adds `data-testid` on interactive elements.
Maintained as part of feature development, not retrofitted.

```html
<button data-testid="checkout-submit" type="submit">
  Place Order
</button>
```

---

## Page Object with Playwright

```python
from playwright.sync_api import Page, expect


class CheckoutPage:
    def __init__(self, page: Page) -> None:
        self._page = page

    def fill_address(self, street: str, city: str, postcode: str) -> "CheckoutPage":
        self._page.get_by_test_id("address-street").fill(street)
        self._page.get_by_test_id("address-city").fill(city)
        self._page.get_by_test_id("address-postcode").fill(postcode)
        return self

    def submit_order(self) -> "OrderConfirmationPage":
        self._page.get_by_test_id("checkout-submit").click()
        return OrderConfirmationPage(self._page)

    def get_total_price(self) -> str:
        return self._page.get_by_test_id("order-total").inner_text()


class OrderConfirmationPage:
    def __init__(self, page: Page) -> None:
        self._page = page

    def get_order_number(self) -> str:
        return self._page.get_by_test_id("order-number").inner_text()

    def wait_for_confirmation(self) -> "OrderConfirmationPage":
        expect(self._page.get_by_test_id("confirmation-heading")).to_be_visible()
        return self
```

---

## UI Test Checklist

| Test Type | Coverage |
|-----------|---------|
| Critical user journeys | Login, checkout, sign-up, core CRUD |
| Auth states | Logged-in, logged-out, expired session |
| Error states | Invalid form, 404 page, server error message |
| Navigation | Links reach correct pages |
| Responsive | Key breakpoints work |

Keep E2E count minimal. Prefer API tests for business logic validation.
E2E tests prove the full stack is wired together, not that each rule is correct.
