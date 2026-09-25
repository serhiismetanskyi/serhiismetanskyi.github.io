---
date: 2026-08-26
tags:
  - ci-cd
  - devops
---

# CI/CD — Concepts & Goals

## Continuous Integration (CI)

Developers integrate code into a shared repository **frequently** — multiple times per day.
Each integration is verified automatically: build, lint, test.

```
Developer pushes → CI runs → Build + Test → Result in minutes
```

The goal is not automation for its own sake. The goal is **fast feedback**.
A developer who finds out their change broke the build in 5 minutes fixes it in 5 minutes.
A developer who finds out in 2 days has lost all context.

### CI Requirements

| Requirement | Why |
|-------------|-----|
| Frequent commits (at least daily) | Small changes = small failures = easy fixes |
| Automated build | Manual builds don't scale |
| Automated tests | Human verification is slow and inconsistent |
| Fast feedback loop | > 15 minutes kills developer flow |

---

## Continuous Delivery vs Continuous Deployment

These terms are often confused. They differ in the final step.

### Continuous Delivery

The codebase is **always in a deployable state**.
Every commit that passes CI could be released to production.
The actual release to production is a **manual decision**.

```
Commit → CI → All tests pass → Artifact ready → [Manual gate] → Production
```

Used when: regulatory requirements, business sign-off needed, controlled release windows.

### Continuous Deployment

Every commit that passes CI is **automatically deployed to production**.
No human in the loop between merge and production.

```
Commit → CI → All tests pass → Auto-deploy → Production
```

Used when: high-confidence test suite, mature monitoring, fast rollback capability.

---

## The Spectrum

```
CI only          Continuous Delivery       Continuous Deployment
   │                     │                        │
Automate        Automate + always          Automate + auto-ship
build/test       deployable                  to production
```

Most organisations operate at Continuous Delivery.
Full Continuous Deployment requires very high confidence in automated verification.

---

## Goals

| Goal | Concrete Outcome |
|------|-----------------|
| Fast feedback | Failures found in < 10 minutes |
| High quality | Broken code never reaches production |
| Reliable releases | Every release is the same repeatable process |
| Reduced manual work | No manual build/deploy steps |

---

## The Core Feedback Loop

```
Write code
    ↓
Commit & push
    ↓
CI runs (build → lint → test)
    ↓
Pass → merge/deploy
Fail → developer fixes immediately (context is fresh)
```

Every extra minute in this loop multiplies the cost of fixing the problem.
A 30-second build + 5-minute test suite is a competitive advantage.
