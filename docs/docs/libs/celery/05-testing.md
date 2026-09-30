---
date: 2026-09-30 18:10:00
tags:
  - python
  - libraries
  - celery
  - testing
  - pytest
  - integration-testing
  - docker
---

# Celery — Testing Celery Code

Celery code has two halves: **what a task does** (plain Python) and **how it travels** (serialization, routing, retries, acks, workflows, a worker process). Most bugs in the second half are invisible when a test calls the function directly or turns on eager mode. Test each half at the level where it can actually break.

## Test Layers

| Layer | What it checks | Broker / worker | Speed | Example |
|-------|----------------|-----------------|-------|---------|
| Business logic | Calculations, decisions, formatting | None | ms | `calculate_total(items)` |
| Task as a function | Task body, idempotency, which exception triggers a retry | None | ms | `charge_order(1, 500)` with fakes |
| Local execution (`apply()`) | Retry loop, final failure after `max_retries` | None | ms | `charge_order.apply(args=(1, 500))` |
| Workflow shape | Chain / chord structure, arguments, immutability | None | ms | `checkout_workflow(1, 500).tasks` |
| Embedded worker | Real messages, JSON serialization, retries through the broker, canvas | In-memory broker, worker thread | 0.1–3 s | `celery_session_worker` |
| Integration | Real broker, prefork worker process, routing, redelivery after a crash | Redis in Docker, worker subprocess | seconds | `testcontainers` + `celery worker` |
| System / E2E | API → queue → worker → DB → UI | Full stack (Compose) | slow | Poll the API until the job is done |

The first five layers are on this page; integration tests with a real broker, pytest-celery containers, xdist and flakiness are in [06 Integration Tests & Flakiness](./06-integration-testing.md). All examples were run with Celery 5.6.3, pytest 9.1, pytest-celery 1.3.0 and testcontainers 4.13 on Python 3.13.

## Example Project

The tasks from [01 Tasks & Calling](./01-tasks-calling.md), with dependencies that tests can replace:

```text
orders/
├── celery_app.py      # app = Celery("orders", include=["orders.tasks"]) + config
├── tasks.py           # order_total, charge_order, notify, sum_totals, build_report
├── workflows.py       # checkout_workflow, batch_total_workflow, place_order
├── payments.py        # PaymentGatewayError (transient), CardDeclined (permanent), gateway
└── repository.py      # OrderRepository: is_paid(), mark_paid(); module-level repo
tests/
├── conftest.py
├── test_unit.py
├── test_worker.py
├── test_canvas.py
├── test_tracing.py
└── integration/       # page 06
    ├── conftest.py
    └── test_real_worker.py
tests_app/             # embedded worker for the production app, beat schedule
tests_docker/          # pytest-celery container tests (page 06)
```

Tasks use `@shared_task`, so the same task objects work with the production app and with a test app. `build_report(order_id, seconds=0.0)` sleeps `seconds` to simulate a long task.

```python
# orders/celery_app.py
import os

from celery import Celery
from celery.schedules import crontab

app = Celery("orders", include=["orders.tasks"])
app.conf.update(
    broker_url=os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0"),
    result_backend=os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/1"),
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    broker_connection_retry_on_startup=True,
    result_extended=True,          # store task name, args and queue with the result
    task_routes={"orders.tasks.build_report": {"queue": "reports"}},
    timezone="UTC",
    beat_schedule={
        "nightly-sales-report": {
            "task": "orders.tasks.build_report",
            "schedule": crontab(hour=2, minute=30),
            "args": (0,),
        },
    },
)
```

```python
# tests/conftest.py
import pytest

from orders import payments
from orders.repository import OrderRepository


@pytest.fixture
def repo(monkeypatch):
    fresh = OrderRepository()
    monkeypatch.setattr("orders.tasks.repo", fresh)
    return fresh


class FakeGateway:
    def __init__(self, fail_times: int = 0, error: type[Exception] = payments.PaymentGatewayError):
        self.fail_times = fail_times
        self.error = error
        self.calls: list[tuple[int, int, str]] = []

    def charge(self, order_id: int, amount_cents: int, idempotency_key: str) -> str:
        self.calls.append((order_id, amount_cents, idempotency_key))
        if len(self.calls) <= self.fail_times:
            raise self.error("gateway unavailable")
        return f"ch_{order_id}"


@pytest.fixture
def gateway(monkeypatch):
    fake = FakeGateway()
    monkeypatch.setattr("orders.payments.gateway", fake)
    return fake
```

