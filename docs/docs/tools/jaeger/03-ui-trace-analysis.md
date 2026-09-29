---
date: 2026-09-29
tags:
  - tools
  - observability
  - opentelemetry
  - jaeger
---

# Jaeger — UI & Trace Analysis

The Jaeger UI at `http://localhost:16686` has four main views: **Search**, **Trace** (one trace in detail), **Compare**, and **System Architecture** (service dependencies). **Monitor** (SPM) appears when a metrics backend is configured.

## Search

| Field | What it filters | Example |
|-------|-----------------|---------|
| Service | `service.name` of the spans | `orders-api` |
| Operation | Span name within the service | `GET /orders/{order_id}` |
| Tags | Span or resource attributes, `key=value` pairs separated by spaces | `error=true http.response.status_code=500` |
| Lookback | Time window | Last hour (default), custom range |
| Min / Max Duration | Trace duration bounds | `500ms`, `2s` |
| Limit Results | Max traces returned (default 20) | `100` |

- **Find by trace ID** — paste the 32-hex-char ID into the search box in the top bar, or open `http://localhost:16686/trace/<trace_id>`.
- **Errors** — spans with OTel status `ERROR` are tagged `error=true` in Jaeger; `error=true` in Tags finds failing traces, and the result list marks them with an error count.
- **Tags with spaces or quotes** — wrap the value in double quotes: `test.name="test create order"`.
- The search results scatter plot (duration over time) shows outliers at a glance; click a dot to open that trace.
- **Upload** tab — load traces from a JSON file (Jaeger JSON or OTLP JSON, for example traces exported from a CI run) without any storage behind them.

## Trace View

| Part | Shows |
|------|-------|
| Header | Trace start, total duration, number of services, depth, total spans |
| Minimap | Whole trace in miniature; drag to zoom into a time range |
| Timeline | One row per span: service, operation, bar for start and duration, nesting by parent |
| Span details (click a row) | Tags (span attributes), Process (resource attributes), Events / Logs, References, span ID |

```text
orders-api   GET /orders/{order_id}      |==============================| 812 ms
orders-api     load_order                |==|                              14 ms
orders-api     GET                          |===========================|  790 ms
pricing          GET /price                  |==========================|  782 ms
pricing            SELECT prices               |=========================|  770 ms  <- the slow span
```

Reading a trace:

1. **Critical path** — the longest chain of nested spans; the UI highlights it on the timeline bars. Optimising anything else will not shorten the request.
2. **Gaps** between a parent's start and its first child — time spent in code without spans (serialization, CPU work, waiting for a lock). Add a manual span there.
3. **Staircase** of many identical short spans — sequential calls in a loop, typical N+1 query.
4. **Error icon** on a span — open it: `exception.type`, `exception.message` and the stack trace are in the span events when the code called `record_exception()` (instrumentations do this automatically).
5. **Missing child service** — the downstream service is not instrumented, or context was not propagated (a new trace started there instead).

Alternative views from the trace page menu:

| View | Use |
|------|-----|
| Trace Timeline | Default; latency and nesting |
| Trace Graph | Call graph of the trace; good for fan-out and retries |
| Trace Statistics | Aggregates per service and operation: count, total and self time |
| Trace Spans Table | Flat sortable list of spans — sort by duration to find the slowest |
| Trace Flamegraph | Stacked view of time per operation; good for deep call trees |
| Trace JSON / Trace JSON (unadjusted) | Raw data; *unadjusted* is before Jaeger's clock-skew correction |

## Compare Traces

Select two traces in the search results (checkboxes) and press **Compare**. Jaeger renders a merged graph of both:

- Nodes present only in one trace are coloured by which side they belong to; shared nodes show the difference in span count.
- Typical QA use: a passing and a failing run of the same test, or the same endpoint before and after a change — an extra retry, a missing cache hit or an additional DB call becomes visible immediately.

## System Architecture (Dependencies)

The **System Architecture** tab draws the service dependency graph (DAG) built from parent/child spans across services, with call counts on the edges.

| Storage | How dependencies are computed |
|---------|-------------------------------|
| Memory, Badger | From stored traces, on request |
| Elasticsearch, OpenSearch, Cassandra | By the separate `spark-dependencies` batch job, run periodically |

