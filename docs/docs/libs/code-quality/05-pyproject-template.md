---
date: 2026-09-11
tags:
  - python
  - libraries
  - code-quality
---

# Config Template — pyproject.toml + Pre-Commit

Copy-paste baseline for a new Python project with full quality stack.

## `pyproject.toml`

```toml
[project]
name = "my-project"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = []

[dependency-groups]
dev = [
    "ruff>=0.11",
    "mypy>=1.15",
    "wemake-python-styleguide>=1.6",
    "flake8>=7.3",
    "pre-commit>=4.2",
    "pytest>=8.3",
    "pytest-cov>=6.1",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

# --- Ruff ---
[tool.ruff]
target-version = "py312"
line-length = 100
exclude = [".venv", "migrations", "__pycache__", "dist"]

[tool.ruff.lint]
select = ["E", "W", "F", "I", "UP", "B", "SIM", "S", "C4", "PTH", "RET", "ARG", "PL", "RUF"]
ignore = ["E501"]

[tool.ruff.lint.per-file-ignores]
"tests/**" = ["S101", "ARG001", "PLR2004"]

[tool.ruff.lint.isort]
known-first-party = ["my_project"]

[tool.ruff.format]
quote-style = "double"
indent-style = "space"
docstring-code-format = true

# --- mypy ---
[tool.mypy]
python_version = "3.12"
strict = true
warn_return_any = true
warn_unused_configs = true
no_implicit_reexport = true

[[tool.mypy.overrides]]
module = ["tests.*"]
disallow_untyped_defs = false

# --- pytest ---
[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-ra -q --strict-markers --strict-config --cov=src --cov-branch --cov-fail-under=100"
markers = ["slow: long-running tests", "integration: external dependencies"]
filterwarnings = ["error"]

# --- coverage ---
[tool.coverage.run]
source = ["src"]
branch = true
omit = ["*/migrations/*"]

[tool.coverage.report]
show_missing = true
fail_under = 100
exclude_lines = [
    "if TYPE_CHECKING:",
    "if __name__",
    "@overload",
    "raise NotImplementedError",
]
```

---

## `setup.cfg` (wemake-python-styleguide)

```ini
[flake8]
select = WPS
max-line-length = 100
max-cognitive-score = 12
max-function-score = 8
max-module-members = 10
max-local-variables = 8
max-returns = 5
exclude = .venv,migrations,__pycache__,dist

per-file-ignores =
    tests/*.py: WPS226, WPS432
```

---

## `.pre-commit-config.yaml`

```yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v5.0.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-toml
      - id: check-added-large-files
        args: [--maxkb=500]
      - id: detect-private-key

  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.15.8
    hooks:
      - id: ruff-check
        args: [--fix]
      - id: ruff-format

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.15.0
    hooks:
      - id: mypy
        additional_dependencies: [types-requests, types-PyYAML]

  - repo: https://github.com/PyCQA/flake8
    rev: "7.3.0"
    hooks:
      - id: flake8
        args: [--select=WPS]
        additional_dependencies: [wemake-python-styleguide]
```

---

## Bootstrap Commands

```bash
uv init my-project && cd my-project
uv add --dev ruff mypy wemake-python-styleguide flake8 pre-commit pytest pytest-cov
uv run pre-commit install
uv run ruff check . --fix && uv run ruff format .
uv run flake8 . --select=WPS
uv run mypy .
uv run pytest
```

---

## CI (GitHub Actions)

```yaml
name: quality
on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
        with:
          enable-cache: true
      - run: uv sync --locked
      - run: uv run ruff check .
      - run: uv run ruff format . --check
      - run: uv run flake8 . --select=WPS
      - run: uv run mypy .
      - run: uv run pytest --cov=src --cov-branch --cov-fail-under=100
```
