---
date: 2026-09-30 18:10:00
tags:
  - python
  - libraries
  - celery
  - reliability
---

# Celery — Tasks & Calling

A task is a Python function registered in a Celery app. Calling it through Celery turns the call into a **message**; a worker later runs the function with the arguments from that message. Everything in this page follows from that: arguments must be serializable, the call can fail or repeat on another machine, and the result arrives later.

## Project Layout

```text
orders/
├── __init__.py
├── celery_app.py      # the Celery app and its config
├── tasks.py           # tasks
└── payments.py        # plain Python code the tasks call
```

```python
# orders/celery_app.py
import os

from celery import Celery

app = Celery("orders", include=["orders.tasks"])
app.conf.update(
    broker_url=os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0"),
    result_backend=os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/1"),
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    broker_connection_retry_on_startup=True,
)
```

Start a worker with `celery -A orders.celery_app worker --loglevel=INFO`. `include` tells the worker which modules to import so it knows the tasks. More settings: [03 Configuration, Workers & Beat](./03-config-workers-beat.md).

## Defining Tasks

```python
# orders/tasks.py
from celery import shared_task
from celery.utils.log import get_task_logger

logger = get_task_logger(__name__)


def calculate_total(items: list[dict]) -> int:
    """Business logic stays a plain function: easy to unit-test."""
    return sum(item["price_cents"] * item["qty"] for item in items)


@shared_task
def order_total(items: list[dict]) -> int:
    return calculate_total(items)
```

| Decorator | Binds to | Use when |
|-----------|----------|----------|
| `@app.task` | This app object | Small projects; the module can import the app |
| `@shared_task` | The current app at call time | Reusable modules, Django apps, and tests that use a separate test app |

The task name defaults to `module.function` (`orders.tasks.order_total`). The name is part of the message: renaming or moving a task breaks messages already in the queue and all `task_routes` that use the old name. Set `name="orders.total"` explicitly if the module may move.

## Calling Tasks

| Call | What happens |
|------|--------------|
| `order_total(items)` | Plain function call in this process — no broker, no worker |
| `order_total.delay(items)` | Sends a message with default options; returns `AsyncResult` |
| `order_total.apply_async(args=(items,), countdown=10)` | Sends a message with execution options |
| `order_total.s(items)` | Creates a **signature** (a call description) for later or for workflows |
| `app.send_task("orders.tasks.order_total", args=(items,))` | Sends by name — the caller does not need to import the task code |
| `order_total.apply(args=(items,))` | Runs locally and synchronously, returns `EagerResult` (useful in tests) |

Useful `apply_async` options:

| Option | Meaning |
|--------|---------|
| `countdown=10` | Run no earlier than 10 seconds from now |
| `eta=datetime(...)` | Run no earlier than this time (use timezone-aware datetimes) |
| `expires=60` or a datetime | If no worker starts the task before this, it is revoked with state `REVOKED` |
| `queue="reports"` | Send to a specific queue (overrides `task_routes`) |
| `priority=5` | Message priority (broker-specific semantics) |
| `headers={"x_test_id": "T-1"}` | Custom headers; the task reads them as `self.request.headers` or `self.request.x_test_id` |
| `task_id="..."` | Use your own id (for example, to make a submission idempotent) |
| `ignore_result=True` | Do not store the result |

```python
from datetime import datetime, timedelta, timezone

order_total.apply_async((items,), countdown=5)
order_total.apply_async((items,), eta=datetime.now(timezone.utc) + timedelta(minutes=1))
order_total.apply_async((items,), countdown=300, expires=600)   # useless after 10 minutes
```

`countdown` and `eta` are "not earlier than", not "exactly at". The worker **receives** the message at once and keeps it in memory until the time comes. Long delays on a Redis broker interact with the visibility timeout (see Delivery Guarantees below). For "run tomorrow at 03:00" use beat or a database-driven scheduler instead.

## Results and States

```python
result = order_total.delay(items)
result.id                   # task id (UUID string)
result.get(timeout=10)      # wait for the value; raises the task's exception on failure
result.state                # 'PENDING', 'STARTED', 'RETRY', 'SUCCESS', 'FAILURE', 'REVOKED'
result.successful(), result.failed()
result.get(timeout=10, propagate=False)   # return the exception instead of raising it
result.traceback            # worker traceback as a string, for failed tasks
```

| State | Meaning |
|-------|---------|
| `PENDING` | Unknown to the backend: waiting in a queue — **or the id does not exist at all** |
| `STARTED` | A worker started it (only with `task_track_started=True`) |
| `RETRY` | Failed and scheduled for a retry |
| `SUCCESS` / `FAILURE` | Finished |
| `REVOKED` | Cancelled, or expired before it started |

