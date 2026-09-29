---
date: 2026-09-29
tags:
  - tools
  - observability
  - opentelemetry
  - jaeger
  - testing
  - pytest
---

# Jaeger — Testing, CI & Troubleshooting

What Jaeger gives a test suite for a distributed system:

1. **One trace per test** — the test is the root span; every service call it triggers is a child, so a failure links to the full request path.
2. **Faster root cause** — slow spans, errors and retries are visible without reading logs of five services.
3. **Assertions on internals** — which services were called, how many DB queries, which calls must not happen.

The generic OTel test patterns (in-memory exporter, baggage, trace-based testing) are in [OpenTelemetry — Testing with OpenTelemetry](../../libs/opentelemetry/06-testing.md). This page adds the Jaeger side: links, queries and CI.

## Tracing a pytest Suite

```python
# tests/conftest.py
import os

import pytest
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.requests import RequestsInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.trace import Status, StatusCode

JAEGER_UI = os.getenv("JAEGER_UI", "http://localhost:16686")
RUN_ID = os.getenv("CI_PIPELINE_ID", "local")

provider = TracerProvider(resource=Resource.create({
    "service.name": "api-tests",
    "test.run.id": RUN_ID,
}))
# SimpleSpanProcessor: each span is exported when it ends — nothing is lost if pytest exits
provider.add_span_processor(SimpleSpanProcessor(OTLPSpanExporter(
    endpoint=os.getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "http://localhost:4318/v1/traces"),
)))
trace.set_tracer_provider(provider)
RequestsInstrumentor().instrument()      # every requests call gets a client span and a traceparent header

tracer = trace.get_tracer("api-tests")


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    report = outcome.get_result()
    if report.when == "call":
        item.test_outcome = report.outcome            # passed / failed / skipped


@pytest.fixture(autouse=True)
def test_span(request):
    with tracer.start_as_current_span(
        request.node.nodeid,
        attributes={"test.name": request.node.name, "test.run.id": RUN_ID},
    ) as span:
        yield span
        outcome = getattr(request.node, "test_outcome", "unknown")
        span.set_attribute("test.outcome", outcome)
        if outcome == "failed":
            span.set_status(Status(StatusCode.ERROR, "test failed"))
        trace_id = format(span.get_span_context().trace_id, "032x")
        request.node.user_properties.append(("jaeger_trace", f"{JAEGER_UI}/trace/{trace_id}"))  # -> JUnit XML


def pytest_sessionfinish(session, exitstatus):
    provider.shutdown()
```

```python
# tests/test_orders.py
import requests

BASE_URL = "http://localhost:8000"


def test_get_order():
    response = requests.get(f"{BASE_URL}/orders/42", timeout=5)
    assert response.status_code == 200


def test_missing_order_returns_404():
    response = requests.get(f"{BASE_URL}/orders/missing", timeout=5)
    assert response.status_code == 404
```

Because `requests` is instrumented, `traceparent` is injected automatically and the server spans of `orders-api` become children of the test span. In Jaeger: Service `api-tests`, Tags `test.outcome=failed` lists only the failed tests of all runs; `test.run.id=<id>` narrows to one pipeline.

!!! tip "Link in the report"
    `user_properties` end up in the JUnit XML (`--junitxml=report.xml`), which most CI systems render. With Allure, attach the same URL via `allure.dynamic.link(url, name="Jaeger trace")` inside the fixture.

## Propagating `traceparent` Manually

For clients that are not instrumented (httpx without its instrumentation, Playwright, gRPC stubs, message producers), inject the current context yourself:

```python
from opentelemetry.propagate import inject


def trace_headers() -> dict[str, str]:
    headers: dict[str, str] = {}
    inject(headers)          # {"traceparent": "00-<trace_id>-<span_id>-01"}
    return headers


def test_create_order_playwright(playwright):
    api = playwright.request.new_context(base_url="http://localhost:8000", extra_http_headers=trace_headers())
    response = api.post("/orders", data={"sku": "book-1", "qty": 1})
    assert response.status == 201
```

