---
date: 2026-07-20
tags:
  - test-automation
  - architecture
---

# UI Test Design Patterns

## Page Object Model (POM)

The foundational pattern for UI test automation.
One class per page or significant component. Tests call methods, never selectors.

```
Test  →  LoginPage.login(user, password)  →  Browser
Test  →  DashboardPage.get_welcome_text()  →  Browser
```

### Minimal POM Implementation

```python
from playwright.sync_api import Page


class LoginPage:
    _USERNAME = '[data-testid="username"]'
    _PASSWORD = '[data-testid="password"]'
    _SUBMIT   = '[data-testid="submit"]'
    _ERROR    = '[data-testid="error-msg"]'

    def __init__(self, page: Page) -> None:
        self._page = page

    def login(self, username: str, password: str) -> "DashboardPage":
        self._page.fill(self._USERNAME, username)
        self._page.fill(self._PASSWORD, password)
        self._page.click(self._SUBMIT)
        return DashboardPage(self._page)

    def get_error_text(self) -> str:
        return self._page.inner_text(self._ERROR)
```

### POM Rules

| Rule | Reason |
|------|--------|
| No assertions inside page objects | Pages describe capability, not expectations |
| Return typed page objects after navigation | Catches wrong-page bugs at call time |
| One locator definition per element | Change once, all methods benefit |
| Prefer `data-testid` over CSS class | Survives redesigns |

### Composition Over Inheritance

Large pages decompose into components:

```python
class CheckoutPage:
    def __init__(self, page: Page) -> None:
        self._page = page
        self.address_form = AddressFormComponent(page)
        self.payment_form = PaymentFormComponent(page)
        self.order_summary = OrderSummaryComponent(page)
```

---

## Screenplay Pattern

An actor-centric alternative to POM for complex, multi-role UI automation.

### Core Concepts

```
Actor  →  performs  →  Task
Task   →  uses      →  Interaction
Actor  →  asks      →  Question
Actor  →  has       →  Ability (e.g., BrowseTheWeb)
```

### When to Use Screenplay Over POM

| Criterion | POM | Screenplay |
|-----------|-----|-----------|
| Multi-actor scenarios (admin + user) | Hard | Natural |
| Reusable business tasks | Fragile | First-class |
| Complex, nested flows | God objects | Composable |
| Simple CRUD flows | Good fit | Over-engineered |

### Implementation Sketch

```python
class Actor:
    def __init__(self, name: str, abilities: list) -> None:
        self.name = name
        self._abilities = {type(a): a for a in abilities}

    def can(self, ability_type: type):
        return self._abilities[ability_type]

    def attempts_to(self, *tasks) -> None:
        for task in tasks:
            task.perform_as(self)

    def asks(self, question) -> object:
        return question.answered_by(self)
```

```python
class Login:
    def __init__(self, username: str, password: str) -> None:
        self._username = username
        self._password = password

    def perform_as(self, actor: Actor) -> None:
        browser = actor.can(BrowseTheWeb)
        browser.fill('[data-testid="username"]', self._username)
        browser.fill('[data-testid="password"]', self._password)
        browser.click('[data-testid="submit"]')
```

---

## POM vs Screenplay — Decision Guide

```
Is there more than one actor in your tests?         → Screenplay
Do you have complex, reusable multi-step user flows?→ Screenplay
Is the team small and the app CRUD-focused?         → POM
Are tests written by manual QA with some Python?    → POM
```

Both patterns share the same rule: **tests never contain selectors.**
