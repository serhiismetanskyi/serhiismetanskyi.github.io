---
date: 2026-08-09
tags:
  - performance
  - load-testing
  - metrics
---

# Performance Testing — Goals & Types

## Why We Do It

Performance testing is not about proving the system is fast.
It is about understanding **how the system behaves when it's actually used**.

| Goal | What It Answers |
|------|----------------|
| Measure system capacity | How many users / RPS can we handle before degradation? |
| Identify bottlenecks | What breaks first — DB, CPU, network, application logic? |
| Validate SLAs / SLOs | Do we meet the contractual and internal performance targets? |
| Understand behavior under load | How does latency change as load increases? |

---

## Types of Performance Tests

### Load Testing

Simulates **expected production load**. The goal is to confirm the system behaves
normally at the traffic levels it is designed to handle.

```
Users: normal peak → sustained for 30–60 min
Goal:  stable RPS, latency within SLO, error rate < 1%
```

---

### Stress Testing

Pushes the system **beyond its designed limits** to find where and how it breaks.

```
Users: ramp up until failure
Goal:  find the breaking point, observe degradation pattern
```

A well-designed system degrades gracefully — latency increases, but it doesn't
crash or corrupt data.

---

### Spike Testing

Applies a **sudden, sharp increase** in load to simulate real-world events:
flash sales, viral posts, product launches.

```
Users: 10 → 1000 in 10 seconds → back to 10
Goal:  recovery time, error behavior at peak
```

---

### Soak Testing

Runs **sustained load for an extended period** (hours or days) to detect
slow degradation: memory leaks, connection pool exhaustion, log file growth.

```
Users: constant moderate load for 8–24 hours
Goal:  stable memory, no latency drift over time
```

---

### Scalability Testing

Measures how the system responds to **adding resources** (more servers, more DB replicas).

```
Pattern: test at 1 node → 2 nodes → 4 nodes
Goal:    linear throughput increase, or identify bottleneck that prevents scaling
```

---

## Choosing the Right Test

| Trigger | Test Type |
|---------|-----------|
| Pre-deploy validation | Load |
| Capacity planning | Stress + Scalability |
| Event-driven traffic (sale, launch) | Spike |
| Long-running service concern | Soak |
| Infrastructure decision | Scalability |