```toml
# pyproject.toml
[tool.pytest.ini_options]
pythonpath = ["."]
addopts = "-m 'not integration'"
markers = ["integration: needs Docker and a real broker"]
```

## Calling Task Functions Directly

Calling a task object like a function runs its body in the test process — no broker, no worker, no serialization. This is where most assertions belong.

```python
# tests/test_unit.py
from unittest.mock import patch

import pytest
from celery.exceptions import Retry

from orders import payments
from orders.tasks import calculate_total, charge_order, notify, order_total


def test_calculate_total_is_plain_python():
    assert calculate_total([{"price_cents": 250, "qty": 2}, {"price_cents": 100, "qty": 1}]) == 600


def test_task_called_directly_runs_in_process():
    assert order_total([{"price_cents": 100, "qty": 3}]) == 300


def test_bound_task_called_directly(repo, gateway):
    assert charge_order(1, 500) == {"order_id": 1, "status": "paid", "charge_id": "ch_1"}
    assert gateway.calls == [(1, 500, "order-1")]      # idempotency key is sent


def test_charge_is_idempotent(repo, gateway):
    charge_order(1, 500)
    assert charge_order(1, 500) == {"order_id": 1, "status": "already_paid"}
    assert len(gateway.calls) == 1                      # the second run changed nothing


def test_transient_error_triggers_retry(repo, gateway):
    gateway.fail_times = 1
    with patch.object(charge_order, "retry", side_effect=Retry()) as retry:
        with pytest.raises(Retry):
            charge_order(1, 500)
    assert isinstance(retry.call_args.kwargs["exc"], payments.PaymentGatewayError)
    assert "countdown" in retry.call_args.kwargs        # backoff is applied


def test_permanent_error_is_not_retried(repo, gateway):
    gateway.fail_times, gateway.error = 1, payments.CardDeclined
    with patch.object(charge_order, "retry") as retry:
        with pytest.raises(payments.CardDeclined):
            charge_order(1, 500)
    retry.assert_not_called()


def test_notify_formats_message():
    assert notify({"order_id": 7, "status": "paid"}, channel="sms") == "sms: order 7 paid"
```

- A bound task (`bind=True`) gets `self` automatically when called directly; `self.request.retries` is 0.
- `autoretry_for` also works on direct calls: the wrapper calls `self.retry()`. Patching `retry` lets you assert **which** errors are retried without waiting for backoff.
- Test idempotency by **running the task twice** and asserting on side effects — it is the cheapest test against duplicate charges, emails and rows.

## Local Execution with `apply()`

`task.apply()` runs the task synchronously and returns an `EagerResult`. Retries also run synchronously, **immediately** (backoff delays are skipped) — good for testing the retry loop and the final failure:

```python
def test_apply_runs_retries_eagerly(repo, gateway):
    gateway.fail_times = 2
    result = charge_order.apply(args=(1, 500))
    assert result.successful()
    assert result.get()["status"] == "paid"
    assert len(gateway.calls) == 3


def test_apply_gives_up_after_max_retries(repo, gateway):
    gateway.fail_times = 100
    result = charge_order.apply(args=(1, 500))
    assert result.failed()
    assert isinstance(result.result, payments.PaymentGatewayError)   # the original error
    assert len(gateway.calls) == 6                                    # 1 call + max_retries=5
```

## `task_always_eager` and What It Hides

`task_always_eager=True` makes `delay()` / `apply_async()` call `apply()` locally. It is tempting for "integration" tests of the code that enqueues tasks. What it does and does not do in Celery 5.6.3 (each row was checked):

