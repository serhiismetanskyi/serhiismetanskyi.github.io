---
date: 2026-08-01
tags:
  - robot-framework
  - test-automation
---

# Robot Framework — Decisions & Production

How to scale large suites, avoid costly anti-patterns, and mature your automation from ad-hoc scripts to an owned, observable product. Pair this section with [Architecture](../02-architecture/index.md) and official docs on [parallel runs](https://docs.robotframework.org/docs/parallel) and [Pabot](https://pabot.org/).

## Topics in this section

| Topic | File | What you will learn |
|-------|------|---------------------|
| [Scalability & Maintainability](01-scalability-maintainability.md) | `01-scalability-maintainability.md` | Parallel runs with Pabot, suite splitting, tags, contract tests, DRY resources, and architecture patterns for API vs microservices vs full-stack. |
| [Anti-Patterns, Risks & Limitations](02-antipatterns-risks.md) | `02-antipatterns-risks.md` | Symptom/fix tables for brittle tests, risks (verbosity, flakiness, perf scope), and mitigation strategies. |
| [Maturity Model & Engineering Heuristics](03-maturity-model-heuristics.md) | `03-maturity-model-heuristics.md` | Five maturity levels, transitions, staff-level heuristics, security/perf boundaries, and “framework as a product.” |

## When to read what

| Situation | Start here |
|-----------|------------|
| CI exceeds target duration or suites hit 1000+ cases | [Scalability & Maintainability](01-scalability-maintainability.md) |
| Flaky tests, duplicated HTTP calls, or “IF in `.robot`” | [Anti-Patterns, Risks & Limitations](02-antipatterns-risks.md) |
| Stakeholders ask for roadmap, ownership, or quality metrics | [Maturity Model & Engineering Heuristics](03-maturity-model-heuristics.md) |

## Related references

- [Robot Framework User Guide — Tags](https://robotframework.org/robotframework/latest/RobotFrameworkUserGuide.html#tagging-test-cases)
- [PabotLib](https://pabot.org/PabotLib.html) for shared resources across processes

---
## See also
- [Digital Garden: Knowledge Base](../../index.md)
- [Test Automation Framework](../../test-automation-framework/index.md)
- [Testing Pyramid](../../testing-pyramid/index.md)
- [QA & Testing Methodology](../../qa-methodology/index.md)
- [Automation](../../python-guide/04-automation/index.md)
- [Robot Framework — Complete Guide](../index.md)
