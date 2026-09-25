---
date: 2026-09-17
tags:
  - python
  - libraries
  - playwright
  - ui-testing
---

# Playwright — Page Object Model

POM encapsulates page structure and interactions in classes. Tests stay readable; locators live in one place.

## Basic Page Object

```python
from playwright.sync_api import Page, expect


class LoginPage:
    """Encapsulates login page locators and actions."""

    def __init__(self, page: Page) -> None:
        self.page = page
        # define locators as properties — centralized, easy to update
        self.email_input = page.get_by_label("Email")
        self.password_input = page.get_by_label("Password")
        self.submit_button = page.get_by_role("button", name="Sign in")
        self.error_message = page.get_by_role("alert")

    def navigate(self) -> None:
        self.page.goto("/login")

    def login(self, email: str, password: str) -> None:
        self.email_input.fill(email)
        self.password_input.fill(password)
        self.submit_button.click()

    def expect_error(self, text: str) -> None:
        expect(self.error_message).to_contain_text(text)
```

### Using in Tests

```python
from playwright.sync_api import Page, expect


def test_successful_login(page: Page):
    login_page = LoginPage(page)
    login_page.navigate()
    login_page.login("alice@example.com", "correct-password")
    expect(page).to_have_url("/dashboard")


def test_wrong_password(page: Page):
    login_page = LoginPage(page)
    login_page.navigate()
    login_page.login("alice@example.com", "wrong")
    login_page.expect_error("Invalid credentials")
```

---

## Page Object as Fixture

```python
import pytest
from playwright.sync_api import Page


@pytest.fixture
def login_page(page: Page) -> LoginPage:
    """Provides a LoginPage already navigated to /login."""
    lp = LoginPage(page)
    lp.navigate()
    return lp


def test_login_success(login_page: LoginPage, page: Page):
    login_page.login("alice@example.com", "secret")
    expect(page).to_have_url("/dashboard")
```

---

## Component Object

For reusable UI components (navbar, sidebar, modal, table row):

```python
from playwright.sync_api import Page, Locator, expect


class Navbar:
    """Reusable navbar component — shared across multiple page objects."""

    def __init__(self, page: Page) -> None:
        self.page = page
        self.root = page.get_by_role("navigation")
        self.user_menu = self.root.get_by_role("button", name="Account")
        self.logout_button = self.root.get_by_role("menuitem", name="Logout")

    def open_user_menu(self) -> None:
        self.user_menu.click()

    def logout(self) -> None:
        self.open_user_menu()
        self.logout_button.click()


class DashboardPage:
    """Composes Navbar component into the page object."""

    def __init__(self, page: Page) -> None:
        self.page = page
        self.navbar = Navbar(page)  # reuse component
        self.heading = page.get_by_role("heading", level=1)

    def navigate(self) -> None:
        self.page.goto("/dashboard")

    def expect_loaded(self) -> None:
        expect(self.heading).to_have_text("Dashboard")
```

---

## Table / List Pattern

```python
from playwright.sync_api import Page, Locator, expect


class UsersTable:
    def __init__(self, page: Page) -> None:
        self.page = page
        self.rows = page.get_by_role("row")

    def row_by_name(self, name: str) -> Locator:
        """Find a specific row by visible user name."""
        return self.rows.filter(has_text=name)

    def delete_user(self, name: str) -> None:
        row = self.row_by_name(name)
        row.get_by_role("button", name="Delete").click()

    def expect_user_visible(self, name: str) -> None:
        expect(self.row_by_name(name)).to_be_visible()

    def expect_user_count(self, count: int) -> None:
        # +1 for header row in most tables
        expect(self.rows).to_have_count(count + 1)
```

---

## Project Structure

```
tests/
├── conftest.py           # shared fixtures (auth, base_url)
├── pages/
│   ├── __init__.py
│   ├── login_page.py
│   ├── dashboard_page.py
│   └── users_page.py
├── components/
│   ├── __init__.py
│   ├── navbar.py
│   └── modal.py
├── test_login.py
├── test_dashboard.py
└── test_users.py
```

---

## Best Practices

| Practice | Why |
|----------|-----|
| Define locators in `__init__` | Centralized, easy to find and update |
| Use `get_by_role` / `get_by_label` | Resilient to DOM changes |
| Return `self` from actions for chaining | Optional fluent API |
| Keep assertions in test or `expect_*` methods | Clear test intent |
| Compose component objects into pages | DRY, reusable across pages |
| One page object per page/view | Maps 1:1 to the application |
| Fixture for page object creation | Keeps test code clean |
