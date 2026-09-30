---
date: 2026-09-30
tags:
  - databases
  - redis
  - python
  - pytest
  - testing
---

# Redis — Testing Recipes

Tests for the typical Redis bugs: missing TTLs, stale cache after an update, off-by-one limits, locks that are never released, lost updates under concurrency, and an app that hangs when Redis is down.

The `r`, `fake_r` and `real_r` fixtures come from [06 — Setup & Isolation](./06-testing-setup-isolation.md#fixtures): tests that take `r` run twice, on fakeredis and on a real Redis. The code under test is `app/cache.py` and `app/ratelimit.py` from [03 — Patterns](./03-patterns.md), plus two small modules below.

## Testing Cache-Aside and Invalidation

A fake loader counts database reads — the cache behaviour is visible without a database.

```python
# tests/test_cache.py
import json

import pytest

from app.cache import USER_TTL, get_user, update_user, user_key


class FakeDb:
    def __init__(self):
        self.rows = {42: {"id": 42, "name": "Ann"}}
        self.reads = 0

    def load(self, user_id: int) -> dict:
        self.reads += 1
        return dict(self.rows[user_id])

    def save(self, user_id: int, data: dict) -> None:
        self.rows[user_id] = {**self.rows[user_id], **data}


def test_miss_then_hit(r):
    db = FakeDb()
    assert get_user(r, 42, db.load) == {"id": 42, "name": "Ann"}
    assert get_user(r, 42, db.load) == {"id": 42, "name": "Ann"}
    assert db.reads == 1                              # second call served from Redis


def test_value_is_stored_with_ttl(r):
    get_user(r, 42, FakeDb().load)
    assert 0 < r.ttl(user_key(42)) <= USER_TTL        # -1 would mean "no TTL": the key lives forever


def test_update_invalidates_cache(r):
    db = FakeDb()
    get_user(r, 42, db.load)
    update_user(r, 42, {"name": "Bob"}, db.save)
    assert r.exists(user_key(42)) == 0
    assert get_user(r, 42, db.load)["name"] == "Bob"  # no stale read
    assert db.reads == 2


def test_expired_entry_is_reloaded(r):
    db = FakeDb()
    get_user(r, 42, db.load)
    r.delete(user_key(42))                            # same effect as the TTL running out
    get_user(r, 42, db.load)
    assert db.reads == 2


def test_corrupted_entry_fails_loudly(r):
    r.set(user_key(42), "not json")                   # e.g. written by an old app version
    with pytest.raises(json.JSONDecodeError):
        get_user(r, 42, FakeDb().load)
```

More cases worth a test in a real project:

- Every write path invalidates: update, delete, bulk import, admin tools, other services.
- The key contains everything that changes the result (tenant, locale, permissions) — two users with different rights never see each other's cached data.
- A cache written by the **previous** app version (old JSON shape) does not crash the new one — or the key is versioned.
- Redis down → the app still answers from the database (see [Failure Modes](#failure-modes)).

## Testing TTL and Expiry Without Sleep

Sleeping for the real TTL makes tests slow and flaky. In order of preference:

1. **Assert the TTL, not the expiry.** `0 < r.ttl(key) <= USER_TTL` proves the key will expire; Redis itself is trusted to expire it. `-1` means the TTL was forgotten, `-2` that the key does not exist.
2. **Simulate expiry** by deleting the key (`r.delete(key)`) — the code sees exactly what it sees after a real expiry.
3. **Move the clock** with fakeredis + `time-machine`: fakeredis computes expiry from `time.time()`.
4. **Inject the clock** into code that computes time-based keys (the rate limiter's `now=` argument) — works with a real Redis too.
5. **Real expiry with a tiny TTL** (test-only config, milliseconds) and a polling helper with a deadline — for integration tests of the real server behaviour.

```python
# tests/test_ttl_time.py
import time

import time_machine

from app.cache import USER_TTL, get_user, user_key


def test_entry_expires_after_ttl(fake_r):
    reads = []

    def load(user_id: int) -> dict:
        reads.append(user_id)
        return {"id": user_id}

    with time_machine.travel(1_700_000_000, tick=False) as traveller:
        get_user(fake_r, 1, load)
        traveller.shift(USER_TTL - 1)
        assert fake_r.exists(user_key(1)) == 1
        traveller.shift(2)
        assert fake_r.exists(user_key(1)) == 0        # fakeredis reads time.time()
        get_user(fake_r, 1, load)
    assert reads == [1, 1]


def wait_until(predicate, timeout=2.0, interval=0.01):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(interval)
    raise AssertionError("condition not met in time")


def test_real_expiry_with_short_ttl(real_r):
    real_r.set("myapp:otp:42", "123456", px=100)      # short TTL, test-only
    wait_until(lambda: real_r.exists("myapp:otp:42") == 0)
```

Moving the Python clock does nothing to a real Redis: its TTLs follow the server clock. Do not combine `time_machine` with `real_r` for expiry tests.

TTL bugs worth a dedicated test:

- A refresh written as plain `SET` drops the TTL (`ttl == -1` after the second write).
- A counter created by `INCR` never gets a TTL, or gets a new one on every hit (the window never ends) — the `EXPIRE ... NX` in the rate limiter prevents that.
- Sliding sessions: `GETEX ... EX` extends the TTL on every read; a fixed-lifetime token must **not** be extended.

## Testing Rate Limiters

An injected clock makes window boundaries deterministic, and the same tests run on fakeredis and a real Redis.

```python
# tests/test_ratelimit.py
from app.ratelimit import allow


class Clock:
    def __init__(self, t: float = 1_700_000_000.0):
        self.t = t

    def __call__(self) -> float:
        return self.t


def test_allows_up_to_limit_then_blocks(r):
    clock = Clock()
    results = [allow(r, "user:1", limit=3, window_s=60, now=clock) for _ in range(5)]
    assert results == [True, True, True, False, False]


def test_next_window_resets_counter(r):
    clock = Clock()
    for _ in range(3):
        allow(r, "user:1", 3, 60, now=clock)
    assert allow(r, "user:1", 3, 60, now=clock) is False
    clock.t += 60                                     # jump to the next window, no sleep
    assert allow(r, "user:1", 3, 60, now=clock) is True


def test_subjects_are_independent(r):
    clock = Clock()
    for _ in range(3):
        allow(r, "user:1", 3, 60, now=clock)
    assert allow(r, "user:2", 3, 60, now=clock) is True


def test_counter_key_has_ttl(r):
    clock = Clock()
    allow(r, "user:1", 3, 60, now=clock)
    (key,) = r.keys("myapp:rl:user:1:*")              # KEYS is fine on a test database
    assert 0 < r.ttl(key) <= 60
```

At the API level check the contract as well: status `429`, `Retry-After` / rate-limit headers, and that rejected requests do not change state. For a limit shared by several app instances, run the requests from parallel clients against a real Redis — the total accepted must still equal the limit.

## Testing Locks

```python
# app/jobs.py
import redis


def run_nightly_report(r: redis.Redis, build) -> bool:
    """Run build() on one instance only; return False if another holds the lock."""
    lock = r.lock("myapp:lock:nightly-report", timeout=60, blocking=False)
    if not lock.acquire():
        return False
    try:
        build()
        return True
    finally:
        lock.release()
```

```python
# tests/test_locks.py
import threading

import pytest
import time_machine
from redis.exceptions import LockNotOwnedError

from app.jobs import run_nightly_report


def test_second_instance_skips_while_lock_is_held(r):
    held = r.lock("myapp:lock:nightly-report", timeout=60)
    assert held.acquire(blocking=False)
    calls = []
    assert run_nightly_report(r, lambda: calls.append(1)) is False
    assert calls == []
    held.release()
    assert run_nightly_report(r, lambda: calls.append(1)) is True


def test_lock_is_released_after_failure(r):
    def boom():
        raise RuntimeError("build failed")

    with pytest.raises(RuntimeError):
        run_nightly_report(r, boom)
    assert r.exists("myapp:lock:nightly-report") == 0


def test_only_one_of_many_concurrent_callers_runs(real_r):
    gate = threading.Event()
    ran, skipped = [], []

    def build():
        ran.append(1)
        gate.wait(timeout=5)                          # hold the lock until the others have tried

    def worker():
        start.wait()
        if not run_nightly_report(real_r, build):
            skipped.append(1)
            if len(skipped) == 9:
                gate.set()

    start = threading.Barrier(10)
    threads = [threading.Thread(target=worker) for _ in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert (len(ran), len(skipped)) == (1, 9)


def test_expired_lock_cannot_be_released(fake_r):
    with time_machine.travel(1_700_000_000, tick=False) as traveller:
        lock = fake_r.lock("myapp:lock:x", timeout=5)
        assert lock.acquire(blocking=False)
        traveller.shift(6)                            # the job ran longer than the lock TTL
        other = fake_r.lock("myapp:lock:x", timeout=5)
        assert other.acquire(blocking=False)          # a second worker got in
        with pytest.raises(LockNotOwnedError):
            lock.release()                            # and the first cannot delete its lock
```

- The concurrency test holds the lock with an `Event` until all other callers have tried. Without it a fast `build()` finishes before the next thread starts, several threads "win" one after another, and the test is flaky.
- The last test documents the main lock caveat: a job longer than the TTL loses mutual exclusion. In production code decide what `LockNotOwnedError` in `finally` should mean (alert, not a crash that hides the original error).

## Race Conditions

"Read, change in Python, write back" loses updates when clients run at the same time. A real Redis and threads make it visible:

```python
# tests/test_race.py
from concurrent.futures import ThreadPoolExecutor

import pytest
import redis


def add_credit_naive(r: redis.Redis, key: str) -> None:
    value = int(r.get(key) or 0)                      # read
    r.set(key, value + 1)                             # write: another client may have written in between


def add_credit_atomic(r: redis.Redis, key: str) -> None:
    r.incr(key)


@pytest.mark.parametrize("fn", [add_credit_atomic])  # add add_credit_naive to see it fail
def test_concurrent_increments_are_not_lost(real_r, fn):
    with ThreadPoolExecutor(max_workers=16) as pool:
        for _ in range(500):
            pool.submit(fn, real_r, "myapp:credits:42")
    assert int(real_r.get("myapp:credits:42")) == 500
```

With `add_credit_naive` the test failed on every run: only 54–56 of 500 increments survived. Fix such code with atomic commands (`INCR`, `HINCRBY`, `SET NX`, `ZADD GT`), `WATCH` / `MULTI`, or a Lua script ([03](./03-patterns.md#transactions-multi-exec-watch)).

Where to look for races in code that uses Redis:

- Check-then-act: `if not r.exists(key): r.set(key, ...)` → `SET ... NX`.
- Read-modify-write of JSON blobs: two requests update different fields, one change disappears → hash fields or a script.
- Cache invalidation vs a slow reader: reader loads the old row, writer commits and deletes, reader writes the old row back. Reproduce it by pausing the loader with an `Event`, the same way as in the lock test.

## Pub/Sub and Streams

```python
# tests/test_pubsub_streams.py
import json
import time


def next_message(p, timeout=1.0):
    deadline = time.monotonic() + timeout
    while (left := deadline - time.monotonic()) > 0:
        if (msg := p.get_message(ignore_subscribe_messages=True, timeout=left)) is not None:
            return msg
    return None


def test_order_created_event_is_published(r):
    p = r.pubsub()
    p.subscribe("myapp:events:orders")                # subscribe BEFORE the action
    try:
        r.publish("myapp:events:orders", json.dumps({"type": "created", "id": 7}))   # the code under test
        msg = next_message(p)
        assert msg is not None, "no event within 1 s"
        assert json.loads(msg["data"]) == {"type": "created", "id": 7}
    finally:
        p.close()


def test_unacked_entry_is_redelivered(r):
    r.xgroup_create("myapp:orders", "billing", id="0", mkstream=True)
    r.xadd("myapp:orders", {"order_id": "1"})
    [[_, [(entry_id, _)]]] = r.xreadgroup("billing", "worker-1", {"myapp:orders": ">"})
    # worker-1 "crashes" before XACK
    assert r.xpending("myapp:orders", "billing")["pending"] == 1
    _, claimed, _ = r.xautoclaim("myapp:orders", "billing", "worker-2", min_idle_time=0)
    assert [eid for eid, _ in claimed] == [entry_id]
    r.xack("myapp:orders", "billing", entry_id)
    assert r.xpending("myapp:orders", "billing")["pending"] == 0
```

Pub/Sub messages sent before `subscribe()` are gone — a test that subscribes after triggering the action fails randomly. `min_idle_time=0` claims at once; production code uses a real idle threshold.

## Failure Modes

```python
# app/profile.py
import logging

import redis

log = logging.getLogger(__name__)


def cached_greeting(r: redis.Redis, user_id: int) -> str:
    try:
        if (hit := r.get(f"myapp:greeting:{user_id}")) is not None:
            return hit
    except redis.RedisError:
        log.warning("redis unavailable, serving without cache")
    return f"Hello, user {user_id}"
```

```python
# tests/test_outage.py
import fakeredis

from app.profile import cached_greeting


def test_redis_outage_is_a_cache_miss(caplog):
    server = fakeredis.FakeServer()
    r = fakeredis.FakeRedis(server=server, decode_responses=True)
    server.connected = False                          # every command now raises ConnectionError
    assert cached_greeting(r, 42) == "Hello, user 42"
    assert "redis unavailable" in caplog.text
```

With a real server, test outages with `docker pause` / `docker stop` on the container or a client pointed at a closed port with short timeouts. Measure how long a request takes while Redis is down: with redis-py 8.1 defaults (5 s timeouts, 10 retries) a single `ping()` to a closed port needed about 4.5 s — see [04 — Timeouts & Retries](./04-python-redis-py.md#timeouts-retries).

## Common Pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| `FLUSHALL` in a fixture | Other workers, teams or environments lose data | `FLUSHDB` on a dedicated database; ACL `-flushall` for test users |
| Test URL falls back to a shared or production Redis | Tests delete real data | Guard in the fixture; separate env variable for tests |
| `decode_responses` differs between app and test | `b'1' != '1'` failures | One client factory for app and tests |
| Tests pass on fakeredis only | Unknown command, different reply, no Lua | Run the same tests on a real Redis in CI |
| `time_machine` with a real Redis | TTL does not move | Server clock: assert TTL or use short TTLs + polling |
| `time.sleep(ttl)` | Slow, flaky suite | Assert TTL, delete the key, fake or inject the clock |
| Pub/Sub subscribe after the action | Random "no message" | Subscribe first; poll with a deadline |
| One `get_message()` call | Returns `None` (it read the subscribe confirmation) | Loop until a deadline |
| Fixed key names under xdist | Collisions between workers | Database or prefix per worker |
| Leaked clients / pools | `ResourceWarning`, "Too many connections" | `close()` / `aclose()` in fixture teardown |
| Lock tests with a fast job | Flaky "exactly one ran" | Hold the lock with an `Event` until the others tried |
| Code creates its client at import time | Cannot inject a fake | Dependency injection or a factory function |
| `db=` with a URL that has `/0` | Tests run in db 0, next to dev data | Base URL without a path, or put the db in the URL |
| Blocking read longer than `socket_timeout` | `TimeoutError` after a long retry loop | `socket_timeout=None` or larger than the block time for workers |

## Checklist

- [ ] Every cache key has a TTL test; every write path has an invalidation test
- [ ] TTL and window logic tested without `sleep` (TTL asserts, fake or injected clock)
- [ ] Rate limiter tested at the limit, over it, at a window change and per subject
- [ ] Locks tested for contention, release on failure and expiry
- [ ] Concurrency tests on a real Redis for counters and check-then-act code
- [ ] Redis outage and slow Redis tested: timeouts set, app degrades instead of hanging
- [ ] Pub/Sub tests subscribe before the action; stream tests cover redelivery of unacked entries

---
## See also
- [Redis — Testing Setup & Isolation](./06-testing-setup-isolation.md)
- [Redis — Patterns](./03-patterns.md)
- [Redis — Python Client (redis-py)](./04-python-redis-py.md)
- [Pytest Playbook — Flakiness Debugging](../../libs/pytest/02-practical-playbooks/03-flakiness-debugging.md)
- [Performance Testing](../../performance-testing/index.md)