| Real behaviour | With `task_always_eager=True` |
|----------------|-------------------------------|
| Arguments are JSON-serialized | Also serialized — `EncodeError` for a `set` or dataclass argument is raised |
| Return value is serialized into the backend | **Not serialized** — a task returning a `set` "works" |
| `countdown` / `eta` delay execution | Ignored — runs at once (`countdown=5` returned in 0.01 s) |
| `task_routes` / `queue=` choose a worker | Ignored — a route to a queue no worker consumes still "works" |
| `time_limit` kills a stuck task (prefork) | Ignored — a 2 s task with `time_limit=1` succeeded |
| Exception fails the task | Stored in `EagerResult`; **not raised** unless `task_eager_propagates=True` |
| `result.get()` inside a task raises `RuntimeError` | Same — also raises |
| Acks, redelivery, prefetch, concurrency, separate process | None of them exist |
| Worker process has its own memory | Same process — monkeypatches and globals leak in, hiding "works on my machine" bugs |

If you use it, set both flags and treat the tests as **unit tests of the calling code**:

```python
@pytest.fixture(scope="session")
def celery_config():
    return {"task_always_eager": True, "task_eager_propagates": True}
```

Prefer calling the task directly (above) or an embedded worker (below): the first is simpler, the second is more honest.

## `celery.contrib.pytest` Fixtures

Celery ships pytest fixtures that create a test app (in-memory broker `memory://`, result backend `cache+memory://`) and run an **embedded worker in a thread** of the test process.

| Fixture | Scope | Purpose |
|---------|-------|---------|
| `celery_config` | session | Override: dict of settings for the test app |
| `celery_parameters` | session | Override: keyword arguments for `Celery(...)` |
| `celery_includes` | session | Override: modules to import before the worker starts (your task modules) |
| `celery_worker_pool` | session | Override: pool for the embedded worker (default `"solo"`) |
| `celery_worker_parameters` | session | Override: `WorkController` arguments, e.g. `{"queues": ["celery", "reports"]}` |
| `celery_enable_logging` | session | Override: `True` to see worker logs |
| `celery_session_app` / `celery_session_worker` | session | One app and one worker for the whole run — fast |
| `celery_app` / `celery_worker` | function | A fresh app and worker per test — isolated, about 5 s per test in our run |
| `use_celery_app_trap` | session | Override: `True` makes any use of the implicit default app raise |

Enable them:

| Installed | How |
|-----------|-----|
| `pytest-celery` (also installed by `celery[pytest]`) | Loaded automatically through its pytest plugin |
| Only `celery` | `pytest_plugins = ("celery.contrib.pytest",)` in the root `conftest.py` |

!!! warning "`celery_worker` with pytest-celery 1.x"
    pytest-celery 1.x re-exports the `celery.contrib.pytest` fixtures but **replaces `celery_worker`** with its own fixture that builds and starts a worker **Docker container**. A test that asks for `celery_worker` then waits for a container worker that does not know your tasks, and `result.get()` times out. With pytest-celery installed, use `celery_session_worker` or your own `start_worker()` fixture (below). The function-scoped `celery_app` + `celery_worker` pair works as documented only with plain `celery.contrib.pytest` (`pytest -p no:celery` disables the pytest-celery plugin).

```python
# tests/conftest.py (continued)
@pytest.fixture(scope="session")
def celery_config():
    return {
        "broker_url": "memory://",
        "result_backend": "cache+memory://",
        "task_acks_late": True,
        "worker_prefetch_multiplier": 1,
        "broker_transport_options": {"polling_interval": 0.1},   # memory transport polls every 1 s by default
    }


@pytest.fixture(scope="session")
def celery_includes():
    return ["orders.tasks"]
```

```python
# tests/test_worker.py
import pytest
from celery import chain, chord, group
from kombu.exceptions import EncodeError

from orders.tasks import charge_order, notify, order_total, sum_totals


def test_task_runs_on_embedded_worker(celery_session_worker):
    result = order_total.delay([{"price_cents": 100, "qty": 2}])
    assert result.get(timeout=10) == 200
    assert result.state == "SUCCESS"


def test_task_is_registered(celery_session_worker):
    assert "orders.tasks.charge_order" in celery_session_worker.app.tasks


def test_args_must_be_json_serializable(celery_session_worker):
    with pytest.raises(EncodeError):
        order_total.delay({1, 2})


def test_retries_then_succeeds(celery_session_worker, repo, gateway):
    gateway.fail_times = 2
    result = charge_order.delay(1, 500)          # real retry messages with real backoff
    assert result.get(timeout=30)["status"] == "paid"
    assert len(gateway.calls) == 3


def test_chain_passes_result_to_next_task(celery_session_worker, repo, gateway):
    workflow = chain(charge_order.s(1, 500), notify.s(channel="sms"))
    assert workflow.delay().get(timeout=10) == "sms: order 1 paid"


def test_chord_sums_group_results(celery_session_worker):
    header = group(order_total.s([{"price_cents": p, "qty": 1}]) for p in (100, 200, 300))
    assert chord(header, sum_totals.s()).delay().get(timeout=10) == 600
```

