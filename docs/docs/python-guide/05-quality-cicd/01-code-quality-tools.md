---
date: 2026-08-19
tags:
  - python
  - ci-cd
  - code-quality
---

# Code Quality Tools

Code quality tools catch bugs, enforce style, and keep your codebase consistent.

---

## PEP 8 — Python Style Guide

PEP 8 is the official style guide for Python. Key rules:

| Rule | Example |
|------|---------|
| Use `snake_case` for functions and variables | `get_user_name()` |
| Use `PascalCase` for classes | `UserProfile` |
| Use `UPPER_CASE` for constants | `MAX_RETRIES` |
| Indent with **4 spaces** (not tabs) | Standard |
| Max line length: **79-120 characters** | Configurable |
| Two blank lines before top-level definitions | Between classes |

---

## Ruff — Linting and Formatting

Ruff replaces `black`, `flake8`, and `isort` with one fast tool.

### Install

```bash
uv add --dev ruff
```

### Run

```bash
uv run ruff check .       # find problems
uv run ruff check . --fix # fix automatically
uv run ruff format .      # format code
```

### Configuration (pyproject.toml)

```toml
[tool.ruff]
target-version = "py312"
line-length = 120

[tool.ruff.lint]
select = ["E", "F", "I", "N", "W", "UP", "B", "SIM", "RUF"]

[tool.ruff.format]
quote-style = "double"
indent-style = "space"
```

### What Ruff Checks

| Code | Category | Example |
|------|----------|---------|
| `E` | PEP 8 errors | Missing whitespace |
| `F` | Pyflakes | Unused imports |
| `I` | isort | Import order |
| `N` | Naming | Wrong naming convention |
| `UP` | Pyupgrade | Outdated syntax |
| `B` | Bugbear | Common bugs |
| `SIM` | Simplify | Code that can be simpler |

---

## mypy — Static Type Checking

mypy checks your type hints without running the code.

### Install

```bash
uv add --dev mypy
```

### Run

```bash
uv run mypy src/
```

### Configuration (pyproject.toml)

```toml
[tool.mypy]
python_version = "3.12"
strict = true
warn_return_any = true
warn_unused_configs = true
disallow_untyped_defs = true
```

### Example

```python
def greet(name: str) -> str:
    return f"Hello, {name}"

greet(42)  # mypy error: Argument 1 has incompatible type "int"
```

---

## Pre-commit Hooks

Run checks automatically before each commit:

### Install

```bash
uv add --dev pre-commit
```

### Configuration (.pre-commit-config.yaml)

```yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.8.0
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format
  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.13.0
    hooks:
      - id: mypy
```

### Activate

```bash
uv run pre-commit install
```

Now checks run automatically on every `git commit`.

---

## Test Coverage

Measure how much of your code is tested:

```bash
uv add --dev pytest-cov
uv run pytest --cov=src --cov-report=term-missing
```

### Configuration

```toml
[tool.coverage.run]
source = ["src"]
branch = true

[tool.coverage.report]
fail_under = 100
show_missing = true
```

---

## Tool Summary

| Tool | Purpose | Command |
|------|---------|---------|
| `ruff` | Linting + formatting | `uv run ruff check . && uv run ruff format .` |
| `mypy` | Type checking | `uv run mypy src/` |
| `pytest-cov` | Test coverage | `uv run pytest --cov=src` |
| `pre-commit` | Auto-run checks | `uv run pre-commit run --all-files` |

---

## Best Practices

- **Automate** all checks with pre-commit hooks
- Run checks in **CI/CD** too — pre-commit alone is not enough
- Set coverage target to **100%** and enforce it
- Fix **all warnings** — do not ignore them
- Use **strict mode** in mypy for better type safety
- Keep **consistent style** across the whole project
