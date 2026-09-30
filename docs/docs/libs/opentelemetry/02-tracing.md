---
date: 2026-09-27
tags:
  - python
  - libraries
  - opentelemetry
  - observability
---

# OpenTelemetry — Tracing

## Tracer Provider Setup

Configure the SDK once, as early as possible in the entry point (`main.py`, app factory).

```python
# telemetry.py
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter, SimpleSpanProcessor
from opentelemetry.sdk.trace.sampling import ParentBased, TraceIdRatioBased


def setup_tracing(service_name: str, *, debug: bool = False) -> TracerProvider:
    provider = TracerProvider(
        resource=Resource.create({"service.name": service_name}),
        sampler=ParentBased(TraceIdRatioBased(1.0)),
    )
    # endpoint, headers and TLS come from OTEL_EXPORTER_OTLP_* env vars
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    if debug:
        provider.add_span_processor(SimpleSpanProcessor(ConsoleSpanExporter()))
    trace.set_tracer_provider(provider)
    return provider
```

| Processor | Behavior | Use |
|-----------|----------|-----|
| `BatchSpanProcessor` | Buffers spans, exports in the background | Production |
| `SimpleSpanProcessor` | Exports each span synchronously on `end()` | Tests, local debugging |

`trace.set_tracer_provider()` works only once per process; later calls log a warning and are ignored.

## Getting a Tracer

```python
from opentelemetry import trace

tracer = trace.get_tracer(__name__)   # instrumentation scope = module name
```

Call `get_tracer` at module level. Before the SDK is configured it returns a proxy that starts delegating once a provider is set.

## Creating Spans

### Context manager (preferred)

```python
with tracer.start_as_current_span("reserve_stock") as span:
    span.set_attribute("shop.order.id", order.id)
    span.set_attribute("shop.order.items", len(order.items))
    reserve(order)
```

The span becomes the **current** span: child spans and instrumented calls inside the block are attached to it.

### Decorator

```python
@tracer.start_as_current_span("calculate_discount")
def calculate_discount(cart: Cart) -> Decimal:
    ...
```

Works for `async def` functions too.

### Manual start / end

Use when the operation does not fit one block (callbacks, streaming):

```python
span = tracer.start_span("stream_upload")
try:
    for chunk in chunks:
        send(chunk)
finally:
    span.end()
```

A span started with `start_span` is **not** current. To make it the parent of nested work, use `trace.use_span(span)`.

## Attributes, Events and Status

```python
from opentelemetry.trace import Status, StatusCode

with tracer.start_as_current_span("charge_card", kind=trace.SpanKind.CLIENT) as span:
    span.set_attributes({"payment.provider": "stripe", "payment.amount": 49.90})
    span.add_event("card.tokenized", {"card.brand": "visa"})
    try:
        result = gateway.charge(token, amount)
    except GatewayDeclined as exc:
        span.set_status(Status(StatusCode.ERROR, "card declined"))
        span.set_attribute("error.type", "card_declined")
        raise
```

| Method | Stores |
|--------|--------|
| `set_attribute(key, value)` | `str`, `bool`, `int`, `float` or a homogeneous sequence of them |
| `add_event(name, attributes)` | A timestamped point inside the span |
| `record_exception(exc)` | An `exception` event with type, message and stacktrace |
| `set_status(Status(...))` | Final outcome: `ERROR` marks the span as failed in backends |
| `update_name(name)` | Rename, e.g. once the route template is known |

### Exceptions

`start_as_current_span` records an exception and sets `ERROR` status automatically if one escapes the block (`record_exception=True`, `set_status_on_exception=True` by default). Record manually only when you catch and handle an error but still want it visible:

```python
with tracer.start_as_current_span("load_profile") as span:
    try:
        profile = cache.get(user_id)
    except CacheUnavailable as exc:
        span.record_exception(exc)    # handled: status stays UNSET
        profile = db.load_profile(user_id)
```

!!! tip "When is a span an error?"
    A `SERVER` span returning 4xx is **not** an error by convention (the client made a mistake); 5xx is. A `CLIENT` span receiving 4xx or 5xx **is** an error from the caller's side.

## Span Naming

| Good | Bad | Why |
|------|-----|-----|
| `GET /orders/{id}` | `GET /orders/9812` | IDs explode cardinality |
| `charge_card` | `charge card for user 42` | Put data in attributes |
| `SELECT orders` | full SQL text | SQL goes into `db.query.text` |

## Span Links

Links connect spans that are related but not parent-child: a batch job processing messages from many traces, or a retry started in a new trace.

```python
from opentelemetry.trace import Link

links = []
for msg in batch:
    span_ctx = trace.get_current_span(extract(msg.headers)).get_span_context()
    if span_ctx.is_valid:
        links.append(Link(span_ctx, {"messaging.message.id": msg.id}))

with tracer.start_as_current_span("process_batch", links=links):
    process(batch)
```

## Accessing the Current Span

```python
span = trace.get_current_span()
span.set_attribute("shop.user.tier", user.tier)   # enrich the auto-created HTTP span

ctx = span.get_span_context()
trace_id = format(ctx.trace_id, "032x")           # for logs, error pages, support tickets
```

Adding attributes to the current server span from a route handler is the cheapest way to enrich auto-instrumented traces.

## Async and Threads

- **asyncio** — context follows `await`, `asyncio.create_task` and `asyncio.gather` automatically.
- **Threads** — context is **not** copied into new threads. Pass it explicitly:

```python
from concurrent.futures import ThreadPoolExecutor
from opentelemetry import context

def run_with_context(ctx, fn, *args):
    token = context.attach(ctx)
    try:
        return fn(*args)
    finally:
        context.detach(token)

ctx = context.get_current()
with ThreadPoolExecutor() as pool:
    futures = [pool.submit(run_with_context, ctx, fetch, url) for url in urls]
```

`opentelemetry-instrumentation-threading` does this for `ThreadPoolExecutor` and `threading.Thread` automatically.

## Sampling

| Sampler | Decision |
|---------|----------|
| `ALWAYS_ON` / `ALWAYS_OFF` | Keep / drop everything |
| `TraceIdRatioBased(0.1)` | Keep 10% of traces, deterministic by `trace_id` |
| `ParentBased(root=...)` | Follow the parent's decision; use `root` only for new traces |

Always wrap a ratio sampler in `ParentBased` — otherwise services make independent decisions and traces arrive broken. Head sampling (in the SDK) is cheap but blind to the outcome; to keep all errors and slow requests use **tail sampling** in the Collector ([05 Collector & Backends](./05-collector-backends.md)).

## Shutdown

```python
provider = setup_tracing("nightly-report")
try:
    run_report()
finally:
    provider.shutdown()   # flushes buffered spans; without it the last batch is lost
```

Long-running servers flush on interpreter exit via `atexit`, but short scripts, CLI tools, Lambda handlers and Celery tasks should flush explicitly (`provider.force_flush()`).

---
## See also
- [OpenTelemetry — Python Observability](./index.md)
- [OpenTelemetry — Core Concepts](./01-core-concepts.md)
- [OpenTelemetry — Metrics & Logs](./03-metrics-logs.md)
- [Celery — Monitoring & Deployment](../celery/04-monitoring-deployment.md)
