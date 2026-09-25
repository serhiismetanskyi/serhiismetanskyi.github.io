---
date: 2026-07-03
tags:
  - qa
  - testing
---

# Test Execution, Defect Management & Environments

## Test Execution

### Process

```
1. Verify entry criteria are met
2. Execute test cases (manual or automated)
3. Record actual results
4. Compare actual vs expected
5. Log defects for any failure
6. Update test case status: PASS / FAIL / BLOCKED / SKIPPED
7. Produce daily / sprint execution report
```

### Status definitions

| Status | Meaning |
|---|---|
| **PASS** | Actual = expected |
| **FAIL** | Actual ≠ expected; defect logged |
| **BLOCKED** | Cannot execute — prerequisite missing |
| **SKIPPED** | Out of scope or deferred |

---

## Defect Management

### Defect Report Structure

```
ID:             BUG-042
Title:          Checkout button disabled after adding promo code
Severity:       High
Priority:       High
Environment:    Staging v2.1.4
Steps to reproduce:
  1. Add item to cart
  2. Apply promo code "SAVE20"
  3. Observe checkout button state
Expected result: Checkout button is enabled
Actual result:   Checkout button is disabled
Attachments:     screenshot.png, console.log
Reporter:        QA / Date
```

### Defect Lifecycle

```
New → Open (assigned to dev)
         ├─ In Progress → Fixed → Ready for Retest
         │                          ├─ PASS → Closed
         │                          └─ FAIL → Reopened → In Progress
         └─ Rejected (not a bug / duplicate / cannot reproduce) → Closed
```

### Severity vs Priority

These are **independent** axes — never conflate them.

| | Definition | Who sets it |
|---|---|---|
| **Severity** | Technical impact on the product | QA / tester |
| **Priority** | Business urgency — how fast to fix | Product / business |

| Severity | Example |
|---|---|
| **Critical** | System crash, data loss, security breach |
| **High** | Core feature broken, no workaround |
| **Medium** | Feature broken but workaround exists |
| **Low** | Cosmetic issue, minor UX friction |

**Classic mismatch examples:**

| Scenario | Severity | Priority |
|---|---|---|
| CEO's name misspelled on homepage | Low | High |
| Crash in rarely-used admin export | High | Low |

---

## Test Environments

### Environment Tiers

| Environment | Purpose | Who uses it |
|---|---|---|
| **Dev** | Developer testing, debugging | Developers |
| **QA / Test** | Functional testing, regression | QA team |
| **Staging** | Pre-production validation, UAT | QA, Product, Stakeholders |
| **Production** | Live users | Everyone |

### Environment Management Checklist

- **Config isolation:** each env has its own config (DB, API keys, feature flags).
- **Data isolation:** test data does not bleed into prod; no real PII in test envs.
- **Dependency management:** external services mocked or using sandboxes in lower envs.
- **Reset strategy:** ability to restore a clean state before each test cycle.
- **Access control:** production access is restricted; audit logs enabled.

---

## Test Data Management

| Strategy | When to use |
|---|---|
| **Static fixtures** | Stable, well-known data needed for specific scenarios |
| **Dynamic generation** | Fresh data per test run; avoids shared-state conflicts |
| **Data factories** | Programmatically generate realistic objects with defaults + overrides |
| **Masking / synthetic data** | When you need prod-like data but cannot use real PII |

### Data isolation principles

1. Each test owns its data — do not share mutable state between tests.
2. Clean up after each test (or use transactions that roll back).
3. Never run destructive tests (DELETE, truncate) against shared environments.
4. Use separate DB schemas / namespaces per parallel test worker.
