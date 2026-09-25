---
date: 2026-07-03
tags:
  - qa
  - testing
---

# Test Automation, SDLC, Agile & Risk-Based Testing

## Test Automation Basics

### When to Automate

Automation pays off when a test is:

| Signal | Rationale |
|---|---|
| Repetitive across releases | Manual repetition is expensive |
| Part of the regression suite | Must run reliably after every change |
| Data-driven (many inputs) | Parameterised tests cover more ground than manual |
| Stable requirements | Changing tests every sprint burns automation ROI |
| Fast feedback required | Slow manual cycles block CI/CD pipelines |

### When NOT to Automate

| Scenario | Why |
|---|---|
| One-off exploratory testing | Human intuition finds unexpected bugs automation cannot |
| Rarely executed scenarios | Setup cost > savings |
| UX / visual / accessibility judgment | Automated checks miss nuance |
| Rapidly changing UI | Tests break faster than they are written |
| Short-lived features | Feature may be removed before ROI is reached |

### Automation ROI Formula (simplified)

```
ROI > 0  when:
  (Manual cost per run × Runs) > (Automation build cost + Maintenance cost)
```

---

## Testing in SDLC

### Waterfall

- Testing is a **discrete phase** after development completes.
- Test plan written early; execution happens late.
- Late defect discovery is expensive — high risk.
- Suitable for: stable, well-defined requirements; regulated domains.

### Agile

| Practice | Detail |
|---|---|
| Continuous testing | Tests written and run in every sprint |
| Sprint-based regression | Automated regression runs each sprint |
| Three Amigos | Dev + QA + Product discuss acceptance criteria before development |
| ATDD / BDD | Tests written from business scenarios (Gherkin) before implementation |
| DoD includes tests | Sprint item is not "done" until tests are written and passing |

### DevOps / CI-CD

```
Commit → Unit tests (< 5 min)
       → Static analysis / linting
       → Integration tests (< 15 min)
       → Contract tests
       → Build artefact
       → Deploy to staging
       → Smoke tests
       → E2E regression (< 30 min)
       → Deploy to production
       → Synthetic monitoring
```

Quality gates block promotion if any stage fails.

> See [CI/CD Approaches](../ci-cd-approaches/index.md) for pipeline-level testing strategy.

---

## QA in Agile

### Role in Scrum

| Event | QA involvement |
|---|---|
| Sprint Planning | Review acceptance criteria for testability |
| Refinement | Clarify edge cases; flag untestable stories |
| Daily Standup | Surface blocked tests, environment issues |
| Sprint Review | Demonstrate tested features |
| Retrospective | Improve process (flakiness, slow feedback, coverage gaps) |

### Definition of Done (QA perspective)

A story is only done when:
- Acceptance criteria are covered by tests (automated or manual)
- Regression tests updated
- No open High/Critical defects
- Test cases reviewed and approved

### Continuous Feedback

- QA provides daily signal: test results, defect trends, environment health.
- Early defect detection in the sprint is cheaper than fixing after sprint ends.
- Test coverage reports go into the team dashboard — not just to QA.

---

## Risk-Based Testing

When time is limited, focus effort where **failure impact × probability** is highest.

### Step 1 — Identify risks

| Risk area | Questions to ask |
|---|---|
| Business-critical flows | What breaks if payment / login / checkout fails? |
| Recent changes | What code changed in this release? |
| Complex logic | Where are the most conditional branches? |
| Historically buggy areas | Where do defects cluster (Pareto principle)? |
| External integrations | Which third-party dependencies are unreliable? |

### Step 2 — Prioritise

```
Risk score = Business impact (1–5) × Failure probability (1–5)

High (score 15–25) → Must test in every release
Medium (score 8–14) → Test in most releases
Low (score 1–7)    → Test occasionally / rely on automation
```

### Step 3 — Allocate effort

| Priority | Approach |
|---|---|
| High | Full test coverage, both positive and negative paths |
| Medium | Happy path + key negative cases |
| Low | Smoke only, or skip manual execution if automated |
