---
date: 2026-06-13
tags:
  - architecture
  - networking
  - reliability
  - security
  - observability
---

# Observability

Observability means you can understand what the system is doing from its outputs. Three pillars: logs, metrics, traces.

## 14.1 Logging

### Structured logging
JSON format, not plain text. Include key fields in every log entry:
- `timestamp`, `level`, `service`, `trace_id`, `request_id`
- `method`, `path`, `status`, `duration_ms`
- `user_id` (where relevant)

Example:
```json
{"ts":"2026-03-25T12:00:00Z","level":"info","service":"user-api","trace_id":"abc123",
 "request_id":"req-456","method":"POST","path":"/users","status":201,"duration_ms":45}
```

### Log levels
- DEBUG: detailed dev info (disabled in production).
- INFO: normal operations.
- WARNING: unexpected but handled (e.g. retried request).
- ERROR: failure needing attention.
- CRITICAL: system-level failure.

### Sensitive data
Never log passwords, tokens, credit cards, PII. Mask: `email: u***@example.com`.

## 14.2 Metrics (RED method)

Track per service:
- **R**ate: requests per second.
- **E**rror rate: % of requests returning 5xx.
- **D**uration: p50, p95, p99 latency.

Also track:
- Active connections (WebSocket servers, DB pool usage).
- Queue depth (backpressure signal).
- Business metrics: orders/min, signups/hour.

Tools: Prometheus + Grafana (open-source), Datadog (SaaS), CloudWatch (AWS).

## 14.3 Distributed Tracing

One user request may go through 5 services. A trace connects all of them.

- Each request gets a unique `trace_id` at the edge.
- Each service adds a span (operation name, start time, duration, status).
- Spans form a tree. Parent span = full request. Child spans = individual operations.
- Propagate trace context via HTTP headers (`traceparent`, W3C standard).

Tools: Jaeger, Zipkin, Tempo (open-source), Datadog APM (SaaS).
Standard SDK: OpenTelemetry (vendor-neutral, use for all new projects).

## 14.4 Edge Observability

Observe the edge layer specifically:

### API Gateway metrics
- Request count per route.
- Error rate per route.
- Authentication failure rate.
- Rate limit triggers.

### Load Balancer metrics
- Healthy vs. unhealthy backend count.
- Connections per backend.
- Request distribution evenness.
- Backend response time (not just LB response time).
