---
date: 2026-09-30
tags:
  - databases
  - redis
  - python
  - libraries
---

# Redis — Python Client (redis-py)

`redis-py` (package `redis`) is the official Python client. It has a sync API (`redis.Redis`) and an asyncio API (`redis.asyncio.Redis`) with the same method names, plus `RedisCluster` and `Sentinel` clients. It works with Valkey too.

```bash
uv add redis                     # pure Python
uv add "redis[hiredis]"          # optional C parser, faster on large replies
uv run python -c "import importlib.metadata as m; print(m.version('redis'))"
```

Examples below were run with **redis-py 8.1.0** against Redis 8.10.2. Default values mentioned on this page are from that version — they have changed between major releases, so check yours with `redis.Redis().connection_pool.connection_kwargs`.

## Connecting

```python
import redis

r = redis.Redis(host="localhost", port=6379, db=0, decode_responses=True)
r = redis.Redis.from_url("redis://localhost:6379/0", decode_responses=True)
r = redis.Redis.from_url("redis://app:secret@redis.internal:6379/2")   # ACL user + password, db 2
r = redis.Redis.from_url("rediss://cache.example.com:6380/0")          # rediss = TLS
r = redis.Redis(unix_socket_path="/run/redis/redis.sock")

r.ping()                          # True, or raises ConnectionError
```

!!! warning "The database in the URL wins"
    `Redis.from_url("redis://localhost:6379/0", db=3)` connects to database **0** — the path of the URL overrides the `db=` argument. Build the URL with the database you need, or leave the path out.

### Bytes or `str`: `decode_responses`

```python
raw = redis.Redis()                                   # decode_responses=False (default)
raw.set("myapp:name", "Ann")
raw.get("myapp:name")                                 # b'Ann'

text = redis.Redis(decode_responses=True)
text.get("myapp:name")                                # 'Ann'
text.hgetall("user:42")                               # {'name': 'Ann', 'visits': '1'} — numbers come back as str
```

- Use `decode_responses=True` for text data — tests read better and you do not compare `b'...'` with `'...'`.
- Keep a separate client without decoding for binary values (pickles, compressed blobs, images): decoding them as UTF-8 fails.
- Values you send can be `str`, `bytes`, `int` or `float`. `None`, `bool`, `dict` and `list` raise `DataError` — serialize them yourself:

```python
import json

r.set("myapp:user:1", json.dumps({"id": 1, "tags": ["qa"]}), ex=60)
json.loads(r.get("myapp:user:1"))                     # {'id': 1, 'tags': ['qa']}
r.set("myapp:bad", {"id": 1})                         # DataError: ... must be str, int, float or bytes
```

## Connection Pools

Each `Redis` object owns a `ConnectionPool`; a connection is taken from the pool for every command and returned after it. A `Redis` client can be shared between threads; `PubSub` and `Pipeline` objects cannot — create one per thread.

```python
pool = redis.ConnectionPool.from_url("redis://localhost:6379/0", max_connections=20, decode_responses=True)
r1 = redis.Redis(connection_pool=pool)
r2 = redis.Redis(connection_pool=pool)                # shares the 20 connections

blocking = redis.BlockingConnectionPool.from_url(
    "redis://localhost:6379/0", max_connections=20, timeout=5,    # wait up to 5 s for a free connection
)
```

| Rule | Why |
|------|-----|
| Create one client (or pool) per process and reuse it | A new client per request opens a new TCP connection every time |
| Know what happens when the pool is full | `ConnectionPool` raises `MaxConnectionsError: Too many connections`; `BlockingConnectionPool` waits `timeout` seconds, then raises `ConnectionError` |
| Close clients you created | `r.close()` / `await r.aclose()` — in tests too, otherwise you get `ResourceWarning`s and leaked sockets |

## Timeouts & Retries

