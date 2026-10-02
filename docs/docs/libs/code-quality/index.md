---
date: 2026-09-10
tags:
  - python
  - libraries
  - code-quality
---

# Code Quality — Linters, Formatters, Type Checkers, Coverage

Practical guide to the modern Python quality stack: what to use, how to configure, how to enforce in CI.

## The 2026 Stack

| Layer | Tool | Role |
|-------|------|------|
| Linter + Formatter | [**Ruff**](01-ruff-linting-formatting.md) | Replaces Flake8, Black, isort, bandit, pyupgrade (900+ rules, Rust speed) |
| Type checker | [**mypy**](02-type-checkers.md) | Static type analysis (strict mode in CI) |
| Type checker (IDE) | [**Pyright / Pylance**](02-type-checkers.md) | Real-time feedback in VS Code |
| Strict style | **wemake-python-styleguide** | Flake8 plugin, complements Ruff (WPS rules) |
| Pre-commit | [**pre-commit**](03-pre-commit-hooks.md) | Run all checks on `git commit` |
| Test coverage | [**pytest-cov** + **coverage.py**](04-test-coverage.md) | Line + branch coverage measurement |
| Mutation testing | **pytest-gremlins** / **cosmic-ray** | Verify test assertions actually catch bugs |

## Section Map

| File | Topics |
|------|--------|
| [01 Ruff: Linting & Formatting](./01-ruff-linting-formatting.md) | Install, configure, rule sets, auto-fix, format, CI |
| [02 Type Checkers](./02-type-checkers.md) | mypy strict, pyright, wemake-python-styleguide |
| [03 Pre-Commit Hooks](./03-pre-commit-hooks.md) | Setup, hook ordering, CI integration |
| [04 Test Coverage](./04-test-coverage.md) | pytest-cov, branch coverage, mutation testing |
| [05 Config Template](./05-pyproject-template.md) | Copy-paste `pyproject.toml` + `.pre-commit-config.yaml` |

## Quick Start

```bash
uv add --dev ruff mypy pytest-cov
uv run ruff check . --fix && uv run ruff format .
uv run mypy .
uv run pytest --cov=src --cov-branch --cov-fail-under=100
```

## Golden Rules

1. Ruff replaces Flake8 + Black + isort for most teams (keep Flake8 only if you use WPS rules).
2. Run `ruff check` before `ruff format` (linter may auto-fix code that needs reformatting).
3. Use `mypy --strict` in CI; Pyright in IDE for instant feedback.
4. Enforce 100% coverage gate in CI with `--cov-fail-under=100`.
5. Line coverage alone is not enough — consider mutation testing for critical paths.
6. Pre-commit hooks = last safety net before code reaches the repo.

---
## See also
- [Digital Garden: Knowledge Base](../../index.md)
- [Python Guide for Automation QA](../../python-guide/index.md)
- [Test Automation Framework](../../test-automation-framework/index.md)
- [CI/CD](../../ci-cd-approaches/index.md)
- [Tools — Practical Reference Guides](../../tools/index.md)
- [Python Libraries](../index.md)
