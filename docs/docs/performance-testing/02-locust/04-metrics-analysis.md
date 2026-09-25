---
date: 2026-08-11
tags:
  - performance
  - load-testing
  - locust
  - metrics
---

# Metrics Analysis in Locust

## Built-in Metrics

Locust tracks and reports the following out of the box:

| Metric | Description |
|--------|-------------|
| RPS | Requests per second (current) |
| Failures/s | Failed requests per second |
| p50 / p90 / p95 / p99 | Response time percentiles |
| Avg / Min / Max | Response time summary |
| Total requests | Cumulative count |
| Total failures | Cumulative failures |

Available in: web UI (`http://localhost:8089`), terminal output, CSV export.

---

## Key Focus Areas

### Latency — Watch p95 and p99

Average is a vanity metric. Focus on tail percentiles.

```
p50 = 45ms   → typical user: fine
p95 = 280ms  → SLA threshold: check against contract
p99 = 1800ms → 1 in 100 users: investigate
```

A p99 that grows as load increases signals a resource saturation problem.

### Errors — Spikes Under Load

A healthy system has 0% errors at expected load.
Error rate is the **first indicator** that something is breaking.

```
RPS:    100  200  300  400
Errors: 0%   0%   0.2% 8%   ← 300 RPS is the threshold
```

### Throughput — Plateau Detection

When RPS stops growing despite adding more users, throughput has plateaued.
This is the system's **capacity ceiling**.

```
Users: 10  50  100  200  400
RPS:   10  50  100  110  112  ← plateau at ~100 RPS
```

---

## Bottleneck Detection

Locust metrics alone show symptoms. Correlate with system metrics (CPU, memory, DB)
to find the root cause.

| Symptom in Locust | Likely Cause |
|-------------------|-------------|
| Latency rises linearly with load | CPU saturation |
| Latency spikes at specific RPS | Thread pool / connection pool exhaustion |
| Error rate jumps at threshold | Timeout / queue overflow |
| RPS plateaus despite more users | Backend bottleneck (DB, app) |
| p99 much higher than p95 | Occasional GC pause, lock, or slow query |

---

## Reading the Locust Report

After a headless run, export CSV:

```bash
locust -f locustfile.py --headless -u 200 -r 20 --run-time 120s \
  --csv=results/run1
```

Files generated:
- `run1_stats.csv` — per-endpoint summary
- `run1_stats_history.csv` — time-series data
- `run1_failures.csv` — failure details

Import `stats_history.csv` into Grafana or plot with Python/pandas to visualize
latency trends over time — far more useful than summary numbers alone.