- `AsyncResult("does-not-exist").state` is `PENDING`. In tests, never treat `PENDING` as "queued": it also means "never sent" or "result expired".
- `result.get()` without a timeout waits forever. Always pass `timeout=`.
- Results are kept for `result_expires` (default 1 day) and then removed from the backend.
- If nobody reads results, set `task_ignore_result=True` (globally) or `ignore_result=True` per task — storing unused results only fills Redis. With ignored results the state stays `PENDING`.

## Bound Tasks

`bind=True` passes the task instance as `self`. You need it for `self.retry()` and for `self.request` — the context of the current execution:

```python
@shared_task(bind=True)
def whoami(self) -> dict:
    return {
        "id": self.request.id,
        "retries": self.request.retries,       # 0 on the first run
        "hostname": self.request.hostname,     # e.g. 'celery@worker-1'
        "queue": self.request.delivery_info["routing_key"],
    }
```

## Retries

### Manual retry

```python
from orders import payments


@shared_task(bind=True, max_retries=3, default_retry_delay=5)
def refund(self, order_id: int) -> str:
    try:
        return payments.gateway.refund(order_id)
    except payments.PaymentGatewayError as exc:
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)
```

`self.retry()` raises a `Retry` exception and sends a **new message with the same task id** and `retries + 1`. When `max_retries` is reached, the exception passed as `exc` is raised and the task fails with it; without `exc`, the task fails with `MaxRetriesExceededError`.

### Automatic retry with backoff

```python
from orders import payments
from orders.repository import repo


@shared_task(
    bind=True,
    autoretry_for=(payments.PaymentGatewayError,),   # transient errors only
    retry_backoff=True,        # exponential: 1, 2, 4, 8 ... seconds
    retry_backoff_max=60,      # cap for one delay
    retry_jitter=True,         # random delay in [0, backoff] — spreads the load
    max_retries=5,             # 1 run + 5 retries = 6 attempts
    acks_late=True,
)
def charge_order(self, order_id: int, amount_cents: int) -> dict:
    if repo.is_paid(order_id):
        logger.info("order %s already paid, skipping", order_id)
        return {"order_id": order_id, "status": "already_paid"}
    charge_id = payments.gateway.charge(
        order_id, amount_cents, idempotency_key=f"order-{order_id}"
    )
    repo.mark_paid(order_id, charge_id)
    return {"order_id": order_id, "status": "paid", "charge_id": charge_id}
```

A run with `retry_backoff=1`, `retry_jitter=False`, `max_retries=3` and a task that always fails (condensed worker log):

```text
attempt 1 retries=0   Retry in 1s: TransientError('attempt 1')
attempt 2 retries=1   Retry in 2s: TransientError('attempt 2')
attempt 3 retries=2   Retry in 4s: TransientError('attempt 3')
attempt 4 retries=3   raised unexpected: TransientError('attempt 4')   -> state FAILURE
```

| Option | Default | Note |
|--------|---------|------|
| `autoretry_for` | `()` | Tuple of exception classes; keep it narrow |
| `dont_autoretry_for` | `()` | Subclasses that must not be retried |
| `max_retries` | 3 | `None` = retry forever — avoid |
| `default_retry_delay` | 180 s | Used when there is no backoff and no `countdown` |
| `retry_backoff` | `False` | `True` or a number (the first delay factor) |
| `retry_backoff_max` | 600 s | Upper limit for one delay |
| `retry_jitter` | `True` | Full jitter: the delay is random between 0 and the backoff value |
| `retry_kwargs` | `{}` | Extra `retry()` arguments, for example `{"countdown": 5}` |

Rules:

- Retry **transient** errors (timeouts, 502/503, connection reset). A declined card, a validation error or a 404 will fail on every attempt.
- Every retry runs the **whole function again** — the side effects before the failing line happen again. That is the main reason for idempotency.
- A retry is a new message: other tasks can run in between, and the retry can land on another worker.

## Delivery Guarantees and `acks_late`

The broker removes a message only after the worker **acknowledges** it.

| Setting | When the message is acked | If the worker process dies mid-task |
|---------|---------------------------|-------------------------------------|
| Default (`task_acks_late=False`) | Just before the task starts | The task is lost (at most once) |
| `task_acks_late=True` | After the task returns or raises | With `task_reject_on_worker_lost=True` — the message is requeued and the task runs again. Without it — the task is marked `FAILURE` with `WorkerLostError` and not rerun |

Both rows were checked by killing the pool process (`kill -9`) in the middle of a 4-second task on a Redis broker: with `task_reject_on_worker_lost=True` another pool process ran the task again and it succeeded; without it `result.get()` raised `WorkerLostError`.

