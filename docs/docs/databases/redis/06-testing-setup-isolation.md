---
date: 2026-09-30
tags:
  - databases
  - redis
  - python
  - pytest
  - testing
  - docker
---

# Redis — Testing Setup & Isolation

Code that uses Redis has bugs of its own: missing TTLs, stale cache after an update, off-by-one limits, locks that are never released, lost updates under concurrency. Test it at three levels:

| Level | Backend | Catches | Speed |
|-------|---------|---------|-------|
| Unit | fakeredis (in-process) | Logic: keys, TTLs, invalidation, limits, lock handling | Milliseconds, no Docker |
| Integration | Real Redis in Docker (testcontainers or a CI service) | Real command semantics, Lua, timeouts, concurrency, server version differences | Seconds for the container, then fast |
| Environment smoke | The same topology as production (Cluster, Sentinel, managed service, ACL user) | `CROSSSLOT`, `NOPERM`, TLS, failover behaviour | Slow, run on schedule or before release |

Examples were run with redis-py 8.1.0, fakeredis 2.38.0 (with the `lua` extra, lupa 2.8), testcontainers 4.15.0, pytest 9.1.1, pytest-xdist 3.8.0, pytest-asyncio 1.4.0, time-machine 3.5.1 and Redis 8.10.2. This page sets up the fixtures; [07 — Testing Recipes](./07-testing-recipes.md) uses them to test caches, TTLs, rate limiters, locks, races and outages.

```bash
uv add redis
uv add --dev pytest pytest-xdist pytest-asyncio "fakeredis[lua]" "testcontainers[redis]" time-machine
```

## fakeredis or a Real Redis?

| | fakeredis | Real Redis (Docker) |
|--|-----------|---------------------|
| Setup | `pip install`, no Docker | Docker locally and in CI |
| Speed | Fastest; a new empty server per test is free | One container per session; `FLUSHDB` between tests |
| Command coverage | Most commands, including streams, hash field TTL, JSON; some newer or rare commands are missing | Everything, exactly as the server version behaves |
| Lua (`EVAL`, redis-py `Lock`) | Only with `fakeredis[lua]` — without it `unknown command 'evalsha'` | Yes |
| Time | Uses the Python clock — `time-machine` / `freezegun` can move TTLs forward | Server clock — you cannot move it from the test |
| Several processes (xdist, app in another container) | No — state lives in one Python process | Yes |
| Timeouts, network errors, memory limits, ACL, Cluster | Simulated at best (`server.connected = False`) | Real |

Use both: fakeredis for the bulk of logic tests, and run the same tests (plus concurrency, Lua and failure tests) against a real Redis. The `r` fixture below does exactly that.

## Fixtures

```python
# tests/conftest.py
import os
from urllib.parse import urlparse

import fakeredis
import pytest
import redis


# --- fast: in-process fake ------------------------------------------------
@pytest.fixture
def fake_r():
    r = fakeredis.FakeRedis(decode_responses=True)   # new empty server for every test
    yield r
    r.close()


# --- real Redis: shared server from REDIS_URL, or one container per session --
@pytest.fixture(scope="session")
def redis_base_url():
    if url := os.getenv("REDIS_URL"):                # CI service / docker compose
        yield url
        return
    from testcontainers.community.redis import RedisContainer

    with RedisContainer("redis:8") as container:
        host = container.get_container_host_ip()
        port = container.get_exposed_port(6379)
        yield f"redis://{host}:{port}"


@pytest.fixture(scope="session")
def redis_db() -> int:
    # xdist sets PYTEST_XDIST_WORKER=gw0, gw1, ...; db 0 stays for manual work
    worker = os.getenv("PYTEST_XDIST_WORKER", "gw0")
    return int(worker.removeprefix("gw")) + 1


@pytest.fixture
def real_r(redis_base_url, redis_db):
    host = urlparse(redis_base_url).hostname
    if host not in {"localhost", "127.0.0.1", "::1"} and os.getenv("REDIS_TEST_ALLOW_FLUSH") != "1":
        pytest.fail(f"refusing to FLUSHDB on {host}; set REDIS_TEST_ALLOW_FLUSH=1 for a dedicated test server")
    r = redis.Redis.from_url(redis_base_url, db=redis_db, decode_responses=True)
    r.flushdb()                                      # this db only, never FLUSHALL
    yield r
    r.flushdb()
    r.close()


@pytest.fixture(params=["fake", pytest.param("real", marks=pytest.mark.integration)])
def r(request):
    """Run a test against both backends: pytest -m 'not integration' for the fast set."""
    return request.getfixturevalue(f"{request.param}_r")
```