Call `trace_headers()` inside the test (while `test_span` is active); the flag `-01` marks the trace as sampled, so a service with `parentbased_*` sampling keeps it.

!!! warning "The system under test must extract the context"
    Propagation works only when the service is instrumented at its entry point (FastAPI, Flask, Django, gRPC instrumentation) and uses the same propagator (`tracecontext` is the default). If a proxy or API gateway strips unknown headers, the backend starts a new trace — the test trace then ends at the client span.

## Asserting on Spans via the Jaeger API

Export is asynchronous: spans reach Jaeger some time after the request returns. Poll with a deadline instead of `sleep()`.

```python
# tests/jaeger_client.py
import time

import requests
from opentelemetry.instrumentation.utils import suppress_instrumentation

JAEGER_UI = "http://localhost:16686"


def fetch_trace(trace_id: str, min_services: int = 1, timeout: float = 15.0) -> dict:
    """Wait until the trace is stored and contains spans from at least `min_services` services."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        with suppress_instrumentation():     # keep the polling calls out of the test's trace
            response = requests.get(f"{JAEGER_UI}/api/traces/{trace_id}", timeout=5)
        if response.status_code == 200:
            data = response.json()["data"][0]
            services = {p["serviceName"] for p in data["processes"].values()}
            if len(services) >= min_services:
                return data
        time.sleep(0.5)
    raise AssertionError(f"trace {trace_id} not complete in Jaeger after {timeout}s")


def spans_of(data: dict, service: str) -> list[dict]:
    pids = {pid for pid, p in data["processes"].items() if p["serviceName"] == service}
    return [s for s in data["spans"] if s["processID"] in pids]
```

```python
# tests/test_order_trace.py
import requests

from tests.jaeger_client import fetch_trace, spans_of


def test_order_calls_pricing_once(test_span):
    requests.get("http://localhost:8000/orders/42", timeout=5)
    trace_id = format(test_span.get_span_context().trace_id, "032x")

    data = fetch_trace(trace_id, min_services=3)            # api-tests, orders-api, pricing

    pricing_calls = [s for s in spans_of(data, "pricing") if s["operationName"] == "GET /price"]
    assert len(pricing_calls) == 1
    slow = [s for s in spans_of(data, "orders-api") if s["duration"] > 500_000]   # µs
    assert not slow, [(s["operationName"], s["duration"] / 1000) for s in slow]
```

Without `suppress_instrumentation()` the instrumented `requests` would inject `traceparent` into the Jaeger API calls too, and Jaeger's own query spans would show up inside the test trace.

The service spans are exported by the services with their own batching delay (5 s by default). Set `OTEL_BSP_SCHEDULE_DELAY=500` for the system under test in test environments to keep these tests fast.

## Jaeger in CI

```yaml
# .github/workflows/api-tests.yml (fragment)
jobs:
  api-tests:
    runs-on: ubuntu-latest
    services:
      jaeger:
        image: jaegertracing/jaeger:latest     # pin a version
        ports:
          - 4317:4317
          - 4318:4318
          - 16686:16686
    env:
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: http://localhost:4318/v1/traces
      CI_PIPELINE_ID: ${{ github.run_id }}
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v6
      - name: Start the system under test
        run: docker compose up -d --wait        # services export to the Jaeger service container
      - name: Run tests
        run: uv run pytest --junitxml=report.xml
      - name: Export traces of this run
        if: always()
        run: |
          curl -s -G http://localhost:16686/api/v3/traces \
            --data-urlencode "query.service_name=api-tests" \
            --data-urlencode "query.attributes={\"test.run.id\":\"${CI_PIPELINE_ID}\"}" \
            --data-urlencode "query.start_time_min=$(date -u -d '-2 hours' +%Y-%m-%dT%H:%M:%SZ)" \
            --data-urlencode "query.start_time_max=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            --data-urlencode "query.num_traces=1000" \
          | jq '.result' > jaeger-traces.json
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: jaeger-traces
          path: jaeger-traces.json
```

