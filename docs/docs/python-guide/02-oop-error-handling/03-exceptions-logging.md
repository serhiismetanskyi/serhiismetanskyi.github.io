---
date: 2026-08-15
tags:
  - python
---

# Exceptions & Logging

Good error handling makes your code reliable. Good logging makes debugging easy.

---

## Exception Handling Basics

```python
try:
    result = 10 / 0
except ZeroDivisionError as e:
    print(f"Error: {e}")
```

### Full Try/Except Structure

```python
import json

try:
    data = load_config("config.json")
except FileNotFoundError:
    print("Config file not found")
except json.JSONDecodeError:
    print("Config file has invalid JSON")
else:
    print("Config loaded successfully")
finally:
    print("This always runs")
```

| Block | When It Runs |
|-------|-------------|
| `try` | Always — the main code |
| `except` | Only if an error happens |
| `else` | Only if no error happens |
| `finally` | Always — cleanup code |

---

## Common Built-in Exceptions

| Exception | When It Happens |
|-----------|----------------|
| `ValueError` | Wrong value (e.g., `int("abc")`) |
| `TypeError` | Wrong type (e.g., `"a" + 1`) |
| `KeyError` | Missing dictionary key |
| `IndexError` | List index out of range |
| `FileNotFoundError` | File does not exist |
| `AttributeError` | Object has no such attribute |
| `TimeoutError` | Operation took too long |
| `ConnectionError` | Network connection failed |

---

## Custom Exceptions

Create your own exceptions for specific error cases:

```python
class ApiError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message
        super().__init__(f"API Error {status_code}: {message}")

class NotFoundError(ApiError):
    def __init__(self, resource: str) -> None:
        super().__init__(404, f"{resource} not found")
```

### Using Custom Exceptions

```python
def get_user(user_id: int) -> dict:
    response = fetch(f"/users/{user_id}")
    if response.status_code == 404:
        raise NotFoundError(f"User {user_id}")
    return response.json()

try:
    user = get_user(999)
except NotFoundError as e:
    print(e)  # "API Error 404: User 999 not found"
```

---

## Logging

### Basic Setup

```python
import logging

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)
```

### Logging Levels

| Level | Use For |
|-------|---------|
| `DEBUG` | Detailed info for debugging |
| `INFO` | General events (test started, step completed) |
| `WARNING` | Something unexpected but not an error |
| `ERROR` | An error happened but the program continues |
| `CRITICAL` | A serious error — program may stop |

### Using the Logger

```python
logger.debug("Connecting to database at %s", db_host)
logger.info("Test suite started with %d tests", test_count)
logger.warning("Retry attempt %d of %d", attempt, max_retries)
logger.error("Failed to load config: %s", error_message)
```

!!! tip "Use lazy formatting"
    Use `logger.info("Value: %s", value)` instead of `logger.info(f"Value: {value}")`.
    This avoids formatting the string if the log level is disabled.

---

## Logging in Tests

```python
import logging

logger = logging.getLogger(__name__)

def test_user_creation():
    logger.info("Creating test user")
    user = create_user("Alice")
    logger.debug("User created: %s", user)
    assert user["name"] == "Alice"
    logger.info("Test passed")
```

---

## Best Practices

- **Never** use bare `except:` — always catch specific exceptions
- **Never** silently ignore exceptions (empty `except` block)
- **Log** error context, not just the error message
- Use **custom exceptions** for your application's error cases
- Use **`finally`** for cleanup (close files, connections)
- Set log level to `DEBUG` during development, `INFO` in production
- Add **meaningful log messages** at key points in your code
- Use **structured logging** for easier analysis
