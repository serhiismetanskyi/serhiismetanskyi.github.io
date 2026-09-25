---
date: 2026-06-16
tags:
  - design-patterns
  - architecture
---

# Code Quality Tools

Clean code principles are enforced by humans during review — but code quality tools
catch violations **automatically, before review even starts**.

---

## Linters

A linter performs **static analysis** — it reads source code without running it
and reports violations of style rules, complexity limits, or bug-prone patterns.

### Python

| Tool | What It Checks |
|------|---------------|
| `ruff` | Style, imports, complexity, unused vars — replaces flake8, isort, pyupgrade |
| `mypy` | Type annotations — catches type mismatches before runtime |
| `wemake-python-styleguide` | Strict style: cognitive complexity, nesting depth, naming conventions |
| `bandit` | Security — detects hardcoded passwords, unsafe `eval`, SQL injection patterns |

```toml
# pyproject.toml
[tool.ruff]
line-length = 88
select = ["E", "F", "W", "C90", "I", "N", "UP", "S"]

[tool.mypy]
strict = true
disallow_untyped_defs = true
```

---

## Formatters

Formatters **rewrite code** to enforce consistent style. Unlike linters, they don't
report — they fix. Non-negotiable in any shared codebase.

| Tool | Note |
|------|------|
| `ruff format` | Replaces black — fast, opinionated, same output |
| `black` | Original formatter, widely adopted |

---

## Type Checkers

Type checking bridges the gap between dynamic languages and compile-time safety.

```python
# mypy catches this before runtime
def get_user(user_id: str) -> dict:
    return db.find(user_id)

result = get_user(42)  # error: Argument 1 has incompatible type "int"; expected "str"
```

Run as part of CI — treat type errors as build failures, not warnings.

---

## Complexity Metrics

High complexity = hard to test, hard to understand, easy to break.

| Metric | Tool | Threshold |
|--------|------|-----------|
| Cyclomatic complexity | `ruff` (C90), `radon` | > 10 is a warning |
| Cognitive complexity | `wemake-python-styleguide` | > 12 is a warning |
| Lines per function | Any linter | > 30 is a smell |
| Arguments per function | `wemake` | > 5 is a smell |

---

## Pre-commit Hooks

Pre-commit hooks run checks **before a commit is created**.
If any check fails, the commit is rejected. Developers fix the issue, then commit again.

### Setup

```bash
pip install pre-commit
pre-commit install       # installs hook into .git/hooks/pre-commit
```

### `.pre-commit-config.yaml`

```yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.4.0
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.9.0
    hooks:
      - id: mypy
        additional_dependencies: [types-requests]

  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.6.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-merge-conflict
      - id: detect-private-key
```

Run manually on all files:

```bash
pre-commit run --all-files
```

---

## CI Integration

Pre-commit stops bad code locally. CI stops it at the repository level —
even if a developer bypasses hooks with `--no-verify`.

```yaml
# .github/workflows/quality.yml
name: Code Quality

on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v3

      - name: Lint
        run: uv run ruff check .

      - name: Format check
        run: uv run ruff format --check .

      - name: Type check
        run: uv run mypy src/

      - name: Security scan
        run: uv run bandit -r src/ -ll
```

---

## Coverage Enforcement

Test coverage without enforcement drifts downward over time.
Enforce a minimum threshold in CI:

```bash
uv run pytest --cov=src --cov-fail-under=95 --cov-report=term-missing
```

Coverage alone does not guarantee quality — a test that calls a function
without asserting anything gives 100% coverage and zero confidence.
Use coverage as a **floor**, not a goal.

---

## Tool Execution Order

The recommended order — fast checks first, slow checks last:

```
Format (ruff format)     → 0.1s  — fix style
Lint (ruff check)        → 0.3s  — catch errors
Type check (mypy)        → 2–5s  — catch type issues
Security (bandit)        → 1–3s  — catch security issues
Tests + coverage         → 10s+  — validate behavior
```

Run format + lint in pre-commit. Run everything in CI.
