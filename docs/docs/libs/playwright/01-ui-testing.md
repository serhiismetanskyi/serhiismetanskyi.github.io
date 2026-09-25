---
date: 2026-09-17
tags:
  - python
  - libraries
  - playwright
  - ui-testing
---

# Playwright — UI Testing

## Locators

Locators are live objects that auto-wait and re-evaluate when DOM changes.

### Priority (most resilient first)

```python
from playwright.sync_api import Page

# 1. Role — matches accessibility role + accessible name
page.get_by_role("button", name="Submit")
page.get_by_role("link", name="Sign in")
page.get_by_role("heading", name="Dashboard")

# 2. Label — form controls by associated <label>
page.get_by_label("Email address")

# 3. Placeholder — when no label exists
page.get_by_placeholder("Search...")

# 4. Text — static visible text content
page.get_by_text("Welcome back")
page.get_by_text("Order #", exact=False)  # partial match

# 5. Test ID — controlled escape hatch for dynamic/localized content
page.get_by_test_id("login-form")

# 6. CSS / XPath — last resort, brittle
page.locator(".btn-primary")
page.locator("//div[@data-id='123']")
```

### Chaining and Filtering

```python
# narrow scope: find button inside a specific card
card = page.locator(".product-card").filter(has_text="Pro Plan")
card.get_by_role("button", name="Buy").click()

# nth element from a list
page.get_by_role("listitem").nth(0).click()

# count elements
assert page.get_by_role("listitem").count() == 5
```

---

## Actions

Playwright auto-waits for elements to be actionable (visible, enabled, stable) before each action.

```python
# navigation
page.goto("https://example.com")
page.go_back()
page.reload()

# click
page.get_by_role("button", name="Submit").click()
page.get_by_role("button", name="Delete").dblclick()  # double click (also: click(click_count=2))

# fill form fields (clears existing value first)
page.get_by_label("Email").fill("alice@example.com")
page.get_by_label("Password").fill("secret123")

# type character by character (for autocomplete/search)
page.get_by_placeholder("Search").press_sequentially("playwright")

# select from dropdown
page.get_by_label("Country").select_option("Ukraine")

# checkbox / radio
page.get_by_role("checkbox", name="Accept terms").check()

# file upload
page.get_by_label("Upload").set_input_files("report.pdf")

# keyboard
page.get_by_label("Search").press("Enter")

# hover
page.get_by_text("Menu").hover()
```

---

## Assertions

`expect()` assertions auto-retry until the condition is met or timeout expires.

```python
import re
from playwright.sync_api import Page, expect


def test_login_flow(page: Page):
    page.goto("https://example.com/login")
    page.get_by_label("Email").fill("alice@example.com")
    page.get_by_label("Password").fill("secret")
    page.get_by_role("button", name="Sign in").click()

    # page-level assertions
    expect(page).to_have_url(re.compile(r"/dashboard"))
    expect(page).to_have_title(re.compile("Dashboard"))

    # element assertions
    expect(page.get_by_role("heading")).to_have_text("Welcome, Alice")
    expect(page.get_by_test_id("sidebar")).to_be_visible()
```

### Common Assertions

| Assertion | Checks |
|-----------|--------|
| `to_be_visible()` | Element is visible (non-zero size, not `display:none` / `visibility:hidden`) |
| `to_be_hidden()` | Element is not visible |
| `to_be_enabled()` / `to_be_disabled()` | Interactive state |
| `to_have_text("...")` | Full text match |
| `to_contain_text("...")` | Partial text match |
| `to_have_value("...")` | Input current value |
| `to_have_attribute(name, value)` | HTML attribute |
| `to_have_class("...")` | Exact `class` attribute value |
| `to_have_count(n)` | Number of matching elements |
| `to_have_url(pattern)` | Current page URL |
| `to_have_title(pattern)` | Page title |
| `to_be_checked()` | Checkbox / radio state |

---

## Auto-Waiting

Playwright waits automatically before actions:

| Check | When |
|-------|------|
| Attached | Element is in DOM |
| Visible | Element has non-zero size and is not hidden |
| Stable | Element is not animating |
| Enabled | Element is not disabled |
| Receives Events | Element is not obscured by another element |

No need for `time.sleep()`, `WebDriverWait`, or explicit waits.

---

## Test Isolation

Each test gets a fresh `BrowserContext` — isolated cookies, storage, and cache.

```python
from playwright.sync_api import Page


def test_first(page: Page):
    page.goto("https://example.com")
    # this page has its own cookies and storage

def test_second(page: Page):
    page.goto("https://example.com")
    # completely isolated from test_first
```

---

## Fixtures (pytest-playwright)

```python
import pytest
from playwright.sync_api import Page, expect


@pytest.fixture(scope="function", autouse=True)
def navigate_to_app(page: Page):
    """Navigate to app before each test, cleanup after."""
    page.goto("https://example.com")
    yield
    # teardown runs after test


def test_homepage(page: Page):
    expect(page.get_by_role("heading")).to_have_text("Home")
```

Override context options per test with marker:

```python
@pytest.mark.browser_context_args(locale="uk-UA", timezone_id="Europe/Kyiv")
def test_localized_ui(page: Page):
    page.goto("https://example.com")
    expect(page.get_by_text("Вітаємо")).to_be_visible()
```

---

## Extra Python Methods (Cheat-Sheet Gaps)

```python
from playwright.sync_api import Page, expect


def test_navigation_and_page_info(page: Page):
    page.goto("/home")
    page.get_by_role("link", name="Docs").click()
    page.go_back()
    page.go_forward()
    page.wait_for_load_state("domcontentloaded")

    # current URL is a property in Python sync API
    assert "/home" in page.url
    assert page.title() != ""


def test_additional_locators_and_actions(page: Page):
    page.goto("/board")

    # image by alt text
    page.get_by_alt_text("Company logo").click()

    # first matching element from a locator list
    first_card = page.locator(".task-card").first
    first_card.focus()
    first_card.scroll_into_view_if_needed()

    # drag-and-drop in Python API
    source = page.get_by_test_id("drag-source")
    target = page.get_by_test_id("drop-target")
    source.drag_to(target)

    # explicit checkbox clear state
    checkbox = page.get_by_role("checkbox", name="Receive updates")
    checkbox.uncheck()
    expect(checkbox).not_to_be_checked()
```

Use these only when needed; default to role/label locators and standard auto-wait behavior.
