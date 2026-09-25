---
date: 2026-06-10
tags:
  - architecture
  - networking
---

# Edge Layer: CDN and Load Balancers

## 3.1 CDN (Content Delivery Network)

A CDN is a network of geographically distributed servers called **PoPs (Points of Presence)**.
When a user makes a request, it is served from the PoP closest to them — not from the origin
server. This reduces round-trip time (RTT) and offloads traffic from the origin.

By 2026, multi-CDN setups are standard for high-availability systems. A unified control layer
manages routing policies, cache invalidation, and health checks across all providers.

### What CDN Caches

- Static assets: JS, CSS, images, fonts, videos.
- API responses with `Cache-Control: public, max-age=N`.
- Pre-rendered HTML pages (avoid caching user-specific content).

### How CDN Caching Works

1. User requests `/assets/main.js`.
2. CDN checks edge cache → **miss** → forwards to origin server.
3. Origin returns response: `Cache-Control: public, max-age=86400`.
4. CDN stores response at the edge node.
5. Next user at the same location gets the response **from edge** — origin is not hit.

If a **cache stampede** occurs (many simultaneous misses), use request coalescing:
Nginx `proxy_cache_lock on` or Varnish grace mode collapses concurrent misses into one
origin request.

### Key Cache Headers

| Header | Effect |
|---|---|
| `Cache-Control: public, max-age=N` | CDN caches for N seconds |
| `Cache-Control: private` | CDN does **not** cache (per-user response) |
| `Cache-Control: no-store` | CDN and browser skip cache entirely |
| `Cache-Control: stale-while-revalidate=N` | Serve stale, revalidate in background |
| `Vary: Accept-Encoding` | CDN stores separate versions per encoding |
| `Surrogate-Key` / `Cache-Tag` | Tag-based selective purging |
| `Surrogate-Control` | Overrides `Cache-Control` at CDN level only |

### Edge Caching Patterns

**Immutable assets** — content-hashed filenames with maximum TTL:
```
/main.abc123.js → Cache-Control: public, max-age=31536000, immutable
```
Hash changes when content changes. Safe to cache forever.

**Versioned API responses** — short TTL for semi-dynamic data:
```
GET /v1/products → Cache-Control: public, max-age=60
```

**Stale-while-revalidate** — serve stale immediately, update in background:
```
Cache-Control: public, max-age=60, stale-while-revalidate=300
```
Best UX for non-critical data. User never waits for revalidation.

### Geo Distribution

CDN routes requests to the nearest PoP using DNS steering and Anycast network routing.
The same service endpoint can be served by different edge locations based on client
location and network path. Benefits:

- Lower RTT for global users.
- Regional data sovereignty (data stays in region).
- DDoS absorption at edge — attack traffic is distributed across PoPs instead of hitting origin.

### Origin Protection

Restrict origin to accept requests **only from CDN IPs**. Use:
- IP allowlisting (CDN publishes its IP ranges).
- mTLS with a shared client certificate between CDN and origin.
- Signed headers (e.g. Cloudflare `CF-Access-Client-Id`).

Without this, attackers bypass CDN and hit origin directly.

---

## 3.2 Load Balancers

### L4 vs L7

| Feature | L4 (TCP/UDP) | L7 (HTTP) |
|---|---|---|
| Works at | Transport layer | Application layer |
| Routing based on | IP + port | URL path, headers, cookies |
| SSL termination | No (pass-through) | Yes |
| Content awareness | No | Yes |
| Latency | Lower | Slightly higher (HTTP parsing) |
| Use cases | Raw TCP, gRPC, custom protocols | HTTP APIs, WebSocket |

L4 is faster but blind to application content. L7 enables smart routing and SSL termination
at the cost of parsing overhead.

### Routing Algorithms

| Algorithm | How it works | Best for |
|---|---|---|
| Round robin | Cycles through servers in order | Even, equal-duration requests |
| Least connections | Routes to server with fewest active connections | Variable-duration requests |
| Weighted routing | Servers get traffic proportional to capacity | Mixed server sizes |
| IP hash | Same client IP always maps to same server | Stateful WebSocket connections |
| Geo-based | Routes to geographically closest data center | Global users, latency reduction |

### Health Checks and Failover

LB sends periodic probes (e.g. `HTTP GET /health`, TCP connect every 5s):

- Server returns non-2xx or times out **N consecutive times** → removed from rotation.
- Remaining healthy servers absorb the load automatically — this is **automatic failover**.
- Server recovers → reintroduced with a **slow traffic ramp-up** (avoid thundering herd).

Health check endpoint should verify internal dependencies (DB connection, queue),
not just return 200 unconditionally.

**Failover types at the LB level:**
- **Passive failover:** LB detects unhealthy server and removes it from rotation. Traffic redistributes automatically.
- **Active failover:** a standby server is promoted to primary when the primary fails (active-passive setup, see §4.5).

### SSL Termination

```
Client —[HTTPS]→ Load Balancer —[HTTP]→ Backend servers
```

- LB handles TLS handshake and decryption (expensive crypto offloaded from backends).
- Backends communicate over plain HTTP internally — fast, no cert management per service.
- Internal network must be trusted (private VPC). If compliance requires end-to-end TLS,
  use **TLS re-encryption**: LB terminates then re-encrypts before forwarding.

### Sticky Sessions

LB inserts a cookie (e.g. `SERVER_ID=backend-3`). All subsequent requests from the same
user go to the same backend instance.

**Required for:** stateful WebSocket connections (TCP connection is tied to one server).

**Downsides:**
- Uneven load if some users generate more traffic.
- Backend failure drops all sessions pinned to it — requires client-side reconnect logic.

**Alternative:** move session state to a shared store (Redis) and make backends stateless.
Then sticky sessions are unnecessary.
