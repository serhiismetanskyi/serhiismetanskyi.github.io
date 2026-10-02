---
date: 2026-10-02
tags:
  - python
  - libraries
  - resilience
  - reliability
  - api
---

# Resilience — Retries & Backoff

A retry is a bet that the next attempt will see a different world: the overloaded server has recovered, the connection pool has a fresh connection, the leader election is over. The bet pays off for **transient** failures and loses for everything else — and a lost bet costs time, load on a struggling dependency, and sometimes a duplicate side effect. This page is about placing the bet well: what to retry, how many times, how long to wait, and how to stop.

## What to Retry

| Failure | Retry? | Why |
|---------|--------|-----|
| Connection refused / reset, DNS hiccup | Yes | The request did not reach the application, or the connection broke |
| Connect timeout | Yes | No TCP connection — the request was not sent, safe even for POST |
| Read timeout | Only if idempotent | The server may have done the work; only the answer was lost |
| `408 Request Timeout` | Yes, if idempotent | The server gave up waiting for the request |
| `429 Too Many Requests` | Yes, after `Retry-After` | Rate limit; waiting is the fix |
| `502`, `503`, `504` | Yes, if idempotent | Proxy, overload or upstream timeout — usually short |
| `500 Internal Server Error` | Usually no | Often a bug that fails every time; retry only reads you know are safe |
| `400`, `404`, `409`, `422` | No | The request itself is wrong or conflicts; the same request fails again |
| `401`, `403` | No (refresh token once, then fail) | Credentials problem, not a timing problem |
| DB deadlock / serialization failure | Yes — the whole transaction | The database aborted one side to let the other finish |
| DB unique violation, check violation | No | Data problem; a retry hits the same constraint |
| Validation error, business rule | No | Deterministic |

Make the split explicit in code — two exception families, or one predicate — so nobody "fixes" a flaky test by retrying `Exception`:

```python
class TransientError(Exception):
    """Worth retrying: timeout, connection reset, 429, 502/503/504."""


class PermanentError(Exception):
    """Not worth retrying: 400, 401, 403, 404, 422, business rule violations."""
```

### `Retry-After`

Servers send `Retry-After` with `429` and `503`. The value is either seconds (`Retry-After: 120`) or an HTTP date (`Retry-After: Fri, 02 Oct 2026 12:00:30 GMT`). Prefer it over your own backoff, but **cap it** — a buggy or hostile server can ask for a day — and give up if it does not fit your deadline.

```python
>>> parse_retry_after("120")
120.0
>>> parse_retry_after("Fri, 02 Oct 2026 12:00:30 GMT", now=datetime(2026, 10, 2, 12, 0, tzinfo=timezone.utc))
30.0
>>> parse_retry_after("soon") is None
True
```

