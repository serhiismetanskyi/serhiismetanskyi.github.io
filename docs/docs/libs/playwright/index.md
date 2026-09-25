---
date: 2026-09-16
tags:
  - python
  - libraries
  - playwright
  - ui-testing
---

# Playwright — Python Browser & API Testing

End-to-end testing framework: UI automation, API testing, network mocking, cross-browser support.

## Installation

```bash
uv add --dev pytest-playwright
playwright install  # downloads browser binaries (Chromium, Firefox, WebKit)
```

## Section Map

| File | Topics |
|------|--------|
| [01 UI Testing](./01-ui-testing.md) | Locators, actions, assertions, auto-waiting, fixtures, isolation |
| [02 API Testing](./02-api-testing.md) | APIRequestContext, HTTP methods, auth, mixed UI+API flows |
| [03 Page Objects](./03-page-objects.md) | POM pattern, component objects, best practices |
| [04 Advanced Patterns](./04-advanced-patterns.md) | Network mocking, conftest config, async API, CI, Allure reporting, debugging |
| [05 UI Playbook](./05-ui-playbook.md) | Auth state, forms, downloads, dialogs, tables, multi-tab, screenshots |
| [06 API Playbook](./06-api-playbook.md) | CRUD lifecycle, schema validation, errors, pagination, headers, uploads |

## Framework Architecture (Python, Detailed)

Reference flow:
`Test Scenarios -> UI -> API -> Core Utilities -> Fixtures -> Reports`

### Layer Responsibilities

1. **Test Scenarios**
   - Contains business-flow tests only (`test_checkout_flow.py`, `test_login_flow.py`).
   - No technical logic, no selectors parsing, no direct request-building details.
   - Calls page objects and API clients with intent-level steps.

2. **UI Layer**
   - Page Objects and reusable UI components.
   - Owns locators, UI actions, and UI-level assertions.
   - Never calls DB directly; can call API helpers only through explicit client abstractions.

3. **API Layer**
   - Request builders and typed clients (`AuthClient`, `UserClient`, `OrderClient`).
   - Handles endpoint paths, payload shape, retries, and contract checks.
   - Used for setup/teardown and state control before UI steps.

4. **Core Utilities**
   - Shared non-domain infrastructure: config loader, logging, random data factories, retries.
   - Must be stateless where possible and deterministic for test reproducibility.
   - Used by all other layers, but should not depend on UI/API/testing layers.

5. **Fixtures**
   - Pytest lifecycle and isolation boundary.
   - Creates browser/context/page, API context, auth state, per-test cleanup hooks.
   - Enforces "fresh context per test" and consistent environment setup.

6. **Reports**
   - Final execution output layer (Allure results, screenshots, traces, videos).
   - Collects artifacts on failure and step metadata for debugging and trend analysis.
   - Should be write-only from tests (tests emit, reporters aggregate).

### Dependency Rule (Keep It Clean)

- `Test Scenarios` may use: `UI`, `API`, `Fixtures`.
- `UI` may use: `Core Utilities`.
- `API` may use: `Core Utilities`.
- `Fixtures` may use: `UI`, `API`, `Core Utilities`.
- `Reports` consumes outputs from all layers; no layer should depend on `Reports`.

### Python Project Tree Example

```text
playwright-python-framework/
├── tests/
│   ├── test_login_flow.py
│   ├── test_checkout_flow.py
│   └── test_user_lifecycle_flow.py
├── ui/
│   ├── pages/
│   │   ├── login_page.py
│   │   ├── catalog_page.py
│   │   └── checkout_page.py
│   └── models/
│       └── user_model.py
├── api/
│   ├── clients/
│   │   ├── auth_client.py
│   │   ├── user_client.py
│   │   └── order_client.py
│   └── validators/
│       └── user_validator.py
├── utils/
│   ├── config.py
│   ├── logger.py
│   └── data_factory.py
├── fixtures/
│   ├── browser_fixture.py
│   ├── api_fixture.py
│   └── test_context.py
└── reports/
    ├── allure-results/
    └── artifacts/
```

