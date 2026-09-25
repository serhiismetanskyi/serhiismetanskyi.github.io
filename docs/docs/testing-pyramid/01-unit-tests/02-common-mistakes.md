---
date: 2026-07-16
tags:
  - testing
  - test-strategy
  - unit-testing
---

# Unit Tests — Common Mistakes

## Mistake 1: Test Without an Assertion

The test calls the function, nothing crashes, pytest marks it green.
But the result was never checked. Wrong output ships to production.

```python
import pytest


def calculate_shipping(weight_kg: float, express: bool) -> float:
    if weight_kg <= 0:
        raise ValueError("Weight must be positive")
    base = 5.0 + weight_kg * 2.0
    if express:
        base *= 1.5
    return round(base, 2)


@pytest.mark.unit
class TestShippingBad:
    """Bad: calls the function but never checks the result."""

    def test_standard_shipping(self) -> None:
        calculate_shipping(3.0, express=False)  # no assert

    def test_express_shipping(self) -> None:
        calculate_shipping(3.0, express=True)   # no assert
```

Both tests pass even if someone changes the formula and express now costs 10×.
The function ran, it didn't crash — "all good." Meanwhile customers see $165
on checkout instead of $16.50.

```python
@pytest.mark.unit
class TestShippingGood:
    """Good: every test checks the actual value."""

    def test_standard_shipping(self) -> None:
        assert calculate_shipping(3.0, express=False) == 11.0

    def test_express_shipping(self) -> None:
        assert calculate_shipping(3.0, express=True) == 16.5

    def test_minimum_weight(self) -> None:
        assert calculate_shipping(0.1, express=False) == 5.2

    def test_zero_weight_raises(self) -> None:
        with pytest.raises(ValueError, match="Weight must be positive"):
            calculate_shipping(0, express=False)
```

**Rule:** every test that calls a function returning a value **must assert** that value.

---

## Mistake 2: Hidden Integration Dependency

A "unit" test that hits a real database or calls a live API is not a unit test.
It passes locally because the developer has Postgres running.
It fails on CI where the container isn't there.

```python
import pytest
from myapp.db import get_db_connection


@pytest.mark.unit
class TestUserServiceBad:
    """Bad: hits a real database inside a unit test."""

    def test_user_exists(self) -> None:
        conn = get_db_connection()           # real DB call
        result = conn.execute(
            "SELECT 1 FROM users WHERE id = 1"
        ).fetchone()
        assert result is not None            # fails on CI
```

Fix: mock the dependency at the boundary.

```python
from unittest.mock import MagicMock, patch

import pytest
from myapp.user_service import UserService


@pytest.mark.unit
class TestUserServiceGood:
    """Good: database is mocked, test runs in isolation."""

    def test_user_exists_returns_true(self) -> None:
        mock_repo = MagicMock()
        mock_repo.find_by_id.return_value = {"id": 1, "name": "Alice"}
        service = UserService(repo=mock_repo)
        assert service.user_exists(user_id=1) is True

    def test_user_not_found_returns_false(self) -> None:
        mock_repo = MagicMock()
        mock_repo.find_by_id.return_value = None
        service = UserService(repo=mock_repo)
        assert service.user_exists(user_id=999) is False
```

**Rule:** inject dependencies (repository, HTTP client, file system) so tests can replace
them with mocks. Real connections belong in integration tests.

---

## Mistake 3: One Test Covers Everything

A single test that checks the happy path gives 0 information when it fails.
Was it the empty case? The uppercase rule? The network error? Nobody knows.

```python
@pytest.mark.unit
def test_everything_at_once() -> None:
    # checks valid, invalid, boundary all in one test
    assert validate_password("Str0ng!Pass") == []
    assert validate_password("weak") != []
    assert validate_password("") != []
```

One failure masks the rest. Use `parametrize` to separate concerns:

```python
@pytest.mark.unit
@pytest.mark.parametrize("password, rule", [
    ("Ab1!", "at least 8 characters"),
    ("weak1!pass", "one uppercase letter"),
    ("NoDigits!Here", "one digit"),
    ("NoSpecial1", "one special character"),
])
def test_each_rule_independently(password: str, rule: str) -> None:
    assert rule in validate_password(password)
```

**Rule:** one test = one scenario. If it fails, the name tells you exactly what broke.

---

## Checklist

| Check | Bad Pattern | Fix |
|-------|-------------|-----|
| Every return value asserted | Call without `assert` | Always `assert result == expected` |
| No real I/O in unit scope | DB/HTTP calls in unit tests | Mock external dependencies |
| One scenario per test | Many assertions in one test | Use `parametrize` |
| Error paths tested | Only happy path | Add `pytest.raises` for expected exceptions |
| Coverage enforced in CI | Tests merged without coverage | `--cov-fail-under=95` in CI |
