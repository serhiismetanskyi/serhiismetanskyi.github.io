---
date: 2026-06-12
tags:
  - architecture
  - networking
  - performance
---

# Scalability

## 10.1 Horizontal Scaling

Add more instances behind a load balancer. This is the primary scaling strategy
for stateless services.

**Stateless** means: no session data stored in the server instance. All state
lives in the database, cache, or client.

```
User → Load Balancer → [Instance 1]
                     → [Instance 2]
                     → [Instance 3]
```

Auto-scaling: scale based on CPU, memory, or request queue depth. Kubernetes
HPA (Horizontal Pod Autoscaler) does this automatically.

---

## 10.2 Vertical Scaling

Give one instance more CPU or RAM. Simple but has limits. When you hit the
hardware ceiling, you must scale horizontally. Do not rely only on vertical
scaling for production systems.

---

## 10.3 Bottlenecks

Common bottlenecks under load:

| Bottleneck               | Symptom                        | Solution                                   |
| ------------------------ | ------------------------------ | ------------------------------------------ |
| Database queries         | High DB CPU, slow queries      | Add indexes, query optimization, replicas  |
| Connection pool exhausted| "too many connections" error   | Increase pool size, use PgBouncer          |
| N+1 queries              | DB latency grows with list size| DataLoader / batch queries                 |
| CPU-bound processing     | High CPU, slow responses       | Cache results, offload to queue            |
| Network                  | High latency to DB / upstream  | Move services closer, CDN, pooling         |
| Memory leaks             | Memory grows over time         | Profile, fix, add memory limits            |

### N+1 query pattern — what it looks like

```
GET /posts → SELECT * FROM posts (1 query)
For each post → SELECT * FROM users WHERE id = ? (N queries)
```

Fix: one joined query or DataLoader batch.

---

## 10.4 WebSocket Scaling

WebSocket connections are stateful — they stay on one server. They cannot be
load-balanced freely.

### Sticky sessions

LB routes the same client to the same server using IP hash or session cookie.

**Problem:** if one server has many heavy users, it gets overloaded while
others are idle.

### Pub/Sub for cross-server messaging

```
Client A (Server 1) sends message
  → Server 1 publishes to Redis Pub/Sub
  → Server 2 and Server 3 receive from Redis
  → They forward to their connected clients
```

| Broker        | Best for                          |
| ------------- | --------------------------------- |
| Redis Pub/Sub | Simple, fast, no persistence      |
| Kafka         | Persistent, ordered, high volume  |
| NATS          | Very low latency, lightweight     |

---

## 10.5 Multi-region

Serve users from the nearest region to minimize latency.

### Geo routing

DNS or load balancer routes requests to the nearest region.
- Cloudflare: anycast routing.
- AWS Route 53: latency-based routing.

### Data replication

- Read replicas per region (PostgreSQL streaming replication).
- Writes go to the primary region — cross-region write latency: 100–300 ms.
- For global writes: use CRDTs or eventual consistency patterns.

**Rule:** decide which data must be globally consistent vs. eventually
consistent per domain before choosing a replication strategy.

---

## Key Rules

1. Design services as stateless from the start. Retrofitting is expensive.
2. Identify DB bottlenecks first before adding instances — extra instances do
   not fix slow queries.
3. Use PgBouncer or equivalent connection pooling in front of every database.
4. For WebSocket scale-out, always use a Pub/Sub broker; never rely on
   sticky sessions alone.
5. Measure before scaling: use APM (Datadog, Grafana) to find the real
   bottleneck.
