---
date: 2026-06-08
tags:
  - api
  - architecture
  - security
  - observability
  - reliability
---

# Cross-Cutting: SLO, Error Budget, Incident Playbook

This document adds an actionable reliability policy for API teams.

## SLO baseline model

- Availability SLO: `99.9%` for critical read/write APIs.
- Latency SLO: `p95 < 500ms`, `p99 < 1000ms`.
- Correctness SLO: error rate for valid requests below target threshold.

Use rolling 28-day windows for executive reporting and 1-day windows for operations.

## Error budget policy

| Remaining budget | Release policy | Operational action |
|---|---|---|
| `>25%` | Normal releases | Standard monitoring |
| `10-25%` | Release with approval | Increase incident readiness |
| `<10%` | Freeze risky releases | Focus on reliability fixes |
| Burn rate critical | Stop releases now | Incident mode and rollback plan |

## Burn-rate alerts

Use multi-window alerts:
- Fast burn: 5m / 1h windows for immediate incidents.
- Slow burn: 6h / 24h windows for hidden degradations.

Trigger severity mapping:
- Warning: sustained budget burn above policy threshold.
- Critical: projected full budget exhaustion before window end.

## Incident response playbook (API-first)

1. **Detect**: SLO alert triggers incident channel.
2. **Triage**: identify blast radius (endpoints, tenants, regions).
3. **Mitigate**: rollback, traffic shift, feature flag off, load shedding.
4. **Stabilize**: verify burn rate reduction and latency recovery.
5. **Recover**: return normal routing and release controls.
6. **Review**: postmortem with clear corrective actions.

## Minimum telemetry requirements

- Per-endpoint request rate, error rate, p95/p99 latency.
- Per-dependency error/latency metrics for root-cause speed.
- Correlated logs and traces with `request_id` and `trace_id`.
- Dashboard views for SLO status, budget trend, and incident timeline.

## Practical governance rule

If reliability work is repeatedly postponed while budget is low, enforce an engineering policy:
"No feature release without an equal or larger reliability investment."
