---
date: 2026-10-02
tags:
  - python
  - libraries
  - resilience
  - reliability
  - databases
  - testing
---

# Resilience — Race Conditions

A race condition is a bug whose result depends on **timing**: two threads, tasks, processes or transactions touch the same state, and the outcome depends on who gets there first. Retries make races more likely (the same operation runs twice), concurrency limits make them less visible (fewer collisions in tests), and production traffic finds them anyway. Every race on this page was reproduced on Python 3.14.8 — and on the free-threaded build where noted — and every fix was checked to remove it.

## What the GIL Does and Does Not Protect

In the default CPython build the Global Interpreter Lock lets only one thread run Python bytecode at a time. It keeps the interpreter's own data consistent: a single `list.append()` or `d[key] = value` from several threads does not corrupt the list or dict. It does **not** make a sequence of steps atomic — and almost every real update is a sequence.

```python
import sys
import threading

N, THREADS = 1_000_000, 4
counter = 0
lock = threading.Lock()


def plus_one(value: int) -> int:
    return value + 1


def increment() -> None:
    global counter
    for _ in range(N):
        counter += 1                            # load, add, store


def increment_via_call() -> None:
    global counter
    for _ in range(N):
        counter = plus_one(counter)             # a function call between read and write


def increment_locked() -> None:
    global counter
    for _ in range(N):
        with lock:
            counter += 1


for target in (increment, increment_via_call, increment_locked):
    counter = 0
    threads = [threading.Thread(target=target) for _ in range(THREADS)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    print(f"{target.__name__:20} {counter:>9,} of {N * THREADS:,}  (GIL enabled: {sys._is_gil_enabled()})")
```

| Function | Python 3.14.8 (GIL) | Python 3.14.8t (free-threaded) |
|----------|---------------------|--------------------------------|
| `increment` — `counter += 1` | 4,000,000 | 1,446,987 |
| `increment_via_call` | 2,192,396 | 1,343,934 |
| `increment_locked` | 4,000,000 | 4,000,000 |

- With the GIL, the bare `counter += 1` loop gave the right answer in every run — current CPython only switches threads at certain points (calls, loop jumps), and none falls between this load and store. That is an **implementation detail**, not a promise: add a function call between read and write and 45 % of the updates disappear, and on the free-threaded build the plain `+=` loses about two thirds.
- The same applies to every **read-modify-write** (`balance -= amount`, `self.count = self.count + 1`, `cache[k] = cache.get(k, 0) + 1`) and every **check-then-act** (`if key not in cache: cache[key] = load()`).
- Iterating over a dict while another thread adds keys fails with `RuntimeError: dictionary changed size during iteration` on both builds; iterate over a copy (`list(d.items())`) or hold a lock for the whole loop.

Check-then-act with a pause between the check and the write — any log call, DB read or HTTP call — is the common shape in real code:

```python
# app/inventory.py
import asyncio
import threading
from collections.abc import Callable


def _no_pause() -> None:
    pass


class Inventory:
    """Racy on purpose: check-then-act with a pause between the check and the write."""

    def __init__(self, stock: int, pause: Callable[[], None] = _no_pause) -> None:
        self.stock = stock
        self.sold = 0
        self._pause = pause                      # stands in for a log call, DB read, HTTP call

    def buy(self) -> bool:
        if self.stock > 0:                       # check
            self._pause()
            self.stock -= 1                      # act
            self.sold += 1
            return True
        return False


class SafeInventory(Inventory):
    def __init__(self, stock: int, pause: Callable[[], None] = _no_pause) -> None:
        super().__init__(stock, pause)
        self._lock = threading.Lock()

    def buy(self) -> bool:
        with self._lock:                         # check and act are one step for other threads
            return super().buy()


class Wallet:
    def __init__(self, balance: int) -> None:
        self.balance = balance
        self._lock = asyncio.Lock()

    async def withdraw_racy(self, amount: int) -> bool:
        if self.balance >= amount:
            await asyncio.sleep(0)               # any await: DB call, HTTP call, log shipping
            self.balance -= amount
            return True
        return False

    async def withdraw(self, amount: int) -> bool:
        async with self._lock:
            return await self.withdraw_racy(amount)
```

