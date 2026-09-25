---
date: 2026-09-10
tags:
  - python
  - libraries
  - code-quality
---

# Ruff — Linting & Formatting

Rust-based all-in-one tool. Replaces Flake8, Black, isort, bandit, pyupgrade, pydocstyle, and 20+ others. 10–100x faster.

## Install

```bash
uv add --dev ruff
```

---

## Linting

```bash
uv run ruff check .               # lint
uv run ruff check . --fix         # lint + auto-fix
uv run ruff check . --diff        # show what --fix would change
uv run ruff check . --select E,F  # only specific rules
```

---

## Formatting

```bash
uv run ruff format .              # format all
uv run ruff format . --check      # check without modifying
uv run ruff format . --diff       # show diffs
```

Always run `ruff check --fix` before `ruff format` — linter fixes may need reformatting.

---

## Configuration (`pyproject.toml`)

```toml
[tool.ruff]
target-version = "py312"
line-length = 100
exclude = [".venv", "migrations", "__pycache__"]

[tool.ruff.lint]
select = [
    "E",    # pycodestyle errors
    "W",    # pycodestyle warnings
    "F",    # Pyflakes
    "I",    # isort (import sorting)
    "UP",   # pyupgrade (modern syntax)
    "B",    # flake8-bugbear
    "SIM",  # flake8-simplify
    "S",    # bandit (security)
    "C4",   # flake8-comprehensions
    "PTH",  # flake8-use-pathlib
    "RET",  # flake8-return
    "ARG",  # flake8-unused-arguments
    "ERA",  # eradicate (commented-out code)
    "PL",   # Pylint subset
    "RUF",  # Ruff-specific rules
]
ignore = ["E501"]  # formatter handles line length

[tool.ruff.lint.per-file-ignores]
"tests/**" = ["S101"]  # allow assert in tests

[tool.ruff.lint.isort]
known-first-party = ["my_package"]

[tool.ruff.format]
quote-style = "double"
indent-style = "space"
docstring-code-format = true
```

---

## Key Rule Sets Quick Reference

| Code | Source | What it catches |
|------|--------|----------------|
| `E/W` | pycodestyle | Style issues |
| `F` | Pyflakes | Unused imports, undefined names |
| `I` | isort | Import order |
| `UP` | pyupgrade | Old Python syntax (`dict()` → `{}`) |
| `B` | bugbear | Common bugs, design issues |
| `SIM` | simplify | Unnecessarily complex code |
| `S` | bandit | Security issues (hardcoded passwords, etc.) |
| `C4` | comprehensions | List/dict/set comprehension improvements |
| `PTH` | use-pathlib | `os.path` → `pathlib.Path` |
| `PL` | Pylint | Broad code quality checks |
| `RUF` | Ruff-specific | Ruff-only rules |

---

## What Ruff Replaces

| Old Tool | Ruff Equivalent |
|----------|----------------|
| `black` | `ruff format` |
| `flake8` | `ruff check` (E, W, F rules) |
| `isort` | `ruff check --select I` |
| `bandit` | `ruff check --select S` |
| `pyupgrade` | `ruff check --select UP` |
| `pydocstyle` | `ruff check --select D` |
| `autoflake` | `ruff check --select F401,F841 --fix` |

---

## Bandit (When You Still Need It)

`bandit` is a dedicated Python security scanner. In this guide, default choice is Ruff `S` rules because they are faster and simpler to run in one tool.

Use standalone `bandit` when you need:
- explicit Bandit severity/confidence reporting in CI;
- exact parity with existing Bandit-only pipelines;
- extra checks not yet covered by Ruff `S` rules.

```bash
uv add --dev bandit
uv run bandit -r src
uv run bandit -r src -f json -o bandit-report.json
```

Practical rule:
- start with `ruff check --select S`;
- add `bandit` only if your security policy requires it.

---

## CI Usage

```bash
uv run ruff check . --output-format=github  # annotate PR diffs
uv run ruff format . --check                # fail if unformatted
```
