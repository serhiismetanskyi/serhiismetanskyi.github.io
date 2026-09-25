---
date: 2026-07-24
tags:
  - test-automation
  - architecture
  - ci-cd
---

# Logging, Reporting & Observability

## Structured Test Logging

Tests must produce logs that help diagnose failures without re-running.

### Logger Setup

```python
import logging
import sys


def configure_logging(level: str = "INFO") -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper()),
        format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
        stream=sys.stdout,
    )


# Silence noisy third-party loggers
logging.getLogger("playwright").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)
```

### Logging Test Steps

```python
import logging

log = logging.getLogger(__name__)


class UsersClient:
    def create(self, data: dict) -> dict:
        log.debug("POST /users payload=%s", data)
        response = self._driver.post("/users", json=data)
        log.debug("Response %d: %s", response.status_code, response.text[:200])
        response.raise_for_status()
        result = response.json()
        log.info("User created: id=%s email=%s", result.get("id"), result.get("email"))
        return result
```

Log levels in tests:
- `DEBUG` — request/response bodies, selector values
- `INFO` — test step completion, resource IDs
- `WARNING` — retry attempts, slow operations
- `ERROR` — unexpected failures with context

---

## Request/Response Logging

Log every HTTP call for failure diagnosis:

```python
class HttpDriver:
    def _log_request(self, method: str, url: str, **kwargs) -> None:
        log.debug(
            "%s %s | body=%s headers=%s",
            method.upper(),
            url,
            str(kwargs.get("json", ""))[:300],
            {k: v for k, v in kwargs.get("headers", {}).items() if k != "Authorization"},
        )

    def _log_response(self, response) -> None:
        log.debug(
            "Response %d %s | body=%s",
            response.status_code,
            response.url,
            response.text[:300],
        )
```

---

## Reporting

### Allure Report

Allure is the standard for rich test reports in 2026.

```bash
uv add allure-pytest

uv run pytest --alluredir=test-results/allure-results
allure serve test-results/allure-results
```

```python
import allure


@allure.feature("User Management")
@allure.story("User Registration")
def test_register_with_valid_email(api_client):
    with allure.step("Create user payload"):
        payload = UserBuilder().build()

    with allure.step("POST /users"):
        response = api_client.post("/users", json=payload)

    with allure.step("Verify 201 Created"):
        assert response.status_code == 201
```

### HTML Report (lightweight)

```bash
uv run pytest --html=test-results/report.html --self-contained-html
```

### JUnit XML (for CI integration)

```bash
uv run pytest --junitxml=test-results/junit.xml
```

Most CI systems (GitHub Actions, Jenkins, GitLab) parse JUnit XML natively.

---

## Screenshots & Videos

### Screenshot on Failure (Playwright)

```python
# conftest.py
import pytest
from pathlib import Path


@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    report = outcome.get_result()

    if report.when == "call" and report.failed:
        page = item.funcargs.get("page")
        if page:
            path = Path("test-results/screenshots") / f"{item.nodeid.replace('/', '_')}.png"
            path.parent.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(path), full_page=True)
```

### Video Recording

```python
# playwright.config.py equivalent in pytest-playwright
@pytest.fixture(scope="session")
def browser_context_args(browser_context_args):
    return {
        **browser_context_args,
        "record_video_dir": "test-results/videos",
        "record_video_size": {"width": 1280, "height": 720},
    }
```

---

## Observability Metrics

Track these to monitor framework health over time:

| Metric | Description | Target |
|--------|-------------|--------|
| Test duration (p95) | 95th percentile test execution time | < 30s per test |
| Suite duration | Total CI pipeline test stage time | < 10 min |
| Pass rate | Tests passing / total tests | > 99% on main |
| Flakiness rate | Tests that passed on rerun / total | < 1% |
| Coverage delta | Coverage change per PR | Never decrease |

### Collecting Metrics in CI

```yaml
# GitHub Actions
- name: Publish test metrics
  run: |
    uv run python scripts/collect_metrics.py \
      --junit test-results/junit.xml \
      --output test-results/metrics.json
```

Parse JUnit XML to extract `total`, `passed`, `failed`, `duration_seconds`, `pass_rate`.
Feed the output into Datadog, Grafana, or a Slack notification.
