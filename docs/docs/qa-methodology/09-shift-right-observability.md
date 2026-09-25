---
date: 2026-07-04
tags:
  - qa
  - testing
  - observability
  - test-strategy
---

# Shift-Right Testing, SLO/Error Budget & AI-Assisted QA (2026)

## Shift-Right Testing

Shift-right extends quality validation into staging/production with controlled risk.

| Technique | Purpose | Guardrail |
|---|---|---|
| Canary deployment | Compare new vs old version in real traffic | Gradual traffic ramp and rollback triggers |
| Feature flags | Decouple deploy from release | Kill switch and owner per flag |
| Synthetic monitoring | Proactive 24/7 checks of critical paths | Alert routing with runbooks |
| Chaos experiments | Validate resilience under failures | Blast-radius limits + stop conditions |
| RUM (real user monitoring) | Observe true user performance | Privacy-safe telemetry only |

---

## Canary Rollout Runbook

### Typical rollout steps

1. Deploy to `1%` traffic for 15-30 min.
2. Validate SLI deltas vs baseline.
3. Increase to `10%`, then `25%`, then `50%`, then `100%`.

### Automated rollback triggers

- Error rate delta > `+0.5%` vs baseline.
- p95 latency delta > `+15%`.
- Critical path synthetic failures >= `3` consecutive runs.
- New Critical incidents during canary window.

Rollback must be automatic and finish in < 5 min.

---

## Feature Flags Governance

| Policy | Rule |
|---|---|
| Ownership | Every flag has owner and expiry date |
| Naming | `area_feature_behavior` |
| Audit | Flag changes logged with actor and timestamp |
| Cleanup | Remove stale flags within 2 releases |
| Safety | Kill switch tested in staging before production |

---

## Synthetic Monitoring Playbook

Prioritize high-value journeys:
- Login
- Checkout/payment
- Search
- Core API health endpoint

### Alert severity

| Severity | Trigger | Response |
|---|---|---|
| P1 | Checkout synthetic fails in 2 regions | Immediate incident + rollback candidate |
| P2 | Single-region failures | On-call triage within 15 min |
| P3 | Degraded but passing thresholds | Investigate in business hours |

Synthetic tests should run every 1-5 minutes depending on criticality.

---

## Chaos in Production (Safe Mode)

Chaos is allowed only with strict safety boundaries.

### Preconditions

- SLO dashboard is healthy for the last 24h.
- On-call engineer and rollback operator are available.
- Blast radius defined (service, region, % traffic).
- Abort conditions configured before experiment starts.

### Allowed experiment examples

- Kill one replica and verify self-healing.
- Inject 200-500 ms latency to one dependency.
- Drop 1-2% of messages in non-critical async flow.

### Forbidden in production

- Data-destructive experiments.
- Multi-region failure injection at once.
- Security-control bypass simulations without explicit approval.

---

## SLO and Error Budget in QA Strategy

### Core terms

| Term | Meaning |
|---|---|
| SLI | Measured indicator (latency, availability, error rate) |
| SLO | Target for SLI over time window |
| Error budget | Allowed unreliability = `100% - SLO` |

Example:
- SLO availability `99.9%` per month.
- Error budget `0.1%` (~43.2 minutes downtime/month).

### Budget policy

| Budget state | Delivery policy |
|---|---|
| >= 50% budget left | Normal release pace |
| 20-50% left | Cautious releases, stricter canary |
| < 20% left | Freeze risky releases, reliability work only |

---

## AI-Assisted QA (2026)

Use LLMs to accelerate QA, but keep human accountability.

### Safe use cases

| Use case | Why safe |
|---|---|
| Generate test ideas from requirements | Human reviews and selects final set |
| Create draft test data combinations | Low-risk productivity boost |
| Summarize logs/traces and cluster failures | Speeds triage, does not auto-change prod |
| Generate skeletons for test cases/checklists | Human edits before execution |

### Human review required

- Final acceptance criteria sign-off.
- Security test conclusions and vulnerability severity.
- Go/No-Go release decision.
- Contract compatibility waivers.
- Any production rollback or incident closure note.

### Not allowed for autonomous execution

- Auto-approving PRs without reviewer.
- Auto-closing defects without reproducible evidence.
- Editing production configs directly.
- Executing destructive scripts in production.

---

## Practical Combined Flow (Shift-left + Shift-right)

```text
PR checks (unit/integration/contract) ->
staging smoke + synthetic ->
canary 1% with SLO guardrails ->
progressive rollout ->
post-release RUM + synthetic + chaos schedule ->
feedback into next sprint test strategy
```

This loop keeps quality continuous from code to production reality.
