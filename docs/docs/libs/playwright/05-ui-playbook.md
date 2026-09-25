---
date: 2026-09-18
tags:
  - python
  - libraries
  - playwright
  - ui-testing
---

# Playwright — UI Practical Playbook

Copy-paste recipes for common UI testing scenarios.

## 1) Auth with Storage State Reuse

Authenticate once, reuse across all tests — no repeated login:

```python
# tests/conftest.py
import pytest
from playwright.sync_api import Playwright, Browser, BrowserContext


@pytest.fixture(scope="session")
def auth_state(playwright: Playwright):
    """Login once via browser, save cookies + localStorage."""
    browser = playwright.chromium.launch()
    context = browser.new_context()
    page = context.new_page()

    page.goto("https://example.com/login")
    page.get_by_label("Email").fill("admin@example.com")
    page.get_by_label("Password").fill("secret")
    page.get_by_role("button", name="Sign in").click()
    page.wait_for_url("**/dashboard")

    state = context.storage_state()  # captures cookies + localStorage
    browser.close()
    return state


@pytest.fixture
def auth_page(browser: Browser, auth_state: dict):
    """Every test gets a fresh page pre-loaded with auth cookies."""
    context = browser.new_context(storage_state=auth_state)
    page = context.new_page()
    yield page
    context.close()
```

## 2) Form Submission with Validation Errors

```python
from playwright.sync_api import Page, expect


def test_form_shows_validation_errors(page: Page):
    page.goto("/register")

    # submit empty form
    page.get_by_role("button", name="Register").click()

    # verify inline validation messages appear
    expect(page.get_by_text("Email is required")).to_be_visible()
    expect(page.get_by_text("Password must be at least 8 characters")).to_be_visible()

    # fix one field, verify its error disappears
    page.get_by_label("Email").fill("alice@example.com")
    page.get_by_role("button", name="Register").click()
    expect(page.get_by_text("Email is required")).to_be_hidden()
```

## 3) File Download

```python
from playwright.sync_api import Page


def test_download_report(page: Page, tmp_path):
    page.goto("/reports")

    # expect_download waits for the download event
    with page.expect_download() as download_info:
        page.get_by_role("button", name="Export CSV").click()

    download = download_info.value
    dest = tmp_path / download.suggested_filename
    download.save_as(dest)

    content = dest.read_text()
    assert "user_id" in content  # verify CSV header
    assert len(content.splitlines()) > 1  # has data rows
```

## 4) Dialog Handling (Alert / Confirm)

```python
from playwright.sync_api import Page, expect


def test_confirm_delete(page: Page):
    page.goto("/users")

    # register handler BEFORE the action that triggers the dialog
    page.on("dialog", lambda dialog: dialog.accept())

    page.get_by_role("row").filter(has_text="Alice").get_by_role("button", name="Delete").click()

    # verify user removed after confirmation
    expect(page.get_by_role("row").filter(has_text="Alice")).to_have_count(0)


def test_cancel_delete(page: Page):
    page.goto("/users")

    page.on("dialog", lambda dialog: dialog.dismiss())
    page.get_by_role("row").filter(has_text="Bob").get_by_role("button", name="Delete").click()

    # user still present after cancel
    expect(page.get_by_role("row").filter(has_text="Bob")).to_be_visible()
```

## 5) Wait for API Response Before Assertion

```python
from playwright.sync_api import Page, expect


def test_search_waits_for_api(page: Page):
    page.goto("/search")
    page.get_by_placeholder("Search...").fill("playwright")

    # wait until the actual API response arrives
    with page.expect_response("**/api/search*") as resp_info:
        page.get_by_role("button", name="Search").click()

    resp = resp_info.value
    assert resp.status == 200

    # now assert UI updated with results
    expect(page.get_by_role("listitem")).to_have_count(10)
```

## 6) Multi-Tab / Popup

```python
from playwright.sync_api import Page, expect


def test_external_link_opens_new_tab(page: Page):
    page.goto("/help")

    # expect_popup catches the new tab/window
    with page.expect_popup() as popup_info:
        page.get_by_role("link", name="Documentation").click()

    new_tab = popup_info.value
    new_tab.wait_for_load_state()
    expect(new_tab).to_have_url("https://docs.example.com/")
```

## 7) Table Sorting and Filtering

```python
from playwright.sync_api import Page, expect


def test_table_sort_by_name(page: Page):
    page.goto("/users")

    # click column header to sort
    page.get_by_role("columnheader", name="Name").click()

    # verify first row is alphabetically first
    first_cell = page.get_by_role("row").nth(1).get_by_role("cell").first
    expect(first_cell).to_contain_text("Alice")


def test_table_filter(page: Page):
    page.goto("/users")
    page.get_by_placeholder("Filter by role...").fill("admin")

    # wait for filtered results to stabilize, then verify each data row
    data_rows = page.get_by_role("row").filter(has_text="admin")
    expect(data_rows).not_to_have_count(0)
    for i in range(data_rows.count()):
        expect(data_rows.nth(i)).to_contain_text("admin")
```

## 8) Screenshot Comparison (Visual Regression)

```python
from playwright.sync_api import Page


def test_dashboard_visual(page: Page):
    page.goto("/dashboard")
    page.wait_for_load_state("networkidle")

    # first run: use `pytest --update-snapshots` to generate baseline
    # subsequent runs compare against the saved baseline
    expect(page).to_have_screenshot("dashboard.png", max_diff_pixels=50)
```

## Quick Checklist

- Use `storage_state` for auth — never repeat login flows in every test.
- Register dialog handlers **before** the triggering action.
- Use `expect_download` / `expect_popup` — not manual waits.
- `tmp_path` for downloaded files — auto-cleaned by pytest.
- `expect_response` to sync UI with API — avoids flaky timing.