```python
import threading
import time

from app.inventory import Inventory, SafeInventory


def run_threads(target, threads: int = 8, calls: int = 200) -> None:
    workers = [threading.Thread(target=lambda: [target() for _ in range(calls)]) for _ in range(threads)]
    for w in workers:
        w.start()
    for w in workers:
        w.join()


for cls in (Inventory, SafeInventory):
    inventory = cls(stock=1000, pause=lambda: time.sleep(0))   # sleep(0) releases the GIL
    run_threads(inventory.buy)
    print(cls.__name__, "stock", inventory.stock, "sold", inventory.sold)
# Inventory stock -7 sold 1007
# SafeInventory stock 0 sold 1000
```

Eight threads all passed the check for the last item: 1007 sales of 1000 items. The lock makes "check and act" one step for other threads; the race is gone.

## Free-Threaded Python

Python 3.13 added an **experimental** build without the GIL (PEP 703, executable `python3.13t`); in Python 3.14 the free-threaded build is **officially supported** (PEP 779) but still a separate, optional build — the default `python3.14` keeps the GIL.

```bash
uv python install 3.14t
uv run --python 3.14t python -c "import sys; print(sys._is_gil_enabled())"    # False
```

- `sys._is_gil_enabled()` tells which mode the process runs in. The GIL comes back if you start with `-X gil=1` or `PYTHON_GIL=1`, and it is re-enabled automatically (with a warning) when an extension module that does not declare free-threading support is imported.
- Built-in containers (`dict`, `list`, `set`) use internal locks, so single operations stay safe; compound operations race far more often than with the GIL, as the table above shows.
- Code that is correct with explicit locks, queues and atomic database operations is correct on both builds. Code that "worked" because of the GIL is the code to test first: run the race tests on a `3.14t` CI job.
- Not every package ships free-threaded wheels yet (in this check `psycopg-binary` had none for `cp314t`); the test suite skipped those tests with `pytest.importorskip`.

## Races in asyncio

asyncio runs all tasks in **one thread** and switches only at `await`. The code between two awaits is never interrupted by another task — but any `await` between a check and an act is a gap:

```python
import asyncio

from app.inventory import Wallet


async def main() -> None:
    wallet = Wallet(balance=100)
    print(await asyncio.gather(wallet.withdraw_racy(80), wallet.withdraw_racy(80)), wallet.balance)
    # [True, True] -60

    wallet = Wallet(balance=100)
    print(await asyncio.gather(wallet.withdraw(80), wallet.withdraw(80)), wallet.balance)
    # [True, False] 20


asyncio.run(main())
```

- Both tasks passed `balance >= amount` before either subtracted: `await asyncio.sleep(0)` stands in for an awaited DB call, HTTP call or log shipping.
- `asyncio.Lock` closes the gap. It works only inside one event loop and is **not** thread-safe; to share state with threads use `threading.Lock` (briefly, without awaiting inside) or `loop.call_soon_threadsafe`.
- Keep locked sections short. A lock held across a slow `await` serialises every caller behind the slowest call.
- Mutating a shared dict or list between awaits is safe; the danger is reading it, awaiting, then acting on what you read.

## Locks, Conditions and Events

| Need | `threading` | `asyncio` |
|------|-------------|-----------|
| Mutual exclusion | `Lock` | `Lock` |
| Re-entrant lock (same owner may acquire again) | `RLock` | — (restructure the code) |
| Wait until a condition on shared state holds | `Condition` (`wait_for(predicate, timeout)`) | `Condition` |
| One-way signal ("ready", "stop") | `Event` | `Event` |
| N at a time | `Semaphore`, `BoundedSemaphore` | `Semaphore`, `BoundedSemaphore` ([04](./04-semaphores-rate-limits.md)) |
| Wait until N parties arrive | `Barrier` | `Barrier` (Python 3.11+) |

