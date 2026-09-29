---
date: 2026-09-27
tags:
  - python
  - libraries
  - opentelemetry
  - observability
  - pytest
  - testing
---

# OpenTelemetry — Testing with OpenTelemetry

Two different goals:

1. **Test the instrumentation** — unit tests assert that code emits the right spans, attributes and metrics.
2. **Use telemetry in tests** — link test runs to backend traces, debug failures, assert on system behavior (trace-based testing).

## In-Memory Span Exporter

```python
# tests/conftest.py
import pytest
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

_exporter = InMemorySpanExporter()
_provider = TracerProvider()
_provider.add_span_processor(SimpleSpanProcessor(_exporter))
trace.set_tracer_provider(_provider)   # global, can be set only once per process


@pytest.fixture
def spans() -> InMemorySpanExporter:
    _exporter.clear()
    yield _exporter
    _exporter.clear()
```

- `SimpleSpanProcessor` exports on `span.end()` — spans are available right after the code under test returns.
- The global provider can be set **once**, so configure it at import time of `conftest.py` and clear the exporter per test.
- Alternatively, inject a tracer into the code under test (`TracerProvider().get_tracer(...)`) and avoid globals entirely.

## Asserting Spans

```python
import pytest
from opentelemetry.trace import SpanKind, StatusCode

from shop.checkout import checkout


def test_checkout_creates_span_with_order_attributes(spans):
    checkout(order_id="ord-42", items=3)

    finished = spans.get_finished_spans()
    span = next(s for s in finished if s.name == "checkout")

    assert span.kind is SpanKind.INTERNAL
    assert span.attributes["shop.order.id"] == "ord-42"
    assert span.attributes["shop.order.items"] == 3
    assert span.status.status_code is StatusCode.UNSET


def test_payment_failure_marks_span_as_error(spans, failing_gateway):
    with pytest.raises(PaymentDeclined):
        checkout(order_id="ord-43", items=1)

    span = next(s for s in spans.get_finished_spans() if s.name == "charge_card")
    assert span.status.status_code is StatusCode.ERROR
    assert any(e.name == "exception" for e in span.events)
    assert span.events[-1].attributes["exception.type"].endswith("PaymentDeclined")
```

### Asserting the span tree

```python
def by_name(spans):
    return {s.name: s for s in spans}

def test_charge_is_child_of_checkout(spans):
    checkout(order_id="ord-44", items=2)
    s = by_name(spans.get_finished_spans())

    assert s["charge_card"].parent.span_id == s["checkout"].context.span_id
    assert s["charge_card"].context.trace_id == s["checkout"].context.trace_id
```

Spans are finished **child first**, so `get_finished_spans()` lists children before parents. Look up spans by name instead of relying on indices.

## Testing Auto-Instrumented FastAPI

```python
from fastapi.testclient import TestClient
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

from app.main import create_app


@pytest.fixture
def client():
    app = create_app()
    FastAPIInstrumentor.instrument_app(app)
    yield TestClient(app)
    FastAPIInstrumentor.uninstrument_app(app)


def test_route_span_uses_template(client, spans):
    client.get("/orders/9812")

    server = next(s for s in spans.get_finished_spans() if s.kind is SpanKind.SERVER)
    assert server.name == "GET /orders/{order_id}"          # template, not the raw ID
    assert server.attributes["http.route"] == "/orders/{order_id}"
```

This catches a common regression: span names containing IDs, which explodes cardinality in the backend.

## Testing Metrics

```python
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import InMemoryMetricReader


def test_orders_counter():
    reader = InMemoryMetricReader()
    meter = MeterProvider(metric_readers=[reader]).get_meter("test")
    service = OrderService(meter=meter)          # inject the meter

    service.create(payment_method="card")
    service.create(payment_method="card")

    data = reader.get_metrics_data()
    metric = next(
        m for rm in data.resource_metrics for sm in rm.scope_metrics for m in sm.metrics
        if m.name == "shop.orders.created"
    )
    point = metric.data.data_points[0]
    assert point.value == 2
    assert point.attributes == {"payment.method": "card"}
```

