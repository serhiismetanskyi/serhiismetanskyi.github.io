---
date: 2026-07-05
tags:
  - qa
  - testing
---

# Domain-Specific QA

## Why domain-specific QA matters

General testing principles stay the same, but failure modes change by system type.
Good QA strategy adapts to the domain instead of reusing one checklist everywhere.

---

## Web applications

Focus areas:
- Cross-browser behavior and responsive layouts.
- Session handling, caching, and client-side state.
- Accessibility and keyboard navigation.
- Analytics events and consent flows.

High-value checks:
- Login, checkout, search, form validation.
- Browser back/refresh behavior.
- Slow network and offline recovery.

---

## Mobile applications

Focus areas:
- OS/device fragmentation.
- App lifecycle: background, foreground, interrupted state.
- Push notifications and permission prompts.
- Network variability and battery/data constraints.

High-value checks:
- Install/update/migration behavior.
- Deep links and app resume flows.
- Low connectivity and airplane-mode recovery.

---

## API and backend systems

Focus areas:
- Contract compatibility and schema evolution.
- Idempotency, retries, rate limits, and auth.
- Data consistency across services.
- Observability: logs, metrics, traces, audit events.

High-value checks:
- Versioning and backward compatibility.
- Error shape and status codes.
- Duplicate requests and timeout recovery.

---

## Data / ETL / analytics systems

Focus areas:
- Schema drift and null handling.
- Late-arriving data and ordering issues.
- Data quality rules and reconciliation.
- Pipeline retry, replay, and backfill safety.

High-value checks:
- Row counts and duplicate detection.
- Type coercion and malformed record handling.
- Idempotent reruns and partition correctness.

---

## AI / LLM systems

Focus areas:
- Prompt/version drift and model variability.
- Grounding quality and hallucination risk.
- Safety, privacy, and toxic output filtering.
- Cost, latency, fallback, and observability.

High-value checks:
- Golden dataset regression.
- Retrieval quality for RAG systems.
- Prompt injection and jailbreak resistance.
- Human review for critical decisions.

---

## Fintech / payments

Focus areas:
- Monetary correctness and rounding.
- Duplicate charge prevention.
- Audit trail and reconciliation.
- Compliance, fraud, and access controls.

High-value checks:
- Partial payment and refund flows.
- Idempotency keys on retries.
- Statement accuracy and timezone handling.

---

## Choosing your domain checklist

| Domain | Extra test emphasis |
|---|---|
| Web | Compatibility, accessibility, UX state |
| Mobile | Lifecycle, devices, interruptions |
| API/backend | Contracts, resilience, observability |
| Data/ETL | Quality rules, replay, reconciliation |
| AI/LLM | Safety, evaluation datasets, human oversight |
| Fintech | Correctness, auditability, duplicate prevention |

The more business-critical the domain, the more QA must combine functional,
non-functional, and operational checks into one strategy.