- The embedded worker runs **in a thread of the test process** with the `solo` pool, so `monkeypatch` fakes (`repo`, `gateway`) are visible to tasks. With a separate worker process they are not.
- Retries on a worker use real countdowns. `retry_backoff=True` with jitter waits up to 1 s, then up to 2 s: keep `fail_times` small, or make the backoff configurable.
- The test app does **not** load your production config — `task_routes`, `task_acks_late`, time limits. Put what matters into `celery_config`, or use the production app (next section).
- Per-test overrides for `celery_app`: `@pytest.mark.celery(result_backend="redis://...")`.

### Embedded worker with your own app

When tests must use the real config (routes, acks, serializers), start the embedded worker for the production app yourself:

```python
# tests_app/conftest.py
import pytest
from celery.contrib.testing.worker import start_worker

from orders.celery_app import app as production_app


@pytest.fixture(scope="session")
def app():
    production_app.conf.update(
        broker_url="memory://",
        result_backend="cache+memory://",
        broker_transport_options={"polling_interval": 0.1},
    )
    return production_app


@pytest.fixture(scope="session")
def worker(app):
    with start_worker(app, pool="solo", perform_ping_check=False, queues=["celery", "reports"]) as w:
        yield w
```

```python
# tests_app/test_own_app.py
from orders.tasks import build_report, order_total


def test_real_app_config_is_used(app, worker):
    assert app.conf.task_acks_late is True
    assert order_total.delay([{"price_cents": 5, "qty": 2}]).get(timeout=10) == 10


def test_routed_task_needs_its_queue(worker):
    assert build_report.delay(3).get(timeout=10) == "report-3.pdf"
```

- `perform_ping_check=False` — the ping check needs the `celery.ping` test task (`import celery.contrib.testing.tasks` registers it).
- `queues=[...]` — `build_report` is routed to `reports`. Without that queue the worker never sees the message and `get(timeout=...)` raises `TimeoutError` — a real routing bug that eager mode would hide.
- Keep these tests in a separate directory (or session) from tests that use `celery_session_app`: both set the "current" app used by `@shared_task`.

## Testing Workflows

Build workflows in functions and test their **shape** without a broker; run one end-to-end test on the embedded worker.

```python
# orders/workflows.py
from celery import chain, chord, group

from orders.tasks import build_report, charge_order, notify, order_total, sum_totals


def checkout_workflow(order_id: int, amount_cents: int):
    return chain(
        charge_order.s(order_id, amount_cents),
        notify.s(channel="email"),
        build_report.si(order_id),
    )


def batch_total_workflow(carts: list[list[dict]]):
    return chord(group(order_total.s(cart) for cart in carts), sum_totals.s())


def place_order(order_id: int, amount_cents: int) -> str:
    """Called by the API: enqueue and return the task id."""
    result = checkout_workflow(order_id, amount_cents).apply_async()
    return result.id
```

```python
# tests/test_canvas.py
from unittest.mock import patch

from orders.workflows import batch_total_workflow, checkout_workflow, place_order


def test_checkout_workflow_shape():
    workflow = checkout_workflow(1, 500)
    assert [sig.task for sig in workflow.tasks] == [
        "orders.tasks.charge_order",
        "orders.tasks.notify",
        "orders.tasks.build_report",
    ]
    charge, notify, report = workflow.tasks
    assert charge.args == (1, 500)
    assert notify.kwargs == {"channel": "email"}
    assert report.immutable  # si(): does not receive the previous result
    assert report.args == (1,)


def test_batch_total_is_a_chord():
    workflow = batch_total_workflow([[{"price_cents": 100, "qty": 1}]] * 3)
    assert len(workflow.tasks) == 3
    assert workflow.body.task == "orders.tasks.sum_totals"


def test_signatures_are_json_friendly():
    sig = checkout_workflow(1, 500).tasks[1]
    assert dict(sig)["kwargs"] == {"channel": "email"}


def test_place_order_enqueues_checkout():
    with patch("orders.workflows.checkout_workflow") as workflow:
        workflow.return_value.apply_async.return_value.id = "task-123"
        assert place_order(1, 500) == "task-123"
    workflow.assert_called_once_with(1, 500)
    workflow.return_value.apply_async.assert_called_once_with()


def test_workflow_end_to_end(celery_session_worker, repo, gateway):
    assert checkout_workflow(1, 500).delay().get(timeout=10) == "report-1.pdf"
    assert repo.is_paid(1)
```

