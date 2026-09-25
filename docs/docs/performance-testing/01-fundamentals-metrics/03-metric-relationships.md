---
date: 2026-08-09
tags:
  - performance
  - load-testing
  - metrics
---

# Metric Relationships

## Little's Law

The fundamental law connecting the three core metrics:

```
Concurrency = RPS × Response Time (seconds)
```

| Scenario | RPS | Latency | Concurrency |
|----------|-----|---------|-------------|
| Healthy | 100 | 0.1s | 10 |
| Degrading | 100 | 1.0s | 100 |
| Overloaded | 80 | 5.0s | 400 |

As latency grows, concurrency explodes — consuming threads, file descriptors,
memory — which in turn causes more latency. This is the **feedback loop of degradation**.

---

## Key Relationships

### Higher latency → lower effective throughput

Even with the same RPS, if each response takes 5× longer, the system does 5× more
work in parallel. Resources saturate sooner.

### Increasing RPS → increases latency after a threshold

Every system has a saturation point. Below it, latency is flat.
Above it, latency climbs nonlinearly.

```
RPS:      10   50  100  150  200
p95 (ms): 40   45   80  300  1200
```

That sharp knee is the system's **capacity limit**.

### Larger payload → higher throughput, same RPS

More bytes per request means more network and CPU work per second,
even if the request count stays constant.

### Slow responses → higher concurrency → resource exhaustion

This is the chain reaction that crashes systems: high load → high latency →
high concurrency → out of threads/connections → errors → higher latency.

---

## Common Misconceptions

| Misconception | Reality |
|--------------|---------|
| High RPS = good performance | High RPS with p99 > 5s is not good performance |
| Low average latency = good UX | Average hides the worst 1–10% of users |
| Zero errors = stable system | A system with 0% errors but 10s latency is not stable |
| Fast under low load = scalable | Many systems look great at 10 users, collapse at 1000 |

---

## Reading a Performance Curve

A standard latency-vs-load curve has three zones:

```
Latency
  |                                    /
  |                                   /
  |                          ________/
  |_________________________/
  |
  +---------------------------------> RPS
       [stable]    [knee]   [degraded]
```

- **Stable zone**: latency flat, system handles load easily
- **Knee**: the inflection point — capacity limit reached
- **Degraded zone**: latency climbs, errors appear, system is overloaded

The goal of performance testing is to **find the knee** and ensure production
traffic stays well to the left of it.
