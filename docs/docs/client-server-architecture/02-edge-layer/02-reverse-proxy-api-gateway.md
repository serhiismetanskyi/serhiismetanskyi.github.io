---
date: 2026-06-10
tags:
  - architecture
  - networking
---

# Edge Layer: Reverse Proxy, Forward Proxy, API Gateway, WAF

## 3.3 Reverse Proxy

A reverse proxy sits **in front of backend servers** and receives all incoming client requests.
Clients see only the proxy — backend topology is hidden.

### What it Does

| Capability | Description |
|---|---|
| Request routing | Path-based: `/api` → service A, `/static` → service B |
| TLS termination | Handles HTTPS, forwards plain HTTP internally |
| Compression | Applies gzip/brotli to response bodies |
| Caching | Stores responses, serves without hitting origin |
| Header manipulation | Add, remove, or rewrite request/response headers |
| Rate limiting | Basic throttle before request reaches application |

**Common implementations:** nginx, HAProxy, Caddy, Envoy.

**nginx routing example:**
```nginx
location /api/ {
    proxy_pass http://api-service:8080/;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}

location /static/ {
    root /var/www;
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

---

## 3.4 Forward Proxy

A forward proxy sits **in front of clients** and controls **outbound** traffic.

**What it does:**
- Controls which external destinations backend services can reach.
- Provides a single exit point — useful for IP allowlisting with external vendors.
- Logs and audits all outbound HTTP calls for security review.

**Example:** a payment service can only reach the payment gateway IP through the forward proxy.
The proxy enforces an allowlist. If a compromised service tries to exfiltrate data to an unknown
IP, the proxy blocks it.

**Contrast with reverse proxy:**

| | Reverse Proxy | Forward Proxy |
|---|---|---|
| Sits in front of | Backend servers | Clients / internal services |
| Controls | Inbound traffic | Outbound traffic |
| Hides | Backend topology | Client identity / network |

---

## 3.5 API Gateway

An API gateway is a **specialized reverse proxy** designed to handle cross-cutting concerns
for APIs at scale. Business logic stays in services — the gateway owns infrastructure concerns.

### Core Responsibilities

| Concern | What it does |
|---|---|
| Routing | Forward request to correct backend service |
| Authentication | Validate JWT, API key, OAuth 2.0 token |
| Rate limiting | Token bucket / sliding window per client |
| Request aggregation | Fan-out to multiple services, merge responses |
| Protocol translation | HTTP ↔ gRPC, REST ↔ GraphQL |
| Request/response transform | Add headers, reshape payload, version mapping |
| Circuit breaking | Stop forwarding to failing backends |
| Observability | Emit metrics, traces, logs per request |

### Technology Choices (2026)

| Tool | Strengths | Use case |
|---|---|---|
| Kong | Plugin ecosystem, Lua extensions, high throughput | Self-hosted, flexible policies |
| Envoy | Kubernetes-native, service mesh integration (Istio) | Cloud-native, gRPC-heavy |
| AWS API Gateway | Fully managed, Lambda integration | AWS-only, serverless |
| nginx | Simple, fast, widely understood | Small/medium deployments |

### BFF (Backend-for-Frontend) Pattern

Different clients have different data needs. One generic gateway forces compromises.
BFF creates **a separate gateway per client type**:

```
Mobile App  →  Mobile BFF  →  [User Service, Product Service]
Web App     →  Web BFF     →  [User Service, Product Service, Analytics Service]
```

Mobile BFF returns compact payloads (limited screen, slow network).
Web BFF returns richer data (full details, aggregated views).

Each team owns its BFF. Changes to mobile payload do not affect web clients.

### API Composition (Fan-Out)

Gateway makes multiple internal service calls and merges the response:

```
GET /dashboard
  → GET /users/123           (user service)
  → GET /orders?user=123     (order service)
  → GET /notifications/123   (notification service)
  ← merged JSON response to client
```

Client makes **1 request**, receives **1 response**. Gateway handles internal fan-out.
Reduces client round-trips, hides service decomposition from frontend.

---

## 3.6 Facade Layer

A facade is a service that aggregates multiple backend services behind a simplified interface.

**Distinctions:**

| Component | Role |
|---|---|
| API Gateway | Edge control: auth, rate limiting, routing, observability |
| Facade | Internal simplification: combines calls, hides complexity from callers |
| BFF | Client-specific facade: tailored response shape per client type |

**Layered example:**
```
Client → API Gateway → BFF Facade → [Service A, Service B, Service C]
```

API Gateway enforces security and traffic policies. BFF Facade assembles the response.
Services remain independent and unaware of client types.

---

## 3.7 WAF (Web Application Firewall)

A WAF inspects HTTP/HTTPS traffic and blocks malicious requests **before they reach the
application**. It operates at Layer 7 and understands HTTP request structure.

### What it Blocks

| Attack | Pattern |
|---|---|
| SQL injection | `' OR 1=1--` in query params or body |
| XSS | `<script>alert(1)</script>` injection attempts |
| Path traversal | `../../etc/passwd` in URL paths |
| HTTP flood / DDoS | High-volume layer-7 request attacks |
| Known CVEs | Signatures for Log4Shell, Spring4Shell, etc. |

### Deployment Modes

| Mode | Behavior | Use case |
|---|---|---|
| Inline (blocking) | WAF sits in request path, drops bad traffic | Production enforcement |
| Detection only | Logs threats, does not block | Tuning phase (7–14 days before enabling blocking) |
| Out-of-band (TAP) | Mirrors traffic passively | Zero-latency monitoring, no blocking |

**Best practice:** deploy in detection mode first. Analyze false positives. Tune rules.
Enable blocking only after rules are validated against real traffic patterns.

### Placement

```
Internet → CDN Edge WAF → Load Balancer → API Gateway → Backend
```

Managed WAF options: Cloudflare WAF, AWS WAF, Fastly Next-Gen WAF.

WAF must inspect decrypted HTTP payloads. In practice, this means TLS is terminated
either in the WAF itself or in a trusted component directly in front of it.

### Limitations

WAF is **defense-in-depth**, not a complete solution:

- Cannot block **business logic vulnerabilities**: BOLA (Broken Object Level Authorization),
  mass assignment, IDOR — these require application-level validation.
- Rule sets must be **tuned** per application. Default rules miss app-specific patterns
  and generate false positives on legitimate traffic.
- Attackers encode payloads to evade signature matching. WAF + application security is required.