### Execution Path for One Test

1. Scenario test starts and requests fixtures.
2. Fixtures create isolated browser context and API context.
3. API layer seeds deterministic test state (user/cart/order).
4. UI layer executes real user actions against seeded state.
5. Assertions run at UI and/or API response levels.
6. Fixtures perform cleanup and emit artifacts for reporting.
7. Reports layer aggregates Allure metadata, screenshots, traces, and videos.

## Quick Commands

| Command | Use |
|---------|-----|
| `pytest` | Run all tests (headless) |
| `pytest --headed` | Run with visible browser |
| `pytest --browser firefox` | Run on specific browser |
| `pytest --browser chromium --browser firefox` | Cross-browser |
| `pytest --slowmo 500` | Slow down actions by 500ms |
| `pytest --tracing on` | Record trace for each test |
| `pytest --screenshot only-on-failure` | Capture on failure |
| `pytest --video retain-on-failure` | Record video on failure |
| `pytest -n auto` | Parallel via pytest-xdist |
| `pytest --base-url http://localhost:8080` | Set base URL |

## Locator Cheat Sheet

| Priority | Locator | Example |
|----------|---------|---------|
| 1 | `get_by_role` | `page.get_by_role("button", name="Submit")` |
| 2 | `get_by_label` | `page.get_by_label("Email")` |
| 3 | `get_by_placeholder` | `page.get_by_placeholder("Search...")` |
| 4 | `get_by_text` | `page.get_by_text("Welcome back")` |
| 5 | `get_by_test_id` | `page.get_by_test_id("login-form")` |
| 6 | CSS/XPath | `page.locator(".btn-primary")` (last resort) |

## Assertion Cheat Sheet

```python
from playwright.sync_api import expect

# page-level
expect(page).to_have_title(re.compile("Dashboard"))
expect(page).to_have_url("https://example.com/dashboard")

# element-level
expect(locator).to_be_visible()
expect(locator).to_be_enabled()
expect(locator).to_have_text("Success")
expect(locator).to_contain_text("created")
expect(locator).to_have_attribute("href", "/home")
expect(locator).to_have_count(3)
expect(locator).to_have_value("alice@example.com")
expect(locator).to_be_checked()
```

## Built-in Fixtures (pytest-playwright)

| Fixture | Scope | Purpose |
|---------|-------|---------|
| `page` | function | Fresh page per test |
| `context` | function | Browser context (cookies, storage) |
| `browser` | session | Browser instance |
| `playwright` | session | Playwright instance |
| `new_context` | function | Create additional contexts (multi-user) |

## Quick Rules

1. **Use `get_by_role` first** — resilient, accessible, user-facing.
2. **Never use `time.sleep`** — Playwright auto-waits for elements.
3. **Use `expect()` assertions** — auto-retry until condition met.
4. **One behavior per test** — isolated, independent tests.
5. **Page Object Model** for real projects — maintainable locators.
6. **Mock external APIs** — `page.route()` for stability and speed.
7. **Trace on failure** — `--tracing retain-on-failure` for debugging.

## Python-Only Equivalents (vs JS cheat sheets)

Use Python snake_case APIs from `playwright.sync_api`:

- `page.go_forward()` (JS: `goForward`)
- `page.get_by_alt_text("Logo")` (JS: `getByAltText`)
- `locator.drag_to(target)` (JS: `dragTo`)
- `locator.scroll_into_view_if_needed()` (JS: `scrollIntoViewIfNeeded`)
- `page.expect_request(...)` / `page.expect_response(...)` (JS often shows `waitForRequest/Response`)
- `expect(response).to_be_ok()` (JS: `toBeOK`)

---
## See also
- [Digital Garden: Knowledge Base](../../index.md)
- [Python Guide for Automation QA](../../python-guide/index.md)
- [Test Automation Framework](../../test-automation-framework/index.md)
- [CI/CD](../../ci-cd-approaches/index.md)
- [Tools — Practical Reference Guides](../../tools/index.md)
- [Python Libraries](../index.md)