```python
from redis.backoff import ExponentialWithJitterBackoff
from redis.exceptions import ConnectionError, TimeoutError
from redis.retry import Retry

r = redis.Redis(
    host="localhost",
    port=6379,
    decode_responses=True,
    socket_connect_timeout=2,         # TCP connect
    socket_timeout=2,                 # waiting for a reply to any command
    retry=Retry(ExponentialWithJitterBackoff(base=0.05, cap=1.0), retries=3),
    health_check_interval=30,         # PING a connection idle for 30 s before using it
    client_name="orders-api",         # shows up in CLIENT LIST
)
```

In redis-py 8.1 the defaults are `socket_timeout=5`, `socket_connect_timeout=5` and a `Retry` with **10 retries** (`ExponentialWithJitterBackoff`, base 10 ms, cap 1 s) on `ConnectionError` and `TimeoutError`. Consequences worth testing:

- With the server down, a default client needed about **4.5 s** to raise `ConnectionError` for one `ping()`. For a cache in the request path that is too long: set short timeouts and fewer retries, then fall back to the database.
- Blocking commands must fit inside `socket_timeout`: with defaults, `r.blpop("q", timeout=6)` raised `TimeoutError: Timeout reading from socket` after **about 60 s** (5 s timeout, retried). For workers use `socket_timeout=None` or a value above the block time.
- Retrying is safe for reads and for idempotent writes (`SET`). A retried `INCR` or `RPUSH` may apply twice if the first attempt reached the server and only the reply was lost.

```python
def get_cached(r: redis.Redis, key: str) -> str | None:
    try:
        return r.get(key)
    except (ConnectionError, TimeoutError):
        return None                   # treat Redis outage as a cache miss; log / count it
```

Exception tree: everything inherits from `redis.RedisError`. `ConnectionError`, `TimeoutError`, `ResponseError` (server error such as `WRONGTYPE`), `OutOfMemoryError` (subclass of `ResponseError`), `DataError`, `WatchError`, `LockError` / `LockNotOwnedError`, `NoScriptError`.

## Commands in Python

Method names follow commands; options are keyword arguments.

```python
r.set("myapp:session:abc", "{}", ex=1800)             # SET ... EX 1800
r.set("myapp:lock:job", "t1", nx=True, px=30_000)     # True, or None if the key exists
r.set("myapp:k", "v", keepttl=True)
r.expire("myapp:k", 60, nx=True)
r.getex("myapp:session:abc", ex=1800)

r.hset("myapp:user:42", mapping={"name": "Ann", "visits": 0})
r.hincrby("myapp:user:42", "visits", 1)
r.zadd("myapp:lb", {"ann": 100, "bob": 250})
r.zrange("myapp:lb", 0, 9, desc=True, withscores=True)   # [('bob', 250.0), ('ann', 100.0)]

for key in r.scan_iter(match="myapp:user:*", count=500):  # SCAN, not KEYS
    ...

r.execute_command("OBJECT", "ENCODING", "myapp:lb")       # any command without a helper
```

## Pipelines & Transactions

```python
with r.pipeline() as pipe:                            # MULTI/EXEC
    pipe.incr("myapp:orders:count")
    pipe.expire("myapp:orders:count", 3600)
    count, _ = pipe.execute()

with r.pipeline(transaction=False) as pipe:           # batching only
    for i in range(1000):
        pipe.get(f"myapp:item:{i}")
    values = pipe.execute()
```