Useful for checking that a test environment is wired as expected: a test that should touch `orders-api → payments-api` but shows no edge means the call did not happen or the context was lost.

## Monitor Tab (SPM)

Service Performance Monitoring shows RED metrics (request rate, error rate, latency percentiles) per service and operation. The metrics are derived from spans by the `spanmetrics` connector and read back from Prometheus:

```yaml
# additions to the Jaeger config
connectors:
  spanmetrics: {}

exporters:
  prometheus:
    endpoint: 0.0.0.0:8889          # scraped by Prometheus

extensions:
  jaeger_storage:
    metric_backends:
      metrics_store:
        prometheus:
          endpoint: http://prometheus:9090
          normalize_calls: true
          normalize_duration: true
  jaeger_query:
    storage:
      traces: main_store
      metrics: metrics_store

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [jaeger_storage_exporter, spanmetrics]
    metrics/spanmetrics:
      receivers: [spanmetrics]
      exporters: [prometheus]
```

Prometheus must scrape `jaeger:8889`. For local debugging of single test runs SPM is rarely needed; it pays off on a long-lived staging environment.

## HTTP API

The UI talks to the query service over HTTP; the same endpoints work from tests and scripts. API v3 is the versioned one and returns OTLP-shaped JSON.

| Endpoint | Returns |
|----------|---------|
| `GET /api/v3/services` | `{"services": [...]}` — services with stored spans |
| `GET /api/v3/operations?service=orders-api` | Operations (span names) with span kind |
| `GET /api/v3/traces/{trace_id}` | One trace as `{"result": {"resourceSpans": [...]}}`; `404` until spans are stored |
| `GET /api/v3/traces?query.service_name=...&query.start_time_min=...&query.start_time_max=...` | Search; the time range (RFC 3339) is required |
| `GET /api/traces/{trace_id}` | One trace in Jaeger's own JSON format (what **Trace JSON** in the UI shows) |
| `GET /api/dependencies?endTs=<ms>&lookback=<ms>` | Dependency graph edges |

Search parameters of `/api/v3/traces`:

| Parameter | Example |
|-----------|---------|
| `query.service_name` | `orders-api` |
| `query.operation_name` | `GET /orders/{order_id}` |
| `query.attributes` | `{"test.run.id":"run-42"}` (JSON object, URL-encoded) |
| `query.start_time_min` / `query.start_time_max` | `2026-09-29T10:00:00Z` |
| `query.duration_min` / `query.duration_max` | `500ms` |
| `query.num_traces` | `100` |

- The v1-era search endpoints `/api/services` and `/api/traces?service=...` return `404` on recent v2 releases — scripts written for Jaeger v1 must move to `/api/v3`.
- Jaeger's own JSON (`/api/traces/{trace_id}`) is often easier to assert on: `{"data": [{"traceID", "spans": [...], "processes": {...}}]}`, span `duration` and `startTime` in **microseconds**, attributes as `tags: [{"key", "type", "value"}]`, `service.name` in `processes`.

```python
import requests

trace = requests.get("http://localhost:16686/api/traces/5b8efff798038103d269b633813fc60c", timeout=5).json()["data"][0]
services = {p["serviceName"] for p in trace["processes"].values()}
slowest = max(trace["spans"], key=lambda s: s["duration"])
print(services, slowest["operationName"], slowest["duration"] / 1000, "ms")
```

## Analysis Checklist

- [ ] Trace found by ID from the test report, not by guessing the time window
- [ ] Critical path identified; the slowest span on it opened
- [ ] Errors checked via `error=true` and the span events with the exception
- [ ] Every expected service present in the trace; no broken (orphan) sub-traces
- [ ] Failing run compared with a passing run of the same test
- [ ] Repeated identical spans checked for N+1 patterns

---
## See also
- [Jaeger — Distributed Tracing for OpenTelemetry](./index.md)
- [Jaeger — Sending Traces from Python](./02-sending-traces-python.md)
- [Jaeger — Testing, CI & Troubleshooting](./04-testing-ci-troubleshooting.md)
- [OpenTelemetry — Tracing](../../libs/opentelemetry/02-tracing.md)
- [OpenTelemetry — Collector & Backends](../../libs/opentelemetry/05-collector-backends.md)
