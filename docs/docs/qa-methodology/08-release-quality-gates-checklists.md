---
date: 2026-07-04
tags:
  - qa
  - testing
---

# Release Quality Gates, Flaky Tests & Templates

## Release Quality Gates (Merge/Deploy)

Use strict, measurable gates. If any gate fails, merge/deploy is blocked.

| Gate | Merge threshold | Deploy threshold |
|---|---|---|
| Test pass rate | 100% in required suites | 100% in required suites |
| Coverage | >= 85% project, >= 90% changed lines | Same as merge |
| Critical defects | 0 open Critical, 0 High without waiver | 0 open Critical/High |
| Security | 0 Critical/High SAST findings | 0 Critical/High SAST + DAST |
| Performance budget | p95 <= baseline + 10% | p95 <= baseline + 5% |
| Contract compatibility | Backward compatible | Backward compatible |

### Recommended required suites

- `unit` on every PR.
- `integration` on PR + main.
- `smoke` on staging before deploy.
- `regression` nightly and before release tags.

---

## Contract Testing Playbook

Contract testing validates producer/consumer compatibility without full E2E cost.

### Producer/consumer model

| Side | Responsibility |
|---|---|
| Producer | Publishes schema and examples, keeps backward compatibility |
| Consumer | Defines expectations and verifies provider contract |
| CI | Runs provider verification against all active consumer contracts |

### Versioning rules

| Change type | Safe? | Rule |
|---|---|---|
| Add optional field | Yes | Backward compatible |
| Remove field | No | New major version |
| Rename field | No | Add new + deprecate old |
| Tighten validation | Usually no | Version bump + migration window |
| New enum value | Maybe | Ensure consumers tolerate unknown values |

### Schema evolution checklist

- Prefer additive changes.
- Keep deprecated fields for at least 2 release cycles.
- Add schema compatibility checks in CI (`backward` mode).
- Include example payloads for every contract version.
- Track consumer adoption before field removal.

---

## Flaky Tests Playbook

### Flaky detector (practical criteria)

A test is flaky if:
- It fails and passes on immediate rerun with no code changes, or
- It has >= 2 non-deterministic failures in the last 10 runs.

### Quarantine policy

| Rule | Action |
|---|---|
| Flaky detected in CI | Mark as `quarantined` label immediately |
| Quarantined tests | Removed from blocking gate, still run in non-blocking lane |
| Owner assignment | Mandatory within 1 working day |
| Root-cause ticket | Mandatory with failure evidence |

### Retry policy (allowed / forbidden)

**Allowed**
- Network timeouts to external sandbox.
- Browser timing instability in E2E.
- Known infra incidents.

**Forbidden**
- Unit tests (should be deterministic).
- Business logic assertions.
- Security and compliance suites.

Retry cap: max `1` retry for blocking pipelines.

### SLA for flaky fixes

| Severity | SLA |
|---|---|
| Blocking core pipeline | Fix within 24h |
| Frequent but non-blocking | Fix within 3 business days |
| Rare, low impact | Fix within 7 business days |

Escalate to QA lead if SLA is missed.

### Common flaky root causes

| Cause | Typical example | Preferred fix |
|---|---|---|
| Timing / race | Assertion before UI or job is ready | Use explicit wait on real condition |
| Shared state | Tests depend on order or reused data | Isolate fixtures and test data |
| External instability | Sandbox timeout or network jitter | Stub dependency or add contract boundary |
| Clock randomness | Timezone or expiry edge | Freeze time or control clock input |
| Async side effects | Queue/job not finished yet | Poll on completion signal, not sleep guesses |

### Prevention rules

- Unit tests must never rely on retry to pass.
- Prefer deterministic fixtures over reused shared accounts.
- Wait for observable conditions, not arbitrary delays.
- Capture logs, traces, and screenshots on first failure.
- Track flaky rate by suite and owner, not only by individual test.

---

## Quality Checklist per PR

Use this short checklist before merge.

### Dev checklist

- Acceptance criteria covered by tests.
- Unit + integration tests pass locally and in CI.
- No hidden breaking API/schema changes.
- Logging added for new failure paths.
- Feature flags used for risky behavior changes.

### QA checklist

- Risk level assigned (Low/Medium/High).
- Regression impact identified.
- Critical user journey validated.
- Known limitations documented in PR.
- Release note entry added if user-visible behavior changed.

---

## Risk Register Template

Copy and use for each release.

| Risk ID | Description | Probability (1-5) | Impact (1-5) | Score | Mitigation | Owner | Due date | Status |
|---|---|---:|---:|---:|---|---|---|---|
| R-001 | Payment timeout under peak load | 3 | 5 | 15 | Load test + autoscaling policy | SRE | 2026-04-15 | Open |
| R-002 | Contract mismatch on `order.created` | 2 | 5 | 10 | Contract tests in CI + schema pinning | Backend Lead | 2026-04-12 | Open |

Score = `Probability x Impact`.

---

## Test Strategy Templates

### 1) Test Plan template

```md
# Test Plan: <Release/Project>
## Scope
## Out of Scope
## Test Levels and Types
## Environments and Data
## Entry Criteria
## Exit Criteria
## Risks and Mitigations
## Schedule and Owners
```

### 2) Test Report template

```md
# Test Report: <Release>
## Build / Environment
## Execution Summary (pass/fail/blocked)
## Defect Summary (severity split)
## Coverage Summary
## Risks Remaining
## Go / No-Go Recommendation
```

### 3) RTM template

```md
| Requirement ID | Requirement | Test Cases | Status |
|---|---|---|---|
| REQ-001 | User can login | TC-001, TC-002 | Covered |
```