Metrics use an injected `MeterProvider` here, because the global one — like the tracer provider — can be set only once.

## Linking Test Runs to Backend Traces

For end-to-end and API tests against a deployed system, give every test its own trace and send `traceparent` with each request. A failing test then points straight to the backend trace.

```python
# tests/conftest.py
import pytest
from opentelemetry import baggage, context, trace
from opentelemetry.propagate import inject

tracer = trace.get_tracer("tests")


@pytest.fixture(autouse=True)
def test_trace(request):
    ctx = baggage.set_baggage("test.run.id", request.config.getoption("--run-id", "local"))
    token = context.attach(ctx)
    with tracer.start_as_current_span(request.node.nodeid, attributes={"test.name": request.node.name}) as span:
        yield span
        trace_id = format(span.get_span_context().trace_id, "032x")
        request.node.user_properties.append(("trace_id", trace_id))   # lands in JUnit XML
    context.detach(token)


@pytest.fixture
def trace_headers() -> dict[str, str]:
    headers: dict[str, str] = {}
    inject(headers)    # traceparent + baggage for the current test span
    return headers
```

```python
# API test (Playwright APIRequestContext)
def test_create_order(playwright, trace_headers):
    api = playwright.request.new_context(base_url=BASE_URL, extra_http_headers=trace_headers)
    response = api.post("/orders", data={"sku": "book-1", "qty": 1})
    assert response.status == 201


# UI test: every browser request of the page carries the test's trace context
def test_checkout_ui(page, trace_headers):
    page.set_extra_http_headers(trace_headers)
    page.goto("/checkout")
```

Combined with the `keep-test-traffic` tail sampling policy ([05 Collector & Backends](./05-collector-backends.md)), all test traffic is kept, and the `trace_id` in the test report opens the full backend trace.

!!! tip "Attach the trace link to the report"
    Add a link like `https://grafana.example.com/explore?...traceId=<trace_id>` to Allure (`allure.dynamic.link`) or the pytest HTML report on failure.

## Trace-Based Testing

Instead of asserting only on the HTTP response, assert on what happened **inside** the system:

| Assertion | Example |
|-----------|---------|
| A call happened | `POST /charge` span exists in `payments-api` |
| A call did **not** happen | No span to the fraud service for trusted customers |
| Order of operations | `reserve_stock` ends before `charge_card` starts |
| Performance budget | `SELECT orders` span < 50 ms |
| Number of calls | Exactly one DB query per request (N+1 detection) |
| Errors are recorded | Retry spans have `error.type` set |

Implementation options:

1. **Query the trace backend** after the test (Tempo / Jaeger HTTP API by `trace_id`) and assert on the returned spans. Wait until spans arrive — export is asynchronous.
2. **Test in-process** with `InMemorySpanExporter` when the whole flow runs in one Python process (FastAPI `TestClient` + instrumented SQLAlchemy).
3. **Dedicated tools** such as Tracetest, which define trace assertions declaratively and run them in CI.

```python
def test_order_listing_has_no_n_plus_one(client, spans):
    client.get("/orders?limit=20")

    db_spans = [s for s in spans.get_finished_spans() if s.attributes.get("db.system.name")]
    assert len(db_spans) <= 2, [s.attributes.get("db.query.text") for s in db_spans]
```

## Checklist

- [ ] Critical business operations have spans with meaningful names and attributes
- [ ] Error paths set `ERROR` status and record exceptions
- [ ] Span names use route templates, not raw IDs
- [ ] Metric attributes are bounded (no IDs)
- [ ] `traceparent` is propagated through queues and background jobs
- [ ] Test runs carry their own trace and `test.run.id` baggage
- [ ] Health checks and test infrastructure noise are excluded

---
## See also
- [OpenTelemetry — Python Observability](./index.md)
- [OpenTelemetry — Tracing](./02-tracing.md)
- [Pytest](../pytest/index.md)
- [Playwright — API Testing](../playwright/02-api-testing.md)
- [FastAPI — Testing](../fastapi/05-testing.md)
- [Jaeger — Testing, CI & Troubleshooting](../../tools/jaeger/04-testing-ci-troubleshooting.md)
