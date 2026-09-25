---
date: 2026-06-07
tags:
  - api
  - architecture
  - security
  - observability
  - reliability
---

# Cross-Cutting: Security and Observability

## Security

### Authentication

- **JWT (JSON Web Token)**: most common for APIs. Three parts: header.payload.signature.
  Short-lived access tokens (15 min) + long-lived refresh tokens. Always verify signature
  and expiration. Use RS256 or ES256 algorithm, never HS256 with weak secrets.

- **OAuth2**: authorization framework. Flows: Authorization Code (web apps),
  Client Credentials (service-to-service), Device Code (IoT).
  Always use PKCE for public clients.

- **API Keys**: simple but less secure. Use for server-to-server calls.
  Hash with SHA-256 in database. Set expiration dates. Scope permissions per key.

- **mTLS**: mutual TLS for service-to-service. Both client and server present certificates.
  Strongest auth for internal services.

- **Best practices**: store tokens in HttpOnly cookies (not localStorage), rotate refresh
  tokens, implement token blacklisting for logout.

### Authorization

- **RBAC** (Role-Based Access Control): user has role (admin, editor, viewer).
  Role has permissions. Simple and works for most apps.
  Example: admin can CRUD all users. Editor can update own profile. Viewer can only read.

- **ABAC** (Attribute-Based Access Control): rules based on attributes.
  More flexible, more complex.
  Example: "User can edit document if user.department == document.department
  AND document.status != 'published'"

- **Field-level auth**: different roles see different fields.
  Admin sees all. User doesn't see internal_id or audit_log.

- **Resource-level auth**: user can only access own resources.
  Check ownership in every request.

### Attack Vectors (OWASP API Top 10 - 2023)

1. **Broken Object Level Authorization (BOLA)**: accessing other users' data
   by changing IDs. Most common API vulnerability.

2. **Broken Authentication**: weak tokens, missing expiration,
   no rate limiting on login.

3. **Broken Object Property Level Authorization**: mass assignment,
   exposing internal fields in responses.

4. **Unrestricted Resource Consumption**: no rate limiting, large payloads,
   expensive queries without pagination.

5. **Server Side Request Forgery (SSRF)**: server makes requests
   to internal resources via user-controlled URLs.

6. **Security Misconfiguration**: verbose errors in production,
   unnecessary endpoints enabled, default credentials.

7. **Injection**: SQL injection, NoSQL injection through API params.
   Always validate and sanitize input.

---

## Observability

### Logging

- **Structured logging**: JSON format, not plain text. Include: timestamp, level,
  service, request_id, user_id, method, path, status, duration.

- **Log levels**:
  - DEBUG: development details, variable values
  - INFO: normal operations, request completed
  - WARNING: unexpected but handled situations
  - ERROR: failures needing attention
  - CRITICAL: system failures, service down

- **Correlation ID**: unique request_id passed through all services.
  Trace one request across microservices. Generate at API gateway,
  propagate via X-Request-ID header.

- **Sensitive data**: never log passwords, tokens, credit cards, PII.
  Mask or redact before logging. Example: mask email as `u***@example.com`.

- **Log aggregation**: send logs to centralized system (ELK Stack, Grafana Loki,
  Datadog). Enable search, filtering, alerting across all services.

### Metrics

- **RED method**: Rate (requests/sec), Errors (error rate), Duration (latency).
  Covers the three most important signals for any service.

- **Key API metrics**:
  - Request count (total and per endpoint)
  - Error rate (4xx client errors, 5xx server errors)
  - Latency percentiles: p50, p95, p99
  - Active connections and connection pool usage
  - Response payload size

- **Business metrics**: signups per minute, orders per hour,
  API calls per customer, revenue per transaction.

- **Tools**: Prometheus + Grafana (open source), Datadog (SaaS),
  AWS CloudWatch, Google Cloud Monitoring.

### Tracing

- **Distributed tracing**: follows a request through multiple services.
  Each service adds a span. Spans form a trace tree.
  Shows where time is spent and where errors happen.

- **OpenTelemetry**: industry standard for traces, metrics, logs.
  Vendor-neutral SDK. Works with Jaeger, Zipkin, Datadog, Tempo.
  Recommended for all new projects.

- **Trace context**: propagate via HTTP headers (traceparent, tracestate).
  W3C Trace Context is the standard. All services must forward these headers.

### Observability Best Practices

- **Three pillars**: logs + metrics + traces together give full picture.
- **Dashboards**: create per-service and system-wide dashboards.
- **Alerting**: alert on symptoms (high error rate), not causes.
  Use thresholds on SLOs (e.g., alert if p99 > 1s for 5 minutes).
- **SLIs/SLOs/SLAs**: define Service Level Indicators (what to measure),
  Objectives (target values), and Agreements (contractual commitments).
