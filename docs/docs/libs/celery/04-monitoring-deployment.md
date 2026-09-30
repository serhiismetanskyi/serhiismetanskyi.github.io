---
date: 2026-09-30 18:10:00
tags:
  - python
  - libraries
  - celery
  - observability
  - opentelemetry
  - docker
  - deployment
---

# Celery — Monitoring & Deployment

A task queue fails quietly: the API returns `202 Accepted`, and the task sits in a queue nobody consumes, retries for an hour, or dies with the pool process. Monitoring answers four questions — **are workers alive, are queues draining, which tasks fail, how long do they take** — and the same tools help to debug failing tests.

| Tool | Answers | Needs |
|------|---------|-------|
| `celery status`, `inspect`, `control` | Which workers are up, what they run and reserve, their config | Broker access |
| Events (`-E`) | Live stream of task lifecycle events | `worker_send_task_events=True` |
| Flower | Web UI, REST API, Prometheus metrics | Events |
| OpenTelemetry | Traces across API → broker → worker, task duration, errors | `opentelemetry-instrumentation-celery` |
| Logs | What happened inside a task | `get_task_logger`, central log storage |
| Broker metrics | Queue length and age | Redis / RabbitMQ exporter |

## CLI: `status`, `inspect`, `control`

```bash
celery -A orders.celery_app status                  # -> celery@host: OK   1 node online.
celery -A orders.celery_app inspect ping
celery -A orders.celery_app inspect active          # tasks running now
celery -A orders.celery_app inspect reserved        # prefetched, waiting for a slot
celery -A orders.celery_app inspect scheduled       # countdown / eta tasks held by workers
celery -A orders.celery_app inspect active_queues   # which queues each worker consumes
celery -A orders.celery_app inspect registered      # task names each worker knows
celery -A orders.celery_app inspect stats           # pool, processes, totals, broker info
celery -A orders.celery_app inspect conf            # effective configuration

celery -A orders.celery_app control enable_events
celery -A orders.celery_app control rate_limit orders.tasks.build_report 10/m
celery -A orders.celery_app control revoke <task_id>
celery -A orders.celery_app control add_consumer reports
celery -A orders.celery_app call orders.tasks.order_total --args='[[{"price_cents": 100, "qty": 3}]]'
celery -A orders.celery_app result <task_id>
```

`celery inspect --list` and `celery control --list` print all commands. Remote control works with the Redis and RabbitMQ transports; add `-d celery@host` to target one worker and `-j` for JSON output.

The same from Python — useful in test fixtures and health checks:

```python
insp = app.control.inspect(timeout=1)
insp.active_queues()
# {'emails@host': [{'name': 'emails', ...}], 'main@host': [{'name': 'default', ...}, {'name': 'reports', ...}]}
app.control.ping(timeout=1)
# [{'emails@host': {'ok': 'pong'}}, {'main@host': {'ok': 'pong'}}]
```

`inspect` asks workers, so it only knows what workers hold. Messages still in the broker are not listed — check queue length in the broker (`redis-cli LLEN celery` for the Redis transport).

## Events

With `worker_send_task_events=True` (or `celery worker -E`) workers publish `task-received`, `task-started`, `task-succeeded`, `task-failed`, `task-retried` and worker heartbeats. `task_send_sent_event=True` adds `task-sent` from the producer.

```bash
celery -A orders.celery_app events           # curses UI
celery -A orders.celery_app events --dump    # raw events to stdout
```

```python
def on_event(event: dict) -> None:
    if event["type"].startswith("task-"):
        print(event["type"], event["uuid"], event.get("name", ""), event.get("runtime", ""))


with app.connection() as conn:
    receiver = app.events.Receiver(conn, handlers={"*": on_event})
    receiver.capture(limit=None, timeout=None, wakeup=True)
```

Output for a periodic `proj.heartbeat` task:

