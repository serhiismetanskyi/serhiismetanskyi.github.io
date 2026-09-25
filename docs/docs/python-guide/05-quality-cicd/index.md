---
date: 2026-08-18
tags:
  - python
  - ci-cd
  - code-quality
---

# Code Quality & CI/CD

This section covers tools that keep your code clean and pipelines that run your tests automatically.

---

## Topics

| Page | What You Will Learn |
|------|-------------------|
| [**Code Quality Tools**](01-code-quality-tools.md) | Ruff, mypy, type checking, PEP 8 |
| [**Dependency Management**](02-dependency-management.md) | uv, virtual environments, lockfiles |
| [**CI/CD Integration**](03-cicd-integration.md) | Pipelines, GitHub Actions, test reports |

---

## Key Points

- **Automate** code quality checks — do not rely on manual reviews
- Use **`ruff`** for linting and formatting (modern replacement for black + flake8 + isort)
- Use **`mypy`** for static type checking
- Run tests on **every pull request** in CI/CD

---
## See also
- [Digital Garden: Knowledge Base](../../index.md)
- [Test Automation Framework](../../test-automation-framework/index.md)
- [Testing Pyramid](../../testing-pyramid/index.md)
- [Test Design Patterns in Test Automation](../../test-design-patterns/index.md)
- [Pytest — Python Testing Framework](../../libs/pytest/index.md)
- [Playwright — Python Browser & API Testing](../../libs/playwright/index.md)

