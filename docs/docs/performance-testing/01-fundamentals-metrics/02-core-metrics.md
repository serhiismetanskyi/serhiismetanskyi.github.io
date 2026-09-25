---
date: 2026-08-09
tags:
  - performance
  - load-testing
  - metrics
---

# Core Metrics

## Response Time (Latency)

Time from the moment a request is sent until the full response is received.

### Components

```
DNS resolution → TCP handshake → TLS handshake → Server processing → Network transfer
```

Each step can be a bottleneck. A slow DNS resolver adds latency even if the server is fast.

---

## Percentiles (Critical Concept)

**Never trust the average.** Average hides outliers. Use percentiles.

| Percentile | Meaning |
|-----------|---------|
| p50 | 50% of requests are faster than this — the typical user |
| p90 | 90% of requests are faster — high-load users |
| p95 | SLA baseline — the standard contract metric |
| p99 | Worst-case tail latency — affects 1 in 100 users |
| Max | Single worst request — often a fluke, but worth monitoring |

### Why Tail Latency Matters

A p99 of 5 seconds means 1 in 100 users waits 5 seconds.
On a system with 1M daily users, that is **10,000 painful experiences per day**.

```
Average: 80ms  →  looks healthy
p99:     4200ms →  10,000 users/day have a broken experience
```

---

## RPS — Requests Per Second

Number of requests the system processes per second.

- Represents **load intensity** from the client perspective
- In Locust: controlled by number of users + wait time between requests
- RPS is an input metric — you set it. Latency is the output — the system responds.

---

## Throughput

Amount of **data** transferred per second (bytes/sec), not request count.

| Metric | Counts |
|--------|--------|
| RPS | Requests |
| Throughput | Bytes |

A single file upload request may have low RPS but very high throughput.
A health-check endpoint may have high RPS but near-zero throughput.

---

## Concurrency

Number of active users or in-flight requests at any given moment.

### Little's Law

```
Concurrency = RPS × Response Time (in seconds)
```

**Example:** 100 RPS × 0.5s latency = 50 concurrent requests in flight at all times.
When latency increases, concurrency grows — consuming more connections, threads, memory.

---

## Error Rate

Percentage of failed requests over total requests.

| Error Type | Examples |
|-----------|---------|
| HTTP 4xx | Bad request, unauthorized, not found |
| HTTP 5xx | Server error, gateway timeout |
| Timeout | Response took longer than client threshold |
| Network failure | Connection refused, reset |

Healthy systems target **< 1% error rate** under expected load.
Error rate should be the **first metric to alert on**.

---

## Latency Distribution

A histogram of all response times over the test duration.

- Shows whether the distribution is **normal** (bell curve) or **bimodal** (two peaks)
- Two peaks often indicate two code paths: fast cache hit vs slow DB query
- Long tail on the right = p99 problem worth investigating
