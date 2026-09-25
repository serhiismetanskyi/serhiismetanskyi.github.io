---
date: 2026-07-19
tags:
  - test-automation
  - architecture
---

# Framework Goals & Core Principles

## What the Framework Must Achieve

A test automation framework is not just a test runner with helpers.
It is a product — with users (engineers), maintenance cost, and quality requirements.

| Goal | Description |
|------|-------------|
| Scalability | Supports 1000+ tests without structural degradation |
| Maintainability | Changes to the app don't ripple into hundreds of tests |
| Reusability | Shared logic lives once; tests call it, don't copy it |
| Stability | Low flakiness — failures mean bugs, not timing noise |
| Fast execution | Parallelised; CI feedback under 10 minutes |
| Easy onboarding | A new engineer runs and writes tests on day one |

---

## Why These Goals Matter

A framework without scalability goals turns into a maintenance burden at 200+ tests.
A framework without stability goals loses trust — engineers start ignoring failures.
A framework without onboarding goals becomes a black box owned by one person.

All six goals interact. Optimise for all six from the start.

---

## Core Design Principles

### DRY — Don't Repeat Yourself

If the same HTTP call setup appears in three tests, it belongs in a shared client.
If the same user creation logic appears twice, it belongs in a builder.

Repetition in tests means: one API change breaks 20 test files instead of one.

### KISS — Keep It Simple

No abstract base class wrapping a wrapper wrapping a driver wrapping a client.
One indirection level solves 90% of problems. Two solves 99%. Stop there.

Complexity that cannot be explained in two sentences does not belong in a framework.

### SOLID in Test Code

| Principle | Application |
|-----------|-------------|
| Single Responsibility | Each page object / API client handles one domain |
| Open/Closed | Add new test types without modifying core framework |
| Liskov Substitution | Interchangeable drivers (mock vs real HTTP client) |
| Interface Segregation | Tests depend on narrow interfaces, not fat base classes |
| Dependency Inversion | Tests inject clients; don't construct them internally |

### Separation of Concerns

```
Test file       → orchestration only (arrange → act → assert)
Page objects    → UI interactions and locators
API clients     → HTTP communication
Builders        → test data construction
Assertions      → verification logic
```

Each layer has one job. Tests that mix all of these are impossible to maintain.

### Test Independence

Every test must be able to run in isolation. No shared mutable state between tests.
No test that only passes after another test has run.

```python
# Bad — depends on test execution order
def test_update_user():
    # assumes user was created by test_create_user
    ...

# Good — creates its own data
def test_update_user(user_factory):
    user = user_factory.create(name="Alice")
    ...
```

### Deterministic Behaviour

Same code, same input → same result every time, on any machine, in any order.
Non-determinism is the root cause of flakiness.

Sources of non-determinism to eliminate:
- Real timestamps → use frozen time
- Random values without seed → use builders with fixed defaults
- Race conditions → use explicit waits, not `sleep()`
- Shared DB state → clean up after each test or use unique identifiers

---

## Consequences of Ignoring Principles

| Ignored Principle | Symptom |
|-------------------|---------|
| DRY | One API change breaks 30 test files |
| KISS | Only the author can debug failures |
| Test independence | Tests pass alone, fail in suite |
| Determinism | Flaky tests that developers learn to ignore |
| Separation of concerns | Tests become integration scripts, not test cases |
