---
date: 2026-08-12
tags:
  - performance
  - load-testing
  - observability
---

# Monitoring & Observability

## Why It Matters

Locust tells you what users experience. System metrics tell you **why**.
Running a load test without monitoring system internals is flying blind.

---

## System Metrics to Track

| Metric | Tool | Warning Threshold |
|--------|------|------------------|
| CPU usage | `top`, Prometheus node_exporter | > 80% sustained |
| Memory usage | `free`, cAdvisor | > 85% |
| Disk I/O wait | `iostat` | > 20% iowait |
| Network bytes/s | `nethogs`, Prometheus | Near NIC capacity |
| Open file descriptors | `/proc/sys/fs/file-nr` | > 80% of limit |

---

## Application Metrics

Instrument your service to expose:

| Metric | Purpose |
|--------|---------|
| Request latency histogram | p50/p95/p99 from inside the app |
| Active connections | Current load on the server |
| DB query duration | Identify slow query patterns |
| Cache hit/miss ratio | Cache efficiency |
| Queue depth | Backpressure indicator |
| Error count by type | Error budget tracking |

### FastAPI + Prometheus example

```python
from prometheus_client import Histogram, Counter, start_http_server

REQUEST_LATENCY = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency",
    ["method", "endpoint"],
)
REQUEST_ERRORS = Counter(
    "http_request_errors_total",
    "Total HTTP errors",
    ["status_code"],
)
```

---

## Tools

### Prometheus + Grafana

The standard stack for metrics collection and visualization.

```
App (metrics endpoint) → Prometheus (scrape & store) → Grafana (dashboards)
```

- Prometheus scrapes `/metrics` every 15s
- Grafana visualizes time-series with alerting
- Use pre-built dashboards: Node Exporter Full, FastAPI dashboard

### Locust + Prometheus

```bash
pip install locust-plugins
```

`locust-plugins` provides a `--timescale` flag to push Locust metrics into PostgreSQL/TimescaleDB,
and a Grafana dashboard to visualize them alongside system metrics.

---

## Correlating Load with System Metrics

The key question during a load test: **at what RPS did the system degrade, and what resource caused it?**

```
Time     RPS    p99(ms)   CPU%   DB connections
0:00     50     45        12%    8
0:05     100    48        23%    16
0:10     150    52        41%    24
0:15     200    180       78%    32
0:20     250    850       95%    40     ← CPU saturated
0:25     240    2100      99%    48     ← overloaded
```

In this example: CPU at 95% at 200 RPS → the application server is the bottleneck,
not the DB (connections still have headroom). Fix: scale horizontally or optimize CPU-bound code.

---

## Correlation Checklist

When latency increases during a test, check in this order:

1. CPU on app servers
2. DB query duration (slow query log)
3. DB connections (pool utilization)
4. Memory (GC pressure, swap usage)
5. Network (bandwidth, inter-service latency)
6. External dependencies (third-party APIs, message queues)
