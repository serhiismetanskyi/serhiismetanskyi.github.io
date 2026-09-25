---
date: 2026-08-19
tags:
  - python
  - ci-cd
  - code-quality
---

# CI/CD Integration

CI/CD runs your tests and checks automatically on every code change.

---

## What Is CI/CD?

| Term | Meaning |
|------|---------|
| **CI** (Continuous Integration) | Automatically build and test code on every push |
| **CD** (Continuous Delivery) | Automatically prepare code for release |
| **CD** (Continuous Deployment) | Automatically deploy to production |

---

## Basic CI Pipeline

Every CI pipeline should include these steps:

```
1. Install dependencies
2. Run linters (ruff, mypy)
3. Run tests (pytest)
4. Check coverage
5. Generate reports
```

---

## GitHub Actions Example

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Install uv
        uses: astral-sh/setup-uv@v4

      - name: Set up Python
        run: uv python install 3.12

      - name: Install dependencies
        run: uv sync

      - name: Run linter
        run: uv run ruff check .

      - name: Run type checker
        run: uv run mypy src/

      - name: Run tests
        run: uv run pytest --cov=src --cov-report=xml

      - name: Check coverage
        run: uv run pytest --cov=src --cov-fail-under=100
```

---

## GitLab CI Example

```yaml
# .gitlab-ci.yml
stages:
  - lint
  - test

variables:
  UV_SYSTEM_PYTHON: "true"

lint:
  stage: lint
  image: python:3.12
  script:
    - pip install uv
    - uv sync
    - uv run ruff check .
    - uv run mypy src/

test:
  stage: test
  image: python:3.12
  script:
    - pip install uv
    - uv sync
    - uv run pytest --cov=src --junitxml=report.xml
  artifacts:
    reports:
      junit: report.xml
```

---

## Test Reporting

### JUnit XML (Standard Format)

```bash
uv run pytest --junitxml=report.xml
```

Most CI systems can read JUnit XML and show test results in the UI.

### Allure Reports

```bash
uv add --dev allure-pytest
uv run pytest --alluredir=allure-results
```

Allure creates rich HTML reports with:

- Test history
- Screenshots
- Step-by-step logs
- Trends

### HTML Coverage Report

```bash
uv run pytest --cov=src --cov-report=html
```

This creates an `htmlcov/` folder with a visual coverage report.

---

## Pipeline Best Practices

### Fail Fast

Put the fastest checks first:

```
1. Ruff (seconds)      → catches syntax and style issues
2. mypy (seconds)      → catches type errors
3. Unit tests (seconds) → catches logic bugs
4. Integration tests (minutes) → catches integration issues
5. E2E tests (minutes)  → catches user flow issues
```

### Cache Dependencies

```yaml
# GitHub Actions
- uses: actions/cache@v4
  with:
    path: ~/.cache/uv
    key: uv-${{ hashFiles('uv.lock') }}
```

### Run on Every PR

- Run **all checks** on every pull request
- **Block merge** if any check fails
- Keep pipeline under **10 minutes**

---

## Quality Gates

Set rules that must pass before code can be merged:

| Gate | Rule |
|------|------|
| Linting | Zero ruff errors |
| Type checking | Zero mypy errors |
| Tests | All tests pass |
| Coverage | >= 100% line coverage |
| No secrets | No API keys in code |

---

## Best Practices

- Run **all checks** on every pull request
- **Fail fast** — put quick checks first
- **Cache** dependencies to speed up pipelines
- Keep pipelines **under 10 minutes**
- Generate **test reports** (JUnit XML, Allure)
- Set **quality gates** and enforce them
- Use **branch protection** — require passing CI before merge
- Run **the same checks** locally and in CI