- The in-memory Jaeger dies with the job — **export traces as an artifact**. The file is OTLP JSON; locally: start Jaeger, open the UI, Search → **Upload**, drop `jaeger-traces.json`.
- Containers started by `docker compose` cannot reach the service container as `localhost`. Use the host gateway (`host.docker.internal` with `extra_hosts: ["host.docker.internal:host-gateway"]`) or run Jaeger inside the same Compose project and address it as `jaeger:4317`.
- The export query filters by the `test.run.id` attribute set on every test span, so only this run's traces (with all their backend spans) are downloaded.

## Common Pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| Service not in the dropdown | No span exported yet; wrong endpoint; app exited before flush | Check `OTEL_EXPORTER_OTLP_*`; call `provider.shutdown()`; send a smoke span with `curl` |
| `unknown_service:python` | `service.name` not set | `OTEL_SERVICE_NAME` or `Resource.create({"service.name": ...})` |
| Export errors, `StatusCode.UNAVAILABLE` or HTTP 404/415 | gRPC exporter pointed at `:4318`, or HTTP exporter at `:4317` | gRPC → 4317, HTTP → 4318 |
| HTTP exporter gets 404 | `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` without `/v1/traces` | Add the path (only the generic `..._ENDPOINT` gets it appended) |
| Works on the host, not in Docker | `localhost` inside a container is the container itself | Use the Compose service name (`jaeger:4317`) |
| Ports published, connection refused | Custom config binds receivers to `localhost` | `endpoint: 0.0.0.0:4317` in the config |
| Test span and backend spans in separate traces | Context not propagated: client not instrumented, proxy strips headers, service not instrumented | Instrument the client or call `inject()`; check `traceparent` arrives |
| Backend spans missing for some tests | Service samples with a ratio and ignores the parent | Use `parentbased_*` samplers in test environments |
| Trace found by ID but not by search | Outside the Lookback window, or the Limit hides it | Widen Lookback; search by `test.run.id` or trace ID |
| Old traces disappear | Memory storage capped by `max_traces`, or restart | Persistent storage (Badger) or export JSON after the run |
| Child span starts before its parent | Clock skew between hosts | Jaeger adjusts it in the view; compare with *Trace JSON (unadjusted)*; fix NTP |
| v1 flags or env vars ignored (`SPAN_STORAGE_TYPE`, `--memory.max-traces`) | Running Jaeger v2 | Move settings to the YAML config |
| Health check endpoints flood the search | Probes traced like real traffic | `excluded_urls` / `OTEL_PYTHON_EXCLUDED_URLS` |
| Negative tests show up under `error=true` | HTTP instrumentations mark client spans with 4xx responses as errors | Expected; filter failed tests by `test.outcome=failed` instead |
| `/api/services` or `/api/traces?service=...` returns 404 | v1-era query endpoints, not served by recent v2 releases | Use `/api/v3/services` and `/api/v3/traces` |

## QA Checklist

- [ ] Every test is a root span with `test.name`, `test.run.id` and `test.outcome`
- [ ] Jaeger trace URL is attached to the test report (JUnit XML or Allure)
- [ ] `traceparent` reaches the system under test for every client used in tests
- [ ] System under test uses `parentbased_*` sampling and a short batch delay in test environments
- [ ] Span assertions poll the Jaeger API with a deadline, never a fixed sleep
- [ ] CI exports the run's traces as an artifact before the job ends
- [ ] Jaeger image version pinned; memory storage only for ephemeral environments
- [ ] Sensitive headers and payloads are not recorded as span attributes

---
## See also
- [Jaeger — Distributed Tracing for OpenTelemetry](./index.md)
- [Jaeger — UI & Trace Analysis](./03-ui-trace-analysis.md)
- [OpenTelemetry — Testing with OpenTelemetry](../../libs/opentelemetry/06-testing.md)
- [Pytest — Python Testing Framework](../../libs/pytest/index.md)
- [Playwright — API Testing](../../libs/playwright/02-api-testing.md)
- [CI/CD](../../ci-cd-approaches/index.md)
