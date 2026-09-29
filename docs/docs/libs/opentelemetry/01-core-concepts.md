---
date: 2026-09-27
tags:
  - python
  - libraries
  - opentelemetry
  - observability
---

# OpenTelemetry — Core Concepts

## Signals

OpenTelemetry defines independent signals that share one context and one resource model.

| Signal | Answers | Unit of data | Typical backend |
|--------|---------|--------------|-----------------|
| **Traces** | Where did this request spend its time, and where did it fail? | Span (a timed operation) | Jaeger, Tempo, Zipkin |
| **Metrics** | How much, how often, how fast — in aggregate? | Data point in a time series | Prometheus, Mimir |
| **Logs** | What exactly happened at this moment? | Log record | Loki, Elasticsearch |
| **Baggage** | Which key-values should travel with the request? | Key-value pair in context | (propagated, not stored) |

Signals become useful together: a metric spike leads to exemplar traces, a slow span leads to the logs written inside it (same `trace_id`).

## Traces and Spans

A **trace** is a tree of **spans** that share one `trace_id`. Each span has:

| Field | Meaning |
|-------|---------|
| `name` | Low-cardinality operation name: `GET /orders/{id}`, `charge_card` |
| `trace_id` / `span_id` | 16-byte / 8-byte identifiers |
| `parent_span_id` | Link to the caller span (empty for the root) |
| `kind` | `SERVER`, `CLIENT`, `PRODUCER`, `CONSUMER`, `INTERNAL` |
| `start_time` / `end_time` | Duration of the operation |
| `attributes` | Key-values: `http.request.method=GET`, `order.id=ord-42` |
| `events` | Timestamped points inside the span (e.g. an exception) |
| `status` | `UNSET`, `OK` or `ERROR` (+ description) |
| `links` | References to spans in other traces (batch jobs, fan-in) |

```text
trace_id = 4bf92f3577b34da6a3ce929d0e0e4736
└── GET /checkout                    SERVER   320 ms
    ├── validate_cart                INTERNAL  12 ms
    ├── POST payments-api/charge     CLIENT   210 ms
    │   └── POST /charge             SERVER   195 ms   (another service)
    │       └── INSERT payments      CLIENT    18 ms
    └── publish order.created        PRODUCER   6 ms
```

## API vs SDK

| | API (`opentelemetry-api`) | SDK (`opentelemetry-sdk`) |
|---|---|---|
| Who uses it | Libraries and application code | Application entry point only |
| Contents | `get_tracer`, `get_meter`, context, propagation | Providers, processors, samplers, exporters, resource |
| Without the other | No-op: spans are created but dropped | — |

This split is why a library such as `httpx` instrumentation can emit spans without forcing any backend choice on your application.

## Resource

A **resource** describes the entity producing telemetry. It is attached to every span, metric and log record.

```python
from opentelemetry.sdk.resources import Resource

resource = Resource.create({
    "service.name": "orders-api",
    "service.version": "1.4.0",
    "service.namespace": "shop",
    "deployment.environment.name": "staging",
})
```

`Resource.create()` also merges `OTEL_RESOURCE_ATTRIBUTES`, `OTEL_SERVICE_NAME` and SDK defaults (`telemetry.sdk.*`). Resource detectors add host, process, container and cloud attributes.

## Context and Propagation

**Context** holds the active span and baggage for the current execution flow. In Python it is built on `contextvars`, so it follows `async`/`await` correctly.

Across process boundaries the context travels in headers. The default is **W3C Trace Context**:

```text
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
             │  │                                │                └─ flags (01 = sampled)
             │  │                                └─ parent span_id
             │  └─ trace_id
             └─ version
tracestate:  vendor-specific data (optional)
baggage:     tenant=acme,feature.flag=new-checkout
```

Instrumented HTTP clients inject these headers and instrumented servers extract them automatically. Manual propagation (queues, custom protocols):

```python
from opentelemetry.propagate import extract, inject

# Producer side
headers: dict[str, str] = {}
inject(headers)                       # adds traceparent (+ baggage)
queue.publish(body, headers=headers)

# Consumer side
ctx = extract(message.headers)
with tracer.start_as_current_span("process order", context=ctx, kind=trace.SpanKind.CONSUMER):
    handle(message)
```

## Baggage

Baggage carries business context (tenant, experiment, test ID) to every downstream service. It is **not** added to spans automatically — read it and copy the values you need.

```python
from opentelemetry import baggage, context

token = context.attach(baggage.set_baggage("tenant", "acme"))
try:
    call_downstream()                 # baggage header goes out with the request
finally:
    context.detach(token)

# Downstream
tenant = baggage.get_baggage("tenant")
```

!!! warning "Baggage is visible"
    Baggage is sent in plain headers to every downstream service, including third parties. Never put secrets or personal data in it.

## Semantic Conventions

Standard attribute names make telemetry from different libraries and languages queryable in the same way.

| Area | Attributes |
|------|------------|
| HTTP | `http.request.method`, `http.response.status_code`, `http.route`, `url.full`, `url.path`, `server.address` |
| Database | `db.system.name`, `db.namespace`, `db.operation.name`, `db.query.text` |
| Messaging | `messaging.system`, `messaging.destination.name`, `messaging.operation.type` |
| Errors | `error.type`, `exception.type`, `exception.message`, `exception.stacktrace` |
| Resource | `service.name`, `service.version`, `deployment.environment.name`, `host.name` |

Older instrumentations may still emit legacy names (`http.method`, `http.status_code`, `db.system`). `OTEL_SEMCONV_STABILITY_OPT_IN=http` switches supported Python instrumentations to the stable HTTP names; `http/dup` emits both during a migration.

For custom attributes use a namespace: `shop.order.id`, `shop.cart.items`.

## OTLP

**OTLP** (OpenTelemetry Protocol) is the native wire format for all signals.

| Transport | Default port | Exporter package module |
|-----------|--------------|-------------------------|
| gRPC | 4317 | `opentelemetry.exporter.otlp.proto.grpc` |
| HTTP/protobuf | 4318 | `opentelemetry.exporter.otlp.proto.http` |

HTTP endpoints are per signal: `/v1/traces`, `/v1/metrics`, `/v1/logs`. When you set `OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4318` the HTTP exporters append these paths themselves.

---
## See also
- [OpenTelemetry — Python Observability](./index.md)
- [OpenTelemetry — Tracing](./02-tracing.md)
- [Client–Server: Observability](../../client-server-architecture/06-reliability-security-observability/03-observability.md)
