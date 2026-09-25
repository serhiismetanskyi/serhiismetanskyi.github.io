---
date: 2026-06-13
tags:
  - architecture
  - networking
  - reliability
  - security
  - observability
---

# Reliability

Reliability means the system works correctly under failures. Not if failures happen, but when.

## 12.1 Retry

When a request fails, retry after a wait. Rules:
- Only retry idempotent operations (GET, PUT, DELETE). For POST, use idempotency keys.
- Use exponential backoff: 100ms → 200ms → 400ms → 800ms.
- Add jitter (random 0-50% to each backoff interval). Prevents synchronized retry storms.
- Set max retries (3-5). Do not retry forever.
- Respect `Retry-After` header from server.

```python
import time
import random


class TransientError(Exception):
    """Network or server errors worth retrying (e.g. 503, connection reset)."""


def retry_with_backoff(fn, max_attempts=4):
    for attempt in range(max_attempts):
        try:
            return fn()
        except TransientError:
            if attempt == max_attempts - 1:
                raise
            wait = (2 ** attempt) * 0.1 + random.uniform(0, 0.1)
            time.sleep(wait)
```

## 12.2 Circuit Breaker

A circuit breaker stops calling a failing service. This prevents cascading failures.

### States
- **Closed (normal):** requests pass through. Track error rate.
- **Open (failing):** all requests fail immediately without calling the service. Wait for cool-down.
- **Half-open (testing):** send one probe request. If success → Closed. If fail → Open again.

### Configuration
- Failure threshold: 50% errors in 20+ requests → Open.
- Cool-down period: 30-60 seconds in Open state before testing.
- Half-open probes: 1-5 test requests.

For critical dependencies (auth, payments): use stricter thresholds (20-30% failure rate).
For non-critical (recommendations, analytics): use looser thresholds (40-50%).

## 12.3 Timeout

Set a timeout on every external call. Never use an infinite timeout.

Recommended defaults:
- Internal service calls: 500ms - 1000ms.
- Database queries: 200ms - 500ms.
- External APIs: 3000ms - 5000ms.

If a timeout fires, return a clear error — do not hang waiting. A hanging request holds a thread, a connection, and memory.

## 12.4 Graceful Degradation

When a dependency is down, degrade gracefully rather than fail completely.

Examples:
- Recommendations service down → show popular items (cached fallback).
- Search service slow → serve cached last results.
- Payment service unavailable → queue the transaction for retry.

Classify dependencies:
- **Critical (auth, core data):** return error if unavailable.
- **Non-critical (enrichment, recommendations):** return default/cached/empty.

## 12.5 Graceful Shutdown

On SIGTERM (deployment, scale-down):
1. Stop accepting new requests (close listen socket).
2. Finish in-flight requests (with a max wait of 15-30s).
3. Close database connections and message consumers.
4. Exit.

Prevents dropped requests during deployments.
