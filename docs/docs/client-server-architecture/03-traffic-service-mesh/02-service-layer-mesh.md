---
date: 2026-06-11
tags:
  - architecture
  - networking
  - service-mesh
---

# Service Layer and Service Mesh

## 5.1 Backend Architecture

### Monolith

All functionality lives in one deployable unit. One codebase, one database, one process.

**Pros:**
- Simple deployment — one artifact to ship.
- No network overhead between components.
- Easier transactions — everything in one process.
- Simple local development and debugging.

**Cons:**
- Hard to scale only one part independently.
- Tight coupling slows down teams as the codebase grows.
- One bad deploy can break the entire system.

**Use when:** team is small, product is early stage, domain is not yet well understood.

### Microservices

Each domain is a separate service with its own deployment lifecycle and data store.

**Pros:**
- Scale individual services independently based on load.
- Deploy one service without touching others.
- Teams own their services end-to-end.

**Cons:**
- Distributed system complexity: network failures, partial outages, data consistency.
- Observability requires more tooling (tracing, centralized logs).
- Operational overhead: many services to deploy, monitor, and version.

**Use when:** different parts have very different scaling needs, teams are large, domain is well understood.

**Rule of thumb:** Start with a modular monolith. Extract services only when a specific bottleneck or team boundary demands it. Premature decomposition adds complexity without benefit.

---

## 5.2 Internal Communication

### REST (internal)

- Simple HTTP/JSON. Every engineer understands it.
- Easy to debug with curl or browser DevTools.
- Overhead: JSON serialization, HTTP headers per request.
- Use for low-frequency calls or when services are in different languages.

### gRPC (internal)

- Binary protobuf encoding: faster serialization, smaller payloads.
- Strong contracts via `.proto` files — schema is enforced at compile time.
- Native streaming support: unary, server-stream, client-stream, bidirectional.
- Use for high-throughput internal calls where latency matters.

### Async messaging (events)

- Services communicate via a message broker: Kafka, RabbitMQ, or SQS.
- Producer sends an event and does not wait for a consumer response.
- Consumers react asynchronously at their own pace.
- Decouples services in time — producer and consumer do not need to be online simultaneously.
- Use for side effects: send email on order placed, update search index, notify analytics.

**Comparison:**

| Pattern | Coupling | Latency | Reliability |
|---|---|---|---|
| REST | Tight | Low | Synchronous, caller waits |
| gRPC | Tight | Very low | Synchronous, caller waits |
| Async events | Loose | Higher | At-least-once delivery |

Choose REST or gRPC when the caller needs an immediate answer.
Choose async events when the operation can happen later without blocking the user.

---

## 5.3 Service Aggregation

A service aggregation layer combines responses from multiple backend services into one unified response for the client.

**Example flow for `GET /product-details/123`:**
1. Aggregation service receives the request.
2. It calls Product service, Inventory service, and Reviews service in parallel.
3. It merges the three responses into one payload and returns it to the client.

**Benefits:**
- Client makes one request instead of three — fewer round-trips.
- Client logic is simpler — no need to merge data on the frontend.
- Backend services stay focused on their domain.

The aggregation layer can be a dedicated service, part of a BFF (Backend for Frontend), or logic inside the API gateway.

---

## 6. Service Mesh

A service mesh is an infrastructure layer that manages all service-to-service communication inside a cluster.

### How it works

Each service instance runs a **sidecar proxy** alongside the application container.
All inbound and outbound traffic passes through the sidecar — the application code does not change.

```
[Service A]
  app container
  sidecar proxy (Envoy)
      ↕ all traffic
[Service B]
  app container
  sidecar proxy (Envoy)
```

The sidecar intercepts traffic transparently using iptables rules injected at pod startup.

### What the mesh provides

| Feature | What it does |
|---|---|
| mTLS | Automatic mutual TLS between all services, no app code changes |
| Traffic routing | Weighted routing, retries, timeouts configured per route |
| Circuit breaking | Automatic open/close at sidecar level based on error thresholds |
| Observability | Metrics, distributed traces, and logs for every service call |
| Load balancing | L7 load balancing inside the cluster |

### Istio vs Linkerd

| Aspect | Istio (Envoy) | Linkerd |
|---|---|---|
| Sidecar memory | ~100 MB | ~20 MB |
| Feature set | Very rich, complex configuration | Essential features, simpler config |
| Sidecar language | C++ (Envoy) | Rust |
| Kubernetes native | Yes | Yes |
| Post-quantum crypto | On roadmap | Supported since v2.19 |
| Best for | Large systems needing fine-grained control | Teams needing simplicity and low overhead |

### Architecture with control plane

```
Client → API Gateway
    → [Service A: app + sidecar]
          → [Service B: app + sidecar]
                    ↕
          [Control Plane: Istiod]
          distributes config to all sidecars
```

The control plane (Istiod in Istio) does not sit in the request path.
It pushes routing rules and certificates to sidecars asynchronously.
If the control plane goes down, existing traffic continues — sidecars use cached config.

### When to use a service mesh

Use a service mesh when:
- You have 5+ microservices that communicate with each other.
- You need automatic mTLS without modifying application code.
- You need consistent distributed tracing and metrics across all services.
- You want centralized traffic policy: retries, timeouts, circuit breakers.

**Do not use** a service mesh for a small system. It adds significant infrastructure complexity:
sidecar injection, control plane operation, certificate rotation, and config debugging.
A monolith with a single API gateway does not need a mesh.

**Decision rule:** If you are asking whether you need a service mesh, you probably do not need one yet.
