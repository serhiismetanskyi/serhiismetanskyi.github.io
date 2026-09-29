---
date: 2026-09-27
tags:
  - python
  - libraries
  - opentelemetry
  - observability
  - fastapi
---

# OpenTelemetry — Auto-Instrumentation

## Two Ways to Instrument Libraries

| Approach | How | Pros | Cons |
|----------|-----|------|------|
| **Zero-code** | `opentelemetry-instrument` wrapper + env vars | No code changes, covers every installed library | Less control; issues with some process models |
| **Programmatic** | `XxxInstrumentor().instrument()` in code | Explicit, testable, per-library options | You list libraries yourself |

Both use the same instrumentation packages (`opentelemetry-instrumentation-*`), which monkey-patch the library at import time.

## Zero-Code Instrumentation

```bash
uv add opentelemetry-distro opentelemetry-exporter-otlp
uv run opentelemetry-bootstrap -a requirements   # prints packages matching installed libs
uv add opentelemetry-instrumentation-fastapi opentelemetry-instrumentation-httpx \
       opentelemetry-instrumentation-sqlalchemy
```

```bash
export OTEL_SERVICE_NAME=orders-api
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
export OTEL_TRACES_EXPORTER=otlp
export OTEL_METRICS_EXPORTER=otlp
export OTEL_LOGS_EXPORTER=otlp
export OTEL_PYTHON_LOGGING_AUTO_INSTRUMENTATION_ENABLED=true

uv run opentelemetry-instrument uvicorn app.main:app --host 0.0.0.0 --port 8000
```

`opentelemetry-bootstrap -a install` installs the packages with `pip` directly; with uv prefer `-a requirements` and add them to `pyproject.toml` so the lockfile stays the source of truth.

### Useful settings

| Variable | Example | Effect |
|----------|---------|--------|
| `OTEL_TRACES_EXPORTER` | `console` | Print spans to stdout — quickest sanity check |
| `OTEL_PYTHON_DISABLED_INSTRUMENTATIONS` | `redis,urllib3` | Skip selected instrumentations |
| `OTEL_PYTHON_EXCLUDED_URLS` | `health,metrics` | No spans for health checks (all HTTP server instrumentations) |
| `OTEL_PYTHON_FASTAPI_EXCLUDED_URLS` | `/health,/ready` | Same, only for FastAPI |
| `OTEL_INSTRUMENTATION_HTTP_CAPTURE_HEADERS_SERVER_REQUEST` | `x-request-id,x-test-id` | Record request headers as span attributes |
| `OTEL_INSTRUMENTATION_HTTP_CAPTURE_HEADERS_SANITIZE_FIELDS` | `authorization,cookie` | Redact sensitive captured headers |
| `OTEL_SEMCONV_STABILITY_OPT_IN` | `http` | Emit stable HTTP semantic convention names |

### Process model caveats

| Server | Behavior |
|--------|----------|
| `uvicorn app:app` | Works |
| `uvicorn --reload` | Breaks instrumentation: the reloader spawns a fresh process. Use programmatic setup in dev |
| `uvicorn --workers N`, `gunicorn -w N` | Exporters created before fork do not work in workers. Initialize the SDK per worker (gunicorn `post_fork` hook) or run one worker per container |

## Programmatic Instrumentation (FastAPI)

```python
# app/telemetry.py
from fastapi import FastAPI
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.instrumentation.logging import LoggingInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from sqlalchemy.ext.asyncio import AsyncEngine


def instrument(app: FastAPI, engine: AsyncEngine) -> None:
    FastAPIInstrumentor.instrument_app(app, excluded_urls="/health,/ready")
    HTTPXClientInstrumentor().instrument()
    SQLAlchemyInstrumentor().instrument(engine=engine.sync_engine)
    LoggingInstrumentor().instrument(set_logging_format=True)
```

```python
# app/main.py
from contextlib import asynccontextmanager

from app.db import engine
from app.telemetry import instrument
from app.tracing import setup_tracing   # TracerProvider setup from 02 Tracing

provider = setup_tracing("orders-api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    provider.shutdown()


app = FastAPI(lifespan=lifespan)
instrument(app, engine)
```

Set up the SDK **before** instrumenting and before the first request, otherwise early spans go to the no-op provider.

## What Each Instrumentation Produces

| Package | Span | Key attributes | Metrics |
|---------|------|----------------|---------|
| `-fastapi` / `-asgi` | `SERVER` span per request: `GET /orders/{order_id}` | `http.route`, `http.request.method`, `http.response.status_code` | `http.server.request.duration`, `http.server.active_requests` |
| `-httpx`, `-requests`, `-urllib3` | `CLIENT` span per outgoing call, injects `traceparent` | `url.full`, `server.address`, `http.response.status_code` | `http.client.request.duration` |
| `-sqlalchemy`, `-psycopg`, `-asyncpg` | `CLIENT` span per query | `db.system.name`, `db.query.text`, `db.namespace` | connection pool metrics |
| `-redis` | `CLIENT` span per command | `db.system.name=redis`, `db.operation.name` | — |
| `-celery`, `-aio-pika`, `-kafka-python` | `PRODUCER` / `CONSUMER` spans, context in message headers | `messaging.system`, `messaging.destination.name` | — |
| `-logging` | — | adds `otelTraceID`, `otelSpanID` to log records | — |

## Hooks: Enriching Auto Spans

```python
def server_request_hook(span, scope):
    if span and span.is_recording():
        span.set_attribute("shop.tenant", scope["headers_dict"].get("x-tenant", "unknown"))

def client_response_hook(span, request, response):
    span.set_attribute("shop.upstream.cache", response.headers.get("x-cache", "miss"))

FastAPIInstrumentor.instrument_app(app, server_request_hook=server_request_hook)
HTTPXClientInstrumentor().instrument(response_hook=client_response_hook)
```

Hook signatures differ per package — check the instrumentation's docstring. Simpler alternative: `trace.get_current_span().set_attribute(...)` inside the route handler.

## Instrumenting One Client Only

```python
import httpx
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

payments = httpx.AsyncClient(base_url="https://payments.internal")
HTTPXClientInstrumentor.instrument_client(payments)   # other clients stay untouched
```

## Suppressing Instrumentation

Exporters, health probes or bulk jobs can flood traces with noise:

```python
from opentelemetry.instrumentation.utils import suppress_instrumentation

with suppress_instrumentation():
    httpx.get("http://localhost:8000/health")   # no span, no propagation
```

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| No spans at all | SDK not configured, wrong endpoint/protocol (4317 is gRPC, 4318 is HTTP) |
| Service shows as `unknown_service` | `OTEL_SERVICE_NAME` / `service.name` not set |
| Spans exist, but each service has its own trace | Client not instrumented, or a proxy strips `traceparent` |
| Route spans named `GET` without a path | Instrumented after routes were mounted, or a raw ASGI app without routing info |
| Spans missing after `--reload` / with gunicorn workers | See process model caveats above |
| Last spans of a script never arrive | Missing `provider.shutdown()` |

Enable SDK debug logs: `OTEL_LOG_LEVEL=debug` (or `logging.getLogger("opentelemetry").setLevel(logging.DEBUG)`).

---
## See also
- [OpenTelemetry — Python Observability](./index.md)
- [OpenTelemetry — Collector & Backends](./05-collector-backends.md)
- [FastAPI — Production Patterns](../fastapi/06-production-patterns.md)
- [HTTPX](../httpx/index.md)
- [SQLAlchemy](../sqlalchemy/index.md)
