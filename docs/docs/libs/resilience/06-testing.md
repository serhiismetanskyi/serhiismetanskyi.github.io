---
date: 2026-10-02
tags:
  - python
  - libraries
  - resilience
  - testing
  - pytest
  - test-automation
---

# Resilience — Testing Resilience Code

Resilience code runs only when something goes wrong, so ordinary tests never execute it. A retry loop that retries `404`, a fallback that raises, a breaker that never opens, a semaphore that is not shared, an idempotency key generated per attempt — all of these pass a happy-path suite. This page tests every module from pages 01–05 **on purpose**, fast and deterministically: fake failures instead of broken services, fake time instead of sleeping, barriers instead of hoping for a bad interleaving.

## What to Test

| Risk | Test | Section |
|------|------|---------|
| Retries a permanent error (`404`, `422`) | Count calls: exactly 1 | [Retry tests](#retry-tests-with-respx) |
| Retries a non-idempotent call (SMS, payment) | `503` / read timeout → exactly 1 call | [Retry tests](#retry-tests-with-respx) |
| New idempotency key on every attempt | Collect the header from every attempt: one value | [Retry tests](#retry-tests-with-respx) |
| Retries forever / too long | Always failing → exact attempt count; deadline stops sleeping | [Retry loop](#hand-written-retry-loop-tests) |
| Ignores `Retry-After` | Recorded sleeps equal the header value | [Retry tests](#retry-tests-with-respx) |
| Slow test suite because of backoff | No real sleeps anywhere | [Without sleeping](#retries-without-real-sleeps) |
| Fallback path broken | Primary error / timeout → secondary, cache, default | [Fallbacks](#fallbacks) |
| Breaker never opens, never closes | State transitions with a fake clock; property-based sequences | [Breaker](#circuit-breaker-states) |
| Limit not applied or not shared | Measure peak concurrency; assert it **equals** the limit | [Limits](#concurrency-limits) |
| Race in memory | Barrier in the gap → bug every run; fix → correct under load | [Races](#reproducing-race-conditions) |
| Lost update / double insert in the DB | Concurrent transactions against real PostgreSQL | [PostgreSQL](#postgresql-race-tests) |

## Example Project

```text
app/
├── retrying.py        # 01: TransientError, retry_call, retry_call_async, RetryBudget
├── http_client.py     # 02: OrdersClient with a tenacity policy
├── profiles.py        # 02: stamina-decorated get_profile
├── legacy_client.py   # 02: requests session with urllib3 Retry
├── deadline.py        # 03: deadline() / remaining()
├── breaker.py         # 03: CircuitBreaker with an injectable clock
├── fallbacks.py       # 03: RatesService fallback chain
├── bulkhead.py        # 03: Bulkhead
├── limits.py          # 04: fetch_all, get_json
├── host_limits.py     # 04: HostLimits
├── inventory.py       # 05: Inventory, SafeInventory, Wallet
├── stock_db.py        # 05: PostgreSQL lost update and fixes
└── consumer.py        # 05: idempotent consumer
tests/
├── __init__.py
├── conftest.py
├── test_retrying.py
├── test_http_client.py
├── test_libraries.py
├── test_fake_time.py
├── test_fallbacks.py
├── test_breaker.py
├── test_limits.py
├── test_races.py
└── test_db_races.py
pyproject.toml
```

```bash
uv add tenacity stamina httpx requests aiolimiter pybreaker "psycopg[binary]"
uv add --dev pytest pytest-asyncio respx responses hypothesis time-machine freezegun pytest-xdist pytest-repeat
```

```toml
# pyproject.toml
[tool.pytest.ini_options]
pythonpath = ["."]
asyncio_mode = "auto"              # async def tests run without a marker
markers = [
    "postgres: needs a PostgreSQL server in PG_DSN",
    "race: concurrency tests that run many iterations",
]
```

```python
# tests/conftest.py
import os
import sys

import pytest
import stamina


class FakeClock:
    """A monotonic clock that only moves when the test says so."""

    def __init__(self, start: float = 1000.0) -> None:
        self.now = start

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


class FakeSleep:
    """Records every delay and moves the fake clock instead of waiting."""

    def __init__(self, clock: FakeClock) -> None:
        self.clock = clock
        self.calls: list[float] = []

    def __call__(self, seconds: float) -> None:
        self.calls.append(seconds)
        self.clock.advance(seconds)

    async def async_sleep(self, seconds: float) -> None:
        self(seconds)


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def fake_sleep(clock: FakeClock) -> FakeSleep:
    return FakeSleep(clock)


@pytest.fixture(autouse=True)
def stamina_test_mode():
    """No backoff waits in stamina-decorated code; at most 3 attempts."""
    with stamina.set_testing(True, attempts=3):
        yield


@pytest.fixture
def busy_switching():
    """Ask the GIL to switch threads very often, so races show up sooner."""
    old = sys.getswitchinterval()
    sys.setswitchinterval(1e-6)
    yield
    sys.setswitchinterval(old)


@pytest.fixture(scope="session")
def pg_dsn() -> str:
    dsn = os.getenv("PG_DSN")
    if not dsn:
        pytest.skip("PG_DSN is not set")
    return dsn


@pytest.fixture
def product_id(worker_id: str) -> int:
    """Separate rows per xdist worker: gw0 -> 1000, gw1 -> 1001, no xdist ("master") -> 999."""
    return 999 if worker_id == "master" else 1000 + int(worker_id.removeprefix("gw"))
```

- `FakeClock` + `FakeSleep` replace `time.monotonic` and `time.sleep` for code that accepts them as parameters — the cleanest way to test anything time-based.
- `stamina_test_mode` is `autouse`: no test in the suite can wait for a stamina backoff by accident.
- `product_id` gives each `pytest-xdist` worker its own database row ([xdist](#pytest-xdist)).

## Hand-Written Retry Loop Tests

```python
# tests/test_retrying.py
import pytest

from app.retrying import (
    PermanentError,
    RetryBudget,
    TransientError,
    full_jitter,
    parse_retry_after,
    retry_call,
    retry_call_async,
)


class Flaky:
    """Fails with the given errors first, then returns "ok"."""

    def __init__(self, *errors: Exception) -> None:
        self.errors = list(errors)
        self.calls = 0

    def __call__(self) -> str:
        self.calls += 1
        if self.errors:
            raise self.errors.pop(0)
        return "ok"


def test_retries_transient_errors_until_success(fake_sleep, clock):
    fn = Flaky(TransientError("503"), TransientError("503"))

    assert retry_call(fn, sleep=fake_sleep, clock=clock) == "ok"
    assert fn.calls == 3
    assert len(fake_sleep.calls) == 2


def test_permanent_error_is_not_retried(fake_sleep, clock):
    fn = Flaky(PermanentError("404"))

    with pytest.raises(PermanentError):
        retry_call(fn, sleep=fake_sleep, clock=clock)
    assert fn.calls == 1
    assert fake_sleep.calls == []


def test_gives_up_after_max_attempts_with_last_error(fake_sleep, clock):
    fn = Flaky(*(TransientError(f"try {i}") for i in range(1, 10)))

    with pytest.raises(TransientError, match="try 4"):
        retry_call(fn, attempts=4, sleep=fake_sleep, clock=clock)
    assert fn.calls == 4


def test_does_not_sleep_past_the_deadline(fake_sleep, clock):
    fn = Flaky(*(TransientError("503", retry_after=4.0) for _ in range(10)))

    with pytest.raises(TransientError):
        retry_call(fn, attempts=10, deadline=10.0, sleep=fake_sleep, clock=clock)
    assert fake_sleep.calls == [4.0, 4.0]          # a third 4 s sleep would end at 12 s
    assert fn.calls == 3


def test_server_retry_after_wins_over_backoff(fake_sleep, clock):
    fn = Flaky(TransientError("429", retry_after=7.0))

    retry_call(fn, sleep=fake_sleep, clock=clock)
    assert fake_sleep.calls == [7.0]


def test_budget_stops_retries_during_an_outage(fake_sleep, clock):
    budget = RetryBudget(max_tokens=10, token_ratio=0.1)
    calls = 0

    def always_down() -> str:
        nonlocal calls
        calls += 1
        raise TransientError("503")

    for _ in range(10):
        with pytest.raises(TransientError):
            retry_call(always_down, attempts=3, budget=budget, sleep=fake_sleep, clock=clock)

    assert calls < 10 * 3                           # without a budget: 30 calls
    assert not budget.can_retry()


@pytest.mark.parametrize("attempt", [1, 2, 5, 10])
def test_full_jitter_stays_within_the_window(attempt):
    for _ in range(1000):
        assert 0 <= full_jitter(attempt, base=0.1, cap=2.0) <= min(2.0, 0.1 * 2 ** (attempt - 1))


@pytest.mark.parametrize(
    ("header", "expected"),
    [("120", 120.0), ("0", 0.0), (None, None), ("", None), ("soon", None)],
)
def test_parse_retry_after_seconds(header, expected):
    assert parse_retry_after(header) == expected


def test_parse_retry_after_http_date():
    from datetime import datetime, timezone

    now = datetime(2026, 10, 2, 12, 0, 0, tzinfo=timezone.utc)
    assert parse_retry_after("Fri, 02 Oct 2026 12:00:30 GMT", now=now) == 30.0


async def test_async_retry_creates_a_new_coroutine_per_attempt(fake_sleep):
    calls = 0

    async def flaky() -> str:
        nonlocal calls
        calls += 1
        if calls < 3:
            raise TransientError("503")
        return "ok"

    assert await retry_call_async(flaky, sleep=fake_sleep.async_sleep) == "ok"
    assert calls == 3
    assert len(fake_sleep.calls) == 2
```

- `test_does_not_sleep_past_the_deadline` uses a server-requested 4 s delay and a 10 s deadline: two sleeps fit, the third would end at 12 s, so the loop gives up after the third call. The fake clock makes this exact.
- `test_budget_stops_retries_during_an_outage` checks the fleet-level property: ten failing calls with 3 attempts each would be 30 calls; the budget cuts retries off well before.
- `fn()` raising `PermanentError` must lead to **zero** sleeps, not just a re-raise.

## Retries Without Real Sleeps

| Code | Fast tests |
|------|-----------|
| Your own loop | Inject `sleep` and `clock` (above) |
| tenacity decorator | `monkeypatch.setattr(fn.retry, "sleep", fake)` — every call copies the policy, so the fake is used; or `fn.retry_with(wait=wait_none())(...)` for one call |
| stamina | `stamina.set_testing(True, attempts=n)` — no backoff, `n` attempts |
| backoff | `monkeypatch.setattr(time, "sleep", fake)` (it calls `time.sleep` / `asyncio.sleep` at runtime) |
| urllib3 `Retry` in requests | `responses` runs the adapter's `Retry` logic but does not sleep |
| HTTPX transport retries | Only connection errors; test with a closed port or a custom transport |

Patching the global `time.sleep` works but also speeds up every other sleep in the test (including ones in the code under test that should really wait). Prefer the narrow patch: the policy's own `sleep`.

## Retry Tests with respx

```python
# tests/test_http_client.py
import httpx
import pytest
import respx

from app.http_client import OrdersClient

BASE = "https://orders.test"


@pytest.fixture
def api():
    with respx.mock(base_url=BASE, assert_all_called=False) as mock:
        yield mock


@pytest.fixture
def client():
    with httpx.Client(base_url=BASE) as http:
        yield OrdersClient(http)


@pytest.fixture(autouse=True)
def no_tenacity_sleep(monkeypatch, fake_sleep):
    """Replace the sleep of each tenacity-decorated method: no real waiting."""
    for method in (OrdersClient.get_order, OrdersClient._post_order):
        monkeypatch.setattr(method.retry, "sleep", fake_sleep)
    return fake_sleep


def test_retries_503_then_succeeds(api, client, fake_sleep):
    route = api.get("/orders/1").mock(
        side_effect=[httpx.Response(503), httpx.Response(503), httpx.Response(200, json={"id": 1})]
    )

    assert client.get_order(1) == {"id": 1}
    assert route.call_count == 3
    assert len(fake_sleep.calls) == 2


def test_retries_connection_errors(api, client):
    route = api.get("/orders/1").mock(
        side_effect=[httpx.ConnectTimeout("connect timed out"), httpx.Response(200, json={"id": 1})]
    )

    assert client.get_order(1) == {"id": 1}
    assert route.call_count == 2


@pytest.mark.parametrize("status", [400, 401, 403, 404, 409, 422])
def test_client_errors_are_not_retried(api, client, status):
    route = api.get("/orders/1").mock(return_value=httpx.Response(status))

    with pytest.raises(httpx.HTTPStatusError):
        client.get_order(1)
    assert route.call_count == 1


def test_gives_up_after_four_attempts_with_the_real_error(api, client):
    route = api.get("/orders/1").mock(return_value=httpx.Response(503))

    with pytest.raises(httpx.HTTPStatusError) as err:     # reraise=True: not tenacity.RetryError
        client.get_order(1)
    assert err.value.response.status_code == 503
    assert route.call_count == 4


def test_honours_retry_after(api, client, fake_sleep):
    api.get("/orders/1").mock(
        side_effect=[
            httpx.Response(429, headers={"Retry-After": "7"}),
            httpx.Response(200, json={"id": 1}),
        ]
    )

    client.get_order(1)
    assert fake_sleep.calls == [7.0]


def test_gives_up_when_retry_after_is_beyond_the_time_budget(api, client, fake_sleep):
    route = api.get("/orders/1").mock(
        side_effect=[
            httpx.Response(503, headers={"Retry-After": "3600"}),
            httpx.Response(200, json={"id": 1}),
        ]
    )

    with pytest.raises(httpx.HTTPStatusError):       # stop_before_delay(15): a 30 s sleep is too long
        client.get_order(1)
    assert route.call_count == 1
    assert fake_sleep.calls == []


def test_post_retries_reuse_one_idempotency_key(api, client):
    route = api.post("/orders").mock(
        side_effect=[httpx.ReadTimeout("no response"), httpx.Response(201, json={"id": 7})]
    )

    assert client.create_order({"sku": "A-1"}) == {"id": 7}
    keys = {call.request.headers["Idempotency-Key"] for call in route.calls}
    assert route.call_count == 2
    assert len(keys) == 1                                   # same key on every attempt


def test_two_logical_orders_get_different_keys(api, client):
    route = api.post("/orders").mock(return_value=httpx.Response(201, json={"id": 7}))

    client.create_order({"sku": "A-1"})
    client.create_order({"sku": "A-1"})
    keys = [call.request.headers["Idempotency-Key"] for call in route.calls]
    assert keys[0] != keys[1]


@pytest.mark.parametrize(
    "failure",
    [httpx.Response(503), httpx.ReadTimeout("sent, but no response")],
    ids=["503", "read-timeout"],
)
def test_non_idempotent_call_is_never_retried(api, client, failure):
    route = api.post("/sms").mock(side_effect=[failure, httpx.Response(200)])

    with pytest.raises((httpx.HTTPStatusError, httpx.ReadTimeout)):
        client.send_sms("+10000000000", "Your code is 1234")
    assert route.call_count == 1                            # a retry could send a second SMS


def test_statistics_report_attempts(api, client):
    api.get("/orders/1").mock(side_effect=[httpx.Response(502), httpx.Response(200, json={})])

    client.get_order(1)
    assert OrdersClient.get_order.statistics["attempt_number"] == 2
```

- `side_effect=[...]` scripts the failure sequence: responses and exceptions (`httpx.ConnectTimeout`, `httpx.ReadTimeout`) in order.
- `route.call_count` is the attempt count; `route.calls[i].request` shows exactly what each attempt sent — headers included.
- `test_gives_up_when_retry_after_is_beyond_the_time_budget` documents a design decision: `stop_before_delay(15)` refuses a 30 s sleep and fails at once with the real `503`.
- `test_non_idempotent_call_is_never_retried` is the test that catches "someone added `@retry_transient` to `send_sms`". Run it for `503` **and** for a read timeout — the dangerous case where the first SMS may have been sent.

## stamina and urllib3 `Retry`

```python
# tests/test_libraries.py
import httpx
import pytest
import requests
import respx
import responses
import stamina
from responses import registries

from app.legacy_client import make_session
from app.profiles import get_profile


@pytest.fixture
def users_api():
    with respx.mock(base_url="https://users.test") as mock:
        yield mock


@pytest.fixture
def http():
    with httpx.Client(base_url="https://users.test") as client:
        yield client


def test_stamina_retries_up_to_the_test_mode_limit(users_api, http):
    route = users_api.get("/users/1").mock(return_value=httpx.Response(503))

    with pytest.raises(httpx.HTTPStatusError):
        get_profile(http, 1)
    assert route.call_count == 3                    # set_testing(True, attempts=3) in conftest


def test_stamina_does_not_retry_client_errors(users_api, http):
    route = users_api.get("/users/1").mock(return_value=httpx.Response(404))

    with pytest.raises(httpx.HTTPStatusError):
        get_profile(http, 1)
    assert route.call_count == 1


def test_stamina_single_attempt_mode(users_api, http):
    route = users_api.get("/users/1").mock(return_value=httpx.Response(503))

    with stamina.set_testing(True, attempts=1), pytest.raises(httpx.HTTPStatusError):
        get_profile(http, 1)
    assert route.call_count == 1


@responses.activate(registry=registries.OrderedRegistry)
def test_urllib3_retry_get_on_503():
    url = "https://legacy.test/orders/1"
    for status in (503, 503, 200):
        responses.get(url, status=status, json={"id": 1})

    response = make_session().get(url, timeout=5)

    assert response.status_code == 200
    assert len(responses.calls) == 3                # responses runs Retry, but does not sleep


@responses.activate
def test_urllib3_retry_never_retries_post():
    responses.post("https://legacy.test/orders", status=503)

    response = make_session().post("https://legacy.test/orders", json={}, timeout=5)

    assert response.status_code == 503
    assert len(responses.calls) == 1


@responses.activate
def test_urllib3_retry_gives_up_with_retry_error():
    responses.get("https://legacy.test/orders/1", status=503)

    with pytest.raises(requests.exceptions.RetryError):
        make_session().get("https://legacy.test/orders/1", timeout=5)
    assert len(responses.calls) == 4                # 1 request + 3 retries
```

`responses` replaces the adapter's `send()` but evaluates its `max_retries` (`Retry`): status lists, allowed methods and `raise_on_status` all work, without the backoff sleeps. A real local HTTP server is the only way to check the actual delays ([02](./02-retry-libraries.md#requests-urllib3-retry)).

## Fake Time: time-machine and freezegun

| What the code reads | `time_machine.travel()` / `shift()` | `freezegun.freeze_time()` / `tick()` |
|---------------------|-------------------------------------|--------------------------------------|
| `time.time()`, `datetime.now()` | Moved | Moved |
| `time.monotonic()`, `perf_counter()` | **Not moved** | Moved |
| tenacity `stop_after_delay`, asyncio timers, `circuitbreaker` (monotonic) | Not affected | Affected |
| `pybreaker` (`datetime.now(UTC)`), `purgatory` (`time.time()`) | Works | Works |
| backoff `max_time` (`datetime.now()`) | Works | Frozen: never expires |
| `asyncio.sleep()` inside the block | Works | **Hangs** — unless `freeze_time(..., real_asyncio=True)` |

```python
# tests/test_fake_time.py
"""Executable notes: what each fake-time library really moves."""

import asyncio
import time
from datetime import UTC, datetime

import freezegun
import time_machine


def test_time_machine_moves_wall_clock_but_not_monotonic():
    with time_machine.travel(datetime(2026, 10, 2, tzinfo=UTC), tick=False) as traveller:
        wall, mono = time.time(), time.monotonic()
        traveller.shift(60)

        assert time.time() - wall == 60
        assert time.monotonic() - mono < 1            # tenacity, asyncio, circuitbreaker: unaffected


def test_freezegun_moves_monotonic_too():
    with freezegun.freeze_time("2026-10-02") as frozen:
        mono = time.monotonic()
        frozen.tick(60)

        assert time.monotonic() - mono == 60


def test_freezegun_needs_real_asyncio_for_sleep():
    with freezegun.freeze_time("2026-10-02", real_asyncio=True):
        asyncio.run(asyncio.sleep(0.01))              # without real_asyncio=True this hangs
```

Fake-time libraries patch whole modules and depend on which clock a library calls internally — which can change between versions. For your own code, an **injected clock** is simpler and exact.

## Fallbacks

```python
# tests/test_fallbacks.py
import asyncio

import pytest

from app.breaker import CircuitBreaker, State
from app.fallbacks import DEFAULT_RATES, FALLBACK_ON, RatesService


class FakeSource:
    """Scripted async dependency: each call takes the next behaviour."""

    def __init__(self, *behaviours) -> None:
        self.behaviours = list(behaviours)
        self.calls = 0

    async def __call__(self) -> dict[str, float]:
        self.calls += 1
        behaviour = self.behaviours.pop(0) if len(self.behaviours) > 1 else self.behaviours[0]
        if behaviour == "hang":
            await asyncio.Event().wait()             # never finishes: only a timeout ends it
        if isinstance(behaviour, Exception):
            raise behaviour
        return behaviour


UP = {"USD": 1.0, "EUR": 0.9}
BACKUP = {"USD": 1.0, "EUR": 0.91}
DOWN = ConnectionError("refused")


def make_service(primary, secondary, clock, threshold: int = 3) -> RatesService:
    breaker = CircuitBreaker(failure_threshold=threshold, reset_timeout=30, failure_types=FALLBACK_ON, clock=clock)
    return RatesService(primary, secondary, breaker=breaker, timeout=0.05, max_stale=3600, clock=clock)


async def test_primary_answer_is_not_degraded(clock):
    rates = await make_service(FakeSource(UP), FakeSource(BACKUP), clock).get()

    assert (rates.source, rates.degraded, rates.values) == ("primary", False, UP)


@pytest.mark.parametrize("failure", [DOWN, "hang"], ids=["error", "timeout"])
async def test_falls_back_to_secondary(clock, failure):
    rates = await make_service(FakeSource(failure), FakeSource(BACKUP), clock).get()

    assert (rates.source, rates.degraded, rates.values) == ("secondary", True, BACKUP)


async def test_uses_last_good_value_when_everything_is_down(clock):
    primary = FakeSource(UP, DOWN)
    service = make_service(primary, FakeSource(DOWN), clock)
    await service.get()                              # fills the cache
    clock.advance(600)

    rates = await service.get()

    assert (rates.source, rates.values) == ("cache", UP)


async def test_stale_cache_is_not_used(clock):
    service = make_service(FakeSource(UP, DOWN), FakeSource(DOWN), clock)
    await service.get()
    clock.advance(3601)

    rates = await service.get()

    assert (rates.source, rates.values) == ("default", DEFAULT_RATES)


async def test_open_breaker_skips_the_primary(clock):
    primary = FakeSource("hang")
    service = make_service(primary, FakeSource(BACKUP), clock, threshold=2)

    for _ in range(5):
        assert (await service.get()).source == "secondary"

    assert primary.calls == 2                        # then the breaker opened: no more slow calls
    assert service._breaker.state is State.OPEN


async def test_primary_is_tried_again_after_reset_timeout(clock):
    primary = FakeSource(DOWN, DOWN, UP)
    service = make_service(primary, FakeSource(BACKUP), clock, threshold=2)
    await service.get()
    await service.get()
    clock.advance(30)

    rates = await service.get()

    assert rates.source == "primary"
    assert service._breaker.state is State.CLOSED
```

- `"hang"` waits on an `asyncio.Event` that is never set: only the timeout can end it. With `timeout=0.05` the test still takes milliseconds.
- `test_open_breaker_skips_the_primary` asserts the **number of calls** to the primary: two slow calls, then none — proof that the breaker stops paying the timeout on every request.
- The stale-cache test moves the injected clock by 3601 s instead of waiting an hour.

## Circuit Breaker States

```python
# tests/test_breaker.py
import threading
from datetime import UTC, datetime

import pybreaker
import pytest
import time_machine
from hypothesis import settings
from hypothesis import strategies as st
from hypothesis.stateful import RuleBasedStateMachine, invariant, precondition, rule

from app.breaker import CircuitBreaker, CircuitOpenError, State
from tests.conftest import FakeClock


def boom() -> None:
    raise ConnectionError("down")


def fail(breaker: CircuitBreaker, times: int) -> None:
    for _ in range(times):
        with pytest.raises(ConnectionError):
            breaker.call(boom)


@pytest.fixture
def breaker(clock) -> CircuitBreaker:
    return CircuitBreaker(
        failure_threshold=3, reset_timeout=30, failure_types=(ConnectionError,), clock=clock
    )


def test_opens_after_threshold_consecutive_failures(breaker):
    fail(breaker, 2)
    assert breaker.state is State.CLOSED
    fail(breaker, 1)
    assert breaker.state is State.OPEN


def test_success_resets_the_failure_count(breaker):
    fail(breaker, 2)
    breaker.call(lambda: "ok")
    fail(breaker, 2)
    assert breaker.state is State.CLOSED


def test_open_circuit_fails_fast_without_calling(breaker):
    fail(breaker, 3)
    calls = []

    with pytest.raises(CircuitOpenError):
        breaker.call(lambda: calls.append(1))
    assert calls == []


def test_half_open_after_reset_timeout(breaker, clock):
    fail(breaker, 3)
    clock.advance(29.9)
    assert breaker.state is State.OPEN
    clock.advance(0.1)
    assert breaker.state is State.HALF_OPEN


def test_successful_trial_call_closes(breaker, clock):
    fail(breaker, 3)
    clock.advance(30)

    assert breaker.call(lambda: "ok") == "ok"
    assert breaker.state is State.CLOSED


def test_failed_trial_call_opens_again_for_a_full_timeout(breaker, clock):
    fail(breaker, 3)
    clock.advance(30)
    fail(breaker, 1)                                  # one failure is enough in half-open

    assert breaker.state is State.OPEN
    clock.advance(29)
    assert breaker.state is State.OPEN


def test_only_one_trial_call_in_half_open(breaker, clock):
    fail(breaker, 3)
    clock.advance(30)
    started, release = threading.Event(), threading.Event()

    def slow_probe() -> str:
        started.set()
        release.wait(5)
        return "ok"

    probe = threading.Thread(target=breaker.call, args=(slow_probe,))
    probe.start()
    started.wait(5)
    with pytest.raises(CircuitOpenError, match="trial call"):
        breaker.call(lambda: "second caller")
    release.set()
    probe.join()
    assert breaker.state is State.CLOSED


def test_errors_outside_failure_types_do_not_open(breaker):
    for _ in range(10):
        with pytest.raises(ValueError):
            breaker.call(lambda: int("not a number"))
    assert breaker.state is State.CLOSED


class BreakerMachine(RuleBasedStateMachine):
    """Random sequences of calls and clock moves must keep the breaker consistent."""

    def __init__(self) -> None:
        super().__init__()
        self.clock = FakeClock()
        self.breaker = CircuitBreaker(
            failure_threshold=3, reset_timeout=10, failure_types=(ConnectionError,), clock=self.clock
        )
        self.consecutive_failures = 0
        self.real_calls = 0

    def _call(self, fn) -> None:
        def counted():
            self.real_calls += 1
            return fn()

        try:
            self.breaker.call(counted)
        except (ConnectionError, CircuitOpenError):
            pass

    @rule()
    def success(self) -> None:
        before = self.breaker.state
        self._call(lambda: "ok")
        if before is not State.OPEN:
            assert self.breaker.state is State.CLOSED
            self.consecutive_failures = 0

    @rule()
    def failure(self) -> None:
        before = self.breaker.state
        calls_before = self.real_calls
        self._call(boom)
        if before is State.OPEN:
            assert self.real_calls == calls_before        # fail fast: not called
        elif before is State.HALF_OPEN:
            assert self.breaker.state is State.OPEN
        else:
            self.consecutive_failures += 1

    @rule(seconds=st.floats(min_value=0, max_value=20))
    def time_passes(self, seconds: float) -> None:
        self.clock.advance(seconds)

    @precondition(lambda self: self.breaker.state is State.CLOSED)
    @invariant()
    def closed_means_below_threshold(self) -> None:
        assert self.consecutive_failures < 3


TestBreakerMachine = BreakerMachine.TestCase
TestBreakerMachine.settings = settings(max_examples=200, stateful_step_count=30, deadline=None)


def test_pybreaker_transitions_with_time_machine():
    """pybreaker reads datetime.now(), so time-machine can move it forward."""
    transitions: list[tuple[str, str]] = []

    class Recorder(pybreaker.CircuitBreakerListener):
        def state_change(self, cb, old_state, new_state) -> None:
            transitions.append((old_state.name, new_state.name))

    with time_machine.travel(datetime(2026, 10, 2, 12, 0, tzinfo=UTC), tick=False) as traveller:
        breaker = pybreaker.CircuitBreaker(fail_max=2, reset_timeout=60, listeners=[Recorder()])
        with pytest.raises(ConnectionError):
            breaker.call(boom)
        with pytest.raises(pybreaker.CircuitBreakerError):  # the tripping call raises CircuitBreakerError
            breaker.call(boom)
        assert breaker.current_state == "open"

        traveller.shift(61)
        assert breaker.call(lambda: "ok") == "ok"

    assert breaker.current_state == "closed"
    assert transitions == [("closed", "open"), ("open", "half-open"), ("half-open", "closed")]
```

- Each transition has its own test with an exact boundary (`29.9` s still open, `30` s half-open).
- `test_only_one_trial_call_in_half_open` holds the trial call open with an `Event` and checks that a second caller is rejected — a breaker that lets every caller through in half-open sends a burst at a service that is just recovering.
- `BreakerMachine` is a **Hypothesis stateful test**: Hypothesis generates random sequences of successes, failures and clock moves (200 sequences of up to 30 steps) and checks the rules after every step. Changing `>=` to `>` in the threshold check makes it fail with a minimal sequence: three `failure()` steps.
- The pybreaker test uses time-machine because pybreaker reads `datetime.now()`; a listener records every transition.

## Concurrency Limits

```python
# tests/test_limits.py
import asyncio
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest
import respx
from aiolimiter import AsyncLimiter

from app.bulkhead import Bulkhead, BulkheadFull
from app.host_limits import HostLimits
from app.limits import fetch_all, get_json


class InFlightProbe:
    """Async respx side effect that measures how many requests run at once."""

    def __init__(self, delay: float = 0.01) -> None:
        self.delay = delay
        self.current = 0
        self.peak = 0

    async def __call__(self, request: httpx.Request) -> httpx.Response:
        self.current += 1
        self.peak = max(self.peak, self.current)
        try:
            await asyncio.sleep(self.delay)          # keep the request "in flight" for a moment
            return httpx.Response(200, json={"path": request.url.path})
        finally:
            self.current -= 1


@pytest.fixture
def probe():
    probe = InFlightProbe()
    with respx.mock:
        respx.get(url__regex=r"https://.*").mock(side_effect=probe)
        yield probe


async def test_fetch_all_never_exceeds_the_limit(probe):
    urls = [f"https://api.test/items/{i}" for i in range(50)]
    async with httpx.AsyncClient() as client:
        results = await fetch_all(client, urls, max_in_flight=5)

    assert len(results) == 50
    assert probe.peak == 5                           # == not <=: prove the limit was reached


async def test_limit_is_per_host(probe):
    limits = HostLimits(max_in_flight=2, max_rate=1000)
    async with httpx.AsyncClient() as client:
        await asyncio.gather(
            *(limits.get(client, f"https://a.test/{i}") for i in range(10)),
            *(limits.get(client, f"https://b.test/{i}") for i in range(10)),
        )

    assert probe.peak == 4                           # 2 for a.test + 2 for b.test


async def test_rate_limiter_allows_a_burst_then_blocks():
    limiter = AsyncLimiter(max_rate=5, time_period=1)

    for _ in range(5):
        await asyncio.wait_for(limiter.acquire(), timeout=0.01)    # burst: no waiting
    assert not limiter.has_capacity()
    with pytest.raises(TimeoutError):
        await asyncio.wait_for(limiter.acquire(), timeout=0.05)     # next token in ~0.2 s


async def test_slot_is_released_during_backoff(monkeypatch):
    semaphore = asyncio.Semaphore(1)
    locked_while_sleeping: list[bool] = []

    async def fake_sleep(seconds: float) -> None:
        locked_while_sleeping.append(semaphore.locked())

    monkeypatch.setattr(get_json.retry, "sleep", fake_sleep)
    with respx.mock:
        respx.get("https://api.test/x").mock(
            side_effect=[httpx.Response(503), httpx.Response(503), httpx.Response(200, json={})]
        )
        async with httpx.AsyncClient() as client:
            await get_json(client, semaphore, "https://api.test/x")

    assert locked_while_sleeping == [False, False]


async def test_bulkhead_rejects_instead_of_queueing():
    bulkhead = Bulkhead("recommendations", size=2)
    release = asyncio.Event()

    async def slow() -> str:
        await release.wait()
        return "ok"

    running = [asyncio.create_task(bulkhead.call(slow)) for _ in range(2)]
    await asyncio.sleep(0)                           # let both take their slots

    with pytest.raises(BulkheadFull):
        await bulkhead.call(slow)
    release.set()
    assert await asyncio.gather(*running) == ["ok", "ok"]


def test_thread_pool_limits_concurrency():
    lock = threading.Lock()
    current = peak = 0

    def job(_: int) -> None:
        nonlocal current, peak
        with lock:
            current += 1
            peak = max(peak, current)
        time.sleep(0.01)
        with lock:
            current -= 1

    with ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(job, range(30)))

    assert peak == 3
```

- Assert `peak == limit`, not `peak <= limit`: a test where the limit was never reached passes even with no semaphore at all.
- `InFlightProbe` keeps each fake request open for 10 ms, long enough for requests to overlap. Too short a delay makes the peak 1 and the test meaningless.
- `test_slot_is_released_during_backoff` checks **where** the semaphore sits relative to the retry loop by looking at it from inside the (fake) backoff sleep.
- The rate-limiter test uses `asyncio.wait_for` with tight timeouts instead of measuring elapsed time: "did not have to wait" and "had to wait" are robust; "took 3.0 ± 0.1 s" is not, especially under xdist.

## Reproducing Race Conditions

Races are timing bugs; tests must **control the timing** instead of hoping for it.

| Technique | How | Determinism |
|-----------|-----|-------------|
| Barrier in the gap | A pause hook (`pause=barrier.wait`) between check and act; two threads both arrive before either acts | Fails every run |
| Await in the gap (asyncio) | `await asyncio.sleep(0)` between check and act, two tasks with `gather` | Fails every run |
| Start together | `threading.Barrier(n)` before the work, so all threads really overlap | Higher chance |
| Many iterations | Loops of hundreds of operations per thread; `pytest --count=50` (pytest-repeat) | Statistical |
| Frequent switching | `sys.setswitchinterval(1e-6)` (GIL build) | Statistical, higher |
| Free-threaded build | Run the suite on `python3.14t` | Much higher for thread races |
| Hypothesis | Stateful tests generate operation sequences; combine with the techniques above | Finds sequences, not interleavings |

```python
# tests/test_races.py
import asyncio
import threading
import time

import pytest

from app.inventory import Inventory, SafeInventory, Wallet


def run_together(*targets, timeout: float = 10) -> None:
    """Start all targets at the same moment and wait for them."""
    start = threading.Barrier(len(targets))

    def wrap(target):
        def go():
            start.wait(timeout)
            target()
        return go

    threads = [threading.Thread(target=wrap(t)) for t in targets]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout)
        assert not t.is_alive(), "thread did not finish: deadlock?"


def test_check_then_act_race_reproduced_deterministically():
    """The barrier holds both buyers between check and act: the race happens every run."""
    in_the_gap = threading.Barrier(2, timeout=5)
    inventory = Inventory(stock=1, pause=in_the_gap.wait)

    run_together(inventory.buy, inventory.buy)

    assert inventory.sold == 2                       # the bug: one item sold twice
    assert inventory.stock == -1


@pytest.mark.race
def test_locked_inventory_never_oversells(busy_switching):
    inventory = SafeInventory(stock=100, pause=lambda: time.sleep(0))

    def buy_many() -> None:
        for _ in range(50):
            inventory.buy()

    run_together(*[buy_many] * 8)                    # 400 attempts for 100 items

    assert inventory.sold == 100
    assert inventory.stock == 0


async def test_await_between_check_and_act_is_a_race():
    wallet = Wallet(balance=100)

    results = await asyncio.gather(wallet.withdraw_racy(80), wallet.withdraw_racy(80))

    assert results == [True, True]
    assert wallet.balance == -60                     # both passed the check before either paid


async def test_asyncio_lock_fixes_it():
    wallet = Wallet(balance=100)

    results = await asyncio.gather(*(wallet.withdraw(80) for _ in range(10)))

    assert results.count(True) == 1
    assert wallet.balance == 20
```

- The first and third tests **document the bug**: they pass because the race happens. In a real suite keep only the tests of the fixed code — or mark the racy one `@pytest.mark.xfail(strict=True, reason="known race")` until it is fixed, so the fix turns it into an unexpected pass.
- A test of the **fixed** code cannot put a barrier inside the critical section (the second thread could never reach it — a deadlock); it starts threads together and runs enough iterations instead. The `run_together` helper fails with "deadlock?" rather than hanging the suite.
- Pause hooks (`pause=`, `after_read=`) are test seams: a no-op in production, a barrier in tests.

## PostgreSQL Race Tests

Races between transactions need a real database — SQLite or mocks do not have PostgreSQL's row locks and isolation levels.

```bash
docker run -d --rm --name pg -e POSTGRES_PASSWORD=pg -p 127.0.0.1:5432:5432 postgres:18-alpine
export PG_DSN=postgresql://postgres:pg@127.0.0.1:5432/postgres
uv run pytest -m postgres -q
```

```python
# tests/test_db_races.py
import threading
import uuid

import pytest
from tenacity import retry, retry_if_exception_type, stop_after_attempt

psycopg = pytest.importorskip("psycopg")            # skip the module where the driver is missing

from app.consumer import SCHEMA as CONSUMER_SCHEMA  # noqa: E402
from app.consumer import handle_deposit  # noqa: E402
from app.stock_db import (  # noqa: E402
    SCHEMA,
    ConflictError,
    buy_atomic,
    buy_for_update,
    buy_optimistic,
    buy_racy,
    count_event,
    record_payment,
)

pytestmark = pytest.mark.postgres


@pytest.fixture(scope="session")
def schema(pg_dsn):
    with psycopg.connect(pg_dsn, autocommit=True) as conn:
        conn.execute(SCHEMA)
        conn.execute(CONSUMER_SCHEMA)


class Stock:
    """This worker's product row: set the stock, read it back."""

    def __init__(self, dsn: str, product_id: int) -> None:
        self.dsn = dsn
        self.product_id = product_id

    def set(self, n: int) -> None:
        with psycopg.connect(self.dsn, autocommit=True) as conn:
            conn.execute(
                "INSERT INTO products (id, stock) VALUES (%s, %s) "
                "ON CONFLICT (id) DO UPDATE SET stock = EXCLUDED.stock, version = 1",
                (self.product_id, n),
            )

    def read(self) -> int:
        with psycopg.connect(self.dsn) as conn:
            row = conn.execute("SELECT stock FROM products WHERE id = %s", (self.product_id,)).fetchone()
            return row[0]


@pytest.fixture
def stock(pg_dsn, schema, product_id) -> Stock:
    return Stock(pg_dsn, product_id)


def run_concurrently(pg_dsn, work, threads: int, calls_each: int = 1) -> list[bool]:
    results: list[bool] = []
    start = threading.Barrier(threads, timeout=10)

    def worker() -> None:
        with psycopg.connect(pg_dsn, autocommit=True) as conn:
            start.wait()
            for _ in range(calls_each):
                results.append(work(conn))

    workers = [threading.Thread(target=worker) for _ in range(threads)]
    for w in workers:
        w.start()
    for w in workers:
        w.join(30)
    return results


def test_lost_update_reproduced(pg_dsn, stock, product_id):
    stock.set(1)
    after_read = threading.Barrier(2, timeout=10)    # both transactions have read stock = 1

    results = run_concurrently(pg_dsn, lambda conn: buy_racy(conn, product_id, after_read.wait), threads=2)

    assert results == [True, True]                   # two sales ...
    assert stock.read() == 0                              # ... but stock went down by one


@retry(retry=retry_if_exception_type(ConflictError), stop=stop_after_attempt(20), reraise=True)
def buy_optimistic_with_retry(conn, product_id: int) -> bool:
    return buy_optimistic(conn, product_id)


@pytest.mark.parametrize("buy", [buy_atomic, buy_for_update, buy_optimistic_with_retry])
def test_no_oversell_under_load(pg_dsn, stock, product_id, buy):
    stock.set(10)

    results = run_concurrently(pg_dsn, lambda conn: buy(conn, product_id), threads=8, calls_each=5)

    assert results.count(True) == 10                # 40 attempts, exactly 10 sales
    assert stock.read() == 0


def test_idempotency_key_records_a_payment_once(pg_dsn, schema):
    key = f"order-42-payment-{uuid.uuid4()}"         # unique per test run

    results = run_concurrently(pg_dsn, lambda conn: record_payment(conn, key, 1, 500), threads=5)

    assert results.count(True) == 1


def test_upsert_counts_concurrent_events(pg_dsn, schema, worker_id):
    day = "2026-10-02" if worker_id == "master" else f"2026-10-{2 + int(worker_id[2:]):02d}"
    with psycopg.connect(pg_dsn, autocommit=True) as conn:
        conn.execute("DELETE FROM daily_counts WHERE day = %s", (day,))

    run_concurrently(pg_dsn, lambda conn: count_event(conn, day), threads=8, calls_each=10)

    with psycopg.connect(pg_dsn) as conn:
        assert conn.execute("SELECT n FROM daily_counts WHERE day = %s", (day,)).fetchone()[0] == 80


def test_duplicate_deliveries_are_applied_once(pg_dsn, schema, product_id):
    account_id, message_id = product_id, f"deposit-{uuid.uuid4()}"
    with psycopg.connect(pg_dsn, autocommit=True) as conn:
        conn.execute(
            "INSERT INTO accounts (id, balance_cents) VALUES (%s, 0) "
            "ON CONFLICT (id) DO UPDATE SET balance_cents = 0",
            (account_id,),
        )

    results = run_concurrently(pg_dsn, lambda conn: handle_deposit(conn, message_id, account_id, 500), threads=3)

    assert sorted(results) == [False, False, True]
    with psycopg.connect(pg_dsn) as conn:
        balance = conn.execute("SELECT balance_cents FROM accounts WHERE id = %s", (account_id,)).fetchone()[0]
    assert balance == 500
```

- `pytest.importorskip("psycopg")` skips the module where the driver is missing (in this check: no `psycopg-binary` wheel for free-threaded 3.14), and `pg_dsn` skips it when no database is configured.
- `test_lost_update_reproduced` puts the barrier **after the read**: both transactions read stock 1, then both write 0. The fixed versions start together (barrier before the transaction), because a barrier after `SELECT ... FOR UPDATE` would deadlock — the second transaction waits for the row lock and never reaches the barrier.
- `buy_optimistic_with_retry` shows the full optimistic-locking pattern: retry on `ConflictError` with tenacity — the same retry rules as for HTTP, applied to a database conflict.

## Running the Suite

```text
$ uv run pytest -q
76 passed in 2.51s

$ uv run pytest -q -n 4                                 # pytest-xdist, 4 workers
76 passed in 2.39s

$ uv run pytest -q --count 20 tests/test_races.py tests/test_db_races.py    # pytest-repeat
220 passed in 17.57s

$ uv run --python 3.14t pytest -q                       # free-threaded build: no psycopg wheel
69 passed, 1 skipped in 2.02s
```

The same suite passed on Python 3.13.6 and with `-W error` (warnings as errors) on 3.14.8.

## pytest-xdist

- **Separate data per worker.** Every xdist worker is its own process; tests that touch the same database row, Redis key or file collide. The `product_id` fixture maps `gw0`, `gw1`, … to different rows; use the same idea for key prefixes and Redis databases.
- **Process-local limits are per worker.** A `Semaphore(5)` or `AsyncLimiter(5, 1)` in test code limits each worker; eight workers send eight times as much to a shared staging API. Limit the total in Redis, or lower the per-worker value.
- **Module-level state is per worker, too** — global stamina test mode, tenacity statistics, in-memory breakers. That keeps workers independent, but a test that passes alone and fails under `-n` usually shares something outside the process.
- **Timing gets worse under load.** CPU-bound workers slow each other down; tests with tight wall-clock thresholds become flaky. Prefer fake clocks and `wait_for` timeouts with generous margins.

## Flaky-Test Pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| Retry tests take seconds | Real backoff sleeps | Fake `sleep` / `.retry.sleep` / `stamina.set_testing` |
| Test hangs forever | `asyncio.sleep` under `freeze_time`; a barrier nobody reaches; `get()` on an empty queue | `real_asyncio=True`; timeouts on every barrier, join and wait |
| Retry count off by one | `stop_after_attempt(n)` counts attempts, `Retry(total=n)` counts retries | Assert on the observed call count, not on config values |
| Passes alone, fails in the suite | Retry policy patched globally, stamina mode left on, a limiter reused across loops | `monkeypatch`, context managers, per-test objects |
| Breaker test depends on the order of tests | One breaker shared by module-level code | Inject a fresh breaker per test |
| "Max concurrency" test always passes | Peak never reached the limit | Assert equality; keep requests in flight long enough |
| Race test sometimes passes, sometimes fails | Relies on chance interleaving | Barrier in the gap for the bug; load + repetition for the fix |
| Fails only under `-n` | Shared rows, keys, files or ports between workers | `worker_id`-based names, `tmp_path` |
| Fails only in CI | Slower machine: timeouts, thresholds | Fake time; generous timeouts that only catch hangs |
| Flaky test "fixed" with `@pytest.mark.flaky(reruns=3)` | The race is real and now hidden | Fix the cause; reruns only for known external flakiness |

## Checklist

- [ ] Every retry policy has tests for: success after transient errors, permanent error not retried, exhausting attempts, `Retry-After`
- [ ] Non-idempotent calls have a test proving they are not retried; idempotency keys are the same across attempts
- [ ] No test sleeps for backoff; time-based logic uses an injected clock or fake time with known limits
- [ ] Each fallback step and the "everything down" case are tested; responses are marked degraded
- [ ] Breaker transitions are tested with a fake clock; a property-based test covers random sequences
- [ ] Concurrency tests assert the peak **equals** the limit; retries release slots during backoff
- [ ] Known races are reproduced deterministically with barriers; fixes are tested under load and repetition
- [ ] Database races are tested against the real database engine; xdist workers use separate rows
- [ ] Thread-heavy code also runs on a free-threaded (`3.14t`) CI job

---
## See also
- [Resilience — Retries, Fallbacks, Semaphores & Race Conditions](./index.md)
- [Resilience — Race Conditions](./05-race-conditions.md)
- [Pytest — Flakiness Debugging](../pytest/02-practical-playbooks/03-flakiness-debugging.md)
- [Test Reliability and Flakiness](../../test-design-patterns/06-execution-reliability/02-reliability-flakiness.md)
- [Test Execution Strategies](../../test-design-patterns/06-execution-reliability/01-execution-strategies.md)
- [HTTPX — Async Patterns](../httpx/02-async-patterns.md)
- [Celery — Testing Celery Code](../celery/05-testing.md)
