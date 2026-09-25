---
date: 2026-08-18
tags:
  - python
  - test-automation
---

# UI Automation

UI automation tests your application through a real browser, like a real user would.

---

## Tool Comparison

| Feature | Playwright | Selenium |
|---------|-----------|----------|
| Speed | Fast | Slower |
| Auto-wait | Yes | No (manual waits) |
| Language | Python, JS, C#, Java | Python, JS, C#, Java, Ruby |
| Browser support | Chromium, Firefox, WebKit | Chrome, Firefox, Safari, Edge |
| Setup | Easy | Requires driver setup |
| Recommendation | **Preferred for new projects** | Good for legacy projects |

---

## Playwright (Recommended)

### Install

```bash
uv add playwright
uv run playwright install
```

### Basic Example

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    page.goto("https://example.com")
    print(page.title())

    browser.close()
```

### Finding Elements (Locators)

```python
page.locator("#username")              # by ID
page.locator(".submit-btn")           # by CSS class
page.locator("[data-testid='login']") # by test ID (recommended)
page.get_by_role("button", name="Submit")  # by role
page.get_by_text("Sign In")                # by text
page.get_by_placeholder("Enter email")     # by placeholder
```

!!! tip "Use `data-testid` attributes"
    Ask developers to add `data-testid` to elements. These do not change with UI redesigns.

### Common Actions

```python
page.fill("#username", "alice")
page.click("#submit")
page.check("#agree-checkbox")
page.select_option("#country", "US")
page.press("#search", "Enter")

text = page.locator(".message").text_content()
is_visible = page.locator(".modal").is_visible()
```

### Wait Strategies

Playwright auto-waits for elements, but you can add explicit waits:

```python
page.wait_for_selector(".result", timeout=5000)
page.locator(".spinner").wait_for(state="hidden")
page.wait_for_url("**/dashboard")
```

---

## Selenium

### Install

```bash
uv add selenium
```

### Basic Example

```python
from selenium import webdriver
from selenium.webdriver.common.by import By

driver = webdriver.Chrome()
driver.get("https://example.com")
print(driver.title)
driver.quit()
```

### Finding Elements

```python
from selenium.webdriver.common.by import By

driver.find_element(By.ID, "username")
driver.find_element(By.CSS_SELECTOR, ".submit-btn")
driver.find_element(By.XPATH, "//button[@type='submit']")
driver.find_element(By.NAME, "email")
```

### Explicit Waits

```python
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

wait = WebDriverWait(driver, 10)
element = wait.until(
    EC.presence_of_element_located((By.ID, "result"))
)
```

!!! warning "Avoid implicit waits"
    Always use **explicit waits**. Implicit waits hide timing issues.

---

## pytest + Playwright

### Fixture Setup

```python
# tests/conftest.py
import pytest
from playwright.sync_api import Page

@pytest.fixture
def login_page(page: Page) -> Page:
    page.goto("https://staging.example.com/login")
    return page
```

### Test Example

```python
def test_successful_login(login_page: Page):
    login_page.fill("#username", "alice")
    login_page.fill("#password", "secret123")
    login_page.click("#submit")
    assert login_page.url.endswith("/dashboard")
```

---

## Locator Strategy (Priority)

| Priority | Locator Type | Example |
|----------|-------------|---------|
| 1 (Best) | `data-testid` | `[data-testid='login-btn']` |
| 2 | Role + name | `get_by_role("button", name="Login")` |
| 3 | Text | `get_by_text("Submit")` |
| 4 | CSS selector | `.login-form .submit` |
| 5 (Avoid) | XPath | `//div[@class='form']/button` |

---

## Best Practices

- Use **Playwright** for new projects — it is faster and more stable
- Use **`data-testid`** attributes as primary locators
- **Never** use `time.sleep()` — use proper wait strategies
- Keep tests **independent** — each test starts from a clean state
- Use **Page Object Model** to organize page interactions
- Run UI tests in **headless mode** in CI/CD
- Test only **critical user flows** with E2E tests
