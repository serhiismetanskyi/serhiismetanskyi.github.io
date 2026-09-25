---
date: 2026-08-12
tags:
  - performance
  - load-testing
---

# Test Execution Strategy

## Pre-Test Preparation

Running a test against a cold system produces misleading results.
The first requests hit empty caches, trigger JIT compilation, and establish new connections.

### Warm-up

Run a short low-load phase before the actual test to stabilize the system state.

```bash
# Warm-up: 10 users for 30 seconds
locust -f locustfile.py --headless -u 10 -r 5 --run-time 30s

# Actual test: 200 users for 5 minutes
locust -f locustfile.py --headless -u 200 -r 20 --run-time 300s \
  --csv=results/run1
```

Or use a `LoadTestShape` with a built-in ramp phase (see `05-advanced-usage.md`).

### Environment Checklist

| Item | Why |
|------|-----|
| Use production-like data volumes | Small datasets hit in-memory limits differently |
| Disable debug logging | Debug mode adds latency and I/O |
| Isolate test environment | Shared environments introduce noise |
| Reset DB state between runs | Stale data causes inconsistencies |
| Prime caches if production has them | Cold cache skews first-run results |

---

## During the Test

### What to Watch in Real Time

- **Locust UI** (`http://localhost:8089`): RPS, error rate, p95/p99
- **Server CPU**: alert if sustained > 80%
- **DB slow query log**: new slow queries appearing under load
- **Memory**: growing linearly = memory leak
- **Error log**: new error types or increasing error frequency

### When to Stop Early

Stop the test if:
- Error rate exceeds 5% (data integrity risk)
- System becomes unresponsive (feedback loop of degradation)
- A cascading failure starts affecting unrelated services

```bash
# Send SIGINT to Locust or press Ctrl+C
# Locust will write final stats before exiting
```

---

## Post-Test Analysis

### Compare Runs

Never analyze a single run in isolation. Compare against:
- Previous deploy (did performance regress?)
- Baseline run (how far are we from optimal?)
- Last week's run (is there a trend?)

### What to Capture After Each Run

```
results/
├── run1_stats.csv
├── run1_stats_history.csv
├── run1_failures.csv
└── run1_notes.md     ← add: users, duration, environment, notable findings
```

### Trend Analysis

Import `stats_history.csv` and plot p95 over time:

```python
import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("run1_stats_history.csv")
df_total = df[df["Name"] == "Aggregated"]
plt.plot(df_total["Timestamp"], df_total["95%"])
plt.ylabel("p95 latency (ms)")
plt.xlabel("Time (s)")
plt.title("p95 Latency Under Load")
plt.savefig("results/p95_trend.png")
```
