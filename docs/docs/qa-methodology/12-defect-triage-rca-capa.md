---
date: 2026-07-05
tags:
  - qa
  - testing
---

# Defect Triage, Root Cause Analysis & CAPA

## Defect triage

Triage decides what to fix first, what can wait, and what is not a bug.
It is a business-and-engineering decision, not only a QA activity.

### Triage inputs

| Input | Why it matters |
|---|---|
| Severity | Technical impact |
| Priority | Business urgency |
| Frequency | One-off or systemic |
| Reach | How many users or services are affected |
| Workaround | Whether users can still proceed |
| Release timing | Whether fix fits current release |

### Triage outcomes

| Outcome | Meaning |
|---|---|
| Fix now | Must be resolved before release |
| Fix next sprint | Important but not a release blocker |
| Defer | Accepted risk |
| Duplicate | Same root issue already tracked |
| Not a bug | Expected behavior or requirement gap |

---

## Triage meeting workflow

1. Confirm reproducibility and evidence.
2. Align on severity and priority.
3. Estimate blast radius.
4. Decide owner and target release.
5. Record waiver or risk acceptance if not fixed now.

### Fast triage rules

- Critical security, data loss, or payment issues bypass normal queue.
- Bugs without reproducible evidence stay in investigation, not in fix queue.
- If requirement is unclear, create product clarification task, not only a bug.

---

## Root Cause Analysis (RCA)

Fixing the symptom is not enough. RCA asks why the bug was introduced and why
the quality system did not catch it earlier.

### Five Whys template

```md
Problem: Duplicate order created after user refreshes payment page.
Why 1? Request retried after timeout.
Why 2? Endpoint is not idempotent.
Why 3? No idempotency key in API contract.
Why 4? Requirement review missed retry behavior.
Why 5? No checklist for payment failure modes in refinement.
```

### Common root cause buckets

| Bucket | Examples |
|---|---|
| Requirement gap | Missing edge case, ambiguity, wrong rule |
| Design gap | No timeout, retry, idempotency, access model |
| Code defect | Logic error, race condition, wrong validation |
| Test gap | Missing regression, wrong assumptions, flaky signal |
| Environment gap | Bad config, stale data, missing dependency |
| Process gap | No review checklist, weak ownership, release rush |

---

## CAPA: Corrective and Preventive Actions

| Type | Purpose | Example |
|---|---|---|
| Corrective action | Fix current issue | Patch duplicate order logic |
| Preventive action | Stop recurrence | Add idempotency checklist and API test |

### Strong CAPA examples

- Add regression test for the defect.
- Update requirement template with missing rule.
- Add monitoring/alert for failure signature.
- Introduce review checklist for risky domains.
- Improve rollout strategy with feature flag or canary.

### Weak CAPA examples

- "Be more careful next time"
- "Retest manually"
- "Watch production closely"

---

## RCA report template

```md
# RCA: <incident or defect>
## Problem statement
## User impact / blast radius
## Timeline
## Immediate fix
## Root cause
## Why not detected earlier
## Corrective actions
## Preventive actions
## Owner and due dates
```

---

## Closure criteria

A defect should be considered fully closed only when:
1. The direct issue is fixed.
2. The regression is covered by test or monitoring.
3. The process gap is addressed if one existed.
4. Owners and dates are assigned for CAPA items.

Mature QA is not only bug counting. It is recurrence prevention.
