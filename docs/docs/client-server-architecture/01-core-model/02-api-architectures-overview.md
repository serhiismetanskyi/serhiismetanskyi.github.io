---
date: 2026-06-09
tags:
  - architecture
  - networking
---

# Client-Server: API Architectures Overview

This document gives a quick summary of API architecture choices in the context of
client-server systems. For deep-dives, see the separate `api-architectures` research.

---

## REST

- **Model:** Stateless request-response over HTTP.
- **Format:** JSON (text), human-readable, wide tooling support (curl, Postman, OpenAPI).
- **Caching:** Excellent — HTTP caching headers, CDN-friendly, browser cache works natively.
- **Best for:** Public APIs, CRUD operations, cacheable resources, wide client diversity.
- **Limitation:** Over/under-fetching, multiple round-trips for related data, no real-time.

**Strengths in production:**
- Horizontally scalable with no server-side session state.
- Any language, proxy, or tool can consume it without special runtime.
- Versioning is straightforward via URL path (`/v1/`, `/v2/`).

---

## GraphQL

- **Model:** Schema-driven query language. Client specifies the exact data shape it needs.
- **Format:** JSON over HTTP POST (or GET for persisted queries).
- **Caching:** Hard by default — POST is not cached by CDN. Use persisted queries to work around this.
- **Best for:** Frontend-heavy apps with varied data needs, mobile clients with bandwidth limits.
- **Limitation:** Query complexity attacks (unbounded nested queries), N+1 resolver problem,
  harder HTTP caching, requires strict schema discipline.

**When it pays off:**
A mobile client that needs only 6 of 47 fields from a REST endpoint saves ~87% payload.
With multiple REST calls replaced by one GraphQL query, round-trip latency also drops.

---

## gRPC

- **Model:** Remote Procedure Call with strongly typed contracts (protobuf), HTTP/2 transport.
- **Format:** Binary (protobuf) — typically 3–10× smaller than equivalent JSON payloads.
- **Caching:** Hard — binary POST, not CDN-friendly.
- **Best for:** Internal microservice communication, high-throughput pipelines, streaming,
  polyglot service meshes.
- **Limitation:** No native browser support (requires grpc-web proxy), complex toolchain,
  protobuf schema management overhead.

**Streaming modes:**

| Mode | Direction | Example use case |
|---|---|---|
| Unary | Client → Server (one call) | Standard RPC |
| Server streaming | Server → Client | Live feed, query results |
| Client streaming | Client → Server | File upload, sensor batch |
| Bidirectional | Both | Real-time coordination |

---

## WebSocket

- **Model:** Persistent full-duplex TCP connection upgraded from HTTP.
- **Format:** JSON or binary frames (application-defined protocol).
- **Caching:** Not applicable — event-driven, not request-response.
- **Best for:** Real-time bidirectional features — chat, live dashboards, gaming,
  collaborative editing.
- **Limitation:** Stateful connections are harder to scale horizontally. Load balancers
  need sticky sessions. No guaranteed delivery without application-level protocol on top.

**Scale concern:** 10 000 concurrent WebSocket connections consume significant server
memory (each connection holds a goroutine / thread / descriptor). Plan capacity carefully.

---

## SSE (Server-Sent Events)

- **Model:** One-way server-to-client stream over standard HTTP (`text/event-stream`).
- **Format:** Plain text, newline-delimited event fields.
- **Best for:** Simple server-push use cases — notifications, progress bars, log tailing.
- **Limitation:** Client-to-server communication still requires a separate REST call.
  Not suitable for bidirectional or high-frequency event flows.

**Why prefer SSE over WebSocket for simple push:**
SSE works over plain HTTP/2, uses standard reconnection logic, and requires no special
infrastructure. Simpler to operate and monitor than a WebSocket service.

---

## Selection Guide

| Need | Best Choice |
|---|---|
| Public CRUD API | REST |
| Flexible frontend queries | GraphQL |
| Internal service calls | gRPC |
| Real-time bidirectional | WebSocket |
| Simple server push | SSE |
| Large binary data transfers | gRPC streaming or REST multipart |
| Mobile on variable networks | GraphQL + HTTP/3 |
| Existing REST, add real-time | REST + SSE (avoid full rewrite) |

---

## Real-World Hybrid Example

A production system often uses multiple styles together:

```
Browser          → GraphQL (flexible queries, reduces over-fetch)
Mobile app       → GraphQL over HTTP/3 (bandwidth savings + QUIC resilience)
Service A → B    → gRPC (low latency, binary, streaming)
Notifications    → SSE (simple server push)
Live collab      → WebSocket (bidirectional, low latency)
Partner API      → REST (versioned, widely consumable)
```

> **Rule:** choose REST unless you have a specific measured reason to choose otherwise.
> Add GraphQL when clients have divergent field needs. Add gRPC when internal latency
> and payload size become bottlenecks. Add WebSocket or SSE only when HTTP polling
> is not fast enough.