Commands in a pipeline return the pipeline, not a result — results come only from `execute()`. `WATCH` and Lua are covered in [03](./03-patterns.md#transactions-multi-exec-watch).

## Pub/Sub

```python
import time


def next_message(p, timeout: float = 1.0) -> dict | None:
    deadline = time.monotonic() + timeout
    while (left := deadline - time.monotonic()) > 0:
        msg = p.get_message(ignore_subscribe_messages=True, timeout=left)
        if msg is not None:
            return msg
    return None


p = r.pubsub()
p.subscribe("myapp:events")
r.publish("myapp:events", '{"id": 1}')
next_message(p)          # {'type': 'message', 'pattern': None, 'channel': 'myapp:events', 'data': '{"id": 1}'}
p.close()
```

A single `get_message(timeout=1)` right after `subscribe()` returned `None`: it read the subscribe confirmation, skipped it and returned. Loop until the deadline, as above — the same applies in tests.

## Streams: a Worker Loop

```python
import redis

r = redis.Redis(decode_responses=True, socket_timeout=None)   # BLOCK longer than the default socket timeout
STREAM, GROUP, CONSUMER = "myapp:orders", "billing", "worker-1"

try:
    r.xgroup_create(STREAM, GROUP, id="0", mkstream=True)
except redis.ResponseError as exc:
    if "BUSYGROUP" not in str(exc):                            # group already exists
        raise

while True:
    # 1. new entries (">" = never delivered to this group)
    for stream, entries in r.xreadgroup(GROUP, CONSUMER, {STREAM: ">"}, count=10, block=5000) or []:
        for entry_id, fields in entries:
            handle(fields)                                     # must be idempotent
            r.xack(STREAM, GROUP, entry_id)
    # 2. entries delivered earlier but never acked (a crashed consumer, or this one before a restart)
    _, claimed, _ = r.xautoclaim(STREAM, GROUP, CONSUMER, min_idle_time=60_000, count=10)
    for entry_id, fields in claimed:
        handle(fields)
        r.xack(STREAM, GROUP, entry_id)
```

## Locks

```python
with r.lock("myapp:lock:import", timeout=30, blocking_timeout=5):
    run_import()
```

Details and caveats: [03 — Distributed Locks](./03-patterns.md#distributed-locks).

## asyncio

```python
import asyncio

import redis.asyncio as aioredis


async def main() -> None:
    pool = aioredis.BlockingConnectionPool.from_url(
        "redis://localhost:6379/0", max_connections=10, timeout=5, decode_responses=True,
    )
    r = aioredis.Redis.from_pool(pool)               # the client owns the pool and closes it
    try:
        await r.set("myapp:a", "1", ex=60)
        hits = await asyncio.gather(*(r.incr("myapp:hits") for _ in range(100)))
        print(max(hits))                              # 100

        async with r.pipeline(transaction=True) as pipe:
            pipe.incr("myapp:n")
            pipe.expire("myapp:n", 60)
            await pipe.execute()                      # [1, True]

        async with r.pubsub() as ps:
            await ps.subscribe("myapp:ch")
            await r.publish("myapp:ch", "hi")

        async with r.lock("myapp:lock:a", timeout=10):
            ...
    finally:
        await r.aclose()


asyncio.run(main())
```

- `gather()` of 100 commands on `aioredis.Redis.from_url(..., max_connections=10)` failed with `MaxConnectionsError: Too many connections` — the plain async pool does not wait. Use `BlockingConnectionPool` or limit concurrency with a semaphore.
- `Redis(connection_pool=pool)` does **not** close a pool you passed in; `Redis.from_pool(pool)` does.
- Create async clients inside the running event loop (app startup, an async fixture), not at import time — a client bound to a closed loop fails in the next test.

## RESP3, Cluster and Sentinel

```python
r3 = redis.Redis(protocol=3, decode_responses=True)   # RESP3 protocol: typed replies (maps, sets, push messages)

from redis.sentinel import Sentinel
sentinel = Sentinel([("sentinel-1", 26379), ("sentinel-2", 26379)], socket_timeout=1)
primary = sentinel.master_for("mymaster", decode_responses=True)    # follows failover
replica = sentinel.slave_for("mymaster", decode_responses=True)     # read-only traffic

from redis.cluster import RedisCluster
rc = RedisCluster.from_url("redis://node-1:6379", decode_responses=True)   # discovers the other nodes
```

Tracing: `opentelemetry-instrumentation-redis` creates a client span per command — see [OpenTelemetry — Auto-Instrumentation](../../libs/opentelemetry/04-auto-instrumentation.md).

---
## See also
- [Redis — Overview](./index.md)
- [Redis — Patterns](./03-patterns.md)
- [Redis — Testing Setup & Isolation](./06-testing-setup-isolation.md)
- [FastAPI — Modern Async Web Framework](../../libs/fastapi/index.md)
- [SQLAlchemy — Python ORM & SQL Toolkit](../../libs/sqlalchemy/index.md)
