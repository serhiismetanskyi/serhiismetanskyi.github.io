---
date: 2026-08-21
tags:
  - python
---

# Common Pitfalls

These are mistakes that even experienced Python developers make. Know them to avoid them.

---

## 1. Mutable Default Arguments

```python
# BUG — the list is shared between all calls!
def add_item(item: str, items: list = []) -> list:
    items.append(item)
    return items

print(add_item("a"))  # ["a"]
print(add_item("b"))  # ["a", "b"] — unexpected!
```

### Fix

```python
def add_item(item: str, items: list | None = None) -> list:
    if items is None:
        items = []
    items.append(item)
    return items
```

!!! warning "Never use mutable defaults"
    Lists, dicts, and sets as default arguments are shared between calls. Use `None` instead.

---

## 2. Late Binding in Closures

```python
# BUG — all functions return 4!
funcs = []
for i in range(5):
    funcs.append(lambda: i)

print([f() for f in funcs])  # [4, 4, 4, 4, 4]
```

### Fix

```python
funcs = []
for i in range(5):
    funcs.append(lambda i=i: i)

print([f() for f in funcs])  # [0, 1, 2, 3, 4]
```

---

## 3. Bare except

```python
# BAD — catches everything, including KeyboardInterrupt
try:
    do_something()
except:
    pass

# GOOD — catch specific exceptions
try:
    do_something()
except ValueError as e:
    logger.error("Invalid value: %s", e)
except ConnectionError as e:
    logger.error("Connection failed: %s", e)
```

---

## 4. Silently Ignoring Exceptions

```python
# BAD — you will never know about errors
try:
    result = risky_operation()
except Exception:
    pass

# GOOD — log the error
try:
    result = risky_operation()
except Exception:
    logger.exception("risky_operation failed")
    raise
```

---

## 5. Comparing with `is` Instead of `==`

```python
# BAD — compares identity, not value
if x is 1000: ...

# GOOD — compares value
if x == 1000: ...
```

Use `is` **only** for `None`, `True`, `False`:

```python
if x is None: ...
if result is True: ...
```

---

## 6. Modifying a List While Iterating

```python
# BUG — skips items!
numbers = [1, 2, 3, 4, 5]
for n in numbers:
    if n % 2 == 0:
        numbers.remove(n)
```

### Fix

```python
numbers = [1, 2, 3, 4, 5]
numbers = [n for n in numbers if n % 2 != 0]
```

---

## 7. Not Closing Resources

```python
# BAD — file may not be closed on error
f = open("data.txt")
data = f.read()
f.close()

# GOOD — always closed, even on error
with open("data.txt", encoding="utf-8") as f:
    data = f.read()
```

---

## 8. Flaky Tests

Tests that sometimes pass and sometimes fail:

| Cause | Fix |
|-------|-----|
| Shared state between tests | Use fixtures with proper cleanup |
| Time-dependent logic | Mock the clock |
| Network calls in tests | Use mocks or test doubles |
| Order-dependent tests | Make each test independent |
| Race conditions | Add proper waits/synchronization |

```python
# BAD — depends on external service
def test_api():
    response = requests.get("https://real-api.com/users")
    assert response.status_code == 200

# GOOD — use mock
def test_api(mocker):
    mock_get = mocker.patch("requests.get")
    mock_get.return_value.status_code = 200
    response = requests.get("https://real-api.com/users")
    assert response.status_code == 200
```

---

## 9. Overusing Inheritance

```python
# BAD — deep hierarchy
class Animal: ...
class Mammal(Animal): ...
class Domestic(Mammal): ...
class Dog(Domestic): ...
class Labrador(Dog): ...

# GOOD — flat composition
class Dog:
    def __init__(self, breed: str, is_domestic: bool) -> None:
        self.breed = breed
        self.is_domestic = is_domestic
```

---

## 10. Not Using Type Hints

```python
# BAD — unclear types
def process(data, flag):
    ...

# GOOD — clear types
def process(data: list[dict[str, str]], flag: bool) -> list[str]:
    ...
```

---

## Pitfall Summary

| Pitfall | Quick Rule |
|---------|-----------|
| Mutable defaults | Use `None`, then create inside |
| Late binding | Use `i=i` in lambdas |
| Bare except | Always catch specific exceptions |
| Silent exceptions | Always log or re-raise |
| `is` vs `==` | Use `is` only for `None` |
| Modify while iterating | Use list comprehension |
| Unclosed resources | Use `with` statement |
| Flaky tests | Mock external dependencies |
| Deep inheritance | Prefer composition |
| No type hints | Always add type hints |
