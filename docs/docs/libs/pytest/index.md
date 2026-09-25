---
date: 2026-09-19
tags:
  - python
  - libraries
  - pytest
  - testing
---

# Pytest — Python Testing Framework

Standard testing framework for Python: fixtures, parametrize, markers, mocking, coverage.

## Installation

```bash
uv add --dev pytest pytest-cov pytest-xdist pytest-asyncio pytest-mock pytest-randomly
```

## Section Map

| Folder | Focus |
|--------|-------|
| [01 Core Guides](./01-core-guides/01-fundamentals.md) | Fundamentals (fixtures, assertions, parametrize, markers) and advanced patterns (mocking, monkeypatch, async, coverage, plugins) |
| [02 Practical Playbooks](./02-practical-playbooks/01-real-world-recipes.md) | Real-world recipes, test-data factories, flaky-debug workflow, config template |

### [Core Guides](01-core-guides/index.md)

| File | Topics |
|------|--------|
| [01 Fundamentals](./01-core-guides/01-fundamentals.md) | Discovery, assertions, fixtures, conftest, scope, parametrize, markers |
| [02 Advanced Patterns](./01-core-guides/02-advanced-patterns.md) | Mocking, monkeypatch, tmp_path, capsys, async, coverage, plugins |

### [Practical Playbooks](02-practical-playbooks/index.md)

| File | Topics |
|------|--------|
| [01 Real-World Recipes](./02-practical-playbooks/01-real-world-recipes.md) | FastAPI, service mock, DB rollback, CLI, retry, contract, time freeze |
| [02 Test Data Factories](./02-practical-playbooks/02-test-data-factories.md) | Factory fixtures, deterministic faker, FactoryBoy |
| [03 Flakiness Debugging](./02-practical-playbooks/03-flakiness-debugging.md) | Triage commands, order dependency, isolation checklist |
| [04 Config Template](./02-practical-playbooks/04-pytest-config-template.md) | `pyproject.toml` baseline, marker strategy, local vs CI |

## Quick Commands

| Command | Use |
|---------|-----|
| `pytest` | Run all |
| `pytest tests/test_api.py::test_login` | One test |
| `pytest -k "login and not admin"` | Filter by name |
| `pytest -m "not slow"` | Exclude marker |
| `pytest -x --lf` | Stop + rerun last failed |
| `pytest -n auto` | Parallel |
| `pytest --cov=src --cov-fail-under=100` | Coverage gate |

## Baseline Config

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-ra -q --strict-markers --strict-config"
markers = ["slow: long tests", "integration: external deps"]
filterwarnings = ["error"]
```

## Standards

- Deterministic, isolated tests.
- Fixtures with `yield` for reliable teardown.
- Mock external boundaries, not internal logic.
- Strict markers/config and coverage threshold in CI.

---
## See also
- [Digital Garden: Knowledge Base](../../index.md)
- [Python Guide for Automation QA](../../python-guide/index.md)
- [Test Automation Framework](../../test-automation-framework/index.md)
- [CI/CD](../../ci-cd-approaches/index.md)
- [Tools — Practical Reference Guides](../../tools/index.md)
- [Python Libraries](../index.md)

