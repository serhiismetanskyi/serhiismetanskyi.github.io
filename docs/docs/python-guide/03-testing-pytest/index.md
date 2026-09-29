---
date: 2026-08-16
tags:
  - python
  - pytest
  - testing
---

# Testing with pytest

This section covers testing fundamentals and the `pytest` framework — the standard testing tool in Python.

---

## Topics

| Page | What You Will Learn |
|------|-------------------|
| [**Testing Fundamentals**](01-testing-fundamentals.md) | Unit vs integration vs E2E tests, test pyramid |
| [**pytest Basics**](02-pytest-basics.md) | Test structure, assertions, running tests |
| [**Fixtures & Parametrize**](03-fixtures-parametrize.md) | Fixtures, parametrization, markers |
| [**Test Architecture**](04-test-architecture.md) | Project structure, naming, organization, POM, Singleton, Factory |
| [**Assertions & Mocking**](05-assertions-mocking.md) | Custom assertions, mocks, stubs, monkeypatching |

---

## Key Points

- Tests should be **independent** — each test runs on its own
- Tests should be **deterministic** — same result every time
- Tests should be **fast** — slow tests slow down development
- Use **fixtures** to set up test data, not copy-paste

---
## See also
- [Digital Garden: Knowledge Base](../../index.md)
- [Test Automation Framework](../../test-automation-framework/index.md)
- [Testing Pyramid](../../testing-pyramid/index.md)
- [Test Design Patterns in Test Automation](../../test-design-patterns/index.md)
- [Pytest — Python Testing Framework](../../libs/pytest/index.md)
- [Playwright — Python Browser & API Testing](../../libs/playwright/index.md)
