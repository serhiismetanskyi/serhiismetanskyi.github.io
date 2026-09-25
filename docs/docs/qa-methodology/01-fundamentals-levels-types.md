---
date: 2026-07-02
tags:
  - qa
  - testing
---

# QA & Testing Fundamentals, Levels & Types

## What is QA

### Quality Assurance vs Quality Control

| | QA | QC |
|---|---|---|
| Focus | **Process** — prevent defects | **Product** — detect defects |
| When | Throughout SDLC | After work is done |
| Who | Everyone on the team | Dedicated testers / reviewers |
| Goal | Build quality **in** | Find quality issues **out** |
| Example | Code reviews, standards, CI gates | Test execution, inspections |

**One-liner:** QA is proactive; QC is reactive.

### QA vs Testing

- **Testing** is one activity inside QA — it validates the product against requirements.
- **QA** is the wider system: processes, standards, reviews, training, CI gates that
  ensure quality throughout development.

### Shift-Left Testing

Moving quality activities **earlier** in the lifecycle — from post-dev phase into
design, coding, and integration.

| Stage | Traditional | Shift-Left |
|---|---|---|
| Design | No testing | Review requirements for testability |
| Development | Dev writes code, QA waits | Unit tests, static analysis on every commit |
| Integration | First big test run | Contract tests, API tests in CI |
| Release | QA bottleneck | Automated regression, fast feedback |

**Cost impact (IBM research):** fixing a defect found in design costs ~$1;
the same defect in production costs ~$100.
Shift-left reduces defect escape rates by 30–40% and speeds releases by 25–35%.

### 7 Testing Principles (ISTQB)

| # | Principle | Practical meaning |
|---|---|---|
| 1 | Testing shows presence of defects | Passing tests ≠ bug-free |
| 2 | Exhaustive testing is impossible | Risk-based prioritisation is essential |
| 3 | Early testing saves money | Shift-left; catch defects in requirements |
| 4 | Defect clustering | 80% of defects in ~20% of modules — focus there |
| 5 | Pesticide paradox | Same tests stop finding new bugs — update them |
| 6 | Testing is context-dependent | Safety-critical ≠ e-commerce ≠ mobile game |
| 7 | Absence-of-errors fallacy | A bug-free product that solves the wrong problem is still a failure |

### Verification vs Validation

| | Verification | Validation |
|---|---|---|
| Question | "Are we building the product **right**?" | "Are we building the **right** product?" |
| Method | Reviews, static analysis, walkthroughs | Testing, demos, UAT |
| Against | Specifications and design docs | User needs and business goals |

### Testing vs Debugging

- **Testing** — systematic process to find failures; produces a defect report.
- **Debugging** — developer activity to locate and fix the root cause.
  `QA tests → finds failure → logs defect → Dev debugs → fixes → QA re-tests`

---

## Test Levels

Four levels form the classic testing stack, each answering a different question:

| Level | Scope | Who runs it | Speed | Goal |
|---|---|---|---|---|
| **Unit** | Single function / class | Developer | Very fast (ms) | Logic correctness in isolation |
| **Integration** | Component interactions | Dev / QA | Fast (seconds) | Contracts and data flow between parts |
| **System** | Full application end-to-end | QA | Minutes | Feature correctness in deployed environment |
| **Acceptance** | Business requirements | QA + Product / client | Minutes–hours | "Does it solve the real problem?" |

- **Unit** — isolated from DB, network, filesystem (mocks/stubs); runs on every commit.
- **Integration** — tests real interactions: service → DB, service → external API.
- **System** — happy paths + key negative scenarios in a deployed environment.
- **Acceptance** — UAT (stakeholders validate business value) or regulatory sign-off.

> See [Testing Pyramid](../testing-pyramid/index.md) for depth on balancing these levels.

---

## Types of Testing

### Functional — validates **what** the system does

| Type | Focus |
|---|---|
| Feature testing | New functionality works as specified |
| Regression testing | Existing features unbroken after changes |
| Smoke testing | Core flows work after a new build |
| Sanity testing | Targeted check of a recently fixed area |

### Non-Functional — validates **how well** the system behaves

| Type | What to measure | Tools |
|---|---|---|
| **Performance / Load** | Throughput, latency under expected load | k6, Gatling, Locust |
| **Stress** | Behavior at and beyond capacity limits | k6, JMeter |
| **Security** | OWASP vulnerabilities, auth, data exposure | OWASP ZAP, Burp Suite |
| **Usability** | UX quality, accessibility (WCAG) | Axe, manual heuristics |
| **Compatibility** | Browsers, devices, OS versions | BrowserStack, Playwright |
| **Reliability** | Stability over extended runtime | Chaos engineering, soak tests |

### Additional types

| Type | When to use |
|---|---|
| **Exploratory** | New features, unclear requirements — use charter-based sessions |
| **Ad-hoc** | Quick unstructured check; not a substitute for test cases |
| **Regression** | Before every release; should be fully automated |

### Choosing the right mix

| Signal | Action |
|---|---|
| High defect rate in old features | Strengthen regression automation |
| Performance complaints in prod | Add load/stress testing to CI |
| Security incident | Add DAST to CI pipeline |
| New integration point | Add integration + contract tests |
| New UI flow | Exploratory session + automate happy path |
