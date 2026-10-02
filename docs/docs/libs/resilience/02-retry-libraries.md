---
date: 2026-10-02
tags:
  - python
  - libraries
  - resilience
  - reliability
  - api
---

# Resilience — Retry Libraries

Three libraries cover retries in Python: **tenacity** (flexible, the de-facto standard), **stamina** (an opinionated layer on top of tenacity with safe defaults) and **backoff** (decorators, no releases since 2022). On top of that, HTTP and Redis clients retry on their own — which is useful, and dangerous when you add your own retries around them.

## Which One

| | tenacity 9.1.4 | stamina 26.1.0 | backoff 2.2.1 |
|---|----------------|----------------|---------------|
| Last release | Feb 2026 | Apr 2026 | Oct 2022 |
| Style | Decorator, `Retrying` object, `for attempt in Retrying(...)` | Decorator, `retry_context()`, `RetryingCaller` | Decorators |
| Defaults of a bare decorator | Retry **any** exception, **forever**, no wait | `on=` is required; 10 attempts, 45 s total, exponential + jitter | `max_tries=None`: forever unless you set limits |
| Retry on return value | `retry_if_result` | No (exceptions only) | `on_predicate` |
| Backoff | Many `wait_*` strategies, combinable with `+` | Exponential + additive jitter, capped | `expo`, `fibo`, `constant`, `runtime` + full jitter |
| `Retry-After` / custom delay | `wait=` callable reading the exception | `on=` hook returns a float or `timedelta` | `backoff.runtime(value=...)` |
| asyncio / Trio | Yes (`AsyncRetrying`) | Yes | asyncio |
| Logging / metrics | `before_sleep_log`, your own callbacks; `statistics` | Built-in hooks: logging, structlog, Prometheus | `on_backoff` / `on_giveup` handlers, logs to `backoff` logger |
| Test helpers | Replace `fn.retry.sleep`, `retry_with(...)` | `stamina.set_testing(...)` | Patch `time.sleep` / `asyncio.sleep` |
| Note | Most features, most ways to misconfigure | Hard to misconfigure; less flexible | On Python 3.14 decorating any function emits `DeprecationWarning` (`asyncio.iscoroutinefunction`) |

**Default choice:** tenacity when you need retry-on-result, custom stop/wait logic or one shared policy object; stamina when you want good defaults, instrumentation and a clean test switch. Keep backoff in existing code; do not start new code with it.

## tenacity

### A policy for HTTP calls

One policy object, reused by every method that talks to the same API:

```python
# app/http_client.py
import logging
import uuid

import httpx
from tenacity import (
    RetryCallState,
    before_sleep_log,
    retry,
    retry_if_exception,
    stop_after_attempt,
    stop_before_delay,
    wait_random_exponential,
)

from app.retrying import parse_retry_after

logger = logging.getLogger(__name__)

RETRYABLE_STATUS = {408, 429, 502, 503, 504}


def is_retryable(exc: BaseException) -> bool:
    if isinstance(exc, httpx.TransportError):            # connect error, timeouts, connection reset
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in RETRYABLE_STATUS
    return False


_backoff = wait_random_exponential(multiplier=0.2, max=10)   # full jitter: [0, 0.2 * 2**n] capped at 10 s


def wait_retry_after_or_backoff(retry_state: RetryCallState) -> float:
    exc = retry_state.outcome.exception() if retry_state.outcome else None
    if isinstance(exc, httpx.HTTPStatusError):
        delay = parse_retry_after(exc.response.headers.get("Retry-After"))
        if delay is not None:
            return min(delay, 30.0)                      # never trust an unbounded server value
    return _backoff(retry_state)


retry_transient = retry(
    retry=retry_if_exception(is_retryable),
    stop=stop_after_attempt(4) | stop_before_delay(15),  # whichever comes first
    wait=wait_retry_after_or_backoff,
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,                                        # raise the last real error, not RetryError
)


class OrdersClient:
    def __init__(self, http: httpx.Client) -> None:
        self.http = http

    @retry_transient
    def get_order(self, order_id: int) -> dict:
        response = self.http.get(f"/orders/{order_id}")
        response.raise_for_status()
        return response.json()

    def create_order(self, payload: dict, idempotency_key: str | None = None) -> dict:
        key = idempotency_key or str(uuid.uuid4())       # one key per logical operation
        return self._post_order(payload, key)            # every retry reuses the same key

    @retry_transient
    def _post_order(self, payload: dict, key: str) -> dict:
        response = self.http.post("/orders", json=payload, headers={"Idempotency-Key": key})
        response.raise_for_status()
        return response.json()

    def send_sms(self, phone: str, text: str) -> None:
        """Not idempotent, no idempotency key on the provider side: never retried."""
        response = self.http.post("/sms", json={"phone": phone, "text": text})
        response.raise_for_status()
```

