---
date: 2026-06-11
tags:
  - architecture
  - networking
  - service-mesh
---

# Traffic Management

## 4.1 Routing

### Path-based routing

Route requests based on URL path:

- `/api/v1/users` → user service
- `/api/v1/orders` → order service
- `/static/*` → CDN or file service

Each path prefix maps to exactly one upstream target. The gateway matches the longest prefix first.

### Host-based routing

Route based on the `Host` HTTP header:

- `api.example.com` → API cluster
- `admin.example.com` → admin cluster
- `ws.example.com` → WebSocket cluster

Useful when multiple products or tenants share the same IP address. The gateway reads the hostname and forwards to the correct cluster before any application code runs.

---

## 4.2 Traffic Shaping

### Rate limiting

Limit the number of requests a client can make in a time window.
Client is identified by API key, user ID, or IP address.

When the limit is exceeded, return `429 Too Many Requests` with a `Retry-After` header.

**Common algorithms:**

| Algorithm | How it works | Best for |
|---|---|---|
| Fixed window | Count resets every N seconds | Simple cases |
| Sliding window | Count over a rolling time range | Smoother enforcement |
| Token bucket | Add tokens at a fixed rate; each request consumes one | Burst tolerance |
| Leaky bucket | Queue requests and drain at fixed rate | Strict output rate |

Apply rate limiting at the API gateway level — before requests reach backend services.
This protects services from overload and abuse without any code changes in services.

### Throttling

Throttling is softer than rate limiting. Instead of rejecting excess requests, it slows them down.

- Excess requests enter a queue and are processed with a delay.
- The client waits but eventually gets a response.
- Use when short bursts are acceptable but sustained overload is not.

**When to choose throttling vs rate limiting:**
Use rate limiting when you want hard limits (pay-per-use APIs, abuse prevention).
Use throttling when you want smooth flow control with no client errors during mild spikes.

---

## 4.3 Canary Releases

Gradually roll out a new version by routing a small percentage of traffic to it.

```
All traffic → Load Balancer
  95% → Service v1 (stable)
   5% → Service v2 (canary)
```

**Process:**
1. Deploy v2 alongside v1. Route 5% of traffic to v2.
2. Monitor error rate, latency, and business metrics on v2.
3. If healthy: increase percentage — 5% → 25% → 50% → 100%.
4. If errors spike: route all traffic back to v1 immediately.

**Implementation options:**
- NGINX `upstream` with `weight` directive
- Envoy weighted clusters
- AWS ALB weighted target groups
- Istio `VirtualService` with traffic weights

Canary is the preferred strategy when risk reduction matters more than speed of rollout.

---

## 4.4 Blue-Green Deployment

Two identical production environments: **Blue** (current) and **Green** (new version).

**Flow:**
1. Green is deployed and tested fully while Blue serves all traffic.
2. Switch: the load balancer routes all traffic from Blue to Green. Instant cutover.
3. Blue stays idle as a rollback target.
4. If issues appear, switch back to Blue in seconds.

Zero downtime. No gradual rollout — it is all-or-nothing.

**vs Canary:**

| Aspect | Blue-Green | Canary |
|---|---|---|
| Rollout speed | Instant | Gradual |
| Risk exposure | All users at once | Small group first |
| Rollback speed | Instant | Instant |
| Infrastructure cost | 2x during switch | Low |

Use **Blue-Green** when you need fast rollback and can afford 2x infrastructure briefly.
Use **Canary** when you want to validate with real users before full rollout.

---

## 4.5 Failover

### Active-passive

- Primary server handles all traffic.
- Standby server is idle, ready to take over.
- On primary failure: load balancer detects via health check and routes all traffic to standby.
- Standby needs 10–60 seconds to become fully active.

**Trade-offs:** Lower cost (standby does nothing), but brief downtime during failover.
Use when cost matters more than zero-downtime availability.

### Active-active

- Multiple servers handle traffic simultaneously.
- On one server failure: remaining servers absorb the load automatically.
- No failover delay — traffic is already distributed.

**Trade-offs:** Higher cost (all servers active), but no downtime.
Use when your SLA requires continuous availability and no tolerance for even brief outages.

**Key decision factor:** Does your system tolerate 10–60 seconds of downtime? If yes, active-passive. If no, active-active.
