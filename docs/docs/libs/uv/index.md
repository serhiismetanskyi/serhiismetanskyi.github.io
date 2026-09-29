---
date: 2026-09-24
tags:
  - python
  - libraries
  - uv
---

# uv — Fast Python Project Manager

Rust-based tool that replaces pip, poetry, pyenv, pipx, virtualenv, twine. 10–100x faster than pip.

## Installation

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
brew install uv
```

## What uv Replaces

| Old | uv |
|-----|-----|
| `pip install` | `uv add` |
| `pip-compile` | `uv lock` |
| `pip-sync` | `uv sync` |
| `python -m venv` | `uv venv` |
| `pyenv install` | `uv python install` |
| `pipx run` | `uvx` |
| `poetry build` | `uv build` |
| `twine upload` | `uv publish` |

## Section Map

| File | Topics |
|------|--------|
| [01 Projects & Deps](./01-projects-dependencies.md) | init, add/remove, lock/sync, pyproject.toml |
| [02 Scripts & Tools](./02-scripts-tools.md) | uv run, inline scripts, uvx, uv tool install |
| [03 Python & Envs](./03-python-environments.md) | Python versions, pinning, venvs |
| [04 Workspaces & Docker](./04-workspaces-docker.md) | Monorepo, Docker, CI, env vars |
| [05 Build & Publish](./05-build-publish.md) | uv build, uv publish, versioning |

## Quick Start

```bash
uv init my-project && cd my-project
uv add httpx
uv run python -c "import httpx; print(httpx.__version__)"
```

## Core Workflow

```
uv init  →  uv add  →  uv run  →  uv lock  →  uv sync
```

## Quick Rules

1. `uv add` keeps `pyproject.toml` + lockfile in sync automatically.
2. `uv run` auto-creates venv and syncs deps before running.
3. Commit `uv.lock` for reproducible installs.
4. `uvx ruff check .` — run tools without global install.
5. `uv python pin 3.13` — pin Python version per project.
6. `uv sync --frozen` in CI — no re-resolution.

---
## See also
- [Digital Garden: Knowledge Base](../../index.md)
- [Python Guide for Automation QA](../../python-guide/index.md)
- [Test Automation Framework](../../test-automation-framework/index.md)
- [CI/CD](../../ci-cd-approaches/index.md)
- [Tools — Practical Reference Guides](../../tools/index.md)
- [Python Libraries](../index.md)
