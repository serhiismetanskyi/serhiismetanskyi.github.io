---
date: 2026-06-14
tags:
  - architecture
  - networking
  - testing
---

# Real-World Patterns and Decision Factors

## 18. Real-World Patterns

These are proven architecture patterns used in production systems.
Each pattern addresses a specific combination of scale, client type, and data requirements.

---

### Pattern 1: CDN + REST (High-Load Public API)

```
Browser → CDN Edge → Load Balancer → REST API → DB
```

- API responses cached at the CDN edge for semi-static data.
- Static assets (JS, CSS, images) served entirely from CDN — never reach the origin.
- REST keeps the API simple and widely compatible.

**When to use:** public product catalogs, news sites, marketing APIs, documentation sites.

**Key config:** `Cache-Control: public, max-age=300` on list endpoints. Purge on write.

---

### Pattern 2: GraphQL + BFF (Frontend-Heavy App)

```
Mobile App → Mobile BFF → [User Service, Product Service, Order Service]
Web App    → Web BFF    → [User Service, Product Service, Order Service, Analytics Service]
```

- Each client type has its own BFF tailored to its data needs.
- Mobile BFF returns compact payloads — fewer fields, smaller images.
- Web BFF returns richer data — more fields, analytics, admin data.
- No over-fetching or under-fetching — each BFF shapes the response for its client.

**When to use:** e-commerce frontends, social media dashboards, apps with mobile and web clients that have different data needs.

---

### Pattern 3: gRPC Internal + REST External

```
External Client → REST Gateway → gRPC → [Internal Service A → Internal Service B]
```

- Public API exposed as REST — easy to consume from any language or tool.
- Internal service-to-service calls use gRPC — binary protocol, typed contracts, low latency.
- The REST gateway translates HTTP/JSON to gRPC on the way in.

**When to use:** fintech backends, cloud platform APIs, any system where internal performance matters but external compatibility is required.

**Benefit:** external teams and partners can use REST + OpenAPI docs. Internal teams get the speed and type safety of gRPC.

---

### Pattern 4: WebSocket for Realtime

```
Browser ← WebSocket → Realtime Server → Redis Pub/Sub ← [Event Publishers]
```

- Realtime server holds all active WebSocket connections.
- Any service publishes events to Redis pub/sub.
- All Realtime server nodes subscribe and forward relevant events to connected clients.
- Realtime server is horizontally scalable — Redis is the shared message bus.

**When to use:** chat applications, trading dashboards, live sports scores, collaborative editing.

**Key rule:** the Realtime server holds connections but does not own business logic. Publishers are decoupled from the clients.

---

### Pattern 5: Multi-Layer Caching

```
Browser cache → CDN edge → API Gateway cache → Redis → DB
```

- Each layer reduces load on the layer behind it.
- Browser serves repeat visits instantly from disk cache.
- CDN handles traffic spikes without touching the origin.
- Redis absorbs repeated DB queries — DB only handles uncached writes and cache misses.

**When to use:** high-traffic read-heavy systems. News, e-commerce product pages, public APIs with millions of daily users.

**Cache invalidation strategy:** write-through or event-driven purge on data change.

---

## 19. Decision Factors

Use this table to align architecture choices with system requirements.

| Factor | Low end | High end |
|---|---|---|
| **Scale** | Monolith + REST | Microservices + caching + CDN |
| **Latency** | REST sufficient (< 100 ms acceptable) | gRPC internal, HTTP/3, edge caching |
| **Realtime** | Polling (SSE if near-realtime) | WebSocket (full bidirectional) |
| **Data complexity** | Simple CRUD → REST | Flexible queries → GraphQL; typed binary → gRPC |
| **Team expertise** | REST (widely known) | gRPC (requires protobuf investment) |
| **API visibility** | Public → REST, versioned, cached | Internal → gRPC, service mesh, mTLS |
| **Client variety** | One client type → direct API | Multiple client types → GraphQL + BFF |

---

## 19.1 Quick Decision Flow

Work through these questions in order. Stop at the first match.

**1. Is it public-facing?**
- Yes → REST or GraphQL. Document with OpenAPI.
- No → consider gRPC for lower latency and stricter contracts.

**2. Does it need realtime push?**
- Yes → WebSocket (bidirectional) or SSE (server-push only).
- No → HTTP request-response is sufficient.

**3. Do multiple client types need different data shapes?**
- Yes → GraphQL + BFF layer per client type.
- No → REST or gRPC is simpler.

**4. Are there high-frequency internal service calls?**
- Yes → gRPC with protobuf. Binary protocol, low overhead.
- No → REST with JSON is fine.

**5. Is it simple CRUD with few data shapes?**
- Yes → REST. Easiest to build, test, and maintain.
- No → evaluate GraphQL or gRPC based on query flexibility vs. contract strictness.

**6. Must it scale beyond one server?**
- Yes → design for statelessness from day one. Plan caching, pub/sub, and DB connection pooling early.
- No → monolith is fine. Extract services when the pain is real, not speculative.

**7. Small team or early stage?**
- Yes → start with a monolith + REST. Add complexity only when a specific bottleneck appears.
- No → define service boundaries by domain. Build the team structure to match the architecture.

---

## 19.2 Summary

There is no single best architecture. The right choice depends on scale, team, client types, and latency requirements.

- **Default:** REST is the safe, well-understood starting point for most systems.
- **Add GraphQL** when clients need flexible queries or you have multiple client types.
- **Add gRPC** for high-frequency internal calls where latency and type safety matter.
- **Add WebSocket** only when the product requires true realtime bidirectional communication.
- **Add caching layers** progressively as traffic grows — do not over-engineer early.
