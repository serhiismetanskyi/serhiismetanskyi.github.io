---
date: 2026-09-17
tags:
  - python
  - libraries
  - playwright
  - ui-testing
---

# Playwright — Advanced Patterns

## Network Mocking

Intercept requests and return fake data — no real backend needed.

### Mock an API Endpoint

```python
from playwright.sync_api import Page, Route, expect


def test_shows_mocked_users(page: Page):
    # intercept /api/users and return fake data
    def handle_users(route: Route):
        route.fulfill(json=[
            {"id": 1, "name": "Alice"},
            {"id": 2, "name": "Bob"},
        ])

    page.route("**/api/users", handle_users)
    page.goto("/users")
    expect(page.get_by_role("listitem")).to_have_count(2)
```

### Modify Real Response

```python
def test_inject_extra_item(page: Page):
    def add_item(route: Route):
        # fetch real response, then append data
        response = route.fetch()
        data = response.json()
        data.append({"id": 999, "name": "Injected"})
        route.fulfill(response=response, json=data)

    page.route("**/api/items", add_item)
    page.goto("/items")
```

### Block Resources (Speed Up Tests)

```python
# block images, fonts, and analytics to speed up page load
page.route("**/*.{png,jpg,jpeg,gif,svg,woff2}", lambda route: route.abort())
page.route("**/analytics/**", lambda route: route.abort())
```

### Observe Requests/Responses and Cleanup Routes

```python
from playwright.sync_api import Page, Request, Response, expect


def test_network_observability(page: Page):
    seen_urls: list[str] = []

    def on_response(response: Response) -> None:
        if "/api/" in response.url:
            seen_urls.append(response.url)

    page.on("response", on_response)
    page.goto("/dashboard")

    # Python sync API uses expect_request/expect_response context managers.
    with page.expect_request("**/api/profile") as req_info:
        page.get_by_role("button", name="Load profile").click()
    request: Request = req_info.value
    assert request.method == "GET"

    with page.expect_response("**/api/profile") as resp_info:
        page.get_by_role("button", name="Reload profile").click()
    response = resp_info.value
    expect(response).to_be_ok()

    assert any("/api/profile" in url for url in seen_urls)

    # Unregister route handlers to avoid side effects in later tests.
    page.unroute("**/api/profile")
```

### HAR Replay

Record network traffic to a HAR file, replay in tests:

```python
context.route_from_har("tests/data/api.har", update=True)   # record once
context.route_from_har("tests/data/api.har", url="**/api/**")  # replay
```

---

## Conftest Configuration

### Base Fixtures

```python
# tests/conftest.py
import pytest
from playwright.sync_api import Page


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args):
    """Override default context options for all tests."""
    return {
        **browser_context_args,
        "viewport": {"width": 1280, "height": 720},
        "ignore_https_errors": True,
    }


@pytest.fixture(scope="function", autouse=True)
def goto_base(page: Page):
    """Navigate to base URL before every test."""
    page.goto("/")
    yield
```

### Custom Device / Multi-User

```python
@pytest.fixture(scope="session")
def browser_context_args(browser_context_args, playwright):
    device = playwright.devices["iPhone 14"]
    return {**browser_context_args, **device}
```

```python
from pytest_playwright.pytest_playwright import CreateContextCallback
from playwright.sync_api import Page, expect


def test_two_users_chat(page: Page, new_context: CreateContextCallback):
    page.goto("/chat")
    page.get_by_label("Message").fill("Hello from A")
    page.get_by_role("button", name="Send").click()

    ctx_b = new_context()
    page_b = ctx_b.new_page()
    page_b.goto("/chat")
    expect(page_b.get_by_text("Hello from A")).to_be_visible()
```

---

## Async API

Use `playwright.async_api` + `pytest-asyncio`. Every sync method has an `await` equivalent.

```bash
uv add --dev pytest-asyncio
```

