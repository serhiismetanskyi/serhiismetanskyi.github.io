---
date: 2026-07-27
tags:
  - robot-framework
  - test-automation
---

# Robot Framework — Architecture

This section describes how to structure enterprise Robot Framework (RF) projects: layers, responsibilities, keyword design, and test data. Use it as a blueprint before scaling suites across teams and CI.

## Guides

| Guide | Topics |
| ----- | ------ |
| [Layered Architecture](01-layered-architecture.md) | Five layers, separation of concerns, directory layout, dependency flow, resource vs library, dependency locking with **uv** / Poetry |
| [Keyword Design Principles](02-keyword-design.md) | Single responsibility, naming, composition, anti-patterns, embedded arguments, `[Documentation]` / `[Tags]` |
| [Test Data Management](03-test-data-management.md) | Builders, factories, fixtures, uniqueness, variable files, `[Template]`, external files, cleanup, best practices |

For official project layout notes, see the [Robot Framework project structure](https://docs.robotframework.org/docs/examples/project_structure) documentation.

---
## See also
- [Digital Garden: Knowledge Base](../../index.md)
- [Test Automation Framework](../../test-automation-framework/index.md)
- [Testing Pyramid](../../testing-pyramid/index.md)
- [QA & Testing Methodology](../../qa-methodology/index.md)
- [Automation](../../python-guide/04-automation/index.md)
- [Robot Framework — Complete Guide](../index.md)

