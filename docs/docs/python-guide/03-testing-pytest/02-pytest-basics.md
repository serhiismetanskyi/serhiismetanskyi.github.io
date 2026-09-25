---
date: 2026-08-16
tags:
  - python
  - pytest
  - testing
---

# pytest Basics

`pytest` is the most popular testing framework in Python. It is simple, powerful, and has a large plugin ecosystem.

---

## Install pytest

```bash
uv add --dev pytest
```

---

## Writing Your First Test

```python
# tests/test_math.py
def add(a: int, b: int) -> int:
    return a + b

def test_add_positive_numbers():
    assert add(2, 3) == 5

def test_add_negative_numbers():
    assert add(-1, -2) == -3

def test_add_zero():
    assert add(5, 0) == 5
```

---

## Running Tests

```bash
uv run pytest                    # run all tests
uv run pytest tests/test_math.py  # run specific file
uv run pytest -v                 # verbose output
uv run pytest -k "test_add"     # run tests matching name
uv run pytest --tb=short        # shorter error messages
```

---

## Assertions

pytest uses Python's built-in `assert` statement:

```python
def test_assertions_example():
    # Equality
    assert 1 + 1 == 2

    # Truthiness
    assert True
    assert [1, 2, 3]  # non-empty list is truthy

    # Containment
    assert "hello" in "hello world"
    assert 5 in [1, 2, 3, 4, 5]

    # Comparison
    assert 10 > 5
    assert len([1, 2, 3]) == 3

    # Type checking
    assert isinstance(42, int)
```

### Checking for Exceptions

```python
import pytest

def test_division_by_zero():
    with pytest.raises(ZeroDivisionError):
        result = 1 / 0

def test_invalid_input():
    with pytest.raises(ValueError, match="invalid"):
        int("invalid")
```

---

## Test Discovery

pytest automatically finds tests when:

- File names start with `test_` or end with `_test.py`
- Function names start with `test_`
- Class names start with `Test`

```
tests/
├── test_user.py          ✓ found
├── test_api.py           ✓ found
├── user_test.py          ✓ found
├── helpers.py            ✗ skipped
└── conftest.py           ✓ special file for fixtures
```

---

## Test Classes

Group related tests in a class:

```python
class TestUserValidation:
    def test_valid_email(self):
        assert is_valid_email("user@example.com")

    def test_invalid_email_no_at(self):
        assert not is_valid_email("userexample.com")

    def test_invalid_email_empty(self):
        assert not is_valid_email("")
```

---

## Useful Command-Line Options

| Option | What It Does |
|--------|-------------|
| `-v` | Verbose — show each test name |
| `-s` | Show print statements |
| `-x` | Stop after first failure |
| `--lf` | Run only last failed tests |
| `--ff` | Run failed tests first |
| `-k "name"` | Run tests matching name pattern |
| `--tb=short` | Short traceback |
| `--co` | Collect only (list tests without running) |

---

## conftest.py

A special file where you put shared fixtures and hooks:

```python
# tests/conftest.py
import pytest

@pytest.fixture
def sample_user() -> dict:
    return {"name": "Alice", "email": "alice@example.com"}
```

Fixtures in `conftest.py` are available to **all tests** in the same directory and below.

---

## Best Practices

- Name test files with `test_` prefix
- Name test functions with `test_` prefix
- Use **descriptive names** that explain the test
- Keep each test **short and focused**
- Use `pytest.raises` to test exceptions
- Use `-v` flag to see detailed test output
- Put shared fixtures in **`conftest.py`**
