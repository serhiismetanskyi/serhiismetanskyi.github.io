---
date: 2026-08-19
tags:
  - python
  - ci-cd
  - code-quality
---

# Dependency Management

Managing dependencies correctly makes your project reproducible and safe.

---

## Virtual Environments

A virtual environment is an isolated Python installation for your project.

### Why Use Virtual Environments?

- Projects do not **interfere** with each other
- You control **exact versions** of every package
- Easy to **recreate** the same environment on any machine

### Create with uv

```bash
uv venv
source .venv/bin/activate  # Linux/Mac
```

!!! warning "Never install packages globally"
    Always use a virtual environment. Global installations cause version conflicts.

---

## pyproject.toml

The central configuration file for modern Python projects:

```toml
[project]
name = "my-test-project"
version = "1.0.0"
description = "Test automation project"
requires-python = ">=3.12"
dependencies = [
    "requests>=2.32.0",
    "pydantic>=2.9.0",
    "pytest>=8.3.0",
]

[project.optional-dependencies]
dev = [
    "ruff>=0.8.0",
    "mypy>=1.13.0",
    "pytest-cov>=6.0.0",
    "pre-commit>=4.0.0",
]
```

---

## Managing Dependencies with uv

### Add a Dependency

```bash
uv add requests         # production dependency
uv add --dev ruff mypy  # development dependency
```

### Remove a Dependency

```bash
uv remove requests
```

### Update Dependencies

```bash
uv lock --upgrade           # update all
uv lock --upgrade-package requests  # update one
```

### Install All Dependencies

```bash
uv sync         # install production + dev
uv sync --no-dev  # install production only
```

---

## Lockfile (uv.lock)

The lockfile pins **exact versions** of every package (including transitive dependencies).

| Without Lockfile | With Lockfile |
|-----------------|---------------|
| Different versions on different machines | Same versions everywhere |
| "Works on my machine" problems | Reproducible builds |
| Unexpected updates can break things | Controlled updates |

### Rules

- **Always** commit `uv.lock` to Git
- **Never** commit `.venv/` folder
- **Never** edit `uv.lock` manually

---

## .gitignore for Python

```gitignore
.venv/
__pycache__/
*.pyc
.mypy_cache/
.ruff_cache/
.pytest_cache/
htmlcov/
dist/
*.egg-info/
.env
```

---

## Version Pinning

| Syntax | Meaning | Example |
|--------|---------|---------|
| `>=2.0` | At least 2.0 | `requests>=2.32.0` |
| `>=2.0,<3.0` | 2.x only | `pydantic>=2.9.0,<3.0` |
| `~=2.32` | Compatible release | `requests~=2.32.0` |

!!! tip "Use >= for most dependencies"
    The lockfile handles exact pinning. In `pyproject.toml`, use flexible ranges.

---

## Python Version Management

uv can also manage Python versions:

```bash
uv python install 3.12   # install Python 3.12
uv python list            # list available versions
uv python pin 3.12        # set project Python version
```

---

## Best Practices

- **Always** use virtual environments
- Use **`uv`** for dependency management (fast, modern)
- **Commit** `uv.lock` to version control
- **Never** commit `.venv/`
- Keep `pyproject.toml` as the **single source** of project configuration
- **Update** dependencies regularly but carefully
- Use **separate** dev dependencies for development tools
- Set **`requires-python`** to specify minimum Python version
