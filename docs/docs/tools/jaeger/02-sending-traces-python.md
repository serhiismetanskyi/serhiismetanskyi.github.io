---
date: 2026-09-29
tags:
  - tools
  - observability
  - opentelemetry
  - jaeger
  - python
---

# Jaeger — Sending Traces from Python

Jaeger has no Python client of its own: services and tests use the OpenTelemetry SDK with an OTLP exporter. This page covers only the Jaeger-facing setup; spans, attributes and instrumentation in depth are in [OpenTelemetry — Tracing](../../libs/opentelemetry/02-tracing.md) and [Auto-Instrumentation](../../libs/opentelemetry/04-auto-instrumentation.md).

## Packages

```bash
uv add opentelemetry-api opentelemetry-sdk
uv add opentelemetry-exporter-otlp-proto-grpc      # OTLP gRPC -> :4317
uv add opentelemetry-exporter-otlp-proto-http      # OTLP HTTP -> :4318 (pick one, or install both)

# Instrumentation for the libraries in use
uv add opentelemetry-instrumentation-fastapi opentelemetry-instrumentation-requests
```

!!! warning "Not `opentelemetry-exporter-jaeger`"
    The Jaeger Thrift/gRPC exporter for Python was deprecated and removed. Jaeger accepts OTLP natively — use the OTLP exporters.

## gRPC or HTTP

| | OTLP gRPC | OTLP HTTP |
|--|-----------|-----------|
| Port | `4317` | `4318` |
| Exporter module | `opentelemetry.exporter.otlp.proto.grpc.trace_exporter` | `opentelemetry.exporter.otlp.proto.http.trace_exporter` |
| Endpoint in code | `http://localhost:4317` (no path) | `http://localhost:4318/v1/traces` (full path) |
| Good for | Services, lower overhead | Proxies, restricted networks, fewer native deps |

## Tracer Setup Module

```python
# app/telemetry.py
import os

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor


def setup_tracing(service_name: str) -> TracerProvider:
    resource = Resource.create({
        "service.name": service_name,
        "service.version": os.getenv("APP_VERSION", "dev"),
        "deployment.environment.name": os.getenv("APP_ENV", "local"),
    })
    provider = TracerProvider(resource=resource)
    # Endpoint and TLS come from OTEL_EXPORTER_OTLP_* env vars when not passed here
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)
    return provider
```

Resource attributes show up in Jaeger as **Process** tags of every span of the service. `service.name` is the entry in the Service dropdown.

## FastAPI Service

```python
# app/main.py
from contextlib import asynccontextmanager

import requests
from fastapi import FastAPI, HTTPException
from opentelemetry import trace
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor

from app.telemetry import setup_tracing

provider = setup_tracing("orders-api")
RequestsInstrumentor().instrument()          # outgoing calls: client spans + traceparent header


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    provider.shutdown()                      # flush buffered spans on shutdown


app = FastAPI(lifespan=lifespan)
FastAPIInstrumentor.instrument_app(
    app,
    excluded_urls="health",                  # no spans for health probes
    exclude_spans=["receive", "send"],       # drop the internal ASGI "http send/receive" spans
)                                            # incoming requests: server spans
tracer = trace.get_tracer(__name__)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/orders/{order_id}")
def get_order(order_id: str) -> dict:
    with tracer.start_as_current_span("load_order") as span:
        span.set_attribute("order.id", order_id)
        if order_id == "missing":
            raise HTTPException(status_code=404, detail="order not found")
    price = requests.get("http://pricing:8001/price", params={"order_id": order_id}, timeout=5)
    return {"id": order_id, "price": price.json()["amount"]}
```

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317 \
OTEL_EXPORTER_OTLP_INSECURE=true \
uv run uvicorn app.main:app --port 8000
```

One request to `/orders/42` produces a trace in Jaeger:

```text
orders-api   GET /orders/{order_id}            (server span, FastAPI)
orders-api   ├─ load_order                     (manual span)
orders-api   └─ GET                            (client span, requests)
pricing      └─ GET /price                     (server span, if pricing is instrumented)
```

Span names use the route template (`/orders/{order_id}`), not the raw URL — searches by operation stay usable.

## Zero-Code Alternative

The same result without `telemetry.py`, driven only by env vars:

```bash
uv add opentelemetry-distro opentelemetry-exporter-otlp
uv run opentelemetry-bootstrap -a requirements      # lists instrumentation packages to add

