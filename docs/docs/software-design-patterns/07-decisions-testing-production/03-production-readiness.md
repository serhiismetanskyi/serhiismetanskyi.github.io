---
date: 2026-06-21
tags:
  - design-patterns
  - architecture
  - testing
---

# Microservice Production Readiness Checklist

Use before deploying any new service to production. Each section is a gate.

---

## Observability

### Logging

- Logs written to **STDOUT/STDERR** only — no file writes, no sidecar needed
- **Structured JSON** format with consistent field names across all services
- Every log line has: `timestamp`, `level`, `service`, `trace_id`, `span_id`, `message`
- **Correlation ID** (trace ID) propagated via headers and injected into every log
- **Log levels** defined and documented: `ERROR`, `WARN`, `INFO`, `DEBUG`
- `DEBUG`/`TRACE` disabled by default in production; switchable without redeploy
- **No PII** in logs (emails, passwords, tokens, card numbers, SSN)
- **No secrets** logged — even masked partials leak signal to attackers
- Logs shipped to centralised aggregation (ELK, Loki, CloudWatch, Stackdriver)
- Log **retention policy** defined (e.g. 30 days hot, 1 year cold)

### Metrics

- **RED metrics** exposed for every endpoint: Rate (req/s), Errors (%), Duration (latency)
- **USE metrics** for every resource: Utilisation, Saturation, Errors (CPU, memory, connections)
- Latency measured in **percentiles** — p50, p95, p99 — not averages
- **Business metrics** tracked: orders created, payments processed, emails sent
- Metrics endpoint exposed in Prometheus format (`/metrics`) or pushed to aggregator
- Metric names follow a consistent convention: `service_domain_action_unit`
- Dashboards exist in Grafana / Datadog for all RED + business metrics

### Distributed Tracing

- **OpenTelemetry** SDK integrated (unified standard for traces, metrics, logs)
- Trace ID propagated via `traceparent` header (W3C standard) to all downstream calls
- Spans created for: HTTP calls, DB queries, queue publish/consume, cache reads
- Traces exported to backend: Jaeger, Tempo, Datadog, New Relic, X-Ray
- Sampling strategy defined — 100% in staging, adaptive/tail in production

### Alerting

- **Alerts on symptoms, not causes** — alert on high error rate, not on CPU %
- Each alert has: clear name, severity (P1–P4), runbook link, owner team
- **Error rate** alert: > 1% errors over 5 min → page
- **Latency** alert: p99 > SLO threshold over 5 min → page
- **Availability** alert: service unreachable for > 1 min → page
- **Saturation** alerts: queue depth, connection pool exhaustion, disk full
- Dead Man's Switch: alert fires if the service stops sending any metrics at all
- On-call rotation and **escalation policy** defined (PagerDuty / OpsGenie)
- Runbooks written for every P1/P2 alert — not just a title

---

## Resiliency

### Health Checks

- **Liveness probe**: returns 200 if process is alive, 500 if stuck (restart me)
- **Readiness probe**: returns 200 only if service can handle traffic (remove from LB if not)
- Startup probe configured for slow-starting services (avoid premature kill)
- Health checks do NOT call downstream services — they only check local state

### Graceful Shutdown

- App handles `SIGTERM`: stops accepting new requests, finishes in-flight, then exits
- Shutdown timeout <= pod termination grace period in Kubernetes
- Queue consumers drain the current message before stopping

### Timeouts, Retries, Circuit Breakers

- **Timeout** set on every outbound HTTP/gRPC call — no call without a deadline
- Timeout value = 99th-percentile of the healthy dependency + 10–20% buffer
- **Retry** only on idempotent operations; max 3 retries with exponential backoff + jitter
- **Circuit breaker** opens after N consecutive failures; half-open after cool-down
- **Fallback** defined for every external dependency: can the service partially succeed?
- Rate limiting and backpressure implemented if service receives fan-in traffic

### Autoscaling & Capacity

- HPA (Kubernetes) or equivalent configured — scales on CPU, RPS, or custom metric
- **Minimum 2 replicas** in production; PodDisruptionBudget prevents simultaneous kill
- Resource **requests and limits** set for CPU and memory on every container
- Load tested at expected peak + 2× headroom before going live

---

## API & Documentation

- **README** explains: what the service does, bounded context, how to run locally
- **OpenAPI spec** (`openapi.yaml`) committed to root of repo
- API **versioning** strategy defined (`/v1/`, `Accept` header, or header-based)
- Breaking changes documented; deprecation notice sent before removal
- Service registered in **service catalog** (Backstage or equivalent)
- Architecture diagrams (C4 Level 2 minimum) exist and are up to date

---

## Security

- Service not exposed to public internet unless required; VPN or internal DNS otherwise
- **Authentication** in place for all external-facing endpoints (JWT / OAuth2 / mTLS)
- **HTTPS only** for external traffic; TLS between services where required
- Secrets stored in secret manager (Vault, AWS Secrets Manager) — not in env files
- Container runs as **non-root user**
- Dependency vulnerability scan in CI (Snyk, Trivy, Dependabot)
- GDPR: no PII stored without legal basis; data retention policy documented
- Bot configured to auto-update dependencies (Renovate / Dependabot)

---

## Testing

- **Unit tests** cover domain logic; test coverage ≥ 70% (coverage number is a floor, not a goal)
- **Integration tests** cover DB, queue, and cache interactions
- **Contract tests** (PACT) for every service-to-service HTTP dependency
- **Smoke test** runs after every deployment to verify basic availability
- **Load test** baseline established; result documented in README

---

## Data

- Service owns its **own database** — no shared DB across service boundaries
- DB **connection pool** sized for expected concurrency; connection timeout set
- **Migrations** automated (Flyway, Liquibase, Alembic); never manual SQL in production
- Migrations run as separate pre-deploy step, not inside the app on startup
- DB backup configured; **restore tested** at least once
- **Dead letter queue** configured for every consumer; poisoned messages don't block queue
- Encryption at rest enabled; encryption in transit enforced

---

## SLO / SLI Summary

Define before launch, review in post-mortems.

| Signal | SLI | Typical SLO |
|--------|-----|-------------|
| Availability | % of successful requests | ≥ 99.9% / month |
| Latency | p99 response time | < 300 ms |
| Error rate | % of 5xx responses | < 0.1% |
| Throughput | Requests handled per second | ≥ peak + 2× buffer |

---

## Quick Decision Table

| Question | If NO → action |
|----------|---------------|
| Can you find any request in logs within 5 s? | Add correlation ID + structured logging |
| Can you see p99 latency on a dashboard right now? | Add RED metrics + Grafana dashboard |
| Do you get paged before users notice an outage? | Add alerting on error rate + availability |
| Does the service recover on its own after a dependency blip? | Add retry + circuit breaker |
| Can you deploy at 2 AM without fear? | Add smoke tests + rollback runbook |
