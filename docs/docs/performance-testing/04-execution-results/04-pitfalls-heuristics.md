---
date: 2026-08-13
tags:
  - performance
  - load-testing
---

# Pitfalls, Real-World Scenarios & Heuristics

## Common Pitfalls

### Ignoring Percentiles

Using average response time as the success metric. Average hides the tail.

```
Average: 80ms — "looks great"
p99:     4200ms — 10,000 users/day have a broken experience
```

**Fix:** define SLOs on p95/p99. Never accept a test report that only shows averages.

---

### Unrealistic Load

Testing with 1000 users all hitting the same endpoint simultaneously.
Real users are spread across pages, have sessions, use different features.

**Fix:** model actual user flows with task weights, think time, and session state.

---

### No Think Time

Locust users hammering endpoints with zero delay generates 10–100× more RPS
than the same number of real users. Results are not comparable to production.

**Fix:** always set `wait_time`. Match production traffic patterns.

---

### Testing Only Happy Paths

Load testing only successful flows misses the cost of error handling:
retries, rollbacks, logging, notification emails — all add server load.

**Fix:** include realistic error scenarios: 404 lookups, validation failures, expired tokens.

---

### No Monitoring

Running a load test with only Locust output means you see symptoms (slow/errors)
but not causes (which resource is saturated).

**Fix:** always run with system metrics (Prometheus/Grafana, `htop`, DB slow query log).

---

### Misinterpreting Averages

The average is distorted by a small number of extreme outliers.
A system with 990ms p99 and 10ms p50 has average ~19ms — misleadingly healthy.

---

## Real-World Scenarios

### CRUD APIs

**Focus:** RPS + p95 latency per endpoint.

Key concern: DB query efficiency. Every endpoint has a DB query.
Test with realistic data volumes — test with 10M rows, not 1000.

---

### Realtime Systems (WebSocket, SSE)

**Focus:** concurrent connections + message latency.

Standard HTTP load testing does not apply. Use Locust with WebSocket support:

```python
from locust import User, task, between
import websocket


class WsUser(User):
    wait_time = between(0.1, 0.5)

    def on_start(self) -> None:
        self.ws = websocket.create_connection("ws://localhost:8080/ws")

    @task
    def send_message(self) -> None:
        self.ws.send('{"type": "ping"}')
        self.ws.recv()

    def on_stop(self) -> None:
        self.ws.close()
```

---

### Microservices

**Focus:** service-to-service latency, cascading failures.

One slow upstream service can degrade the entire call chain.
Test with realistic inter-service latencies. Add artificial delays to dependencies
to see how your service behaves when an upstream is slow (chaos engineering).

---

### Large-Scale Systems

**Focus:** distributed load generation + cross-region observability.

Use Locust distributed mode. Correlate load test timing with:
- CDN cache hit rates
- Load balancer request distribution
- Per-AZ latency

---

## Engineering Heuristics (Senior Level)

| Heuristic | Why It Matters |
|-----------|---------------|
| Always analyze p95/p99, never average | Average hides the users with bad experience |
| Correlate load with system metrics | Symptoms are in Locust; causes are in the system |
| Use realistic scenarios, not endpoint hammering | Test the system the way users use it |
| Focus on bottlenecks, not averages | Fix the constraint, everything else follows |
| Measure before optimizing | Intuition is wrong 80% of the time |
| Optimize tail latency, not mean | p99 is what users feel, p50 is what engineers celebrate |
| Keep performance tests in CI | Performance regressions caught in hours, not after deploy |
