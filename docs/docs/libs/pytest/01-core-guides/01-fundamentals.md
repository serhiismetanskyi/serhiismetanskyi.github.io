---
date: 2026-09-20
tags:
  - python
  - libraries
  - pytest
  - testing
---

# Pytest — Fundamentals

## Test Discovery

Pytest auto-discovers tests by convention:

| Convention | Pattern |
|------------|---------|
| File names | `test_*.py` or `*_test.py` |
| Function names | `test_*` |
| Class names | `Test*` (no `__init__`) |
| Directory | `tests/` (configurable via `testpaths`) |

---

## Assertions

Plain `assert` with automatic detailed diffs on failure.

```python
import pytest


def test_greeting():
    assert greet("Alice") == "Hello, Alice!"


def test_membership():
    user = get_user(1)
    assert user["role"] in ("admin", "editor")


def test_exception_message():
    # match= checks the string representation of the exception
    with pytest.raises(ValueError, match="must be positive"):
        withdraw(-1)


def test_float_comparison():
    # approx avoids floating-point precision failures
    assert 0.1 + 0.2 == pytest.approx(0.3)
    assert [1.01, 2.02] == pytest.approx([1.0, 2.0], abs=0.05)
```

---

## Fixtures

Fixtures provide test dependencies via dependency injection. `yield` splits setup from teardown — cleanup runs even if the test fails.

```python
import pytest
from myapp.db import Database


@pytest.fixture
def db():
    conn = Database(":memory:")
    conn.create_tables()
    yield conn         # ← test runs here
    conn.close()       # ← always runs after test


def test_insert_user(db):
    db.insert_user("Alice")
    assert db.count_users() == 1
```

### Fixture Scope

| Scope | Lifetime | Use case |
|-------|----------|----------|
| `function` (default) | Per test | Maximum isolation |
| `class` | Per test class | Shared setup within a class |
| `module` | Per `.py` file | Expensive resources per file |
| `session` | Entire run | DB pool, API auth token |

```python
@pytest.fixture(scope="session")
def api_token():
    """Created once, reused across all tests in the run."""
    return authenticate("test-user", "test-pass")


@pytest.fixture
def user_repo(db):
    """Depends on db fixture — pytest resolves the graph automatically."""
    return UserRepository(db)
```

### autouse

Runs for every test in scope without explicit request:

```python
@pytest.fixture(autouse=True)
def reset_db(db):
    """Rollback after each test to prevent state leakage."""
    yield
    db.rollback()
```

---

## conftest.py

Special file for shared fixtures. Pytest discovers it automatically — no import needed.

| Location | Available to |
|----------|-------------|
| `tests/conftest.py` | All tests |
| `tests/api/conftest.py` | Only `tests/api/` |

```python
# tests/conftest.py — shared across all tests
import pytest
from myapp import create_app


@pytest.fixture(scope="session")
def app():
    """Application instance shared for the entire test run."""
    return create_app(testing=True)


@pytest.fixture
def client(app):
    """Fresh test client per test."""
    return app.test_client()
```

---

## Parametrize

Run one test function with multiple inputs.

```python
import pytest


@pytest.mark.parametrize("email, is_valid", [
    ("alice@example.com", True),
    ("bob@test.org", True),
    ("invalid", False),
    ("", False),
    ("@no-local.com", False),
])
def test_email_validation(email, is_valid):
    assert validate_email(email) == is_valid
```

### Named Test IDs

```python
@pytest.mark.parametrize("a, b, expected", [
    pytest.param(2, 3, 5, id="positives"),
    pytest.param(-1, 1, 0, id="zero-sum"),
    pytest.param(0, 0, 0, id="zeros"),
])
def test_add(a, b, expected):
    assert add(a, b) == expected
```

---

## Markers

Tag tests to run selectively or modify behavior.

### Built-in Markers

| Marker | Purpose |
|--------|---------|
| `@pytest.mark.skip(reason="...")` | Always skip |
| `@pytest.mark.skipif(cond, reason="...")` | Conditional skip |
| `@pytest.mark.xfail(reason="...")` | Expected failure |
| `@pytest.mark.usefixtures("name")` | Apply fixture without requesting its value |

### Custom Markers

Register in `pyproject.toml` — `--strict-markers` catches typos:

```toml
[tool.pytest.ini_options]
markers = ["slow: long-running tests", "integration: needs external service"]
```

Run: `pytest -m "not slow"` · `pytest -m integration`.

**Naming:** `test_<unit>_<scenario>_<expected>` — e.g. `test_withdraw_negative_amount_raises_error`.

Output flags: `-v` verbose · `-s` show stdout · `--tb=short` short tracebacks · `-ra` summary.
