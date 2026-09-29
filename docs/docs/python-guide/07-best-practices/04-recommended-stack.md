---
date: 2026-08-21
tags:
  - python
---

# Recommended Stack

A modern Python stack for Automation QA Engineers in 2026.

---

## Core

| Tool | Purpose | Install |
|------|---------|---------|
| **Python 3.12+** | Runtime | `uv python install 3.12` |
| **uv** | Package manager | <code>curl -LsSf https://astral.sh/uv/install.sh &#124; sh</code> |
| **pytest** | Testing framework | `uv add --dev pytest` |

---

## API Testing

| Tool | Purpose | Install |
|------|---------|---------|
| **requests** | Sync HTTP client | `uv add requests` |
| **httpx** | Async HTTP client | `uv add httpx` |
| **pydantic** | Response validation | `uv add pydantic` |

### When to Use Each

| Scenario | Tool |
|----------|------|
| Simple API tests | `requests` |
| Async or high-volume API tests | `httpx` |
| Schema validation | `pydantic` |

---

## UI Testing

| Tool | Purpose | Install |
|------|---------|---------|
| **playwright** | Browser automation (recommended) | `uv add playwright` |
| **selenium** | Browser automation (legacy) | `uv add selenium` |

### When to Use Each

| Scenario | Tool |
|----------|------|
| New projects | Playwright |
| Legacy projects already using Selenium | Selenium |
| Fast, stable E2E tests | Playwright |

---

## Code Quality

| Tool | Purpose | Install |
|------|---------|---------|
| **ruff** | Linting + formatting | `uv add --dev ruff` |
| **mypy** | Type checking | `uv add --dev mypy` |
| **pre-commit** | Git hooks | `uv add --dev pre-commit` |
| **pytest-cov** | Test coverage | `uv add --dev pytest-cov` |

---

## Data & Config

| Tool | Purpose | Install |
|------|---------|---------|
| **pydantic-settings** | Config from env vars | `uv add pydantic-settings` |
| **faker** | Generate test data | `uv add --dev faker` |

---

## Reporting

| Tool | Purpose | Install |
|------|---------|---------|
| **allure-pytest** | Rich test reports | `uv add --dev allure-pytest` |
| **pytest-html** | Simple HTML reports | `uv add --dev pytest-html` |

---

## CI/CD

| Tool | Purpose |
|------|---------|
| **GitHub Actions** | CI/CD pipeline |
| **GitLab CI** | CI/CD pipeline |

---

## Minimal pyproject.toml

```toml
[project]
name = "aqa-project"
version = "1.0.0"
requires-python = ">=3.12"
dependencies = [
    "requests>=2.32.0",
    "pydantic>=2.9.0",
    "playwright>=1.49.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3.0",
    "pytest-cov>=6.0.0",
    "pytest-asyncio>=0.24.0",
    "ruff>=0.8.0",
    "mypy>=1.13.0",
    "pre-commit>=4.0.0",
    "allure-pytest>=2.13.0",
    "faker>=33.0.0",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-v --tb=short --strict-markers"

[tool.ruff]
target-version = "py312"
line-length = 120

[tool.ruff.lint]
select = ["E", "F", "I", "N", "W", "UP", "B", "SIM", "RUF"]

[tool.mypy]
python_version = "3.12"
strict = true

[tool.coverage.run]
source = ["src"]
branch = true

[tool.coverage.report]
fail_under = 100
show_missing = true
```

---

## Project Structure

```
aqa-project/
├── src/
│   ├── clients/
│   │   ├── __init__.py
│   │   └── user_client.py
│   ├── pages/
│   │   ├── __init__.py
│   │   └── login_page.py
│   ├── models/
│   │   ├── __init__.py
│   │   └── user.py
│   └── utils/
│       ├── __init__.py
│       └── helpers.py
├── tests/
│   ├── conftest.py
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── pyproject.toml
├── uv.lock
└── .gitignore
```

---

## Further Learning

### Official Documentation

| Resource | URL |
|----------|-----|
| Python Docs | [docs.python.org](https://docs.python.org/3/) |
| pytest Docs | [docs.pytest.org](https://docs.pytest.org/) |
| Playwright Docs | [playwright.dev/python](https://playwright.dev/python/docs/intro) |
| Pydantic Docs | [docs.pydantic.dev](https://docs.pydantic.dev/) |
| uv Docs | [docs.astral.sh/uv](https://docs.astral.sh/uv/) |
| Ruff Docs | [docs.astral.sh/ruff](https://docs.astral.sh/ruff/) |

### Books & Guides

| Resource | Topic |
|----------|-------|
| *Clean Code* (Robert Martin) | Code quality principles |
| *Python Testing with pytest* | Practical pytest guide |
| *Architecture Patterns with Python* | Domain-driven design in Python |
| Real Python ([realpython.com](https://realpython.com)) | Tutorials and deep dives |
| testdriven.io | Test automation best practices |

### Practice

| Resource | Purpose |
|----------|---------|
| [exercism.io/tracks/python](https://exercism.org/tracks/python) | Python coding exercises |
| [leetcode.com](https://leetcode.com) | Algorithm practice (Python) |
| [github.com — awesome-pytest](https://github.com/augustogoulart/awesome-pytest) | pytest plugins and resources |

---

## Summary

This guide covered:

- **Python fundamentals** — types, control flow, data structures, functions
- **OOP** — classes, inheritance, composition, dunder methods
- **Error handling** — exceptions, logging, file operations
- **Testing** — pytest, fixtures, parametrize, test architecture
- **Automation** — API testing, UI automation, design patterns
- **Code quality** — ruff, mypy, coverage, CI/CD
- **Advanced topics** — decorators, generators, async, performance
- **Best practices** — security, pitfalls, interview prep

Use this guide as a **reference** and come back to any section when you need it.
