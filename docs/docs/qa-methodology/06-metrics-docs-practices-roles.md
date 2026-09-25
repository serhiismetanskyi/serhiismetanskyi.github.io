---
date: 2026-07-03
tags:
  - qa
  - testing
  - metrics
---

# Metrics, Documentation, Best Practices & QA Roles

## Test Metrics

Metrics give stakeholders data-driven confidence and help QA improve continuously.

| Metric | Formula / source | What it tells you |
|---|---|---|
| **Test coverage** | Tests covering requirements / total requirements | % of scope validated |
| **Defect density** | Defects / KLOC or per feature | Code quality signal |
| **Pass rate** | Passed tests / total executed | Current quality snapshot |
| **Defect escape rate** | Prod defects / total defects found | How much QA misses |
| **Reopened rate** | Reopened defects / closed defects | Fix quality signal |
| **Test execution time** | Clock time for full regression | CI/CD pipeline health |
| **Flakiness rate** | Flaky test runs / total runs | Automation reliability |

### Anti-pattern: vanity metrics

High pass rate on trivial tests ≠ quality. Combine coverage + defect density + escape rate
for a meaningful picture.

---

## Test Documentation

| Document | Purpose | Who reads it |
|---|---|---|
| **Test Plan** | Scope, strategy, schedule, resources | Team, management |
| **Test Cases** | Step-by-step scenarios + expected results | QA engineers |
| **Test Report** | Execution summary, defect stats, risks | Product, management |
| **Traceability Matrix (RTM)** | Requirements → test coverage mapping | QA, Product, Auditors |
| **Exploratory Charter** | Session goal, scope, time-box | QA engineers |

---

## Traceability

### Requirement Traceability Matrix (RTM)

Links every requirement to the test cases that cover it.

```
REQ-001 (User login)    → TC-001, TC-002, TC-003
REQ-002 (Forgot password) → TC-004, TC-005
REQ-003 (2FA)           → TC-006, TC-007, TC-008
```

**Why it matters:**
- No requirement is left untested (coverage gap detection).
- Impact analysis: when a requirement changes, instantly find affected tests.
- Compliance: regulated domains require traceability as audit evidence.

---

## QA Anti-Patterns

| Anti-pattern | Symptom | Fix |
|---|---|---|
| **No test strategy** | Random test coverage, duplicate effort | Define levels, types, and ownership |
| **Testing only UI** | Slow, fragile tests; low coverage depth | Push tests down the pyramid |
| **Ignoring flaky tests** | CI becomes noise; failures ignored | Fix or quarantine immediately |
| **Poor test cases** | Unclear steps, no expected results | Apply test case design principles |
| **No regression suite** | Prod bugs in old features | Automate regression; run on every release |
| **Testing only happy path** | Prod breaks on edge cases | Systematically apply BVA, EP, error guessing |
| **Late bug reporting** | Costly, rushed fixes at release | Shift-left; report defects same day |

---

## QA Best Practices

1. **Test early** — review requirements for testability before development starts.
2. **Automate wisely** — automate stable, repetitive tests; leave exploration to humans.
3. **Focus on risk** — spend the most time on the highest-impact, highest-probability areas.
4. **Keep tests simple** — one test = one assertion; readable by anyone on the team.
5. **Maintain test data** — treat test data as code; version control fixtures and factories.
6. **Communicate defects clearly** — reproducible steps + expected vs actual in every report.
7. **Monitor quality metrics** — review trends at each retrospective; act on signals.
8. **Own quality as a team** — QA is a role; quality is everyone's responsibility.

---

## QA Role Evolution

| Level | Core responsibility | Key skills |
|---|---|---|
| **Junior QA** | Execute test cases, log defects accurately | Test case execution, defect reporting, basic tools |
| **Middle QA** | Design test cases, build automation, own a feature area | Design techniques, automation frameworks, API testing |
| **Senior QA** | Define test strategy, mentor, drive quality culture | Risk analysis, architecture review, metrics, coaching |
| **QA Lead / Manager** | Manage team, plan, report to stakeholders | Resource planning, stakeholder comms, process improvement |
| **QA Architect** | Design quality systems, tooling strategy, org-wide standards | System design, CI/CD, security testing, platform thinking |

### Career signal: from executor to enabler

```
Junior   → executes the plan someone else defined
Middle   → defines plans for their own scope
Senior   → defines strategy for a product or domain
Architect → designs the system that enables everyone else to work at quality
```
