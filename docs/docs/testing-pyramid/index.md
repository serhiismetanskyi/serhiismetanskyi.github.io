---
date: 2026-07-16
tags:
  - testing
  - test-strategy
---

# Testing Pyramid

Practical reference for test levels, tooling, and strategy.
Based on: [The Testing Pyramid: Everybody Knows It, Nobody Follows It](https://medium.com/@serhiismetanskyi/the-testing-pyramid-write-tests-not-excuses)

---

## The Pyramid

```
        ▲
       /E2E\        few — critical user flows only
      /─────\
     /       \
    / Integra-\     moderate — component interactions, API contracts
   /  tion     \
  /─────────────\
 /               \
/   Unit Tests    \  many — all business logic, validation, edge cases
/─────────────────\
```

| Layer | Speed | Count | Tool |
|-------|-------|-------|------|
| Unit | 0.001–0.01 s | Thousands | pytest |
| Integration | 0.1–1 s | Hundreds | pytest + Playwright APIRequestContext |
| E2E | 5–30 s | Tens | Playwright (browser) |

---

## Sections

### 1. [Unit Tests](01-unit-tests/index.md)

| File | Topics |
|------|--------|
| [Concept & Examples](./01-unit-tests/01-concept-and-examples.md) | Isolation, fast feedback, pytest marks, coverage, typing |
| [Common Mistakes](./01-unit-tests/02-common-mistakes.md) | Missing assertions, hidden dependencies, no isolation |

### 2. [Integration Tests](02-integration-tests/index.md)

| File | Topics |
|------|--------|
| [Concept & Examples](./02-integration-tests/01-concept-and-examples.md) | Real HTTP via Playwright APIRequestContext, fixtures, cleanup |
| [Common Mistakes](./02-integration-tests/02-common-mistakes.md) | Shared state, test-order dependence, over-mocking |

### 3. [E2E Tests](03-e2e-tests/index.md)

| File | Topics |
|------|--------|
| [Concept & Examples](./03-e2e-tests/01-concept-and-examples.md) | Browser automation with Playwright, stable locators, user flows |
| [Common Mistakes](./03-e2e-tests/02-common-mistakes.md) | Fragile selectors, no auto-wait, testing every validation E2E |

### 4. [Pyramid Strategy](04-pyramid-strategy/index.md)

| File | Topics |
|------|--------|
| [Shape, Anti-Patterns & Alternatives](./04-pyramid-strategy/01-shape-antipatterns-alternatives.md) | Ice cream cone, Testing Trophy, microservice contracts, CI timing |

### 5. [Modular Integration vs Unit](05-modular-integration-vs-unit/index.md)

| File | Topics |
|------|--------|
| [Concepts & Boundaries](./05-modular-integration-vs-unit/01-concepts-boundaries.md) | Module, solitary vs sociable unit tests, narrow vs broad integration, where test doubles go |
| [One Feature, Both Ways](./05-modular-integration-vs-unit/02-one-feature-both-ways.md) | Orders module tested with unit tests, mocks, and through its Python API and HTTP |
| [What Each Test Catches](./05-modular-integration-vs-unit/03-what-each-test-catches.md) | Six changes run against both suites, contract tests for fakes, speed |
| [Database, Isolation & CI](./05-modular-integration-vs-unit/04-database-isolation-ci.md) | Testcontainers, database per xdist worker, TRUNCATE vs rollback, GitHub Actions |
| [Strategy & Mistakes](./05-modular-integration-vs-unit/05-strategy-mistakes.md) | Which test for which code, the mix per module, mistakes, checklist |

---

## Quick Decision Guide

| What you need to test | Level |
|-----------------------|-------|
| Single function, validation rule, calculation | Unit |
| API endpoint → database round trip | Integration |
| Service A calls Service B | Integration |
| User completes a full workflow in browser | E2E |
| Field-level form validation in the UI | Unit (not E2E) |
| Auth contract between two services | Integration (contract) |
| One module end to end, real DB, fake neighbours | [Modular integration](05-modular-integration-vs-unit/index.md) |

---

## Anti-Pattern: Ice Cream Cone

```
/─────────────────\
/   E2E (many!)    \  ← slow, flaky, 40+ min CI
/─────────────────\
     /       \
    / Integra-\     ← almost none
   /  tion     \
  /─────────────\
       /  \
      /Unit\         ← barely any
     /──────\
```

Happens when teams skip unit and integration tests during development
and try to cover everything with Playwright at the end.

---
## See also
- [Digital Garden: Knowledge Base](../index.md)
- [QA & Testing Methodology](../qa-methodology/index.md)
- [Test Design Techniques](../test-design-techniques/index.md)
- [Test Automation Framework](../test-automation-framework/index.md)
- [Testing with pytest](../python-guide/03-testing-pytest/index.md)
