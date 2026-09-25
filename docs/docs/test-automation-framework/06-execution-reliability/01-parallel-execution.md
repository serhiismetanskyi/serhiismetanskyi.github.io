---
date: 2026-07-23
tags:
  - test-automation
  - architecture
---

# Test Execution — Parallel & Test Organisation

## Parallel Execution

### Why It Matters

500 tests × 0.5s average = 250s sequential.
With 8 workers: ~35s. Parallelism is the primary lever for fast CI.

### pytest-xdist Setup

```toml
# pyproject.toml
[tool.pytest.ini_options]
addopts = "--numprocesses=auto"
```

```bash
uv run pytest -n auto           # uses all CPU cores
uv run pytest -n 4              # fixed worker count
uv run pytest -n auto --dist=worksteal  # better load balancing
```

### Thread Safety Requirements

With parallel execution, shared state causes intermittent failures.

| Resource | Problem | Solution |
|----------|---------|---------|
| DB records | Tests modify same row | Unique IDs per test |
| Files | Tests write same file | Use unique temp paths |
| Ports | Tests bind same port | Random port allocation |
| Global state | Module-level mutations | Avoid global state |
| Static test data | Shared fixture modified | Use session-scoped read-only fixtures |

### Resource Isolation in Practice

```python
import uuid
import pytest


@pytest.fixture
def isolated_workspace(tmp_path):
    """Each test gets its own directory — no conflicts."""
    workspace = tmp_path / f"test-{uuid.uuid4().hex[:6]}"
    workspace.mkdir()
    return workspace


@pytest.fixture
def unique_user_email() -> str:
    return f"test-{uuid.uuid4().hex[:8]}@example.com"
```

---

## Test Grouping with Marks

Marks enable selective execution. Define them centrally.

```python
# conftest.py
import pytest


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line("markers", "unit: unit tests — no I/O, milliseconds")
    config.addinivalue_line("markers", "integration: real services, DB access")
    config.addinivalue_line("markers", "api: HTTP/gRPC tests against running service")
    config.addinivalue_line("markers", "e2e: browser tests — slowest, minimum count")
    config.addinivalue_line("markers", "smoke: critical path — run before deployment")
    config.addinivalue_line("markers", "regression: full coverage — run on PR")
    config.addinivalue_line("markers", "slow: > 10s — excluded from fast runs")
```

Apply marks to tests:
```python
@pytest.mark.smoke
@pytest.mark.api
def test_health_endpoint_returns_200(api_client):
    assert api_client.get("/health").status_code == 200


@pytest.mark.regression
@pytest.mark.e2e
def test_full_checkout_journey(page, verified_user):
    ...
```

---

## Selective Runs

### Smoke Suite (pre-deploy)

```bash
uv run pytest -m smoke -n auto --timeout=30
```

Run before every deployment. Must complete in < 2 minutes.
Covers: auth works, critical endpoints respond, no 500s on main routes.

### Regression Suite (per PR)

```bash
uv run pytest -m "not e2e" -n auto --timeout=60
```

Full coverage excluding slow browser tests.
Run on every pull request. Target: < 10 minutes.

### Full Suite (nightly)

```bash
uv run pytest -n auto --timeout=120
```

Includes E2E, performance probes, edge cases.
Run nightly or before major releases.

### Excluding Slow Tests in Dev

```bash
uv run pytest -m "not slow and not e2e" -n auto
```

---

## Test Suite Configuration

```toml
# pyproject.toml
[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py"]
python_functions = ["test_*"]
timeout = 60
log_cli = true
log_cli_level = "INFO"
log_format = "%(asctime)s %(levelname)s %(name)s: %(message)s"
log_date_format = "%H:%M:%S"

[tool.pytest.ini_options.markers]
# defined in conftest.py
```

---

## Test Ordering

By default, pytest runs tests in file-discovery order.
For parallelism, order must not matter. Enforce with `pytest-randomly`:

```bash
uv run pytest --randomly-seed=12345   # deterministic order for reproduction
uv run pytest --randomly-seed=last    # reproduce last failing order
```

Randomised order catches hidden test-ordering dependencies before they reach CI.