```python
import threading


class Cache:
    def __init__(self) -> None:
        self._lock = threading.RLock()               # re-entrant: the same thread may enter again
        self._data: dict[str, str] = {}

    def get_or_load(self, key: str) -> str:
        with self._lock:
            if key not in self._data:
                self.put(key, key.upper())           # put() takes the same lock: fine with RLock
            return self._data[key]

    def put(self, key: str, value: str) -> None:
        with self._lock:
            self._data[key] = value


class Gate:
    """Wait until a condition on shared state is true (e.g. N workers registered)."""

    def __init__(self) -> None:
        self._cond = threading.Condition()
        self.ready = 0

    def register(self) -> None:
        with self._cond:
            self.ready += 1
            self._cond.notify_all()

    def wait_for(self, n: int, timeout: float) -> bool:
        with self._cond:
            return self._cond.wait_for(lambda: self.ready >= n, timeout=timeout)


print(Cache().get_or_load("a"))                      # A
gate = Gate()
for _ in range(3):
    threading.Thread(target=gate.register).start()
print(gate.wait_for(3, timeout=2))                   # True

stop = threading.Event()                             # one-way flag: "shut down now"
worker = threading.Thread(target=lambda: stop.wait(10))
worker.start()
stop.set()
worker.join(1)
print("worker alive:", worker.is_alive())            # worker alive: False
```

- Always use `with lock:` — a `lock.acquire()` without `finally: release()` deadlocks on the first exception.
- Take several locks **in the same order** everywhere; two threads taking A→B and B→A deadlock.
- Give blocking waits a timeout (`wait_for(..., timeout=)`, `Event.wait(timeout)`, `Barrier(timeout=)`) — a hang becomes a failure you can see.

## Queues: the Safe Hand-Off

The simplest race-free design is to **not share** mutable state: one owner per object, and other threads or tasks send it messages through a queue. `queue.Queue` and `asyncio.Queue` do their own locking, and a bounded queue adds backpressure for free.

```python
import queue
import threading

results: list[int] = []
jobs: queue.Queue[int] = queue.Queue(maxsize=100)     # bounded: producers block when it is full


def worker() -> None:
    while True:
        try:
            item = jobs.get()
        except queue.ShutDown:                         # Python 3.13+
            return
        results.append(item * item)                    # one append: safe on both builds
        jobs.task_done()


threads = [threading.Thread(target=worker) for _ in range(4)]
for t in threads:
    t.start()
for i in range(1000):
    jobs.put(i)
jobs.join()                                            # wait until every item was processed
jobs.shutdown()                                        # wake workers blocked in get()
for t in threads:
    t.join()
print(len(results), sum(results) == sum(i * i for i in range(1000)))   # 1000 True
```

```python
import asyncio


async def worker(name: str, q: asyncio.Queue[int], out: list[str]) -> None:
    while True:
        try:
            item = await q.get()
        except asyncio.QueueShutDown:                  # Python 3.13+
            return
        await asyncio.sleep(0.01)
        out.append(f"{name}:{item}")
        q.task_done()


async def main() -> None:
    q: asyncio.Queue[int] = asyncio.Queue(maxsize=10)
    out: list[str] = []
    async with asyncio.TaskGroup() as tg:
        for i in range(3):
            tg.create_task(worker(f"w{i}", q, out))
        for item in range(30):
            await q.put(item)                          # waits while the queue is full: backpressure
        await q.join()
        q.shutdown()
    print(len(out), "items processed")                 # 30 items processed


asyncio.run(main())
```

`Queue.shutdown()` (Python 3.13+) makes blocked `get()` calls raise `ShutDown` / `QueueShutDown` once the queue is empty — no sentinel values needed. On older versions put one `None` per worker as a stop signal.

