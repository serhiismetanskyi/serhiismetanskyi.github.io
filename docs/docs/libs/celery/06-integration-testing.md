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

# Celery — Integration Tests & Flakiness

Tests with an in-memory broker and an embedded worker ([05 Testing Celery Code](./05-testing.md)) run in one process, with no network, no visibility timeout and no prefork pool. A small integration suite closes that gap: **a real broker in Docker and a real worker process**, started with the same command as in production. This page continues the example project from page 05 (`orders` package, `pyproject.toml` with the `integration` marker deselected by default) and ends with parallel runs and the common causes of flaky Celery tests.

## Real Broker and Worker Process

```bash
uv add --dev "testcontainers[redis]"
```

```python
# tests/integration/conftest.py
import gc
import os
import signal
import subprocess
import sys
import time

import pytest
from testcontainers.redis import RedisContainer


@pytest.fixture(scope="session")
def redis_url():
    with RedisContainer("redis:8-alpine") as redis:
        host = redis.get_container_host_ip()
        port = redis.get_exposed_port(6379)
        yield f"redis://{host}:{port}"


@pytest.fixture(scope="session")
def celery_env(redis_url):
    return {
        "CELERY_BROKER_URL": f"{redis_url}/0",
        "CELERY_RESULT_BACKEND": f"{redis_url}/1",
    }


@pytest.fixture(scope="session")
def app(celery_env):
    from orders.celery_app import app

    app.conf.update(
        broker_url=celery_env["CELERY_BROKER_URL"],
        result_backend=celery_env["CELERY_RESULT_BACKEND"],
    )
    app.set_current()
    yield app
    gc.collect()  # drop AsyncResult objects while Redis is still up: they unsubscribe on __del__
    app.close()


def wait_for_worker(app, timeout: float = 30.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if app.control.ping(timeout=0.5):
            return
    raise TimeoutError("Celery worker did not answer ping")


@pytest.fixture(scope="session")
def worker(app, celery_env, tmp_path_factory):
    log_path = tmp_path_factory.mktemp("celery") / "worker.log"
    with log_path.open("w") as log:
        proc = subprocess.Popen(
            [
                sys.executable, "-m", "celery", "-A", "orders.celery_app", "worker",
                "--pool=prefork", "--concurrency=2", "--queues=celery,reports",
                "--loglevel=INFO", "--without-mingle", "--without-gossip",
            ],
            env={**os.environ, **celery_env},
            stdout=log,
            stderr=subprocess.STDOUT,
        )
        try:
            wait_for_worker(app)
            yield proc
        finally:
            proc.send_signal(signal.SIGTERM)  # warm shutdown: finish running tasks
            proc.wait(timeout=30)
            print(log_path.read_text()[-2000:])   # worker log tail, visible with pytest -s
```

```python
# tests/integration/test_real_worker.py
import os
import signal
import time

import pytest
from celery import chord, group

from orders.tasks import build_report, order_total, sum_totals

pytestmark = pytest.mark.integration


def test_task_round_trip_through_redis(worker):
    assert order_total.delay([{"price_cents": 250, "qty": 4}]).get(timeout=10) == 1000


def test_build_report_is_routed_to_reports_queue(worker):
    result = build_report.delay(42)
    assert result.get(timeout=10) == "report-42.pdf"
    assert result.queue == "reports"          # stored because result_extended=True
    assert result.name == "orders.tasks.build_report"


def test_chord_with_real_backend(worker):
    header = group(order_total.s([{"price_cents": p, "qty": 1}]) for p in (100, 200, 300))
    assert chord(header, sum_totals.s()).delay().get(timeout=20) == 600


def wait_until_active(app, task_id: str, timeout: float = 10.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        for tasks in (app.control.inspect(timeout=0.5).active() or {}).values():
            for task in tasks:
                if task["id"] == task_id:
                    return task
    raise TimeoutError(f"task {task_id} never became active")


def test_task_is_redelivered_after_worker_process_crash(app, worker):
    result = build_report.delay(7, seconds=3)
    active = wait_until_active(app, result.id)
    os.kill(active["worker_pid"], signal.SIGKILL)  # simulate an OOM kill of the pool process
    assert result.get(timeout=30) == "report-7.pdf"
```

```bash
uv run pytest                    # unit + embedded worker (integration deselected by addopts)
uv run pytest -m integration     # needs Docker; about 10 s after the image is pulled
```

- The production app in this example has `result_extended=True`, so the backend stores the task name, arguments and queue — `result.queue` makes routing assertable.
- The crash test proves the `acks_late` + `task_reject_on_worker_lost` config: without `task_reject_on_worker_lost=True` it fails with `WorkerLostError`.
- The worker runs in **another process**: `monkeypatch` does not reach it. Integration tests use real dependencies (a test DB, a stub HTTP server such as WireMock) and assert on observable results.
- Without `gc.collect()` before the container stops, `AsyncResult` objects collected later try to unsubscribe from the stopped Redis, and pytest prints `ConnectionError` tracebacks as unraisable exceptions.
- In CI with Docker Compose or service containers, skip `testcontainers` and read `CELERY_BROKER_URL` from the environment instead.

## pytest-celery: Workers in Containers

pytest-celery 1.x is the Celery project's Docker-based test framework: the `celery_setup` fixture starts a broker, a result backend and a **worker container**, and injects your task modules into the worker.

```python
# tests_docker/pricing_tasks.py
from celery import shared_task


@shared_task
def cart_total(items: list[dict]) -> int:
    return sum(item["price_cents"] * item["qty"] for item in items)
```

