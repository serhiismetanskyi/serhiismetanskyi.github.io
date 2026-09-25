---
date: 2026-09-11
tags:
  - python
  - libraries
  - code-quality
---

# Pre-Commit Hooks

Run linters, formatters, and type checkers automatically on every `git commit` — and heavier checks, such as tests, on `git push`.

## Install

```bash
uv add --dev pre-commit
uv run pre-commit install           # activate hooks in repo
uv run pre-commit run --all-files   # manual run on everything
```

---

## `.pre-commit-config.yaml`

```yaml
repos:
  # --- General file hygiene ---
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
      - id: check-merge-conflict

  # --- Ruff (lint → format) ---
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.15.8
    hooks:
      - id: ruff-check
        args: [--fix]
      - id: ruff-format

  # --- mypy ---
  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.15.0
    hooks:
      - id: mypy
        additional_dependencies:
          - types-requests
          - types-PyYAML
          - pydantic

  # --- wemake-python-styleguide ---
  - repo: https://github.com/PyCQA/flake8
    rev: "7.3.0"
    hooks:
      - id: flake8
        args: [--select=WPS]
        additional_dependencies:
          - wemake-python-styleguide
```

---

## Hook Ordering Rules

1. **`ruff-check --fix`** first — auto-fixes imports, unused vars, etc.
2. **`ruff-format`** second — reformats code after linter changes.
3. **`mypy`** third — type-checks the clean code.
4. **`flake8 --select=WPS`** last — strictness layer.

---

## Pre-Push Hooks

Git also runs a **`pre-push`** hook — right before `git push` sends commits to the remote.
The pre-commit framework manages it the same way: one config, different **stages**.

| Stage | Runs on | Put here | Time budget |
|-------|---------|----------|-------------|
| `pre-commit` | `git commit` | Formatting, linting, file hygiene — changed files only | Seconds |
| `pre-push` | `git push` | Unit tests, full type check, secret scan, branch rules | Up to a minute |

### Enable both stages

Tell pre-commit which hook types `pre-commit install` should set up, and keep existing hooks on the commit stage:

```yaml
# .pre-commit-config.yaml (top level)
default_install_hook_types: [pre-commit, pre-push]
default_stages: [pre-commit]   # hooks without `stages` run only on commit
```

```bash
uv run pre-commit install                        # installs both hooks from default_install_hook_types
uv run pre-commit install --hook-type pre-push   # alternative: add only the pre-push hook
```

!!! warning "Without `default_stages`"
    Hooks that don't declare `stages` run at **every installed stage**. After installing `pre-push`,
    Ruff, mypy and the rest would run a second time on every push.

### Pre-push hooks

```yaml
  # --- Checks before push ---
  - repo: local
    hooks:
      - id: pytest
        name: pytest (fast unit tests)
        entry: uv run pytest -q -m "not slow"
        language: system
        pass_filenames: false
        stages: [pre-push]

      - id: no-push-to-main
        name: block direct push to main
        entry: bash -c '[ "$(git rev-parse --abbrev-ref HEAD)" != "main" ] || { echo "Push to main is not allowed, open a PR"; exit 1; }'
        language: system
        pass_filenames: false
        always_run: true
        stages: [pre-push]
```

Existing hooks can move to push too — e.g. a slow full-project mypy run:

```yaml
      - id: mypy
        stages: [pre-push]
```

### Run and skip

```bash
uv run pre-commit run --hook-stage pre-push --all-files   # run pre-push hooks manually
git push --no-verify                                      # skip pre-push hooks once
```

Like `pre-commit`, the `pre-push` hook is client-side and can be skipped — CI remains the real gate.

---

## Key Commands

```bash
uv run pre-commit run --all-files     # check all files
uv run pre-commit autoupdate          # update hook versions
uv run pre-commit run ruff-check      # run single hook
SKIP=mypy git commit -m "wip"         # skip specific hook once
```

---

## CI Integration (GitHub Actions)

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: astral-sh/setup-uv@v5
    with:
      enable-cache: true
  - run: uv sync --locked
  - run: uv run pre-commit run --all-files
```

---

## Common Issues

| Problem | Fix |
|---------|-----|
| mypy can't find third-party types | Add stubs to `additional_dependencies` |
| Hook fails on generated files | Add `exclude` pattern to the hook |
| Slow mypy in pre-commit | Use `pass_filenames: false` + `--incremental` |
| Ruff version mismatch | Pin same version in `.pre-commit-config.yaml` and `pyproject.toml` |

---

## Skip vs Commit Hooks in CI

| Strategy | Pre-commit | Pre-push | CI Pipeline |
|----------|-----------|----------|-------------|
| Purpose | Catch issues before commit (dev machine) | Catch failing tests before sharing (dev machine) | Gate before merge (server) |
| Speed | Must be fast (seconds) | Moderate (up to a minute) | Can be thorough (minutes) |
| Scope | Changed files only | Fast tests, full-project checks | Full repo, all tests |
| Can be skipped | Yes (`--no-verify`) | Yes (`--no-verify`) | No |

Run the same tools everywhere; pre-commit catches early, pre-push stops broken pushes, CI catches everything.