`chain(...)` returns an internal `_chain` subclass, so `isinstance(workflow, chain)` is `False` — assert on `.tasks` instead. For the producer side (API endpoint, service), patch the workflow factory or `delay` and assert the **arguments** it was called with; that is the contract with the worker.

## Testing the Beat Schedule

A typo in `beat_schedule` is not an error: beat sends a message for an unknown task name and the worker rejects it. Test the schedule as data:

```python
# tests_app/test_beat_schedule.py
from datetime import datetime, timezone

import pytest


def test_every_scheduled_task_is_registered(app):
    app.loader.import_default_modules()
    for name, entry in app.conf.beat_schedule.items():
        assert entry["task"] in app.tasks, f"{name}: unknown task {entry['task']}"


@pytest.mark.parametrize(
    ("now", "due"),
    [
        (datetime(2026, 9, 30, 2, 30, 5, tzinfo=timezone.utc), True),
        (datetime(2026, 9, 30, 2, 29, 0, tzinfo=timezone.utc), False),
    ],
)
def test_nightly_report_schedule(app, now, due):
    schedule = app.conf.beat_schedule["nightly-sales-report"]["schedule"]   # crontab(hour=2, minute=30)
    schedule.nowfun = lambda: now
    last_run = datetime(2026, 9, 29, 2, 30, tzinfo=timezone.utc)
    assert schedule.is_due(last_run).is_due is due
```

## Testing Tracing

`CeleryInstrumentor` hooks into Celery signals, so it also works with the embedded worker. With the in-memory exporter from [OpenTelemetry — Testing](../opentelemetry/06-testing.md):

```python
# tests/test_tracing.py
import pytest
from opentelemetry.instrumentation.celery import CeleryInstrumentor
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.trace import SpanKind

from orders.tasks import order_total


@pytest.fixture
def spans():
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    instrumentor = CeleryInstrumentor()
    instrumentor.instrument(tracer_provider=provider)
    yield exporter
    instrumentor.uninstrument()


def test_publish_and_run_share_one_trace(celery_session_worker, spans):
    order_total.delay([{"price_cents": 100, "qty": 1}]).get(timeout=10)
    by_kind = {s.kind: s for s in spans.get_finished_spans()}
    producer, consumer = by_kind[SpanKind.PRODUCER], by_kind[SpanKind.CONSUMER]
    assert producer.name == "apply_async/orders.tasks.order_total"
    assert consumer.name == "run/orders.tasks.order_total"
    assert consumer.context.trace_id == producer.context.trace_id
    assert consumer.attributes["celery.state"] == "SUCCESS"
```

## Checklist

- [ ] Business logic is tested as plain functions; tasks are thin
- [ ] Each task has a "run twice" idempotency test
- [ ] Retried vs non-retried exceptions are tested (patch `retry`); `apply()` covers the retry limit
- [ ] Eager mode, if used, has `task_eager_propagates=True` and is not the only test of task code
- [ ] Workflow shapes are tested without a broker; one end-to-end run on an embedded worker
- [ ] Embedded worker config matches production where it matters (routes, acks, queues)
- [ ] `beat_schedule` entries point to registered tasks
- [ ] Every `get()` has a timeout

---
## See also
- [Celery — Distributed Task Queue for Python](./index.md)
- [Celery — Integration Tests & Flakiness](./06-integration-testing.md)
- [Celery — Tasks & Calling](./01-tasks-calling.md)
- [Celery — Canvas Workflows](./02-canvas-workflows.md)
- [Pytest](../pytest/index.md)
- [OpenTelemetry — Testing with OpenTelemetry](../opentelemetry/06-testing.md)
