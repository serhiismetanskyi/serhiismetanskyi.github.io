---
date: 2026-10-02
tags:
  - python
  - libraries
  - resilience
  - performance
  - reliability
---

# Resilience — Semaphores & Rate Limits

`asyncio.gather()` over 10,000 URLs opens 10,000 requests at once: the target answers `429`, the connection pool times out, and your own process runs out of sockets. Two different limits prevent that, and they are easy to mix up:

| | Concurrency limit | Rate limit |
|---|-------------------|------------|
| Limits | How many calls are **in flight at the same time** | How many calls **start per time window** |
| Typical rule | "At most 10 open requests to this host" | "At most 100 requests per minute per API key" |
| Python tools | `asyncio.Semaphore`, `threading.Semaphore`, `anyio.CapacityLimiter`, `ThreadPoolExecutor(max_workers)`, `httpx.Limits` | `aiolimiter.AsyncLimiter`; Redis counters across processes |
| Protects | Your process (sockets, memory, threads) and the target's workers | The target's quota; avoids `429` |
| Fast calls | 10 slots × 20 ms calls = up to 500 calls/s | 100/min no matter how fast the calls are |

Most clients need **both**: a semaphore for in-flight calls and a rate limiter for the provider's quota.

## asyncio: `Semaphore` and `TaskGroup`

```python
# app/limits.py
import asyncio

import httpx
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_random_exponential

from app.http_client import is_retryable


async def fetch_all(client: httpx.AsyncClient, urls: list[str], *, max_in_flight: int = 10) -> list[dict]:
    """GET every URL, at most `max_in_flight` requests at the same time."""
    semaphore = asyncio.Semaphore(max_in_flight)

    async def fetch(url: str) -> dict:
        async with semaphore:                       # waits here while the limit is reached
            response = await client.get(url)
            response.raise_for_status()
            return response.json()

    async with asyncio.TaskGroup() as tg:           # one failure cancels the rest
        tasks = [tg.create_task(fetch(url)) for url in urls]
    return [task.result() for task in tasks]


@retry(
    retry=retry_if_exception(is_retryable),
    stop=stop_after_attempt(3),
    wait=wait_random_exponential(multiplier=0.2, max=5),
    reraise=True,
)
async def get_json(client: httpx.AsyncClient, semaphore: asyncio.Semaphore, url: str) -> dict:
    async with semaphore:                           # the slot is free while tenacity sleeps
        response = await client.get(url)
        response.raise_for_status()
        return response.json()
```

