---
date: 2026-09-27
tags:
  - python
  - libraries
  - opentelemetry
  - observability
---

# OpenTelemetry — Metrics & Logs

## Meter Provider Setup

```python
from opentelemetry import metrics
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource

reader = PeriodicExportingMetricReader(OTLPMetricExporter(), export_interval_millis=15_000)
provider = MeterProvider(resource=Resource.create({"service.name": "orders-api"}), metric_readers=[reader])
metrics.set_meter_provider(provider)

meter = metrics.get_meter(__name__)
```

Use the **same resource** for traces, metrics and logs — backends join signals by `service.name`.

## Instruments

| Instrument | Sync / async | Value | Example |
|------------|--------------|-------|---------|
| `Counter` | sync | Only goes up | Orders created, bytes sent |
| `UpDownCounter` | sync | Up and down | Items in queue, active connections |
| `Histogram` | sync | Distribution | Request duration, payload size |
| `Gauge` | sync | Current value, set directly | Last batch size, config version |
| `ObservableCounter` | async (callback) | Monotonic total read on export | CPU time, total GC collections |
| `ObservableUpDownCounter` | async | Current total read on export | Memory in use |
| `ObservableGauge` | async | Sampled value | Temperature, pool utilization |

### Sync instruments

```python
orders_created = meter.create_counter(
    "shop.orders.created", unit="{order}", description="Orders successfully created",
)
checkout_duration = meter.create_histogram(
    "shop.checkout.duration", unit="s", description="Checkout processing time",
)
queue_depth = meter.create_up_down_counter("shop.queue.depth", unit="{message}")

def checkout(order: Order) -> None:
    start = time.perf_counter()
    process(order)
    orders_created.add(1, {"payment.method": order.payment_method, "shop.region": order.region})
    checkout_duration.record(time.perf_counter() - start, {"payment.method": order.payment_method})
```

### Async (observable) instruments

The callback runs once per export cycle — no need to track the value yourself.

```python
from opentelemetry.metrics import CallbackOptions, Observation

def observe_pool(options: CallbackOptions):
    yield Observation(engine.pool.checkedout(), {"db.pool.name": "main"})

meter.create_observable_gauge("db.client.connection.count", callbacks=[observe_pool], unit="{connection}")
```

## Naming and Units

| Rule | Good | Bad |
|------|------|-----|
| Dotted, lowercase namespace | `shop.orders.created` | `OrdersCreated` |
| Unit in `unit=`, not in the name | `unit="s"` | `checkout_duration_seconds` |
| UCUM units | `s`, `ms`, `By`, `1`, `{request}` | `seconds`, `bytes` |
| Durations in seconds | `http.server.request.duration` (s) | mixed ms / s |

Prometheus exporters add the unit suffix and `_total` for counters when converting, e.g. `shop_checkout_duration_seconds`.

## Attribute Cardinality

Every unique combination of attribute values creates a new time series.

| Safe (bounded) | Dangerous (unbounded) |
|----------------|-----------------------|
| `http.request.method`, `http.route`, `http.response.status_code` | `user.id`, `session.id`, `order.id` |
| `payment.method`, `shop.region` | Full URL with IDs, raw SQL, error messages |

Rule of thumb: attributes with a fixed set of values go on metrics; per-request identifiers go on spans.

## Views

Views change how an instrument is aggregated or exported without touching the instrumentation code.

```python
from opentelemetry.sdk.metrics.view import ExplicitBucketHistogramAggregation, View, DropAggregation

views = [
    # Buckets tuned for a latency SLO (seconds)
    View(
        instrument_name="shop.checkout.duration",
        aggregation=ExplicitBucketHistogramAggregation([0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]),
    ),
    # Keep only low-cardinality attributes
    View(instrument_name="http.server.request.duration",
         attribute_keys={"http.request.method", "http.route", "http.response.status_code"}),
    # Drop a noisy instrument entirely
    View(instrument_name="http.server.active_requests", aggregation=DropAggregation()),
]

provider = MeterProvider(resource=resource, metric_readers=[reader], views=views)
```

## RED Metrics for a Service

| Metric | Instrument | Query idea |
|--------|------------|------------|
| **R**ate | `http.server.request.duration` histogram count | requests per second by route |
| **E**rrors | same histogram, filter `http.response.status_code >= 500` or `error.type` | error ratio |
| **D**uration | same histogram buckets | p50 / p95 / p99 latency |

HTTP server auto-instrumentation already records `http.server.request.duration` — one histogram covers all three.

## Logs

OpenTelemetry does not replace Python `logging`. It adds a handler that turns log records into OTLP log records carrying `trace_id` and `span_id`.

### Zero-code

```bash
export OTEL_PYTHON_LOGGING_AUTO_INSTRUMENTATION_ENABLED=true
export OTEL_LOGS_EXPORTER=otlp
opentelemetry-instrument python app.py
```

### Manual setup

```python
import logging

from opentelemetry._logs import set_logger_provider
from opentelemetry.exporter.otlp.proto.grpc._log_exporter import OTLPLogExporter
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor

logger_provider = LoggerProvider(resource=resource)
logger_provider.add_log_record_processor(BatchLogRecordProcessor(OTLPLogExporter()))
set_logger_provider(logger_provider)

logging.getLogger().addHandler(LoggingHandler(level=logging.INFO, logger_provider=logger_provider))

log = logging.getLogger(__name__)
with tracer.start_as_current_span("checkout"):
    log.info("payment accepted", extra={"shop.order.id": "ord-42"})   # carries trace_id + span_id
```

!!! note "Underscore modules"
    The Python logs API still lives in `opentelemetry._logs` and `opentelemetry.sdk._logs`. It is usable in production, but import paths may change between releases — pin versions.

### Trace IDs in plain text logs

If logs go to stdout and are shipped by an agent, inject the IDs into the format instead:

```python
from opentelemetry.instrumentation.logging import LoggingInstrumentor

LoggingInstrumentor().instrument(set_logging_format=True)
# 2026-09-27 10:15:02 INFO [app] [trace_id=4bf92f... span_id=00f067... resource.service.name=orders-api] payment accepted
```

This lets you jump from a log line to the trace in any backend that indexes `trace_id`.

## What Goes Where

| Question | Signal |
|----------|--------|
| Is the service healthy right now? Alert me. | Metrics |
| Why was *this* request slow? | Traces |
| What exactly did the code see and decide? | Logs (linked to the trace) |
| Which users are affected? | Span attributes, queried in the trace backend |

---
## See also
- [OpenTelemetry — Python Observability](./index.md)
- [OpenTelemetry — Tracing](./02-tracing.md)
- [OpenTelemetry — Auto-Instrumentation](./04-auto-instrumentation.md)
- [Cross-Cutting: SLO, Error Budget, Incident Playbook](../../api-architectures/05-cross-cutting/03-slo-error-budget-incident-playbook.md)