```python
import pytest
import pytest_asyncio
from playwright.async_api import async_playwright, Browser, Page, expect


@pytest_asyncio.fixture(scope="session")
async def browser():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        yield b
        await b.close()


@pytest_asyncio.fixture
async def page(browser: Browser):
    ctx = await browser.new_context()
    page = await ctx.new_page()
    yield page
    await ctx.close()


@pytest.mark.asyncio
async def test_login(page: Page):
    await page.goto("/login")
    await page.get_by_label("Email").fill("alice@test.com")
    await page.get_by_role("button", name="Sign in").click()
    await expect(page).to_have_url("/dashboard")
```

> `resp.ok`, `resp.status`, `resp.headers` — sync properties. `await resp.json()`, `await resp.text()` — async.

---

## CI & Parallel

```toml
[tool.pytest.ini_options]
addopts = "--tracing retain-on-failure --screenshot only-on-failure"
base_url = "http://localhost:8080"
```

```yaml
- name: Install Playwright
  run: uv add --dev pytest-playwright pytest-xdist && playwright install --with-deps chromium
- name: Run E2E
  run: pytest tests/e2e/ --browser chromium -n auto
- name: Upload traces
  if: failure()
  uses: actions/upload-artifact@v4
  with: { name: playwright-traces, path: test-results/ }
```

---

## Allure Reporting Layer (Python)

Use Allure as a dedicated reporting layer: scenarios emit steps and artifacts, CI publishes history-aware reports.

### Install

```bash
uv add --dev allure-pytest
```

### Pytest Integration

```toml
[tool.pytest.ini_options]
addopts = "--alluredir=reports/allure-results --tracing retain-on-failure --screenshot only-on-failure"
```

```python
import allure
from playwright.sync_api import Page, expect


def test_checkout_happy_path(page: Page):
    with allure.step("Open checkout page"):
        page.goto("/checkout")
        expect(page.get_by_role("heading", name="Checkout")).to_be_visible()

    with allure.step("Fill customer data"):
        page.get_by_label("Email").fill("alice@example.com")
        page.get_by_label("Address").fill("Kyiv")

    with allure.step("Place order"):
        page.get_by_role("button", name="Place order").click()
        expect(page.get_by_text("Order created")).to_be_visible()
```

### Attach Artifacts on Failure

```python
# tests/conftest.py
from pathlib import Path

import allure
import pytest
from playwright.sync_api import Page


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item: pytest.Item, call: pytest.CallInfo):
    outcome = yield
    rep = outcome.get_result()
    page: Page | None = item.funcargs.get("page")
    if rep.when == "call" and rep.failed and page is not None:
        artifacts_dir = Path("reports/artifacts")
        artifacts_dir.mkdir(parents=True, exist_ok=True)
        screenshot = artifacts_dir / f"{item.name}.png"
        page.screenshot(path=str(screenshot), full_page=True)
        allure.attach.file(
            str(screenshot),
            name=f"{item.name}-failure",
            attachment_type=allure.attachment_type.PNG,
        )
```

### CI Publish Flow

1. Run tests with `--alluredir=reports/allure-results`.
2. Persist `reports/allure-results` as CI artifact.
3. Generate static report in CI/CD job:
   - `allure generate reports/allure-results --clean -o reports/allure-html`
4. Publish HTML report (artifact pages, S3, or internal test portal).
5. Keep report history between runs to track flaky tests and trends.

---

## Debugging

| Technique | How |
|-----------|-----|
| Headed / Slow | `pytest --headed --slowmo 500` |
| Trace viewer | `pytest --tracing on` → `playwright show-trace trace.zip` |
| Screenshot | `page.screenshot(path="debug.png")` |
| Video | `pytest --video retain-on-failure` |
| Breakpoint | `breakpoint()` in test + `pytest -s` |

---

## Best Practices

| Practice | Why |
|----------|-----|
| Mock external APIs with `page.route()` | Stable, fast, no third-party flakiness |
| `--tracing retain-on-failure` in CI | Post-mortem debugging without reproduction |
| `base_url` in config, not in tests | One place to change per environment |
| Parallel via `pytest-xdist` (`-n auto`) | Reduce CI wall time |
