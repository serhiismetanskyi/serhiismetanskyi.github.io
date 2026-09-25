---
date: 2026-08-16
tags:
  - python
  - pytest
  - testing
---

# Testing Fundamentals

Before writing tests, you need to understand the different types and levels of testing.

---

## Why We Test

- Find bugs **early** (before production)
- Make sure code works **as expected**
- Allow safe **refactoring** (change code without breaking it)
- Serve as **documentation** (tests show how code should work)

---

## Test Levels

### Unit Tests

Test one function or method in isolation.

```python
def test_add():
    assert add(2, 3) == 5
```

- **Fast** — run in milliseconds
- **Many** — most of your tests should be unit tests
- **Isolated** — no database, no network, no files

### Integration Tests

Test how components work **together**.

```python
def test_user_creation_in_database(db_session):
    user = create_user(db_session, "Alice")
    found = get_user(db_session, user.id)
    assert found.name == "Alice"
```

- **Slower** — use real database or services
- **Fewer** — test key interactions
- **More realistic** — catch integration issues

### End-to-End (E2E) Tests

Test the whole system from the user's point of view.

```python
def test_login_flow(page):
    page.goto("/login")
    page.fill("#username", "alice")
    page.fill("#password", "secret")
    page.click("#submit")
    assert page.url == "/dashboard"
```

- **Slowest** — use real browser and server
- **Fewest** — test critical user flows only
- **Fragile** — can break from UI changes

---

## The Test Pyramid

```
        /  E2E  \        ← Few, slow, expensive
       / Integration \    ← Some, medium speed
      /    Unit Tests  \  ← Many, fast, cheap
```

| Level | Count | Speed | Cost |
|-------|-------|-------|------|
| Unit | Many | Fast | Low |
| Integration | Some | Medium | Medium |
| E2E | Few | Slow | High |

!!! tip "Follow the pyramid"
    Write **many unit tests**, fewer integration tests, and even fewer E2E tests.

---

## Test Naming

Good test names describe **what** is being tested and **what** the expected result is:

```python
# Good names
def test_login_with_valid_credentials_returns_token(): ...
def test_login_with_wrong_password_raises_error(): ...
def test_empty_cart_returns_zero_total(): ...

# Bad names
def test_login(): ...
def test_1(): ...
def test_it_works(): ...
```

---

## AAA Pattern

Structure each test with three parts:

```python
def test_discount_calculation():
    # Arrange — set up test data
    price = 100.0
    discount = 0.2

    # Act — run the code being tested
    result = calculate_discount(price, discount)

    # Assert — check the result
    assert result == 80.0
```

---

## What Makes a Good Test

| Quality | Description |
|---------|-------------|
| **Independent** | Does not depend on other tests |
| **Deterministic** | Same result every run |
| **Fast** | Runs quickly |
| **Readable** | Easy to understand what is tested |
| **Focused** | Tests one thing only |

---

## Best Practices

- Follow the **test pyramid** — many unit, few E2E
- Use **AAA pattern** (Arrange, Act, Assert)
- Give tests **descriptive names**
- Each test should check **one behavior**
- Tests should **not depend** on each other
- Clean up test data **after** each test
- Keep tests **simple** — no complex logic in tests
