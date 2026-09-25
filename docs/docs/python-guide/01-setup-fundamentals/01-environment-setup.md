---
date: 2026-08-14
tags:
  - python
---

# Environment Setup

This page explains how to set up a Python project using `uv` — a modern, fast package manager.

---

## What Is uv?

`uv` is a Python package manager made by Astral. It replaces `pip`, `venv`, and `pip-tools` with one fast tool.

**Why use uv?**

- 10-100x faster than `pip`
- Creates virtual environments automatically
- Manages Python versions
- Generates lockfiles for reproducible builds

---

## Install uv

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Check the installation:

```bash
uv --version
```

---

## Create a New Project

```bash
uv init my-project
cd my-project
```

This creates:

```
my-project/
├── pyproject.toml
├── README.md
└── hello.py
```

---

## Virtual Environment

Create and activate a virtual environment:

```bash
uv venv
source .venv/bin/activate
```

!!! tip "Always use virtual environments"
    Never install packages globally. Each project should have its own `.venv/` folder.

---

## Add Dependencies

```bash
uv add pytest requests httpx pydantic
```

Add development-only dependencies:

```bash
uv add --dev ruff mypy pytest-cov
```

---

## Run Scripts

```bash
uv run python hello.py
uv run pytest
```

---

## Lockfile

`uv` creates a `uv.lock` file. This file pins exact versions of all packages.

| File | Commit to Git? |
|------|---------------|
| `pyproject.toml` | Yes |
| `uv.lock` | Yes |
| `.venv/` | No — add to `.gitignore` |

---

## Project Structure Example

```
my-project/
├── .venv/
├── src/
│   └── my_project/
│       └── __init__.py
├── tests/
│   └── test_example.py
├── pyproject.toml
├── uv.lock
└── .gitignore
```

---

## Best Practices

- **Always** use isolated virtual environments
- **Commit** `uv.lock` for consistent builds across machines
- **Never** commit `.venv/` folder
- **Use** `uv run` to execute scripts inside the virtual environment
- **Pin** Python version in `pyproject.toml`

---

## Quick Reference

| Command | What It Does |
|---------|-------------|
| `uv init project` | Create a new project |
| `uv venv` | Create virtual environment |
| `uv add package` | Install a package |
| `uv add --dev package` | Install dev dependency |
| `uv run command` | Run command in venv |
| `uv sync` | Install all dependencies from lockfile |
| `uv lock` | Update the lockfile |