```python
# tests_docker/conftest.py
import pytest
from pytest_celery import CeleryBackendCluster, CeleryBrokerCluster, RedisTestBackend, RedisTestBroker


@pytest.fixture
def celery_broker_cluster(celery_redis_broker: RedisTestBroker) -> CeleryBrokerCluster:
    cluster = CeleryBrokerCluster(celery_redis_broker)     # default: every supported broker
    yield cluster
    cluster.teardown()


@pytest.fixture
def celery_backend_cluster(celery_redis_backend: RedisTestBackend) -> CeleryBackendCluster:
    cluster = CeleryBackendCluster(celery_redis_backend)
    yield cluster
    cluster.teardown()


@pytest.fixture
def default_worker_tasks(default_worker_tasks: set) -> set:
    from tests_docker import pricing_tasks                # a self-contained task module

    default_worker_tasks.add(pricing_tasks)
    return default_worker_tasks
```

```python
# tests_docker/test_docker_worker.py
import pytest
from pytest_celery import CeleryTestSetup

from tests_docker.pricing_tasks import cart_total

pytestmark = pytest.mark.integration


def test_worker_in_container_runs_task(celery_setup: CeleryTestSetup):
    assert celery_setup.ready()
    queue = celery_setup.worker.worker_queue
    result = cart_total.s([{"price_cents": 100, "qty": 3}]).apply_async(queue=queue)
    assert result.get(timeout=30) == 300
    celery_setup.worker.assert_log_exists("succeeded")
```

- Without the cluster overrides, tests are **parametrized over all supported brokers and backends** (RabbitMQ, Redis, ...) — useful for libraries, heavy for applications.
- The default worker image is built from `python:3.10-slim` with the latest Celery from PyPI, not from your project's image. Task modules are copied into it, so they must not import the rest of your code base. For an application, define a custom worker container from your own Dockerfile.
- Use it for broker/version matrix tests and for testing Celery extensions; for application tests the subprocess worker above is simpler.

## Parallel Runs with pytest-xdist

- **In-memory broker** — every xdist process has its own `memory://` broker and its own session worker, so `pytest -n auto` works unchanged (checked with `-n 2`).
- **Shared real Redis** — give each xdist worker its own Redis database or key prefix, otherwise workers consume each other's tasks:

```python
@pytest.fixture(scope="session")
def redis_db(worker_id: str) -> int:
    return 0 if worker_id == "master" else int(worker_id.removeprefix("gw")) + 1
```

- **Container per xdist process** (the `testcontainers` fixture above is session-scoped) — full isolation, but N containers and N Celery workers. Fine for a handful of processes.
- Never share one Celery worker between xdist processes with in-process fakes — fakes live in the test process that set them.

## Flakiness Pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| Test hangs forever | `result.get()` without `timeout` on a task no worker consumes | Always `get(timeout=...)`; check `inspect active_queues` |
| `TimeoutError` only in CI | Route to a queue the test worker does not consume; slower CI | Pass `queues=[...]` to the worker; generous timeouts, not sleeps |
| Passes with eager, fails in staging | Routing, time limits, return serialization, acks are not exercised | Embedded worker for workflows; one integration test per critical path |
| `celery_worker` test waits and times out | pytest-celery replaced `celery_worker` with a container worker | `celery_session_worker` or `start_worker()` |
| Task sees old fake / real service | Fake set in the test process, task runs in another process | Embedded (thread) worker for fakes; real stubs for process workers |
| Test passes alone, fails in the suite | Leftover messages or results from a previous test; shared session worker state | Unique ids per test, fresh fakes per test, flush the Redis DB between modules |
| Random extra task run | Redelivery (`acks_late`, visibility timeout) or a retry from a previous test | Idempotent tasks; assert on state, not on call counts across tests |
| Order-dependent group assertions | Asserting on completion order | `GroupResult.get()` keeps signature order; compare sets for side effects |
| Retry tests take a minute | Real backoff with `max_retries` | Patch `retry` or use `apply()` for the loop; small `fail_times` on the worker |
| `PENDING` asserted as "queued" | `PENDING` is also "unknown id" | Assert on the final state after `get(timeout=...)` |
| Time-based tests flaky | `countdown`, `eta`, schedules depend on the clock | Test schedules as data with a fixed `nowfun`; avoid sleeping for ETA |
| Tracebacks after the session ends | Result objects unsubscribing after Redis stopped | `gc.collect()` and `app.close()` before the container stops |

## Checklist

- [ ] A small integration suite runs a real broker and a prefork worker, including a crash / redelivery test
- [ ] Every `get()` has a timeout; no `sleep()`-based waiting
- [ ] Integration tests are marked and run in a separate CI job
- [ ] The crash / redelivery test runs against the same worker settings as production
- [ ] xdist runs isolate brokers or Redis databases per process
- [ ] Flaky Celery tests are fixed at the cause (routing, timeouts, shared state), not with retries of the test

---
## See also
- [Celery — Testing Celery Code](./05-testing.md)
- [Celery — Monitoring & Deployment](./04-monitoring-deployment.md)
- [Celery — Distributed Task Queue for Python](./index.md)
- [Pytest — Flakiness Debugging](../pytest/02-practical-playbooks/03-flakiness-debugging.md)
- [Docker Compose](../../tools/docker/03-docker-compose.md)
- [Test Automation Framework](../../test-automation-framework/index.md)