What each argument does:

| Argument | Here | Options |
|----------|------|---------|
| `retry=` | `retry_if_exception(is_retryable)` | `retry_if_exception_type(...)`, `retry_if_not_exception_type(...)`, `retry_if_result(pred)`, `retry_if_exception_message(match=...)`; combine with `&` (both) and the pipe operator (either) |
| `stop=` | `stop_after_attempt(4)` or `stop_before_delay(15)`, whichever comes first | `stop_after_attempt(n)`, `stop_after_delay(s)` (may overshoot by the last sleep), `stop_before_delay(s)` (stops if the next sleep would cross the limit), `stop_when_event_set(event)` |
| `wait=` | `Retry-After`, else `wait_random_exponential` | `wait_fixed`, `wait_random`, `wait_exponential` (no jitter), `wait_random_exponential` (= `wait_full_jitter`), `wait_exponential_jitter`, `wait_incrementing`, `wait_chain`, `wait_exception`; add them with `+`; any callable taking `RetryCallState` |
| `before_sleep=` | `before_sleep_log(logger, WARNING)` | Also `before=`, `after=` callbacks |
| `reraise=` | `True` | `False` (default) raises `tenacity.RetryError` wrapping the last attempt |
| `retry_error_callback=` | — | Return a fallback value instead of raising when retries are exhausted |

A run against a mocked API that answers `503`, then times out, then succeeds:

```text
WARNING app.http_client: Retrying app.http_client.OrdersClient.get_order in 0.0277 seconds as it raised HTTPStatusError: Server error '503 Service Unavailable' for url 'https://api.test/orders/1'
WARNING app.http_client: Retrying app.http_client.OrdersClient.get_order in 0.261 seconds as it raised ConnectTimeout: slow.
{'id': 1}
```

!!! warning "A bare `@retry` retries forever"
    `@retry` without arguments uses `retry_if_exception_type()` (any `Exception`), `stop_never` and `wait_none()`: it retries every error — including `AssertionError` and `KeyError` — immediately and without end. Always pass `retry=`, `stop=` and `wait=`.

### More tenacity features

```python
import itertools

from tenacity import (
    RetryError,
    Retrying,
    retry,
    retry_if_exception_type,
    retry_if_result,
    stop_after_attempt,
    stop_after_delay,
    wait_fixed,
)


@retry(retry=retry_if_exception_type(ConnectionError), stop=stop_after_attempt(3), wait=wait_fixed(0.01))
def without_reraise() -> None:
    raise ConnectionError("still down")


try:
    without_reraise()
except RetryError as err:                          # reraise=False (default)
    print(repr(err.last_attempt.exception()), err.last_attempt.attempt_number)
    # ConnectionError('still down') 3

polls = itertools.count(1)


@retry(                                            # poll until a job is done: retry on the RESULT
    retry=retry_if_result(lambda job: job["status"] == "running"),
    stop=stop_after_delay(30),
    wait=wait_fixed(0.01),
)
def wait_for_job(job_id: int) -> dict:
    return {"id": job_id, "status": "done" if next(polls) >= 3 else "running"}


print(wait_for_job(7), wait_for_job.statistics["attempt_number"])
# {'id': 7, 'status': 'done'} 3


@retry(                                            # degrade instead of failing
    retry=retry_if_exception_type(ConnectionError),
    stop=stop_after_attempt(2),
    wait=wait_fixed(0.01),
    retry_error_callback=lambda state: {"items": [], "degraded": True},
)
def recommendations(user_id: int) -> dict:
    raise ConnectionError("recommender down")


print(recommendations(1))                          # {'items': [], 'degraded': True}

attempts = itertools.count(1)
for attempt in Retrying(stop=stop_after_attempt(3), wait=wait_fixed(0.01), reraise=True):
    with attempt:                                  # retry a block, not a whole function
        if next(attempts) < 2:
            raise TimeoutError("first try times out")
print("block attempts:", attempt.retry_state.attempt_number)   # block attempts: 2
```

