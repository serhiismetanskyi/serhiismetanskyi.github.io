---
date: 2026-07-04
tags:
  - qa
  - testing
---

# Requirements Quality & Testability

## Why this matters

Many defects start before coding. Weak requirements create weak tests,
rework, and late defects. QA should review requirements for clarity,
consistency, and testability before implementation starts.

```
unclear requirement -> unclear implementation -> unclear test coverage -> production risk
```

---

## Quality criteria for requirements

| Criterion | Good signal | Bad signal |
|---|---|---|
| Clear | Terms are unambiguous | "Fast", "intuitive", "works well" |
| Complete | Rules, exceptions, and constraints exist | Happy path only |
| Consistent | No conflict across docs and stories | Different values in different places |
| Feasible | Can be built and validated | Depends on unknown external behavior |
| Testable | Observable expected outcome exists | No measurable result |

### Replace weak wording

| Weak wording | Better wording |
|---|---|
| "System should be fast" | "p95 response time <= 300 ms for search under 500 RPS" |
| "User gets notified" | "User sees in-app message and email within 60 seconds" |
| "Handle invalid input" | "Return 400 with field-level validation errors" |

---

## QA testability checklist

Before development, ask:
- What is the exact expected behavior?
- What are the boundaries and negative cases?
- Which roles or permission levels are affected?
- What happens on timeout, retry, partial failure, or duplicate action?
- Which events, logs, metrics, or UI states prove success/failure?
- Which environment and data are needed?

### Red flags

| Red flag | Why it hurts |
|---|---|
| Missing acceptance criteria | No shared definition of done |
| No error behavior | Happy-path-only quality |
| Hidden dependencies | Environment blockers later |
| Non-measurable wording | Impossible to verify objectively |
| UI-only description | Missing API, data, and observability expectations |

---

## Example refinement

### Weak story

```md
As a user, I want password reset to work so I can access my account.
```

### Testable story

```md
As a registered user, I can request password reset by email.

Acceptance criteria:
- If the email exists, show generic success message.
- Send reset email within 2 minutes.
- Reset link expires after 30 minutes.
- Invalid or expired token returns 400 with "link expired".
- Rate limit: max 5 reset requests per hour per account.
```

---

## Three Amigos review

Use short pre-dev review with Product, QA, and Dev.

### Outcome goals

| Role | Contribution |
|---|---|
| Product | Business intent and edge rules |
| QA | Risks, negative cases, observability, testability |
| Dev | Technical feasibility, dependencies, rollout concerns |

### Review outputs

- Refined acceptance criteria.
- List of risks and open questions.
- Decision on automation scope.
- Required data, mocks, and environments.

---

## Definition of ready for QA

A story is testable when:
1. Acceptance criteria are measurable.
2. Edge and error cases are named.
3. Dependencies are identified.
4. Environment and data needs are known.
5. Observability signals are defined for critical outcomes.

Good QA starts by improving requirements, not only by testing code later.
