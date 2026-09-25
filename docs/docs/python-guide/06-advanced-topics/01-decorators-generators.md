---
date: 2026-08-20
tags:
  - python
---

# Decorators & Generators

Decorators and generators are powerful Python features used often in test automation.

---

## Decorators

A decorator is a function that wraps another function to add behavior.

### Basic Decorator

```python
import functools
import logging
import time

logger = logging.getLogger(__name__)

def log_call(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        logger.info("Calling %s", func.__name__)
        result = func(*args, **kwargs)
        logger.info("Finished %s", func.__name__)
        return result
    return wrapper

@log_call
def process_data(data: list) -> int:
    return len(data)

process_data([1, 2, 3])
# Logs: Calling process_data
# Logs: Finished process_data
```

### Decorator with Arguments

```python
import functools
import time
import logging

logger = logging.getLogger(__name__)

def retry(max_attempts: int = 3, delay: float = 1.0):
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(1, max_attempts + 1):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    logger.warning(
                        "Attempt %d/%d failed: %s",
                        attempt, max_attempts, e,
                    )
                    if attempt == max_attempts:
                        raise
                    time.sleep(delay)
        return wrapper
    return decorator

@retry(max_attempts=3, delay=0.5)
def fetch_data(url: str) -> dict:
    ...
```

### Timing Decorator

```python
import functools
import time
import logging

logger = logging.getLogger(__name__)

def timer(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        result = func(*args, **kwargs)
        elapsed = time.perf_counter() - start
        logger.info("%s took %.3f seconds", func.__name__, elapsed)
        return result
    return wrapper

@timer
def slow_operation() -> None:
    time.sleep(1)
```

### Common Decorators in Python

| Decorator | Purpose |
|-----------|---------|
| `@property` | Make a method act like an attribute |
| `@staticmethod` | Method without `self` or `cls` |
| `@classmethod` | Method that receives the class |
| `@functools.wraps` | Preserve original function metadata |
| `@pytest.fixture` | Create a pytest fixture |
| `@pytest.mark.parametrize` | Run test with different data |

!!! tip "Always use @functools.wraps"
    Without it, the decorated function loses its name and docstring.

---

## Generators

A generator produces values **one at a time** instead of creating them all at once.

### Basic Generator

```python
def count_up(limit: int):
    n = 0
    while n < limit:
        yield n
        n += 1

for number in count_up(5):
    print(number)  # 0, 1, 2, 3, 4
```

### Why Use Generators?

| Regular Function | Generator |
|-----------------|-----------|
| Creates all items in memory | Creates one item at a time |
| Returns a list | Returns an iterator |
| Uses more memory | Uses minimal memory |

### Practical Example: Reading Large Files

```python
from pathlib import Path

def read_lines(file_path: str):
    with Path(file_path).open(encoding="utf-8") as f:
        for line in f:
            yield line.strip()

for line in read_lines("large_log.txt"):
    if "ERROR" in line:
        print(line)
```

### Generator Expressions

A short way to create generators (like list comprehensions but with parentheses):

```python
squares = (x ** 2 for x in range(1000000))

total = sum(x ** 2 for x in range(1000000))
```

### Generators in Testing

```python
import pytest

def generate_test_users(count: int):
    for i in range(count):
        yield {"name": f"User_{i}", "email": f"user_{i}@test.com"}

@pytest.fixture
def test_users():
    return list(generate_test_users(5))
```

---

## Best Practices

- Use **`@functools.wraps`** in every decorator
- Keep decorators **simple** — complex logic should be in separate functions
- Use **generators** when working with large data sets
- Use **generator expressions** instead of list comprehensions when you only need to iterate once
- Prefer **built-in decorators** (`@property`, `@staticmethod`) over custom ones when possible