- **`statistics`** on the decorated function holds the last call's `attempt_number`, `idle_for` (planned sleep total), `start_time` and `delay_since_first_attempt`. It is per thread.
- **`fn.retry_with(stop=..., wait=...)`** returns a copy of the function with changed settings — handy in tests and for one-off stricter calls.
- **`fn.retry`** is the policy object; tests replace `fn.retry.sleep` to skip waiting ([06](./06-testing.md#retry-tests-with-respx)).
- **`stop_after_delay` does not interrupt a running attempt.** A hanging call stays hanging; every attempt needs its own timeout.

### asyncio

The same decorator works on `async def` (it switches to `AsyncRetrying` and sleeps with `asyncio.sleep`, or `trio.sleep` under Trio):

```python
import asyncio
import itertools

from tenacity import AsyncRetrying, retry, retry_if_exception_type, stop_after_attempt, wait_fixed, wait_random_exponential

calls = itertools.count(1)


@retry(
    retry=retry_if_exception_type(ConnectionError),
    stop=stop_after_attempt(4),
    wait=wait_random_exponential(multiplier=0.01, max=0.1),
    reraise=True,
)
async def fetch() -> str:
    if next(calls) < 3:
        raise ConnectionError
    return "ok"


async def main() -> None:
    print(await fetch(), fetch.statistics["attempt_number"])           # ok 3

    async for attempt in AsyncRetrying(stop=stop_after_attempt(3), wait=wait_fixed(0.01), reraise=True):
        with attempt:
            await asyncio.sleep(0)
            if attempt.retry_state.attempt_number < 2:
                raise ConnectionError
    print("async block attempts:", attempt.retry_state.attempt_number)  # async block attempts: 2


asyncio.run(main())
```

## stamina

stamina wraps tenacity with fixed, production-minded choices: you **must** say what to retry (`on=`), retries are bounded by attempts **and** time by default, backoff is exponential with jitter, the last exception is re-raised, and every scheduled retry is reported to logging / structlog / Prometheus (whichever is installed).

```python
# app/profiles.py
import httpx
import stamina

from app.http_client import RETRYABLE_STATUS, is_retryable
from app.retrying import parse_retry_after


def retry_on(exc: Exception) -> bool | float:
    """True/False: retry or not. A float: retry after exactly that many seconds."""
    if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code in RETRYABLE_STATUS:
        delay = parse_retry_after(exc.response.headers.get("Retry-After"))
        return True if delay is None else min(delay, 30.0)
    return is_retryable(exc)


@stamina.retry(on=retry_on, attempts=5, timeout=20)
def get_profile(http: httpx.Client, user_id: int) -> dict:
    response = http.get(f"/users/{user_id}")
    response.raise_for_status()
    return response.json()
```

| Parameter | Default | Meaning |
|-----------|---------|---------|
| `on` | required | Exception class, tuple of classes, or a hook that takes the exception and returns `bool`, `float` or `timedelta` (a number = retry after exactly that long) |
| `attempts` | `10` | Total attempts, `None` = no limit (then `timeout` must be set) |
| `timeout` | `45.0` | Total seconds for all attempts, `None` = no limit |
| `wait_initial` / `wait_max` | `0.1` / `5.0` | First backoff and the cap |
| `wait_jitter` / `wait_exp_base` | `1.0` / `2` | Backoff = `min(wait_max, wait_initial * wait_exp_base**(n-1) + uniform(0, wait_jitter))` |

Retry a block instead of a function, and switch retries for tests:

```python
for attempt in stamina.retry_context(on=retry_on, attempts=3):
    with attempt:
        response = http.get("/users/1")
        response.raise_for_status()

stamina.set_testing(True, attempts=1)    # no backoff, 1 attempt: exceptions surface at once
stamina.set_testing(True, attempts=3)    # no backoff, exactly 3 attempts: check retry logic fast
stamina.set_testing(False)
stamina.set_active(False)                # turn retrying off completely (e.g. one-off scripts)

with stamina.set_testing(True, attempts=2):   # context manager form (stamina 25.1+)
    ...
```

- `set_testing(..., cap=True)` caps attempts at the given number instead of forcing it.
- Retries are logged by the `stamina` logger at `WARNING` as `stamina.retry_scheduled` with structured `extra` fields; `stamina.instrumentation.set_on_retry_hooks([...])` replaces or disables the hooks.
- The hook in `retry_on` can return a float: here, `Retry-After`. In test mode such waits are skipped too.

## backoff

```python
import itertools

import backoff
import httpx

from app.http_client import is_retryable


@backoff.on_exception(
    backoff.expo,                      # 1, 2, 4, ... * factor, with full jitter by default
    httpx.HTTPError,
    max_tries=4,
    max_time=15,
    giveup=lambda exc: not is_retryable(exc),
    factor=0.1,
)
def fetch(client: httpx.Client, url: str) -> dict:
    response = client.get(url)
    response.raise_for_status()
    return response.json()


polls = itertools.count(1)


@backoff.on_predicate(                 # retry while the predicate on the RESULT is true
    backoff.constant,
    lambda job: job["status"] != "done",
    interval=0.05,
    max_time=5,
    jitter=None,
)
def job_status(job_id: int) -> dict:
    return {"id": job_id, "status": "done" if next(polls) == 3 else "running"}


print(job_status(7))                   # {'id': 7, 'status': 'done'}
```

- Logs go to the `backoff` logger: `INFO Backing off fetch(...) for 0.0s (...)`, `ERROR Giving up fetch(...) after 1 tries (...)`.
- `max_time` is measured with `datetime.now()` — wall-clock time, so a frozen clock in tests (freezegun) means it never expires.
- Handlers `on_backoff`, `on_giveup`, `on_success` receive a dict with `tries`, `elapsed`, `wait`, `exception` / `value`.

## Built-in Retries in Clients

### requests + urllib3 `Retry`

```python
# app/legacy_client.py
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


def make_session() -> requests.Session:
    retry = Retry(
        total=3,                                  # at most 3 retries = 4 requests
        backoff_factor=0.5,                       # sleeps 0 s, 1 s, 2 s between attempts
        backoff_jitter=0.3,                       # + random 0..0.3 s
        status_forcelist=[502, 503, 504],
        allowed_methods=["GET", "HEAD", "PUT", "DELETE"],   # never POST
        respect_retry_after_header=True,          # 413/429/503 with Retry-After
    )
    session = requests.Session()
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session
```

Checked against a local server that always answers `503`:

| Behaviour | Result |
|-----------|--------|
| `GET`, `total=3`, `backoff_factor=0.5` | 4 requests; sleeps **0, 1, 2 s** — the first retry is immediate |
| `POST` with default `allowed_methods` | 1 request; the `503` response is returned, not raised |
| `503` + `Retry-After: 1`, no `status_forcelist` | Still retried (codes 413, 429, 503 with `Retry-After`), waits 1 s; after the last retry the `503` response is **returned** |
| Same with `status_forcelist=[503]` | After the last retry raises `requests.exceptions.RetryError` |
| `raise_on_status=False` | Returns the last `503` instead of raising |

- The default `HTTPAdapter` has `max_retries=0` — no retries at all — and requests has **no default timeout**: always pass `timeout=`.
- `allowed_methods` (formerly `method_whitelist`) defaults to `HEAD, GET, PUT, DELETE, OPTIONS, TRACE` — `POST` and `PATCH` are not retried on read errors or status codes.
- More: [Requests — Advanced Patterns](../requests-http/02-advanced-patterns.md#retries-with-backoff).

### HTTPX transport retries

```python
transport = httpx.HTTPTransport(retries=3)          # httpx.AsyncHTTPTransport for AsyncClient
client = httpx.Client(transport=transport, timeout=httpx.Timeout(10.0, connect=2.0))
```

`retries=` retries **only** failures to connect (`ConnectError`, `ConnectTimeout`), with delays 0, 0.5, 1, 2 s… — against a closed port `retries=2` raised `ConnectError` after 0.5 s and `retries=3` after 1.5 s. A `503` is returned on the first try. Status codes, read timeouts and `Retry-After` need tenacity or stamina on top. More: [HTTPX — Advanced Configuration](../httpx/03-advanced-config.md#transport-retries).

### redis-py

redis-py 8 retries by default: a `Retry` with 10 retries and jittered exponential backoff (10 ms base, 1 s cap) on `ConnectionError` and `TimeoutError`, plus 5-second socket timeouts. Against a closed port one `ping()` needed 3.5 s to raise `ConnectionError` — too long for a cache in the request path. Set `retry=`, `socket_timeout` and `socket_connect_timeout` explicitly; details in [Redis — Python Client](../../databases/redis/04-python-redis-py.md#timeouts-retries).

## Retry Multiplication

Retries in different layers multiply. Two layers — urllib3 (`total=2`) inside tenacity (`stop_after_attempt(3)`) — against a server that always answers `503`:

```python
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import requests
from requests.adapters import HTTPAdapter
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_none
from urllib3.util.retry import Retry

hits = 0


class AlwaysDown(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        global hits
        hits += 1
        self.send_response(503)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, *args) -> None:
        pass


server = ThreadingHTTPServer(("127.0.0.1", 0), AlwaysDown)
threading.Thread(target=server.serve_forever, daemon=True).start()

session = requests.Session()                      # layer 1: urllib3 retries 2 times
session.mount("http://", HTTPAdapter(max_retries=Retry(total=2, status_forcelist=[503])))


@retry(                                           # layer 2: tenacity, 3 attempts
    retry=retry_if_exception_type(requests.RequestException),
    stop=stop_after_attempt(3),
    wait=wait_none(),
    reraise=True,
)
def get_status() -> None:
    session.get(f"http://127.0.0.1:{server.server_port}/status", timeout=5).raise_for_status()


try:
    get_status()
except requests.RequestException as exc:
    print(type(exc).__name__, "after", hits, "requests")    # RetryError after 9 requests
```

| Layers, each with 3 attempts | Requests to the failing service per user action |
|------------------------------|-----------------------------------------------|
| HTTP client only | 3 |
| HTTP client + your `@retry` | 9 |
| HTTP client + `@retry` + job queue retry (Celery) | 27 |
| + an upstream service that also retries 3 times | 81 |

Rules:

- **Pick one layer that retries** — usually the outermost one that knows whether the operation is idempotent and how much time is left. Set the others to zero (`Retry(0)`, `HTTPTransport(retries=0)`, `max_retries=0`), or keep only connection-level retries there.
- **SDKs retry too.** Cloud SDKs, LLM clients and database drivers often retry by default; check their `max_retries` before wrapping them.
- **Do not retry a breaker's "open" error** — `CircuitOpenError` means "do not call"; retrying it just spins ([03](./03-timeouts-fallbacks-breakers.md#circuit-breaker)).
- **Count attempts in tests** — a test that asserts "3 calls" catches a second retry layer added later ([06](./06-testing.md)).

## Checklist

- [ ] Every tenacity decorator has explicit `retry=`, `stop=` and `wait=`; `reraise=True` unless you handle `RetryError`
- [ ] Retry predicates use exception types or status codes, not "any exception"
- [ ] `Retry-After` is honoured through a custom `wait` (tenacity), the `on=` hook (stamina) or `backoff.runtime`
- [ ] stamina-decorated code is tested with `set_testing(...)`
- [ ] requests sessions mount an adapter with an explicit `Retry` and every call passes `timeout=`
- [ ] Only one layer retries per call path; built-in client and SDK retries are known and configured
- [ ] Retries are logged (`before_sleep_log`, stamina hooks, `on_backoff`) and visible in metrics

---
## See also
- [Resilience — Retries & Backoff](./01-retries-backoff.md)
- [Resilience — Timeouts, Fallbacks & Circuit Breakers](./03-timeouts-fallbacks-breakers.md)
- [Resilience — Testing Resilience Code](./06-testing.md)
- [Requests — Advanced Patterns & Best Practices](../requests-http/02-advanced-patterns.md)
- [HTTPX — Advanced Configuration](../httpx/03-advanced-config.md)
- [Redis — Python Client (redis-py)](../../databases/redis/04-python-redis-py.md)