`fetch_all` against a mocked API (50 URLs, `max_in_flight=5`, each response takes 50 ms) finished in 0.53 s with at most **5** requests in flight — ten waves of five. `get_json` is used in [Limits and Retries Together](#limits-and-retries-together) below.

- **Create the semaphore inside the running loop** for the work that shares it. One semaphore per batch (as here) limits the batch; one per client or per host limits the whole process.
- **`asyncio.TaskGroup`** (Python 3.11+) waits for all tasks and cancels the rest when one fails; `asyncio.gather(..., return_exceptions=True)` collects all results and errors instead.
- **All tasks are created up front.** That is fine for thousands of items. For millions, start N worker tasks that read from an `asyncio.Queue` ([05](./05-race-conditions.md#queues-the-safe-hand-off)) — the queue size becomes the limit and memory stays flat.
- **`BoundedSemaphore`** raises `ValueError: BoundedSemaphore released too many times` on an extra `release()`. A plain `Semaphore` silently grows (`Semaphore(1)` released twice allows 2 at once). Use `async with`, and prefer `BoundedSemaphore` when you call `acquire()` / `release()` by hand.

## Threads: `Semaphore` and `ThreadPoolExecutor`

```python
import threading
import time
from concurrent.futures import ThreadPoolExecutor

license_slots = threading.BoundedSemaphore(2)        # e.g. a device farm with 2 free phones


def run_on_device(test: str) -> str:
    with license_slots:                              # blocks while 2 tests hold a device
        time.sleep(0.1)
        return f"{test}: passed"


start = time.perf_counter()
with ThreadPoolExecutor(max_workers=8) as pool:      # 8 threads, but only 2 inside at once
    results = list(pool.map(run_on_device, [f"test_{i}" for i in range(6)]))
print(results[:2], f"{time.perf_counter() - start:.1f} s")
# ['test_0: passed', 'test_1: passed'] 0.3 s
```

- `ThreadPoolExecutor(max_workers=n)` **is** a concurrency limit: at most `n` jobs run, the rest wait in its internal queue. The default is `min(32, os.process_cpu_count() + 4)` on Python 3.13+ (`os.cpu_count()` before).
- A semaphore inside the pool limits one resource (devices, licences, a fragile API) while the pool runs other work in parallel.
- `threading.BoundedSemaphore` raises `ValueError` on an extra release, like the asyncio one.

## `anyio.CapacityLimiter`

anyio runs on asyncio and Trio. Its `CapacityLimiter` is a semaphore with extras — and the limit for blocking code sent to threads:

```python
import time

import anyio
import anyio.to_thread

db_slots = anyio.CapacityLimiter(3)                  # at most 3 blocking DB calls at once


def blocking_query(n: int) -> int:
    time.sleep(0.1)                                  # a sync driver, a file read, a CPU-light C call
    return n * n


async def query(n: int, results: list[int]) -> None:
    results.append(await anyio.to_thread.run_sync(blocking_query, n, limiter=db_slots))


async def main() -> None:
    results: list[int] = []
    start = time.perf_counter()
    async with anyio.create_task_group() as tg:
        for n in range(9):
            tg.start_soon(query, n, results)
    print(sorted(results), f"{time.perf_counter() - start:.1f} s")   # 9 calls / 3 slots * 0.1 s
    print(db_slots.total_tokens, db_slots.borrowed_tokens)
    print(anyio.to_thread.current_default_thread_limiter().total_tokens)  # default for run_sync: 40


anyio.run(main)
# [0, 1, 4, 9, 16, 25, 36, 49, 64] 0.3 s
# 3 0
# 40
```

- `total_tokens` can be changed at runtime (scale a limit up or down without recreating it); `borrowed_tokens` and `statistics()` show current use.
- `anyio.to_thread.run_sync()` without `limiter=` shares one default limiter of **40** threads — FastAPI / Starlette run sync endpoints and dependencies through it, so 40 slow sync endpoints block the 41st request.

## Rate Limits with `aiolimiter`

```python
import asyncio
import time

from aiolimiter import AsyncLimiter


async def main() -> None:
    limiter = AsyncLimiter(5, 1)                     # 5 per 1 second  (default period: 60 s!)
    start = time.perf_counter()
    stamps: list[float] = []

    async def call() -> None:
        async with limiter:
            stamps.append(round(time.perf_counter() - start, 2))

    async with asyncio.TaskGroup() as tg:
        for _ in range(20):
            tg.create_task(call())
    print(stamps[:7], "...", stamps[-1])


asyncio.run(main())
# [0.0, 0.0, 0.0, 0.0, 0.0, 0.2, 0.4] ... 3.0
```

- `AsyncLimiter(max_rate, time_period=60)`: **the period defaults to 60 seconds** — `AsyncLimiter(10)` means 10 per minute, not per second.
- It is a leaky bucket: up to `max_rate` acquisitions pass at once (a burst), then one every `time_period / max_rate` seconds. If the provider forbids bursts, use a smaller `max_rate` with a proportionally smaller period (`AsyncLimiter(1, 0.2)` instead of `AsyncLimiter(5, 1)`).
- `has_capacity()` checks without waiting; `acquire(amount)` takes several units (e.g. tokens for an LLM call).
- One limiter belongs to one event loop. Reusing it across `asyncio.run()` calls (common in tests) emits `RuntimeWarning: This AsyncLimiter instance is being re-used across loops`; create it per loop or per test.
- For sync code or limits shared across processes see `pyrate-limiter` and `limits`, or a Redis counter ([Redis — Patterns](../../databases/redis/03-patterns.md#rate-limiting)).

## Limits per Host

A crawler, a test-data loader or a contract-test runner talks to many hosts. One global semaphore lets a slow host take all slots; one per host keeps them independent:

```python
# app/host_limits.py
import asyncio
from collections import defaultdict
from urllib.parse import urlsplit

import httpx
from aiolimiter import AsyncLimiter


class HostLimits:
    """Concurrency limit per host plus a requests-per-second limit per host."""

    def __init__(self, max_in_flight: int = 4, max_rate: float = 10, period: float = 1.0) -> None:
        self._semaphores: defaultdict[str, asyncio.Semaphore] = defaultdict(
            lambda: asyncio.Semaphore(max_in_flight)
        )
        self._rates: defaultdict[str, AsyncLimiter] = defaultdict(
            lambda: AsyncLimiter(max_rate, period)
        )

    async def get(self, client: httpx.AsyncClient, url: str) -> httpx.Response:
        host = urlsplit(url).netloc
        async with self._semaphores[host]:          # outer: limit requests in flight
            async with self._rates[host]:           # inner: send right after getting a token
                return await client.get(url)
```

With `max_in_flight=2`, ten requests to `a.test` and ten to `b.test` ran with a peak of **4** in flight — 2 per host.

- **Semaphore outside, rate limiter inside**: a task takes a token only when it can send right away. The other order lets tasks collect tokens while they wait for a slot and then send them in a burst.
- HTTPX has its own pool limits per client — `httpx.Limits(max_connections=100, max_keepalive_connections=20)` by default — for all hosts together. Above the limit, requests wait for a connection and fail with `httpx.PoolTimeout` after the `pool` timeout (5 s by default).

## Limits and Retries Together

A retry loop inside a semaphore keeps the slot while it **sleeps** between attempts. Twenty jobs, a limit of 4, each job's first call fails and waits 0.5 s before the retry:

```python
import asyncio
import time

from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_fixed


class Busy(Exception):
    pass


failed_once: set[int] = set()


async def call_api(job: int) -> int:
    await asyncio.sleep(0.1)                     # the request itself
    if job not in failed_once:                   # every job fails once, then succeeds
        failed_once.add(job)
        raise Busy(job)
    return job


retry_busy = retry(retry=retry_if_exception_type(Busy), stop=stop_after_attempt(3), wait=wait_fixed(0.5))


@retry_busy
async def call_with_retry(job: int) -> int:
    return await call_api(job)


async def hold_slot(sem: asyncio.Semaphore, job: int) -> int:
    async with sem:                              # slot is held during the 0.5 s backoff sleep
        return await call_with_retry(job)


@retry_busy
async def release_slot(sem: asyncio.Semaphore, job: int) -> int:
    async with sem:                              # slot is held only while the request runs
        return await call_api(job)


async def run(strategy) -> float:
    failed_once.clear()
    sem = asyncio.Semaphore(4)
    start = time.perf_counter()
    async with asyncio.TaskGroup() as tg:
        for job in range(20):
            tg.create_task(strategy(sem, job))
    return time.perf_counter() - start


print(f"hold slot during backoff:    {asyncio.run(run(hold_slot)):.2f} s")
print(f"release slot during backoff: {asyncio.run(run(release_slot)):.2f} s")
```

```text
hold slot during backoff:    3.52 s
release slot during backoff: 1.11 s
```

Holding the slot wastes it on sleeping: three times slower here, and under a real outage all slots end up sleeping while healthy work waits. **Put the semaphore inside the retried function** (like `get_json` above), so every attempt takes a slot and gives it back before the backoff sleep.

The trade-off: a released slot goes to the next waiting task, so a retrying task queues again behind new work. If retries must finish first (e.g. they hold a lock elsewhere), keep the slot — and keep the backoff short.

Rate limiters and retries:

- **Every retry consumes a token** — retries count against the provider's quota exactly like first attempts.
- **A `429` means the limiter is too generous** (or other clients share the quota). Honour `Retry-After`, then lower the rate rather than retrying harder.
- **Shared quota, shared limiter**: all tasks that use one API key go through one limiter instance.

## Distributed Limits

Semaphores and `AsyncLimiter` live in **one process**. Four pods with `Semaphore(10)` allow 40 concurrent calls; eight `pytest-xdist` workers with `AsyncLimiter(5, 1)` send 40 requests per second. Options:

- **Divide the limit** by the number of instances (simple; wrong when instances scale up or down).
- **A shared counter in Redis** — fixed or sliding window, or a token bucket in a Lua script: [Redis — Patterns: Rate Limiting](../../databases/redis/03-patterns.md#rate-limiting).
- **Let the provider enforce it**: honour `429` and `Retry-After`, back off, and keep a local limiter slightly below the quota.
- **One gateway** in front of the dependency (API gateway, LiteLLM proxy for LLM calls) that applies the limit for every client.

## Checklist

- [ ] Every fan-out (`gather`, `TaskGroup`, thread pool) has an explicit concurrency limit
- [ ] Per-host or per-dependency limits where one slow host must not block others
- [ ] Rate limits use `AsyncLimiter(rate, period)` with an explicit period
- [ ] Semaphore outside, rate limiter inside; the semaphore is released during retry backoff
- [ ] Retries and `429` responses are counted against the same limiter
- [ ] Limits that must hold across processes or pods live in Redis or a gateway, not in a `Semaphore`
- [ ] Tests measure peak concurrency and assert it equals the limit ([06](./06-testing.md#concurrency-limits))

---
## See also
- [Resilience — Timeouts, Fallbacks & Circuit Breakers](./03-timeouts-fallbacks-breakers.md)
- [Resilience — Race Conditions](./05-race-conditions.md)
- [HTTPX — Async Patterns](../httpx/02-async-patterns.md)
- [Redis — Patterns: Caching, Rate Limits, Locks, Messaging](../../databases/redis/03-patterns.md)
- [Context Managers & Async](../../python-guide/06-advanced-topics/02-context-managers-async.md)