```toml
# pyproject.toml
[tool.pytest.ini_options]
pythonpath = ["."]
markers = ["integration: needs a real Redis (Docker or REDIS_URL)"]
```

```bash
uv run pytest -m "not integration"                  # fakeredis only, no Docker
uv run pytest                                       # both; starts redis:8 via testcontainers
REDIS_URL=redis://localhost:6379 uv run pytest      # use an already running Redis
```

Notes on the fixtures:

- `fakeredis.FakeRedis()` without `host` / `server` gets a **new, empty** server each time. Instances with the same `host` and `port`, or the same `server=fakeredis.FakeServer()`, share data — use that when the code under test creates its own client.
- The redis base URL has no database path on purpose: `from_url(".../0", db=3)` would still connect to db 0 (the URL wins).
- `testcontainers.redis` still works in 4.15 but is deprecated in favour of `testcontainers.community.redis`. `RedisContainer` also takes `password=`.
- A session-scoped container and `FLUSHDB` per test is much faster than a container per test.

## Getting the Fake into the Code

Pass the client in (function argument, constructor, framework dependency) — then tests need no patching. With FastAPI, override the dependency:

```python
# app/main.py
from functools import lru_cache
from typing import Annotated

import redis
from fastapi import Depends, FastAPI


@lru_cache
def get_redis() -> redis.Redis:
    return redis.Redis.from_url("redis://localhost:6379/0", decode_responses=True)


app = FastAPI()


@app.post("/login-attempts/{user}")
def login_attempt(user: str, r: Annotated[redis.Redis, Depends(get_redis)]) -> dict:
    attempts = r.incr(f"myapp:login:{user}")
    r.expire(f"myapp:login:{user}", 900, nx=True)
    return {"attempts": attempts, "locked": attempts > 5}
```

```python
# tests/test_api.py
import fakeredis
import pytest
from fastapi.testclient import TestClient

from app.main import app, get_redis


@pytest.fixture
def client():
    fake = fakeredis.FakeRedis(decode_responses=True)
    app.dependency_overrides[get_redis] = lambda: fake
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_sixth_attempt_locks_the_account(client):
    for _ in range(5):
        assert client.post("/login-attempts/ann").json()["locked"] is False
    assert client.post("/login-attempts/ann").json() == {"attempts": 6, "locked": True}
```

If the code builds a client at import time (`r = redis.Redis(...)` in a module), `monkeypatch.setattr("app.cache.r", fake)` works, but it is a sign to refactor.

## Isolation: FLUSHDB, Never FLUSHALL

| Approach | When | How |
|----------|------|-----|
| Fresh fakeredis per test | Unit tests | `FakeRedis()` in a function fixture |
| Dedicated server, `FLUSHDB` per test | Container or local Redis owned by the test run | `real_r` above |
| Database per xdist worker | Several workers on one server | `redis_db` above: gw0 → db 1, gw1 → db 2 |
| Key prefix per test, delete by prefix | Shared server you do not own (staging), Redis Cluster (db 0 only) | `key_prefix` fixture below |

`FLUSHALL` deletes **every database on the server**. In a shared environment that means other xdist workers' data mid-test (random failures), other teams' test data, sessions and queued jobs of the environment itself, and a developer's local data in db 0. `FLUSHDB` removes only the selected database — still only on a server or database that belongs to the tests.

Guards that make accidents unlikely:

- Refuse to flush a non-local host unless an explicit variable says it is a test server (the `real_r` fixture does this).
- Give the test user an ACL without `FLUSHALL` (`ACL SETUSER tests ... -flushall`) on shared servers — a mistake becomes `NOPERM`, not an outage.
- Never read the Redis URL for tests from the same variable production uses without a check — a `.env` file pointing to production plus a `flushdb` fixture is a real incident pattern.

On a server you cannot flush, give each test its own prefix and delete only those keys:

```python
# tests/test_prefix.py
import os
import uuid

import pytest
import redis


@pytest.fixture(scope="session")
def shared_r():
    url = os.getenv("SHARED_REDIS_URL") or pytest.skip("SHARED_REDIS_URL not set")
    r = redis.Redis.from_url(url, decode_responses=True)   # no FLUSHDB on this server
    yield r
    r.close()


@pytest.fixture
def key_prefix(shared_r):
    prefix = f"test:{uuid.uuid4().hex[:8]}:"
    yield prefix
    for key in shared_r.scan_iter(match=f"{prefix}*", count=1000):   # delete only what this test created
        shared_r.unlink(key)


def test_prefix_cleanup(shared_r, key_prefix):
    shared_r.set(f"{key_prefix}myapp:user:1", "x", ex=3600)   # TTL: a safety net if teardown never runs
    assert shared_r.exists(f"{key_prefix}myapp:user:1") == 1
```

This works only if the code under test takes the prefix from configuration — another reason to build keys in one helper (`user_key()`).

## Parallel Tests with pytest-xdist

```bash
uv run pytest -n auto                                    # each worker: its own testcontainers Redis
REDIS_URL=redis://localhost:6379 uv run pytest -n 4      # one server: gw0 → db 1 … gw3 → db 4
```

| Setup | Isolation | Notes |
|-------|-----------|-------|
| Container per worker (session fixture) | Full | More memory and startup time; each worker starts `redis:8` once |
| One server, database per worker | Per worker | Needs `databases` ≥ workers + 1 (16 by default); not available on Cluster or many managed services |
| One server, key prefix per worker / test | Per prefix | Works everywhere; the app must take the prefix from config; clean up by `SCAN` + `UNLINK` |
| fakeredis | Per test | Each worker is a separate process with its own fakes |

What breaks under xdist: a `FLUSHALL` or a `FLUSHDB` on a shared database in one worker deletes data of another; fixed key names (`myapp:lock:report`) collide between workers on one database; tests that count keys (`DBSIZE`, `KEYS *`) see other workers' keys.

## Async Code

```python
# tests/test_async.py
import fakeredis
import pytest
import pytest_asyncio
import redis.asyncio as aioredis


async def get_or_set(r: aioredis.Redis, key: str, value: str) -> str:
    return await r.set(key, value, nx=True, get=True) or value   # SET NX GET: Redis 7.0+


@pytest_asyncio.fixture
async def async_r():
    r = fakeredis.FakeAsyncRedis(decode_responses=True)
    yield r
    await r.aclose()


@pytest.mark.asyncio
async def test_first_writer_wins(async_r):
    assert await get_or_set(async_r, "myapp:k", "a") == "a"
    assert await get_or_set(async_r, "myapp:k", "b") == "a"
```

With pytest-asyncio in the default strict mode an `async def` fixture needs `@pytest_asyncio.fixture` — a plain `@pytest.fixture` fails with "requested an async fixture ... with no plugin or hook that handled it". For a real server create `redis.asyncio.Redis` inside the async fixture, never at import time.

## CI

```yaml
# .github/workflows/tests.yml (fragment)
jobs:
  tests:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:8.10                       # same major/minor as production
        ports: ["6379:6379"]
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s --health-timeout 3s --health-retries 10
    env:
      REDIS_URL: redis://localhost:6379
    steps:
      - uses: actions/checkout@v7
      - uses: astral-sh/setup-uv@v10
      - run: uv run pytest -n 4 --junitxml=report.xml
```

With `REDIS_URL` set, the fixtures skip testcontainers and use the service container with a database per worker. If production runs Valkey or a specific managed version, use that image here.

## Checklist

- [ ] Redis client is injected (argument, factory or dependency), not created at import time
- [ ] Unit tests run on fakeredis (`fakeredis[lua]` if the code uses Lua or `Lock`)
- [ ] The same tests run against a real Redis of the production version in CI
- [ ] Tests use `FLUSHDB` on a dedicated database or key prefixes — never `FLUSHALL` on a shared server
- [ ] Fixtures refuse to flush non-test hosts
- [ ] Parallel runs isolated per worker (database, prefix or container)
- [ ] Async clients are created and closed inside async fixtures

---
## See also
- [Redis — Overview](./index.md)
- [Redis — Testing Recipes](./07-testing-recipes.md)
- [Redis — Python Client (redis-py)](./04-python-redis-py.md)
- [Pytest — Python Testing Framework](../../libs/pytest/index.md)
- [Mocking & Test Isolation](../../test-automation-framework/06-execution-reliability/03-mocking-isolation.md)
- [Test Environment Design](../../test-design-patterns/05-data-mocking-env/03-environment-design.md)
