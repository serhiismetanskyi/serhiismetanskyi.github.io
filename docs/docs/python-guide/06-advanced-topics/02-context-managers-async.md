---
date: 2026-08-20
tags:
  - python
  - context-engineering
---

# Context Managers & Async

Context managers handle setup and cleanup. Async programming speeds up I/O-bound tasks.

---

## Context Managers

A context manager runs setup code **before** a block and cleanup code **after** it.

### The `with` Statement

```python
with open("file.txt", "r", encoding="utf-8") as f:
    content = f.read()
# File is automatically closed here, even if an error happened
```

### Custom Context Manager (Class-Based)

```python
import logging

logger = logging.getLogger(__name__)

class Timer:
    def __init__(self, label: str) -> None:
        self.label = label
        self.start: float = 0
        self.elapsed: float = 0

    def __enter__(self):
        import time
        self.start = time.perf_counter()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        import time
        self.elapsed = time.perf_counter() - self.start
        logger.info("%s took %.3f seconds", self.label, self.elapsed)
        return False  # do not suppress exceptions

with Timer("data processing") as t:
    data = [x ** 2 for x in range(100000)]
print(f"Elapsed: {t.elapsed:.3f}s")
```

### Custom Context Manager (Function-Based)

```python
from contextlib import contextmanager
import logging

logger = logging.getLogger(__name__)

@contextmanager
def database_connection(db_url: str):
    logger.info("Connecting to %s", db_url)
    conn = create_connection(db_url)
    try:
        yield conn
    finally:
        conn.close()
        logger.info("Connection closed")

with database_connection("postgresql://localhost/test") as conn:
    result = conn.execute("SELECT 1")
```

### Common Context Managers

| Context Manager | Purpose |
|----------------|---------|
| `open()` | File handling |
| `threading.Lock()` | Thread synchronization |
| `tempfile.TemporaryDirectory()` | Temporary directory |
| `contextlib.suppress(Error)` | Ignore specific exceptions |
| `unittest.mock.patch()` | Mock objects in tests |

### Using `contextlib.suppress`

```python
from contextlib import suppress

with suppress(FileNotFoundError):
    Path("missing.txt").unlink()
```

---

## Async Programming

Async lets Python do other work while waiting for I/O operations (network, files, database).

### When to Use Async

| Use Async | Do Not Use Async |
|-----------|-----------------|
| Many HTTP requests | CPU-heavy computation |
| Database queries | Simple scripts |
| WebSocket connections | Sequential file processing |
| Parallel API calls | Code that is already fast |

### Basic async/await

```python
import asyncio

async def fetch_data(url: str) -> str:
    await asyncio.sleep(1)  # simulates network wait
    return f"Data from {url}"

async def main():
    result = await fetch_data("https://api.example.com")
    print(result)

asyncio.run(main())
```

### Running Tasks in Parallel

```python
import asyncio

async def fetch_user(user_id: int) -> dict:
    await asyncio.sleep(0.5)
    return {"id": user_id, "name": f"User_{user_id}"}

async def main():
    tasks = [fetch_user(i) for i in range(5)]
    users = await asyncio.gather(*tasks)
    for user in users:
        print(user)

asyncio.run(main())
```

### Async with httpx

```python
import httpx

async def fetch_all_users():
    async with httpx.AsyncClient() as client:
        urls = [f"https://api.example.com/users/{i}" for i in range(10)]
        tasks = [client.get(url) for url in urls]
        responses = await asyncio.gather(*tasks)
        return [r.json() for r in responses]
```

### Async in pytest

```python
import pytest

@pytest.mark.asyncio
async def test_async_api_call():
    async with httpx.AsyncClient() as client:
        response = await client.get("https://api.example.com/health")
        assert response.status_code == 200
```

Install the plugin:

```bash
uv add --dev pytest-asyncio
```

---

## Best Practices

- Use `with` for **any resource** that needs cleanup (files, connections, locks)
- Use `@contextmanager` for simple context managers
- Use **async** only when you have **I/O-bound** tasks
- Use `asyncio.gather()` to run **multiple async tasks** in parallel
- Use **`httpx`** for async HTTP requests (requests library is sync-only)
- Do not **mix** sync and async code without careful thought
- Always **close** async clients (use `async with`)
