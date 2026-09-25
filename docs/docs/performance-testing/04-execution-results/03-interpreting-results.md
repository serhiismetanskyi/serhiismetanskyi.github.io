---
date: 2026-08-13
tags:
  - performance
  - load-testing
---

# Interpreting Results

## Healthy System

A system behaving correctly under load shows:

| Signal | What It Looks Like |
|--------|-------------------|
| Stable RPS | Flat line at target throughput |
| Flat latency | p95/p99 barely changes as users increase |
| Low error rate | 0% or < 0.1% throughout the test |
| Stable memory | Memory usage plateaus, no upward drift |
| Consistent CPU | CPU proportional to RPS, not spiking |

```
RPS:     ──────────────────── (flat at target)
p95:     ────────────────────
Errors:  ────────────────────
          0s       60s      120s
```

---

## Degrading System

Early warning signs before a system fails:

| Signal | Interpretation |
|--------|---------------|
| Latency slowly increasing | Resource is being consumed — find which one |
| Occasional p99 spikes | GC pauses, lock contention, slow queries appearing |
| RPS variance increasing | Processing becomes inconsistent |
| Memory creeping up | Potential memory leak — confirm with soak test |

```
p99:     ___
            \___
                \___________
                             \___
                                  \__________________ (slowly growing)
          0s       60s      120s     180s     240s
```

This pattern demands investigation before production load reaches these levels.

---

## Overloaded System

System operating beyond capacity:

| Signal | What Happens |
|--------|-------------|
| Latency spikes sharply | Queue backs up, requests wait for workers |
| Error rate jumps | Timeouts, 503s, connection refused |
| Throughput plateau | Adding users doesn't add RPS — system is saturated |
| RPS drops despite high user count | System spending time recovering, not processing |

```
RPS:     ___________
                    \_____________________  ← plateau then drop
p99:                       _______________
                           /               ← spike
Errors:                    ______________
                           /               ← spike
          0s       60s      120s     180s
```

The knee point is where this transition begins — the critical finding of any load test.

---

## Reading the Numbers

### Scenario: is 200ms p95 acceptable?

It depends on the SLO:
- If SLO is p95 < 300ms → pass
- If SLO is p95 < 100ms → fail

Always evaluate results **against the SLO**, not against intuition.

### Scenario: RPS is 100 but users are 200

Effective RPS = users × (1 / (response_time + wait_time))

```
200 users × 1 / (0.4s + 0.6s wait) = 200 RPS possible
If actual RPS = 100 → latency is 1.4s, not 0.4s
```

High user count with low RPS signals the system is slow, not that Locust is misconfigured.

---

## Result Classification Matrix

| p95 | Error Rate | Conclusion |
|-----|-----------|------------|
| Within SLO | < 0.1% | Pass — healthy |
| Within SLO | 0.1–1% | Warning — investigate errors |
| Within SLO | > 1% | Fail — reliability issue |
| Exceeds SLO | < 0.1% | Fail — latency issue |
| Exceeds SLO | > 1% | Fail — system overloaded |