Redis has no real acks: unacked messages are hidden for `visibility_timeout` (default 1 hour, set in `broker_transport_options`) and then **delivered again** to any worker. A task (or a `countdown` / `eta`) longer than the visibility timeout can therefore run twice. Raise the timeout above your longest task and delay, or use RabbitMQ for very long tasks.

## Idempotency

With `acks_late`, retries, broker redelivery and users double-clicking, assume **every task can run more than once**. Design tasks so that the second run changes nothing.

| Technique | Example |
|-----------|---------|
| Check state first | `if repo.is_paid(order_id): return` |
| Idempotency key to external APIs | `idempotency_key=f"order-{order_id}"` in the payment request |
| Unique constraint / upsert in the DB | `INSERT ... ON CONFLICT (order_id) DO NOTHING` |
| Deterministic task id for submission | `apply_async(..., task_id=f"invoice-{order_id}")` — makes the result lookup stable; it does not stop a second message by itself |
| Lock for "only one at a time" | Redis `SET key value NX EX 300` around the critical part |
| Pass IDs, reload data | The task reads current state instead of trusting a stale snapshot in the message |

"Check state first" alone has a race when two copies run at the same time. Combine it with a database constraint or a lock for money and other critical side effects.

## Time Limits

```python
from celery.exceptions import SoftTimeLimitExceeded


@shared_task(soft_time_limit=60, time_limit=90)
def build_report(order_id: int) -> str:
    try:
        return render_pdf(order_id)
    except SoftTimeLimitExceeded:
        cleanup_temp_files(order_id)
        raise
```

| Limit | What happens |
|-------|--------------|
| `soft_time_limit` | `SoftTimeLimitExceeded` is raised inside the task — it can clean up |
| `time_limit` | The pool process is killed and replaced; the task fails with `TimeLimitExceeded` |
| Global | `task_soft_time_limit`, `task_time_limit` settings; `--soft-time-limit`, `--time-limit` worker options |

Time limits are enforced by the **prefork** pool. The `threads` and `solo` pools ignore them: in a check with `time_limit=1` and a 2-second sleep, both pools returned `"done"`. For network calls, also set client timeouts (`httpx.Client(timeout=10)`) — they are the first line of defense.

## Serialization

The default serializer is JSON (`task_serializer="json"`, `accept_content=["json"]`). kombu's JSON encoder round-trips a few extra types; everything else fails **in the caller**, before the message is sent:

| Argument | Arrives in the task as |
|----------|------------------------|
| `dict`, `list`, `str`, `int`, `float`, `bool`, `None` | The same |
| `tuple` | `list` |
| `datetime`, `date`, `Decimal`, `UUID`, `bytes` | The same type (kombu adds type markers) |
| `set`, dataclass, ORM object, Pydantic model | `kombu.exceptions.EncodeError: Object of type ... is not JSON serializable` |

- Pass **identifiers and small dicts**. An ORM object in a message is a stale snapshot, and it is not serializable anyway.
- Do not switch to `pickle` to "fix" `EncodeError`: a worker that accepts pickle runs code from anyone who can write to the broker.
- Big payloads (files, reports) go to object storage; the message carries the key.

### Pydantic arguments

Since Celery 5.5 a task can validate arguments with Pydantic:

```python
from pydantic import BaseModel


class OrderIn(BaseModel):
    order_id: int
    amount: float


class OrderOut(BaseModel):
    order_id: int
    status: str


@shared_task(pydantic=True)
def confirm_order(order: OrderIn) -> OrderOut:
    return OrderOut(order_id=order.order_id, status="confirmed")


confirm_order.delay({"order_id": 1, "amount": "9.5"}).get(timeout=10)
# {'order_id': 1, 'status': 'confirmed'}
```

The caller still sends a **dict** (`model.model_dump()`); passing the model object itself fails with `EncodeError`. The worker validates the dict into `OrderIn` (invalid data fails the task with a validation error) and dumps the returned model back to a dict.

## Checklist

- [ ] Business logic is in plain functions; tasks are thin wrappers
- [ ] Task arguments are IDs and small JSON values
- [ ] Every task is idempotent (state check + DB constraint, idempotency key, or lock)
- [ ] `autoretry_for` lists only transient errors; `max_retries` is set; backoff with jitter is on
- [ ] Long or critical tasks use `acks_late=True` and `task_reject_on_worker_lost=True`
- [ ] Redis `visibility_timeout` is longer than the longest task and `countdown`
- [ ] Soft and hard time limits are set; network clients have timeouts
- [ ] Callers always use `result.get(timeout=...)` or do not wait at all

---
## See also
- [Celery — Distributed Task Queue for Python](./index.md)
- [Celery — Canvas Workflows](./02-canvas-workflows.md)
- [Celery — Testing Celery Code](./05-testing.md)
- [Pydantic](../pydantic/index.md)
- [FastAPI — Production Patterns](../fastapi/06-production-patterns.md)
