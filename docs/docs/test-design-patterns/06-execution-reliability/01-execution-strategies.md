---
date: 2026-07-14
tags:
  - test-automation
  - design-patterns
---

# Test Execution Strategies

## Parallel Execution

### Thread Safety

Running tests in parallel requires every test to be fully isolated.

| Requirement | Rule |
|---|---|
| No shared state | Fixtures scoped to `function`, not `module`/`session` for mutable data |
| No shared files | Each test writes to a unique path |
| No shared DB rows | Each test creates its own data |
| No port conflicts | Dynamic port allocation for local servers |

pytest-xdist setup:

```ini
# pytest.ini
[pytest]
addopts = -n auto --dist=loadscope
```

`--dist=loadscope` groups tests in the same class/module onto the same worker,
preserving class-scoped fixture isolation.

### Resource Isolation

For DB-heavy parallel tests, use a separate schema or database per worker:

```python
import pytest
import os

@pytest.fixture(scope="session")
def db_url(worker_id):
    if worker_id == "master":
        return os.environ["TEST_DATABASE_URL"]
    # Each worker gets its own schema
    base_url = os.environ["TEST_DATABASE_URL"]
    return f"{base_url}_{worker_id}"
```

---

## Selective Execution

### Tags / Marks

Group tests with marks for selective running:

```python
import pytest

@pytest.mark.smoke
def test_health_check(api_client):
    assert api_client.get("/health").status_code == 200

@pytest.mark.slow
def test_bulk_import(api_client):
    ...

@pytest.mark.security
def test_sql_injection(api_client):
    ...
```

Run by mark:
```bash
uv run pytest -m smoke           # fast smoke suite
uv run pytest -m "not slow"      # skip slow tests in dev
uv run pytest -m "security"      # security suite only
```

### Test Grouping

| Group | When to run | Marks |
|---|---|---|
| Smoke | Every commit | `smoke` |
| Regression | Every PR | `regression` |
| Slow / E2E | Nightly or pre-release | `slow`, `e2e` |
| Security | Nightly | `security` |
| Performance | Release candidate | `performance` |

Marks declared in `pytest.ini`:
```ini
[pytest]
markers =
    smoke: Core health checks
    regression: Full regression suite
    slow: Tests taking > 5s
    e2e: End-to-end browser tests
    security: Security validation tests
    performance: Load and latency tests
```

---

## Retry Strategies

### Handling Flaky Tests

Use `pytest-rerunfailures` for genuinely flaky tests (network, timing):

```ini
# pytest.ini
addopts = --reruns 2 --reruns-delay 1
```

Or per-test:

```python
@pytest.mark.flaky(reruns=3, reruns_delay=2)
def test_external_webhook_delivery(api_client):
    ...
```

Rules:
- Retry only on known transient failures, not logic errors
- Track retry rate — high retry rate signals a design problem
- Never use retry as a substitute for fixing flakiness

### Retry with Backoff (custom)

```python
import time
import logging

logger = logging.getLogger(__name__)


def retry(fn, retries: int = 3, delay: float = 1.0, backoff: float = 2.0):
    last_error = None
    for attempt in range(1, retries + 1):
        try:
            return fn()
        except AssertionError as exc:
            last_error = exc
            logger.warning("Attempt %d/%d failed: %s", attempt, retries, exc)
            if attempt < retries:
                time.sleep(delay)
                delay *= backoff
    raise last_error
```

---

## Execution Speed Optimisation

| Technique | Impact |
|---|---|
| Parallel execution (`-n auto`) | 2–8x faster |
| Session-scoped DB fixtures | Avoid repeated migrations |
| Skip DB for unit tests | Sub-millisecond per test |
| Reuse HTTP session | Remove per-test connection overhead |
| Selective marks in CI | Only run relevant suite per stage |