```text
task-sent 30bd4c16-... proj.heartbeat
task-received 30bd4c16-... proj.heartbeat
task-started 30bd4c16-...
task-succeeded 30bd4c16-...  0.00046780999764450826
```

## Flower

Flower is a web UI and API on top of events and remote control.

```bash
uv add flower
celery -A orders.celery_app flower --port=5555 --basic-auth=qa:secret
```

| Endpoint | Content |
|----------|---------|
| `/` | Workers, tasks, broker, per-task details and tracebacks |
| `/metrics` | Prometheus metrics: `flower_events_total`, `flower_task_runtime_seconds`, `flower_task_prefetch_time_seconds`, `flower_worker_online`, `flower_worker_number_of_currently_executing_tasks`, `flower_worker_prefetched_tasks` |
| `/healthcheck` | `OK` — Flower itself is up |
| `/api/workers`, `/api/tasks`, `/api/task/info/<id>` | REST API |

- The REST API needs authentication. Without it Flower answers `FLOWER_UNAUTHENTICATED_API environment variable is required to enable API without authentication`; with `--basic-auth` a request without credentials gets `401`.
- Options can come from `FLOWER_`-prefixed environment variables, for example `FLOWER_BASIC_AUTH=qa:secret`.
- When Flower connects, it turns task events on in the workers (`Events of group {task} enabled by remote` in the worker log).
- Flower keeps task history in memory (`--max-tasks`, default 100 000). Use it for live views and alerts on metrics, not as the system of record.

## OpenTelemetry

`opentelemetry-instrumentation-celery` creates a `PRODUCER` span when a task is sent and a `CONSUMER` span when it runs, and passes the trace context in message headers — the worker span joins the trace of the API request.

```python
# orders/telemetry.py
from celery.signals import worker_process_init
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.celery import CeleryInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor


def setup_tracing(service_name: str) -> None:
    provider = TracerProvider(resource=Resource.create({"service.name": service_name}))
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)
    CeleryInstrumentor().instrument()


@worker_process_init.connect(weak=False)
def init_worker_tracing(*args, **kwargs) -> None:
    setup_tracing("orders-worker")          # once per prefork child process
```

```bash
uv add opentelemetry-sdk opentelemetry-exporter-otlp opentelemetry-instrumentation-celery
```

Import `orders.telemetry` in the module the worker loads (for example at the end of `orders/celery_app.py`); call `setup_tracing("orders-api")` in the producer (API) process. A run with `ConsoleSpanExporter` instead of OTLP, for a task `add` in module `otelproj`:

| Process | Span | Kind | Trace id |
|---------|------|------|----------|
| API | `checkout` (manual) | `INTERNAL` | `0x7b76...1ecc` |
| API | `apply_async/otelproj.add` | `PRODUCER` | `0x7b76...1ecc` |
| Worker | `run/otelproj.add` | `CONSUMER` | `0x7b76...1ecc` |

Span attributes include `celery.task_name`, `celery.state`, `celery.hostname`, `messaging.message.id`.

- Initialize the SDK **in `worker_process_init`**, not at import time: with prefork, exporters and their background threads created before fork do not work in the children. Same rule as for Gunicorn workers in [OpenTelemetry — Auto-Instrumentation](../opentelemetry/04-auto-instrumentation.md).
- With `BatchSpanProcessor` spans leave in batches; short-lived workers should flush on shutdown (`provider.force_flush()` in `worker_process_shutdown`).
- Asserting on these spans in tests: [05 Testing](./05-testing.md) and [OpenTelemetry — Testing](../opentelemetry/06-testing.md).

## Logging

```python
from celery.utils.log import get_task_logger

logger = get_task_logger(__name__)


@shared_task(bind=True)
def build_report(self, order_id: int) -> str:
    logger.info("building report for order %s (attempt %s)", order_id, self.request.retries + 1)
    ...
```