`parse_retry_after` is part of the [hand-written retry module](#hand-written-retry-loop) below.

## Idempotency

An operation is **idempotent** when doing it twice has the same effect as doing it once. Retries are only safe for idempotent operations, because a timeout does not tell you whether the first attempt happened.

| HTTP method | Idempotent by definition (RFC 9110) | Retry on read timeout / 5xx |
|-------------|------------------------------------|-----------------------------|
| `GET`, `HEAD`, `OPTIONS` | Yes | Yes |
| `PUT` (replace whole resource), `DELETE` | Yes | Yes |
| `POST` | No | Only with an idempotency key the server honours |
| `PATCH` | No (depends on the patch) | Only with an idempotency key, or if the patch is "set", not "add" |

"Idempotent by definition" is a promise of the API design. Check the real API: a `DELETE` that returns `404` on the second call is still idempotent (the state is the same), a `PUT` that appends to a list is not.

**Idempotency keys** make a `POST` safe to retry. The client generates a unique key for one **logical** operation and sends it with every attempt; the server stores the key with the result and returns the stored result for a repeated key instead of doing the work again. Stripe and many payment APIs use an `Idempotency-Key` header (an IETF draft standardises it).

```python
def create_order(self, payload: dict, idempotency_key: str | None = None) -> dict:
    key = idempotency_key or str(uuid.uuid4())       # one key per logical operation
    return self._post_order(payload, key)            # every retry reuses the same key
```

The key is created **outside** the retried function. If `uuid4()` runs inside it, every attempt gets a new key and the server sees new orders — the most common idempotency-key bug, and an easy one to test ([06](./06-testing.md#retry-tests-with-respx)). On the server side the same rule becomes a unique constraint ([05](./05-race-conditions.md#unique-constraints-and-upserts)).

## Attempts, Deadlines and Budgets

| Limit | Protects against | Example |
|-------|------------------|---------|
| Max attempts | Endless loops; hammering a dead service | `stop_after_attempt(4)` = 1 call + 3 retries |
| Total deadline | The caller gave up long ago, but we keep trying | Give up when 15 s since the first attempt would be exceeded |
| Per-attempt timeout | One hanging attempt eats the whole budget | `timeout=5` on every HTTP call |
| Retry budget | A fleet of clients multiplying load during an outage | Retries ≤ ~10 % of recent traffic |

Attempts alone are not enough. Four attempts with a 10-second read timeout and backoff of 0.2 + 0.4 + 0.8 s can take **41.4 s** — useless if the API gateway in front of you times out after 30 s. Size the retry loop from the outside in: caller timeout → total deadline → per-attempt timeout → attempts that fit.

### Retry budgets

During an outage every client that retries 3 times sends 4× the traffic to a service that is already failing. A **retry budget** stops retries when too many recent calls failed, so the fleet backs off as a whole. This one copies gRPC's retry throttling: each failure costs a token, each success earns back a fraction of one, and retries are allowed only while the bucket is more than half full.

```python
class RetryBudget:
    """gRPC-style retry throttling: stop retrying when many recent calls failed."""

    def __init__(self, max_tokens: float = 10.0, token_ratio: float = 0.1) -> None:
        self.max_tokens = max_tokens
        self.token_ratio = token_ratio
        self.tokens = max_tokens
        self._lock = threading.Lock()

    def record_success(self) -> None:
        with self._lock:
            self.tokens = min(self.max_tokens, self.tokens + self.token_ratio)

    def record_failure(self) -> None:
        with self._lock:
            self.tokens = max(0.0, self.tokens - 1)

    def can_retry(self) -> bool:
        return self.tokens > self.max_tokens / 2
```

With `token_ratio=0.1` it takes ten successes to pay for one failure — in steady state retries stay around 10 % of traffic, and in a full outage they stop after a few failures. Share one budget per dependency (per process), not per call.

## Backoff and Jitter

**Backoff** makes each wait longer than the previous one, so a struggling dependency gets more room. **Jitter** randomises the wait, so clients that failed together do not retry together.

| Strategy | Delay before retry *n* (`base`, `cap`) | Notes |
|----------|----------------------------------------|-------|
| Fixed | `base` | Fine for one client polling; bad for many |
| Exponential | `min(cap, base * 2**(n-1))` | All clients that failed at the same moment retry at the same moments |
| Full jitter | `uniform(0, min(cap, base * 2**(n-1)))` | Best spread, shortest average wait; `tenacity.wait_random_exponential`, `backoff.full_jitter` |
| Equal jitter | `half + uniform(0, half)`, `half = min(cap, base * 2**(n-1)) / 2` | Guarantees at least half of the exponential delay |
| Decorrelated jitter | `min(cap, uniform(base, previous * 3))` | Depends on the previous delay, not on *n*; spreads well, waits longer |
| Exponential + additive jitter | `min(cap, base * 2**(n-1) + uniform(0, j))` | `tenacity.wait_exponential_jitter`, `stamina`, urllib3 `backoff_jitter` |

### The thundering herd

When a dependency comes back after an outage, every client that was waiting retries — at the same moments, if their delays are deterministic. The dependency falls over again, and the cycle repeats. This simulation sends 1000 clients that all failed at `t = 0` through 5 retries (`base = 1 s`, `cap = 30 s`) and counts retries per 100 ms slot:

```python
import random
from collections import Counter

BASE, CAP = 1.0, 30.0


def no_jitter(attempt: int, prev: float) -> float:
    return min(CAP, BASE * 2 ** (attempt - 1))


def full_jitter(attempt: int, prev: float) -> float:
    return random.uniform(0, min(CAP, BASE * 2 ** (attempt - 1)))


def equal_jitter(attempt: int, prev: float) -> float:
    half = min(CAP, BASE * 2 ** (attempt - 1)) / 2
    return half + random.uniform(0, half)


def decorrelated_jitter(attempt: int, prev: float) -> float:
    return min(CAP, random.uniform(BASE, prev * 3))


def simulate(strategy, clients: int = 1000, retries: int = 5) -> tuple[int, float]:
    """All clients fail at t=0 and retry 5 times.

    Returns the peak number of retries in one 100 ms slot and the mean total wait.
    """
    slots: Counter[int] = Counter()
    total = 0.0
    for _ in range(clients):
        t, prev = 0.0, BASE
        for attempt in range(1, retries + 1):
            prev = strategy(attempt, prev)
            t += prev
            slots[int(t * 10)] += 1
        total += t
    return max(slots.values()), total / clients


for s in (no_jitter, full_jitter, equal_jitter, decorrelated_jitter):
    peak, mean_wait = simulate(s)
    print(f"{s.__name__:20} peak/100ms={peak:5}  mean total wait={mean_wait:5.1f}s")
```

```text
no_jitter            peak/100ms= 1000  mean total wait= 31.0s
full_jitter          peak/100ms=  155  mean total wait= 15.4s
equal_jitter         peak/100ms=  222  mean total wait= 23.3s
decorrelated_jitter  peak/100ms=   75  mean total wait= 30.7s
```

Without jitter all 1000 retries hit the same 100 ms — five times. Full jitter cuts the peak about six times **and** halves the average wait; decorrelated jitter spreads load the most but waits as long as no jitter. Numbers change a little from run to run. Default to **full jitter**; reach for decorrelated jitter when the dependency's recovery matters more than your latency.

## Hand-Written Retry Loop

Libraries ([02](./02-retry-libraries.md)) are the right choice in production code, but a hand-written loop shows every decision in one place and is a useful baseline in tests. `sleep` and `clock` are parameters, so tests run without waiting ([06](./06-testing.md#hand-written-retry-loop-tests)).

```python
# app/retrying.py
import asyncio
import random
import threading
import time
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime


class TransientError(Exception):
    """Worth retrying: timeout, connection reset, 429, 502/503/504."""

    def __init__(self, message: str = "", retry_after: float | None = None) -> None:
        super().__init__(message)
        self.retry_after = retry_after          # seconds the server asked us to wait


class PermanentError(Exception):
    """Not worth retrying: 400, 401, 403, 404, 422, business rule violations."""


def full_jitter(attempt: int, base: float = 0.1, cap: float = 10.0) -> float:
    """Random delay in [0, min(cap, base * 2**(attempt-1))]."""
    return random.uniform(0, min(cap, base * 2 ** (attempt - 1)))


def parse_retry_after(value: str | None, now: datetime | None = None) -> float | None:
    """Retry-After is either delay-seconds ("120") or an HTTP-date."""
    if not value:
        return None
    if value.strip().isdigit():
        return float(value)
    try:
        when = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None
    if when.tzinfo is None:                     # "-0000" in the date means UTC, but parses as naive
        when = when.replace(tzinfo=timezone.utc)
    now = now or datetime.now(timezone.utc)
    return max(0.0, (when - now).total_seconds())


class RetryBudget:
    """gRPC-style retry throttling: stop retrying when many recent calls failed."""

    def __init__(self, max_tokens: float = 10.0, token_ratio: float = 0.1) -> None:
        self.max_tokens = max_tokens
        self.token_ratio = token_ratio
        self.tokens = max_tokens
        self._lock = threading.Lock()

    def record_success(self) -> None:
        with self._lock:
            self.tokens = min(self.max_tokens, self.tokens + self.token_ratio)

    def record_failure(self) -> None:
        with self._lock:
            self.tokens = max(0.0, self.tokens - 1)

    def can_retry(self) -> bool:
        return self.tokens > self.max_tokens / 2


def retry_call[T](
    fn: Callable[[], T],
    *,
    attempts: int = 4,
    deadline: float = 10.0,
    base: float = 0.1,
    cap: float = 2.0,
    retry_on: tuple[type[Exception], ...] = (TransientError,),
    sleep: Callable[[float], None] = time.sleep,
    clock: Callable[[], float] = time.monotonic,
    budget: RetryBudget | None = None,
) -> T:
    start = clock()
    for attempt in range(1, attempts + 1):
        try:
            result = fn()
        except retry_on as exc:
            if budget:
                budget.record_failure()
            if attempt == attempts:
                raise                                     # out of attempts
            if budget and not budget.can_retry():
                raise                                     # too many failures overall: do not pile on
            delay = getattr(exc, "retry_after", None)
            if delay is None:
                delay = full_jitter(attempt, base, cap)
            if clock() - start + delay > deadline:
                raise                                     # sleeping would break the deadline
            sleep(delay)
        else:
            if budget:
                budget.record_success()
            return result
    raise AssertionError("unreachable")


async def retry_call_async[T](
    fn: Callable[[], Awaitable[T]],
    *,
    attempts: int = 4,
    deadline: float = 10.0,
    base: float = 0.1,
    cap: float = 2.0,
    retry_on: tuple[type[Exception], ...] = (TransientError,),
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> T:
    loop = asyncio.get_running_loop()
    start = loop.time()
    for attempt in range(1, attempts + 1):
        try:
            return await fn()                             # fn() creates a NEW coroutine each time
        except retry_on as exc:
            if attempt == attempts:
                raise
            delay = getattr(exc, "retry_after", None)
            if delay is None:
                delay = full_jitter(attempt, base, cap)
            if loop.time() - start + delay > deadline:
                raise
            await sleep(delay)                            # asyncio.sleep: never time.sleep() here
    raise AssertionError("unreachable")
```

```python
import asyncio
import itertools

from app.retrying import PermanentError, TransientError, retry_call, retry_call_async

calls = itertools.count(1)


def flaky() -> str:
    n = next(calls)
    if n < 3:
        raise TransientError(f"attempt {n}: 503")
    return f"ok after {n} attempts"


print(retry_call(flaky))                        # ok after 3 attempts


def missing() -> str:
    raise PermanentError("404")


try:
    retry_call(missing)
except PermanentError as exc:
    print("not retried:", exc)                  # not retried: 404


async def fetch_async() -> str:
    await asyncio.sleep(0)
    return "ok"


print(asyncio.run(retry_call_async(fetch_async)))   # pass the function, not fetch_async()
```

Details that are easy to get wrong:

- **Re-raise the last real error**, not a generic "retries exhausted" error — the caller and the logs need to see `503` or `ReadTimeout`.
- **Check the deadline before sleeping**: if the next delay ends after the deadline, fail now instead of failing later.
- **asyncio: pass a coroutine function**, not a coroutine. A coroutine object can be awaited once; the second attempt raises `RuntimeError: cannot reuse already awaited coroutine`.
- **asyncio: sleep with `await asyncio.sleep()`** — `time.sleep()` blocks the whole event loop, every other task included.
- **Do not catch `BaseException`**: `KeyboardInterrupt` and `asyncio.CancelledError` must stop the loop, not trigger a retry.
- **Log every retry** with the attempt number, the delay and the error — retries hide problems unless you count them.

## Checklist

- [ ] Every retry has an explicit list (or predicate) of transient errors; nothing retries bare `Exception`
- [ ] Non-idempotent operations are not retried, or carry an idempotency key created once per logical operation
- [ ] Every loop has max attempts **and** a total deadline; every attempt has its own timeout
- [ ] Backoff is exponential with jitter (full jitter by default) and capped
- [ ] `Retry-After` is honoured, capped, and checked against the deadline
- [ ] A retry budget (or circuit breaker) stops the fleet from multiplying load during an outage
- [ ] Retries are logged and counted in metrics

---
## See also
- [Resilience — Retries, Fallbacks, Semaphores & Race Conditions](./index.md)
- [Resilience — Retry Libraries](./02-retry-libraries.md)
- [REST: Caching, Concurrency and Idempotency](../../api-architectures/01-rest/04-caching-concurrency.md)
- [gRPC: Retry and Hedging Policy](../../api-architectures/03-grpc/05-retry-hedging-policy.md)
- [Queues vs Streams: Message Delivery, Ordering & Reliability](../../software-design-patterns/05-composition-architectural/04-queues-streams-messaging.md)