## `contextvars` Instead of Globals

A module-level "current request" variable is shared by every task and thread. A `ContextVar` has a separate value per task (each task runs in a copy of the context) and per thread:

```python
import asyncio
import contextvars

current_request: str | None = None                                        # global: shared by all tasks
request_id: contextvars.ContextVar[str] = contextvars.ContextVar("request_id")


async def handle_global(rid: str) -> str:
    global current_request
    current_request = rid
    await asyncio.sleep(0.01)                     # another request runs here and overwrites it
    return f"{rid} logged as {current_request}"


async def handle_ctx(rid: str) -> str:
    request_id.set(rid)                           # each task runs in a copy of the context
    await asyncio.sleep(0.01)
    return f"{rid} logged as {request_id.get()}"


async def main() -> None:
    print(await asyncio.gather(handle_global("req-1"), handle_global("req-2")))
    # ['req-1 logged as req-2', 'req-2 logged as req-2']
    print(await asyncio.gather(handle_ctx("req-1"), handle_ctx("req-2")))
    # ['req-1 logged as req-1', 'req-2 logged as req-2']


asyncio.run(main())
```

Use `ContextVar` for request ids, tenants, deadlines ([03](./03-timeouts-fallbacks-breakers.md#deadline-propagation)) and the current user. `threading.local()` works for threads only; it leaks between asyncio tasks, which share one thread.

## Multiprocessing

Processes share nothing by default — which removes most races. Shared memory brings them back:

```python
import multiprocessing as mp


def add_racy(counter, n: int) -> None:
    for _ in range(n):
        counter.value += 1                        # read, add, write: three steps


def add_locked(counter, n: int) -> None:
    for _ in range(n):
        with counter.get_lock():                  # Value() comes with its own lock
            counter.value += 1


if __name__ == "__main__":
    for target in (add_racy, add_locked):
        counter = mp.Value("i", 0)
        procs = [mp.Process(target=target, args=(counter, 50_000)) for _ in range(4)]
        for p in procs:
            p.start()
        for p in procs:
            p.join()
        print(f"{target.__name__}: {counter.value} (expected 200000)")
# add_racy: 70237 (expected 200000)
# add_locked: 200000 (expected 200000)
```

- `mp.Value` and `mp.Array` have a lock, but `+=` does not use it — take `get_lock()` yourself.
- `Manager().dict()` proxies make single operations safe; read-modify-write through a proxy still races.
- Prefer **returning results** (`Pool.map`, `ProcessPoolExecutor`) or a `multiprocessing.Queue` over shared mutable state.

## Files: Time of Check to Time of Use

`if not path.exists(): path.write_text(...)` checks at one moment and acts at another. A `Barrier` placed in that gap reproduces the race on every run:

```python
import os
import tempfile
import threading
from pathlib import Path


def claim_racy(path: Path, owner: str, barrier: threading.Barrier) -> bool:
    if not path.exists():                          # time of check
        barrier.wait()                             # both threads are now past the check
        path.write_text(owner)                     # time of use: the second write wins
        return True
    return False


def claim(path: Path, owner: str, barrier: threading.Barrier) -> bool:
    barrier.wait()
    try:
        with path.open("x") as f:                  # O_CREAT | O_EXCL: create or fail, atomically
            f.write(owner)
        return True
    except FileExistsError:
        return False


def write_atomic(path: Path, text: str) -> None:
    """Readers see the old file or the new file, never a half-written one."""
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=path.name, suffix=".tmp")
    with os.fdopen(fd, "w") as f:
        f.write(text)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)                          # atomic rename on the same file system


def race(fn) -> tuple[dict[str, bool], str]:
    with tempfile.TemporaryDirectory() as d:
        path = Path(d) / "job.lock"
        barrier = threading.Barrier(2)
        results: dict[str, bool] = {}
        threads = [
            threading.Thread(target=lambda o=o: results.__setitem__(o, fn(path, o, barrier)))
            for o in ("worker-a", "worker-b")
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        return results, path.read_text()


print("racy: ", race(claim_racy))    # both claim it: ({'worker-b': True, 'worker-a': True}, 'worker-a')
print("fixed:", race(claim))         # exactly one:   ({'worker-b': True, 'worker-a': False}, 'worker-b')
```

- Let the operating system decide: `open(path, "x")` (exclusive create), `os.mkdir()` (fails if it exists), `os.replace()` (atomic rename).
- `tempfile.mkstemp()` / `NamedTemporaryFile` for unique names — never `f"/tmp/report-{time.time()}"`.
- Parallel test workers writing the same report or cache file is the classic CI version of this race; give each worker its own path (`tmp_path`, `worker_id`).

## Database Races

### Lost update

Two transactions read the same row, both compute a new value in Python, both write: the second write silently overwrites the first. Each function below is called from two threads with their own connections; the racy one waits on a `Barrier` right after its `SELECT`, so both reads happen before either write:

```python
# app/stock_db.py
from collections.abc import Callable

import psycopg

SCHEMA = """
CREATE TABLE IF NOT EXISTS products (
    id      int PRIMARY KEY,
    stock   int NOT NULL CHECK (stock >= 0),
    version int NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS payments (
    id              bigserial PRIMARY KEY,
    idempotency_key text NOT NULL UNIQUE,
    order_id        int NOT NULL,
    amount_cents    int NOT NULL
);
CREATE TABLE IF NOT EXISTS daily_counts (
    day date PRIMARY KEY,
    n   int NOT NULL
);
"""


def _noop() -> None:
    pass


def buy_racy(conn: psycopg.Connection, product_id: int, after_read: Callable[[], None] = _noop) -> bool:
    """Lost update: read in Python, decide, write back an absolute value."""
    with conn.transaction():
        (stock,) = conn.execute("SELECT stock FROM products WHERE id = %s", (product_id,)).fetchone()
        after_read()
        if stock <= 0:
            return False
        conn.execute("UPDATE products SET stock = %s WHERE id = %s", (stock - 1, product_id))
        return True


def buy_atomic(conn: psycopg.Connection, product_id: int) -> bool:
    """One statement: the database does check and write under its row lock."""
    with conn.transaction():
        cur = conn.execute(
            "UPDATE products SET stock = stock - 1 WHERE id = %s AND stock > 0", (product_id,)
        )
        return cur.rowcount == 1


def buy_for_update(conn: psycopg.Connection, product_id: int, after_read: Callable[[], None] = _noop) -> bool:
    """Pessimistic lock: other transactions wait at SELECT ... FOR UPDATE until we commit."""
    with conn.transaction():
        (stock,) = conn.execute(
            "SELECT stock FROM products WHERE id = %s FOR UPDATE", (product_id,)
        ).fetchone()
        after_read()
        if stock <= 0:
            return False
        conn.execute("UPDATE products SET stock = %s WHERE id = %s", (stock - 1, product_id))
        return True


class ConflictError(Exception):
    """Someone else changed the row since we read it: re-read and try again."""


def buy_optimistic(conn: psycopg.Connection, product_id: int, after_read: Callable[[], None] = _noop) -> bool:
    """Optimistic lock: no lock while thinking, the UPDATE checks that nothing changed."""
    with conn.transaction():
        stock, version = conn.execute(
            "SELECT stock, version FROM products WHERE id = %s", (product_id,)
        ).fetchone()
        after_read()
        if stock <= 0:
            return False
        cur = conn.execute(
            "UPDATE products SET stock = %s, version = version + 1 WHERE id = %s AND version = %s",
            (stock - 1, product_id, version),
        )
        if cur.rowcount == 0:
            raise ConflictError(product_id)
        return True


def record_payment(conn: psycopg.Connection, key: str, order_id: int, amount_cents: int) -> bool:
    """Idempotent insert: the UNIQUE constraint decides, not a SELECT before the INSERT."""
    with conn.transaction():
        cur = conn.execute(
            """
            INSERT INTO payments (idempotency_key, order_id, amount_cents)
            VALUES (%s, %s, %s)
            ON CONFLICT (idempotency_key) DO NOTHING
            """,
            (key, order_id, amount_cents),
        )
        return cur.rowcount == 1                   # False: a duplicate, already recorded


def count_event(conn: psycopg.Connection, day: str) -> int:
    """Upsert: insert the first row or increment the existing one, in one statement."""
    with conn.transaction():
        (n,) = conn.execute(
            """
            INSERT INTO daily_counts (day, n) VALUES (%s, 1)
            ON CONFLICT (day) DO UPDATE SET n = daily_counts.n + 1
            RETURNING n
            """,
            (day,),
        ).fetchone()
        return n
```

Results on PostgreSQL 18 (default `READ COMMITTED`), stock = 1, two buyers:

| Function | Sales | Stock after | Why |
|----------|-------|-------------|-----|
| `buy_racy` | **2** | 0 | Both read 1, both wrote 0 — one decrement lost, one item sold twice |
| `buy_atomic` | 1 | 0 | `stock = stock - 1 ... AND stock > 0` runs under the row lock; the second UPDATE re-checks and matches 0 rows |
| `buy_for_update` | 1 | 0 | The second `SELECT ... FOR UPDATE` waits until the first transaction commits, then reads 0 |
| `buy_optimistic` | 1 | 0 | The second UPDATE finds `version` changed, matches 0 rows, raises `ConflictError` |

Under load (8 threads × 5 attempts, stock 10) the three fixed versions sold exactly 10 every time ([06](./06-testing.md#postgresql-race-tests)).

| Fix | Use when | Cost |
|-----|----------|------|
| **Atomic statement** (`UPDATE ... SET x = x - 1 WHERE ... AND x > 0`, `RETURNING`) | The decision fits into SQL | Cheapest; always try this first |
| **Pessimistic lock** (`SELECT ... FOR UPDATE`) | Read, decide in Python, write — and conflicts are frequent | Other writers wait; keep the transaction short; watch for deadlocks |
| **Optimistic lock** (`version` column, `WHERE version = :read_version`) | Conflicts are rare, or the "think time" is long (a user edits a form) | Losers must re-read and retry ([02](./02-retry-libraries.md) — retry on `ConflictError`) |
| **Stricter isolation** (`REPEATABLE READ`, `SERIALIZABLE`) | Many rows and rules; you prefer the DB to detect conflicts | The second writer fails with `SerializationFailure` (`could not serialize access due to concurrent update`) and must retry the whole transaction |

In SQLAlchemy the same tools are `select(...).with_for_update()` and the mapper option `version_id_col` (a stale update raises `StaleDataError`) — see [SQLAlchemy — Sessions & Transactions](../sqlalchemy/03-sessions-transactions.md).

### Unique constraints and upserts

"Check, then insert" has the same gap as check-then-act in memory: two requests both see "no payment for this key yet" and both insert. Let the **constraint** decide:

- `record_payment` inserts with `ON CONFLICT (idempotency_key) DO NOTHING`: with 5 concurrent calls for one key exactly one returns `True`. This is the server side of an idempotency key ([01](./01-retries-backoff.md#idempotency)).
- `count_event` is an **upsert**: `INSERT ... ON CONFLICT (day) DO UPDATE SET n = daily_counts.n + 1` — 8 threads × 10 calls counted exactly 80.
- Catching `UniqueViolation` after a plain `INSERT` also works, but in PostgreSQL the error aborts the surrounding transaction; `ON CONFLICT` does not.

## Distributed Locks

Several processes, pods or CI runners need "only one at a time": one nightly import, one schema migration, one cache rebuild. A Redis lock (`SET key token NX PX ttl` plus compare-and-delete) is the common tool — with real limits:

- The lock **expires** while the owner still works (slow job, GC pause, VM freeze) — then two owners run, and the first gets no error.
- On Redis **failover** the new primary may not have the lock yet.
- So use Redis locks for **efficiency** (avoid duplicate work), and keep **correctness** in the system of record: a unique constraint, a `WHERE version = ...` update, an idempotency key, or a **fencing token** the protected resource checks.
- Inside PostgreSQL, `pg_advisory_xact_lock(key)` gives a lock that is released with the transaction.

Implementation and the full caveats table: [Redis — Patterns: Distributed Locks](../../databases/redis/03-patterns.md#distributed-locks).

## Idempotent Consumers

Queues deliver **at least once**: a consumer that crashes after the work but before the ack gets the message again ([Queues vs Streams](../../software-design-patterns/05-composition-architectural/04-queues-streams-messaging.md)). Retries in the producer add more duplicates. Make the consumer idempotent by recording processed message ids **in the same transaction** as the effect:

```python
# app/consumer.py
import psycopg

SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts (
    id            int PRIMARY KEY,
    balance_cents bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS processed_messages (
    message_id   text PRIMARY KEY,
    processed_at timestamptz NOT NULL DEFAULT now()
);
"""


def handle_deposit(conn: psycopg.Connection, message_id: str, account_id: int, amount_cents: int) -> bool:
    """Apply a deposit message once, however many times it is delivered."""
    with conn.transaction():                        # the marker and the effect commit together
        cur = conn.execute(
            "INSERT INTO processed_messages (message_id) VALUES (%s) ON CONFLICT DO NOTHING",
            (message_id,),
        )
        if cur.rowcount == 0:
            return False                            # duplicate delivery: already applied
        conn.execute(
            "UPDATE accounts SET balance_cents = balance_cents + %s WHERE id = %s",
            (amount_cents, account_id),
        )
        return True
```

Three concurrent deliveries of the same message: `[True, False, False]`, balance `500` — applied once. Recording the id in Redis and the effect in PostgreSQL is **not** the same: a crash between the two writes either loses the message or applies it twice. Broker-specific details: [RabbitMQ — Idempotent Consumers](../../tools/rabbitmq/03-python-clients.md#idempotent-consumers), [Celery — Idempotency](../celery/01-tasks-calling.md#idempotency).

## Checklist

- [ ] No read-modify-write or check-then-act on shared state without a lock, a queue, or an atomic operation
- [ ] asyncio code has no `await` between a check and the action that depends on it (or holds an `asyncio.Lock`)
- [ ] Per-request data lives in `ContextVar`s, not module globals
- [ ] Multiprocessing shares results through return values or queues; shared `Value`s use `get_lock()`
- [ ] Files are created with `open(..., "x")` / written with `os.replace()`; temp names come from `tempfile`
- [ ] Database updates are atomic statements, `FOR UPDATE`, or version-checked; uniqueness is a constraint, not a `SELECT`
- [ ] Distributed locks only avoid duplicate work; correctness is enforced by the database
- [ ] Message consumers store processed ids in the same transaction as the effect
- [ ] Race tests run in CI, including a free-threaded (`3.14t`) job for thread-heavy code

---
## See also
- [Resilience — Semaphores & Rate Limits](./04-semaphores-rate-limits.md)
- [Resilience — Testing Resilience Code](./06-testing.md)
- [Redis — Patterns: Caching, Rate Limits, Locks, Messaging](../../databases/redis/03-patterns.md)
- [REST: Caching, Concurrency and Idempotency](../../api-architectures/01-rest/04-caching-concurrency.md)
- [SQLAlchemy — Sessions & Transactions](../sqlalchemy/03-sessions-transactions.md)
- [RabbitMQ — Python Clients](../../tools/rabbitmq/03-python-clients.md)
