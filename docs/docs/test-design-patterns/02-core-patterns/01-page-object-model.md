---
date: 2026-07-10
tags:
  - test-automation
  - design-patterns
---

# Page Object Model (POM)

## Concept

POM encapsulates all interactions with a UI page or component behind a dedicated class.
Tests call methods on the page object; the page object handles locators and browser actions.

```
Test  →  PageObject.do_action()  →  Browser / API
Test  →  PageObject.get_state()  →  Browser / API
```

---

## Responsibilities

### Element Locators

- Defined once per page object, never repeated across tests
- Prefer stable locators: `data-testid`, ARIA roles, label text
- Avoid: CSS class names, XPath by position, auto-generated IDs

```python
class LoginPage:
    USERNAME = '[data-testid="username-input"]'
    PASSWORD = '[data-testid="password-input"]'
    SUBMIT   = '[data-testid="submit-btn"]'
    ERROR    = '[data-testid="error-message"]'
```

### Actions

- One method = one user intent
- Return `self` for chaining or a new page object after navigation
- No assertions inside page objects — pages describe capability, not expectations

```python
class LoginPage:
    def __init__(self, page: Page) -> None:
        self._page = page

    def fill_credentials(self, username: str, password: str) -> "LoginPage":
        self._page.fill(self.USERNAME, username)
        self._page.fill(self.PASSWORD, password)
        return self

    def submit(self) -> "DashboardPage":
        self._page.click(self.SUBMIT)
        return DashboardPage(self._page)

    def get_error(self) -> str:
        return self._page.inner_text(self.ERROR)
```

### State / Query Methods

- Read-only methods that return values for assertion in tests
- Naming: `get_*`, `is_*`, `has_*`

---

## Composition Over Inheritance

Large pages decompose into components:

```
LoginPage
  ├── HeaderComponent
  ├── LoginFormComponent
  └── FooterComponent
```

Each component owns its locators and actions. The page object composes them.

---

## Risks

| Risk | Description | Mitigation |
|---|---|---|
| God page object | One class with 50+ methods | Split by component |
| Tight coupling to UI | Tests break on every redesign | Use `data-testid`, not visual selectors |
| Assertions in POM | Logic leaks from tests to pages | Move all assertions to test body |
| Nested navigation | Page returns wrong type after action | Use typed return annotations, verify in tests |
| Shared mutable state | Race conditions in parallel runs | Each test gets a fresh page instance |

---

## When to Use

| Scenario | Use POM |
|---|---|
| Playwright / Selenium E2E suite | Yes |
| Repeated UI flows across tests | Yes |
| Single one-off smoke test | No — direct API call preferred |
| API-only testing | No |

---

## POM vs Direct API

| Criterion | POM | Direct API |
|---|---|---|
| Setup cost | Medium | Low |
| Reusability | High | Low |
| Maintenance | Centralised | Scattered |
| Speed | Slow (browser) | Fast |

For regression and user journey coverage, use POM.
For data setup and teardown, prefer direct API or service calls.
