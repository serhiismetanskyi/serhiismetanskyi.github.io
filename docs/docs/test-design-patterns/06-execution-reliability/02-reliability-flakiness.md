---
date: 2026-07-14
tags:
  - test-automation
  - design-patterns
---

# Test Reliability and Flakiness

## Causes of Flakiness

| Cause | Description | Example |
|---|---|---|
| Timing issues | Test proceeds before async operation completes | Assert before API response settles |
| Shared state | One test's side effect breaks another | Global DB row modified by two tests |
| Async behaviour | Event loop or queue processing order not guaranteed | WebSocket message arrives late |
| External dependencies | Third-party API rate limit or downtime | OAuth token refresh fails |
| Port conflicts | Two tests bind to the same port | Parallel integration tests |
| Clock dependency | Test relies on `datetime.now()` | Time-based expiry check |
| Random ordering | Test passes only in specific order | Order-dependent fixtures |

---

## Solutions

### Wait Strategies

Avoid arbitrary fixed `time.sleep()` in test bodies. Use polling or event-driven waits instead.

**Polling with timeout:**

```python
import time
import logging

logger = logging.getLogger(__name__)


def wait_until(condition_fn, timeout: float = 5.0, interval: float = 0.2) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if condition_fn():
            return
        logger.debug("Condition not met, retrying in %.1fs", interval)
        time.sleep(interval)
    raise TimeoutError(f"Condition not met within {timeout}s")
```

Usage:
```python
def test_async_job_completes(api_client, job_id):
    wait_until(
        lambda: api_client.get(f"/jobs/{job_id}").json()["status"] == "done",
        timeout=10.0,
    )
```

**Playwright explicit waits:**
```python
page.wait_for_selector('[data-testid="result"]', timeout=5000)
page.wait_for_response(lambda r: r.url.endswith("/api/data") and r.status == 200)
```

### Retry Logic

See [01-execution-strategies.md](./01-execution-strategies.md) for retry configuration.

Apply retry only at the boundaries (network call, external service).
Never retry assertion failures caused by business logic bugs.

### Isolation

| Isolation technique | What it solves |
|---|---|
| Function-scoped DB fixture | Shared state between tests |
| Unique test data (UUID-based IDs) | Collision in parallel runs |
| Mocked clock (`freezegun`) | Time-dependent test behaviour |
| WireMock / httpx mock | External service instability |
| Separate DB schema per worker | Parallel DB state conflicts |

**Freeze time:**
```python
from freezegun import freeze_time

@freeze_time("2026-01-15 12:00:00")
def test_token_expires_after_one_hour(auth_service):
    token = auth_service.create_token(expires_in=3600)
    with freeze_time("2026-01-15 13:00:01"):
        assert auth_service.is_expired(token)
```

---

## Flakiness Detection

Track flaky tests systematically:

| Method | Description |
|---|---|
| Run suite N times in CI | `pytest --count=5` (pytest-repeat) |
| Randomise test order | `pytest-randomly` |
| Record failure rates | CI metrics over time |
| Quarantine known flaky tests | `@pytest.mark.xfail(strict=False)` |

### Quarantine Pattern

```python
@pytest.mark.xfail(
    reason="Flaky: external webhook delivery timing",
    strict=False,
    run=True,
)
def test_webhook_delivery_timing(api_client):
    ...
```

`strict=False` means: a pass is acceptable, a fail is not a hard failure.
This keeps the test visible without blocking CI.

---

## Flakiness Risk Register

| Pattern | Flakiness risk | Mitigation |
|---|---|---|
| `time.sleep()` in test | High | Replace with `wait_until` |
| Hardcoded IDs | High | Use UUIDs or generated values |
| Global fixture state | High | Scope fixtures to `function` |
| Ordered test dependency | High | Use explicit fixtures, not ordering |
| External HTTP in unit test | Medium | Mock at HTTP boundary |
| Async test without timeout | Medium | Always set `asyncio.wait_for` timeout |
