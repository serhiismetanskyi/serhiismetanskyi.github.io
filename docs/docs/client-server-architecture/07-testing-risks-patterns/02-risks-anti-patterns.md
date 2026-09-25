---
date: 2026-06-14
tags:
  - architecture
  - networking
  - testing
---

# Risks, Limitations, and Anti-Patterns

## 16. Architectural Risks

### 16.1 Distributed Complexity

Every service call can fail, be slow, or return unexpected data.
The more services you have, the more failure combinations exist.

A single user request may touch 5–10 services. If any one of them is slow, the user sees it.

**Mitigation:**

- Add a **timeout** to every external call. Never wait indefinitely.
- Use **circuit breakers** to stop calling a failing service.
- **Retry** only idempotent operations. Never retry writes without idempotency keys.
- Design **graceful degradation** — return partial or cached data instead of a full error.

### 16.2 Tight Coupling

Services that know too much about each other's internals.
A field rename in one service's response breaks another service's parser.

**Mitigation:**

- Publish and version **API contracts** (OpenAPI, protobuf schemas).
- Use **semantic versioning** for APIs. Never break v1 without a migration path.
- For non-critical flows, use **async events** instead of direct calls — the publisher does not need to know who consumes.

### 16.3 Network Overhead

Every service-to-service call adds latency.
A chain of 5 synchronous calls can add 50–200 ms that the user pays for.

**Mitigation:**

- Use a **BFF (Backend for Frontend)** to aggregate multiple calls into one response.
- Cache common results in **Redis** — avoid re-fetching data that changes rarely.
- Use **async messaging** for flows that do not need to be synchronous.

### 16.4 Stateful Connections

WebSocket and gRPC streaming connections are pinned to one server instance.
You cannot freely move that load to another server.

**Mitigation:**

- Use **sticky sessions** at the load balancer level to keep the connection on the same server.
- Use a **pub/sub broker** (Redis, Kafka) to route messages across server instances.
- Keep WebSocket servers stateless in business logic — the broker holds state.

### 16.5 Large Attack Surface

More endpoints, protocols, and services = more potential entry points for attackers.

**Mitigation:**

- **WAF** (Web Application Firewall) at the edge for public endpoints.
- **Rate limiting** per IP and per authenticated user.
- **Input validation** at every layer — do not trust data from internal services.
- **mTLS** between internal services — both sides must present a valid certificate.

---

## 17. Anti-Patterns

### Distributed Monolith

Services are deployed separately but are tightly coupled. They call each other synchronously in long chains. You cannot deploy one service without coordinating with all others.

**Problem:** you get the complexity of microservices without the independence benefits.
One service fails → the whole chain fails.

**Fix:** define clear domain boundaries. Each service owns its own data and database.
Communicate async (events) for non-critical flows. Synchronous calls only when the response is needed immediately.

---

### Chatty Services

A client or service makes many small requests instead of one composite request.

```
GET /user/1
GET /user/1/orders
GET /user/1/preferences
GET /user/1/notifications
```

**Problem:** four round trips where one would do. High latency. High server load.

**Fix:**

- **BFF layer** — compose the four calls server-side, return one response.
- **GraphQL** — client requests exactly the fields it needs in one query.
- **Batch endpoints** — `POST /users/batch` with a list of IDs.

---

### No Caching

Every request hits the origin server, even for data that changes once a day.

**Problem:** unnecessary DB load. Higher latency for users. Wasted compute cost.

**Fix:**

| Layer | What to cache |
|---|---|
| CDN edge | Static assets, public API responses |
| API Gateway | Auth token validation results |
| Redis | Expensive DB queries, session data |
| Browser | `Cache-Control: max-age=300` for semi-static data |

---

### Shared Database Between Services

Two or more services read and write the same database schema.

**Problem:** a schema migration for Service A breaks Service B.
Services cannot be deployed independently. Every change requires coordination.

**Fix:** each service owns its own database schema.
Services communicate via API or async events — never by reading each other's tables.

---

### Ignoring Backpressure

A producer sends messages or requests faster than the consumer can process them.
No queue size limits. No drop strategy. No flow control signals.

**Problem:** queue grows until the server runs out of memory and crashes (OOM).

**Fix:**

- Use **bounded queues** with a max size.
- Define an explicit **drop strategy**: drop oldest, drop newest, or reject with `429`.
- Emit **flow control signals** — consumer tells producer to slow down.
- Monitor queue depth in metrics and alert before it fills.

---

### No Health Checks or Timeouts

Services assume all dependencies are always available.
No timeout is set on DB calls, HTTP calls, or gRPC calls.

**Problem:** one slow or unresponsive dependency causes the entire request thread to hang.
Thread pool exhausts. Server becomes unresponsive for all requests.

**Fix:**

- Set a **timeout on every external call** — HTTP, DB, gRPC, Redis.
- Expose a **`/health`** endpoint that checks all critical dependencies.
- Add **circuit breakers** — stop calling a service that is failing.
- Use **liveness and readiness probes** in Kubernetes.
