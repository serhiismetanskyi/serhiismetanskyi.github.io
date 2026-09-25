---
date: 2026-07-16
tags:
  - testing
  - test-strategy
  - unit-testing
---

# Unit Tests — Concept & Examples

## What They Test

One function, one method, one class. No database, no API calls, no browser.
Code calls code, result is checked. That's it.

```
Function → [input] → Unit test → assert result
```

---

## Why They Are the Foundation

| Property | Value |
|----------|-------|
| Speed | 0.001–0.01 s per test |
| Count | Thousands on a real project |
| Feedback | Instant — developer runs before committing |
| Tool | pytest |

Fast feedback is the entire point. A developer changes the password validation logic,
runs the tests, sees a failure in 2 seconds — not after deploy, not after manual QA.

---

## What to Test at Unit Level

- Business logic (discounts, calculations, rules)
- Validation (input checks, error messages)
- Data transformations (formatters, parsers, serializers)
- Edge cases (empty input, None, zero, max value)
- Error paths (expected exceptions with correct messages)

---

## Example: Password Validator

```python
import pytest


def validate_password(password: str) -> list[str]:
    errors = []
    if len(password) < 8:
        errors.append("at least 8 characters")
    if not any(char.isupper() for char in password):
        errors.append("one uppercase letter")
    if not any(char.isdigit() for char in password):
        errors.append("one digit")
    if not any(char in "!@#$%^&*" for char in password):
        errors.append("one special character")
    return errors


@pytest.mark.unit
class TestValidatePassword:
    def test_valid_password(self) -> None:
        assert validate_password("Str0ng!Pass") == []

    def test_too_short(self) -> None:
        assert "at least 8 characters" in validate_password("Ab1!")

    def test_no_uppercase(self) -> None:
        assert "one uppercase letter" in validate_password("weak1!pass")

    def test_no_digit(self) -> None:
        assert "one digit" in validate_password("NoDigits!Here")

    def test_no_special_char(self) -> None:
        assert "one special character" in validate_password("NoSpecial1")

    def test_empty_string_returns_all_errors(self) -> None:
        assert len(validate_password("")) == 4
```

Six tests, under a second. Covers valid case, each rule separately, and worst-case input.

---

## Toolchain Requirements

Without these enforced in CI, unit test suites quietly rot:

| Tool | Purpose |
|------|---------|
| `coverage` | Track which lines are covered; reject PRs below threshold |
| `ruff` | Lint — catch style issues and common bugs |
| `mypy` | Type checking — catch type mismatches before runtime |

```bash
# Run with coverage
uv run pytest --cov=src --cov-report=term-missing tests/unit/

# Enforce threshold
uv run pytest --cov=src --cov-fail-under=95 tests/unit/
```

---

## Pytest Marks for Layer Separation

```python
# conftest.py
import pytest

def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line("markers", "unit: unit tests — no I/O")
    config.addinivalue_line("markers", "integration: integration tests — real services")
    config.addinivalue_line("markers", "e2e: end-to-end browser tests")
```

Run only unit tests in the fast feedback loop:

```bash
uv run pytest -m unit          # only unit
uv run pytest -m "not e2e"    # everything except E2E
```

---

## Isolation Contract

A unit test **must not**:
- connect to a database
- make HTTP requests
- read from the filesystem (unless testing I/O code specifically)
- depend on environment variables being set

If it does any of these, it is an **integration test** — slow, fragile, and failing on CI
because the dev's local Postgres isn't running in the container.
Use mocks (`unittest.mock`, `pytest-mock`) to isolate external dependencies at this level.
