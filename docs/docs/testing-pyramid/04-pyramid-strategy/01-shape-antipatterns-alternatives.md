---
date: 2026-07-18
tags:
  - testing
  - test-strategy
---

# Pyramid Shape, Anti-Patterns & Alternatives

## The Numbers

On a typical project with a healthy pyramid:

| Layer | Count | Time per test | Suite contribution |
|-------|-------|--------------|-------------------|
| Unit | ~2000 | 0.001–0.01 s | ~20 s |
| Integration | ~200 | 0.1–1 s | ~100 s |
| E2E | ~30 | 5–30 s | ~5–10 min |
| **Total** | | | **~8–12 min** |

Flip it upside-down (30 unit, 2000 E2E):
**CI suite takes hours. Nobody trusts the results. Incidents happen on Friday.**

---

## Anti-Pattern: Ice Cream Cone

```
/─────────────────────────────\
/   E2E  (hundreds or more)   \  ← 40+ min, fails on every 2nd run
/─────────────────────────────\
      /               \
     /  Integration   \          ← almost none
    /  (a handful)    \
   /───────────────────\
          /     \
         / Unit  \               ← barely any
        /─────────\
```

**How it happens:**
1. Team skips unit and integration tests during sprints ("no time")
2. QA tries to cover everything with Playwright at the end of a release
3. CI takes 45 minutes, nobody runs it locally, flakiness rises
4. Everyone stops trusting the suite

**Why it's painful:**
- A bug in discount logic only surfaces in a slow E2E run hours later
- A unit test would have caught it in 2 seconds, right where the code was written
- Maintaining 200 E2E tests is a full-time job

---

## Anti-Pattern: Testing at the Wrong Level

| Scenario | Wrong Level | Correct Level |
|----------|-------------|---------------|
| Password validation rules | E2E (slow) | Unit (fast) |
| API response field names | E2E (browser) | Integration (HTTP) |
| DB constraint enforcement | Unit (mocked) | Integration (real DB) |
| User completes checkout | Unit (too isolated) | E2E (full flow) |

---

## Alternative: Testing Trophy (Kent C. Dodds)

```
         /──────\
        /  E2E   \     few
       /──────────\
      /            \
     / Integration  \   most
    /────────────────\
   /                  \
  /  Unit + Static     \  some
 /──────────────────────\
```

More integration tests, fewer unit tests, with static analysis (linters, type checkers)
replacing part of the unit layer.

**When it makes sense:**
- Projects where integration tests catch more real bugs than unit tests
- Services with many external dependencies (DB, APIs)
- Components that are easy to test through integration endpoints

**When to stay with classic pyramid:**
- Backend-heavy business logic (many rules, calculations, transformations)
- Services with high unit-testable domain logic

---

## Microservices: More Integration & Contract Tests

When ten services talk to each other, unit testing each in isolation only goes so far.
Bugs live at the boundaries — API contracts, message formats, auth flows.

```
Service A  →  [Contract Test]  →  Service B
```

Contract testing tools: **Pact**, **Spring Cloud Contract**.

| Type | Coverage |
|------|---------|
| Unit | Logic inside each service |
| Contract | API between services (provider + consumer) |
| Integration | Service + its own DB |
| E2E | End-to-end user journey across services |

---

## CI Pipeline Structure

```yaml
stages:
  - lint-type-check     # ruff + mypy — seconds
  - unit                # pytest -m unit — ~20 s
  - integration         # pytest -m integration — ~2 min
  - e2e                 # pytest -m e2e — ~10 min
```

Fast stages run first. If unit tests fail, E2E never starts.
Developers get feedback in under a minute for the most common failures.

---

## Decision: Which Level?

Ask these questions in order:

1. **Can I test this without I/O?** → Unit test it
2. **Does this check how two components interact?** → Integration test it
3. **Does this verify what the user sees and does?** → E2E test it
4. **Am I testing a validation rule through a browser?** → Stop. Write a unit test

The pyramid isn't about following an exact shape.
It's about getting **fast feedback** from the layer closest to the bug.