OTEL_SERVICE_NAME=orders-api \
OTEL_TRACES_EXPORTER=otlp \
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317 \
OTEL_EXPORTER_OTLP_PROTOCOL=grpc \
OTEL_PYTHON_EXCLUDED_URLS=health \
uv run opentelemetry-instrument uvicorn app.main:app --port 8000
```

Details and caveats (reload mode, workers) are in [OpenTelemetry — Auto-Instrumentation](../../libs/opentelemetry/04-auto-instrumentation.md).

## Environment Variables

| Variable | Example | Notes |
|----------|---------|-------|
| `OTEL_SERVICE_NAME` | `orders-api` | Overrides `service.name` from `OTEL_RESOURCE_ATTRIBUTES` |
| `OTEL_RESOURCE_ATTRIBUTES` | `service.version=1.4.0,deployment.environment.name=ci` | Extra Process tags in Jaeger |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://jaeger:4317` (gRPC) / `http://jaeger:4318` (HTTP) | Base URL; the HTTP exporter appends `/v1/traces` |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | `http://jaeger:4318/v1/traces` | Traces only; for HTTP used **as is**, so include the path |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `grpc` / `http/protobuf` | Used by `opentelemetry-instrument` to pick the exporter |
| `OTEL_EXPORTER_OTLP_INSECURE` | `true` | gRPC without TLS (local Jaeger) |
| `OTEL_EXPORTER_OTLP_HEADERS` | `authorization=Bearer abc` | When Jaeger sits behind an authenticating proxy |
| `OTEL_TRACES_SAMPLER` | `parentbased_traceidratio` | Sampler |
| `OTEL_TRACES_SAMPLER_ARG` | `0.1` | Ratio for `*traceidratio` samplers |
| `OTEL_BSP_SCHEDULE_DELAY` | `500` | Batch export delay in ms (default 5000) — lower in tests |

## Sampling

| Sampler | Behaviour | Use in |
|---------|-----------|--------|
| `parentbased_always_on` (default) | Keep everything; follow the parent's decision | Local, CI, test environments |
| `parentbased_traceidratio` + `0.1` | Keep 10% of new traces; child spans follow the parent | Production services |
| `always_off` | Record nothing | Disabling tracing without code changes |

- **Parent-based** matters for tests: when the test sends `traceparent` with the sampled flag (`-01`), the service keeps the trace even at a 1% ratio.
- Jaeger's **remote sampling** (`:5778`) serves per-service strategies to SDKs that implement the `jaeger_remote` sampler (Go, Java and others). The core Python SDK does not ship one — use env-var sampling in Python or tail sampling in a Collector.
- For "keep all errors and slow requests", use tail sampling in the [Collector](../../libs/opentelemetry/05-collector-backends.md#tail-sampling), not head sampling in the SDK.

## Verifying the Pipeline

```bash
# 1. Is Jaeger up?
curl -sf http://localhost:16686/api/v3/services

# 2. Send one span by hand over OTLP HTTP (no SDK involved)
NOW=$(date +%s)
curl -s -X POST http://localhost:4318/v1/traces \
  -H 'Content-Type: application/json' \
  -d '{"resourceSpans":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"curl-smoke"}}]},
       "scopeSpans":[{"spans":[{"traceId":"5b8efff798038103d269b633813fc60c","spanId":"eee19b7ec3c1b174",
       "name":"smoke","kind":1,"startTimeUnixNano":"'"${NOW}"'000000000","endTimeUnixNano":"'"${NOW}"'500000000"}]}]}]}'

# 3. Read it back
curl -s http://localhost:16686/api/v3/traces/5b8efff798038103d269b633813fc60c
```

If step 3 works but your service does not show up, the problem is on the app side: endpoint, protocol/port mismatch, missing flush, or a sampler dropping spans.

---
## See also
- [Jaeger — Distributed Tracing for OpenTelemetry](./index.md)
- [Jaeger — UI & Trace Analysis](./03-ui-trace-analysis.md)
- [OpenTelemetry — Core Concepts](../../libs/opentelemetry/01-core-concepts.md)
- [OpenTelemetry — Tracing](../../libs/opentelemetry/02-tracing.md)
- [OpenTelemetry — Auto-Instrumentation](../../libs/opentelemetry/04-auto-instrumentation.md)
- [FastAPI](../../libs/fastapi/index.md)
