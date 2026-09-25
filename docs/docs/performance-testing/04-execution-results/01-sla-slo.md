---
date: 2026-08-12
tags:
  - performance
  - load-testing
---

# SLA / SLO

## Definitions

### SLA — Service Level Agreement

An **external contract** with customers or partners.
Defines the minimum acceptable performance. Breach has legal or financial consequences.

```
"We guarantee 99.9% uptime and p95 response time < 500ms"
```

---

### SLO — Service Level Objective

An **internal target** set by engineering.
Must be stricter than the SLA — it is the team's goal, not the floor.

```
SLA commitment:  p95 < 500ms
SLO target:      p95 < 300ms   ← engineers aim here
```

If the SLO is breached, the team acts before the SLA is violated.

---

### SLI — Service Level Indicator

The **measurement** used to evaluate SLO compliance.

| SLI | What It Measures |
|-----|-----------------|
| Request latency (p95) | Speed |
| Error rate | Reliability |
| Availability | Uptime |
| Throughput | Capacity |

---

## Practical SLO Examples

| System | SLO |
|--------|-----|
| REST API (read) | p95 < 200ms, error rate < 0.1% |
| REST API (write) | p95 < 500ms, error rate < 0.5% |
| Background job | p99 < 30s, success rate > 99% |
| WebSocket stream | Connection drop rate < 0.1% |
| Search endpoint | p95 < 300ms, p99 < 1000ms |

---

## Error Budget

Error budget = the allowed amount of SLO violations before action is required.

```
SLO target:    99.9% requests < 300ms
Error budget:  0.1% of requests can exceed 300ms
At 1000 RPS:  1 request/second can be slow
```

When the error budget is consumed, **stop feature work, fix reliability**.

---

## Using SLOs in Load Tests

Define SLO pass/fail criteria in Locust:

```python
from locust import events
from locust.env import Environment


@events.quitting.add_listener
def assert_slo(environment: Environment, **kwargs: object) -> None:
    stats = environment.runner.stats.total
    p95 = stats.get_response_time_percentile(0.95)
    error_rate = stats.fail_ratio

    if p95 > 300:
        environment.process_exit_code = 1
        print(f"SLO BREACH: p95={p95}ms exceeds 300ms threshold")

    if error_rate > 0.01:
        environment.process_exit_code = 1
        print(f"SLO BREACH: error_rate={error_rate:.1%} exceeds 1%")
```

This makes performance tests act as **automated SLO gates** in CI/CD.
