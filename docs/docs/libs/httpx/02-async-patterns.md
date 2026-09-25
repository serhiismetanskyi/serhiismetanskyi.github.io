---
date: 2026-09-14
tags:
  - python
  - libraries
  - httpx
  - api-testing
---

# HTTPX — Async Patterns

## AsyncClient Basics

Same API as sync `Client`, but with `await` and `async with`.

```python
import httpx


async def fetch_users() -> list[dict]:
    async with httpx.AsyncClient(
        base_url="https://api.example.com",
        timeout=10,
    ) as client:
        r = await client.get("/users")
        r.raise_for_status()
        return r.json()
```

`async with` ensures the connection pool is properly closed on exit.

---

## Concurrent Requests

Send multiple requests in parallel with `asyncio.gather`:

```python
import asyncio

import httpx


async def fetch_all(urls: list[str]) -> list[dict]:
    """Fetch multiple URLs concurrently using a single connection pool."""
    async with httpx.AsyncClient(timeout=10) as client:
        tasks = [client.get(url) for url in urls]
        responses = await asyncio.gather(*tasks)
        return [r.json() for r in responses if r.is_success]


async def main():
    urls = [
        "https://api.example.com/users/1",
        "https://api.example.com/users/2",
        "https://api.example.com/users/3",
    ]
    results = await fetch_all(urls)
```

### Limiting Concurrency

Use `asyncio.Semaphore` to avoid overwhelming the server:

```python
import asyncio

import httpx


async def fetch_with_limit(
    client: httpx.AsyncClient,
    url: str,
    sem: asyncio.Semaphore,
) -> httpx.Response:
    async with sem:  # limits concurrent requests
        return await client.get(url)


async def fetch_all_limited(urls: list[str], max_concurrent: int = 10) -> list:
    sem = asyncio.Semaphore(max_concurrent)
    async with httpx.AsyncClient(timeout=10) as client:
        tasks = [fetch_with_limit(client, url, sem) for url in urls]
        return await asyncio.gather(*tasks)
```

---

## Streaming Responses

For large downloads — process data without loading everything into memory.

### Binary Streaming

```python
import httpx


async def download_file(url: str, dest: str) -> None:
    async with httpx.AsyncClient() as client:
        async with client.stream("GET", url) as r:
            r.raise_for_status()
            with open(dest, "wb") as f:
                async for chunk in r.aiter_bytes(chunk_size=8192):
                    f.write(chunk)
```

### Line-by-Line Streaming (NDJSON, Logs, SSE)

```python
async with client.stream("GET", "/events") as r:
    async for line in r.aiter_lines():
        if line.strip():
            process_event(line)
```

### Streaming Methods

| Method | Returns |
|--------|---------|
| `r.aiter_bytes()` | Chunks of bytes |
| `r.aiter_text()` | Chunks of decoded text |
| `r.aiter_lines()` | Lines of text |
| `r.aiter_raw()` | Raw bytes (no content decoding) |

---

## Event Hooks

Execute callbacks on every request/response — great for logging and metrics.

```python
import logging

import httpx

log = logging.getLogger(__name__)


def log_request(request: httpx.Request) -> None:
    log.debug("Request: %s %s", request.method, request.url)


def log_response(response: httpx.Response) -> None:
    response.read()  # required — .elapsed is only available after read/close
    log.debug(
        "Response: %s %s (%dms)",
        response.status_code,
        response.url,
        response.elapsed.total_seconds() * 1000,
    )


client = httpx.Client(
    event_hooks={
        "request": [log_request],
        "response": [log_response],
    },
    timeout=10,
)
```

For `AsyncClient`, use `async def` hooks — call `await response.aread()` before accessing `.elapsed`.

---

## Async Fixtures (pytest)

```python
import httpx
import pytest
import pytest_asyncio


@pytest_asyncio.fixture
async def api_client():
    """Async httpx client for API tests."""
    async with httpx.AsyncClient(
        base_url="https://api.example.com",
        timeout=10,
    ) as client:
        yield client


@pytest.mark.asyncio
async def test_list_users(api_client: httpx.AsyncClient):
    r = await api_client.get("/users")
    assert r.is_success
    assert len(r.json()) > 0
```

Note: `@pytest_asyncio.fixture` is required in strict mode (default). In auto mode, `@pytest.fixture` works for async fixtures too.

---

## Best Practices

| Practice | Why |
|----------|-----|
| `async with AsyncClient()` | Ensures connection pool cleanup |
| One client per service | Reuse connections, avoid pool exhaustion |
| `asyncio.gather` for fan-out | Parallel I/O without threads |
| `Semaphore` for rate limiting | Prevent server overload |
| Event hooks for logging | Centralized, no per-call boilerplate |
| Stream large responses | Avoid OOM on big downloads |
| `raise_for_status()` in hook | Auto-fail on errors globally |
