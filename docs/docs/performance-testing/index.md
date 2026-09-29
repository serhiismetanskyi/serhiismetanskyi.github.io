---
date: 2026-08-08
tags:
  - performance
  - load-testing
---

# Performance Testing

Performance testing answers one question: **does the system behave correctly under load?**

This section covers the full spectrum — from theory to Locust tooling.

---

## Structure

### 1. [Fundamentals & Metrics](01-fundamentals-metrics/index.md)

| File | Topics |
|------|--------|
| [Goals & Types](./01-fundamentals-metrics/01-goals-and-types.md) | Performance testing goals, load/stress/spike/soak/scalability types |
| [Core Metrics](./01-fundamentals-metrics/02-core-metrics.md) | Latency (p50/p95/p99), throughput, error rate, concurrency |
| [Metric Relationships](./01-fundamentals-metrics/03-metric-relationships.md) | How metrics interact, bottleneck signals, capacity planning |

### 2. [Locust](02-locust/index.md)

| File | Topics |
|------|--------|
| [Architecture & Basics](./02-locust/01-architecture-basics.md) | Locust architecture, setup, basic load test structure |
| [Load Modeling](./02-locust/02-load-modeling.md) | User classes, wait times, task weights, ramp-up patterns |
| [Test Design](./02-locust/03-test-design.md) | Scenario design, data handling, correlation, assertions |
| [Metrics & Analysis](./02-locust/04-metrics-analysis.md) | Interpreting Locust output, charts, CSV export, dashboards |
| [Advanced Usage](./02-locust/05-advanced-usage.md) | Distributed mode, custom clients, event hooks, CI integration |

### 3. [Bottlenecks & Monitoring](03-bottlenecks-monitoring/index.md)

| File | Topics |
|------|--------|
| [Bottlenecks](./03-bottlenecks-monitoring/01-bottlenecks.md) | CPU, memory, I/O, network, DB, connection pool bottlenecks |
| [Monitoring & Observability](./03-bottlenecks-monitoring/02-monitoring-observability.md) | Metrics collection, Grafana, Prometheus, alerting patterns |

### 4. [Execution & Results](04-execution-results/index.md)

| File | Topics |
|------|--------|
| [SLA / SLO](./04-execution-results/01-sla-slo.md) | SLA vs SLO vs SLI, defining targets, error budgets |
| [Execution Strategy](./04-execution-results/02-execution-strategy.md) | Environment prep, baseline, incremental load, test schedule |
| [Interpreting Results](./04-execution-results/03-interpreting-results.md) | Reading reports, comparing runs, identifying regressions |
| [Pitfalls & Heuristics](./04-execution-results/04-pitfalls-heuristics.md) | Common mistakes, unrealistic scenarios, anti-patterns |

---

## When to Apply Which Test Type

| Situation | Test Type |
|-----------|-----------|
| Regular deploy validation | Load test |
| Finding system limits | Stress test |
| Flash sale, viral traffic | Spike test |
| Memory leaks, long sessions | Soak test |
| Horizontal scaling plan | Scalability test |

---

## Key Principle

> Always analyze p95/p99. Average latency hides the pain of real users.

---
## See also
- [Digital Garden: Knowledge Base](../index.md)
- [Test Automation Framework](../test-automation-framework/index.md)
- [CI/CD](../ci-cd-approaches/index.md)
- [Linux Terminal — Essential Commands](../tools/linux-terminal/index.md)
- [Advanced Topics](../python-guide/06-advanced-topics/index.md)