Task loggers add the task name and id to each record: `orders.tasks.build_report[<task id>]: building report ...`. The worker replaces the root logger configuration by default; set `worker_hijack_root_logger=False` if the app configures logging itself (JSON logs, OpenTelemetry log export).

## Docker Compose

```dockerfile
# Dockerfile
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-install-project --no-dev
COPY orders ./orders
ENV PATH="/app/.venv/bin:$PATH"
RUN useradd --create-home app
USER app
```

```yaml
# compose.yaml
services:
  redis:
    image: redis:8-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  worker:
    build: .
    command: celery -A orders.celery_app worker --loglevel=INFO --concurrency=2 --queues=celery,reports
    environment: &celery-env
      CELERY_BROKER_URL: redis://redis:6379/0
      CELERY_RESULT_BACKEND: redis://redis:6379/1
    depends_on:
      redis:
        condition: service_healthy
    stop_grace_period: 60s
    healthcheck:
      test: ["CMD-SHELL", "celery -A orders.celery_app inspect ping --destination celery@$$HOSTNAME --timeout 5"]
      interval: 30s
      timeout: 10s
      start_period: 20s
      retries: 3

  beat:
    build: .
    command: celery -A orders.celery_app beat --loglevel=INFO --schedule=/tmp/celerybeat-schedule
    environment: *celery-env
    depends_on:
      redis:
        condition: service_healthy

  flower:
    build: .
    command: celery -A orders.celery_app flower --port=5555
    environment:
      <<: *celery-env
      FLOWER_BASIC_AUTH: qa:secret
    ports:
      - "5555:5555"
    depends_on:
      - worker
```

```bash
docker compose up -d --build
docker compose exec worker celery -A orders.celery_app call orders.tasks.order_total \
  --args='[[{"price_cents": 100, "qty": 3}]]'
docker compose exec worker celery -A orders.celery_app result <task_id>     # 300
docker compose ps                                                          # worker ... (healthy)
docker compose down
```

- **Health check** — `inspect ping` to this container's worker (`celery@$HOSTNAME`; `$$` escapes `$` in Compose). A process that is running but not consuming fails it.
- **Shutdown** — `docker compose stop` sends `SIGTERM`: a **warm shutdown** (`worker: Warm shutdown (MainProcess)`) stops taking new tasks and waits for running ones. `stop_grace_period` must be longer than your longest task, or Docker kills the worker with `SIGKILL` — with `acks_late` the task is redelivered, without it the task is lost.
- **One beat** — never scale the `beat` service; scale `worker` (`docker compose up -d --scale worker=3`).
- **Separate images are not needed** — worker, beat and Flower run the same image with different commands.
- **Secrets** — the broker URL contains the password in production (`rediss://:password@host:6380/0`); pass it via secrets or environment, not in the image.
- **No `--reload` for workers** — restart the container after code changes; tasks registered at startup are what the worker runs.

## Production Checklist

- [ ] Worker health check (`inspect ping`) and alert on `flower_worker_online == 0`
- [ ] Queue length and age are monitored in the broker
- [ ] Failed and retried task rates are graphed (Flower metrics or OpenTelemetry)
- [ ] Traces connect API requests to worker spans; the SDK is initialized per worker process
- [ ] `stop_grace_period` / `terminationGracePeriodSeconds` exceed the longest task
- [ ] Exactly one beat instance
- [ ] Flower is behind authentication and not exposed publicly
- [ ] Broker credentials come from secrets; TLS (`rediss://`, `amqps://`) outside a private network

---
## See also
- [Celery — Distributed Task Queue for Python](./index.md)
- [Celery — Configuration, Workers & Beat](./03-config-workers-beat.md)
- [OpenTelemetry — Python Observability](../opentelemetry/index.md)
- [OpenTelemetry — Auto-Instrumentation](../opentelemetry/04-auto-instrumentation.md)
- [Docker Compose](../../tools/docker/03-docker-compose.md)
- [CI/CD](../../ci-cd-approaches/index.md)
