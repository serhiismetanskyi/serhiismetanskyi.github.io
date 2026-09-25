---
date: 2026-09-24
tags:
  - python
  - libraries
  - uv
---

# uv — Projects & Dependencies

## Create Project

```bash
uv init my-api              # new directory
uv init                     # current directory
uv init --lib my-lib        # library (src/ layout)
uv init --app my-app        # application (flat layout)
```

---

## pyproject.toml

```toml
[project]
name = "my-api"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = ["fastapi>=0.115", "httpx>=0.28"]

[dependency-groups]
dev = ["ruff>=0.11", "mypy>=1.15", "pytest>=8.3"]
test = ["pytest-cov>=6.1"]
```

| Section | Purpose |
|---------|---------|
| `dependencies` | Runtime deps |
| `[dependency-groups]` | Dev/test groups (not shipped) |
| `optional-dependencies` | Published extras |
| `[tool.uv.sources]` | Git, path, workspace overrides |

---

## Add / Remove

```bash
uv add httpx                      # runtime dep
uv add "httpx>=0.28,<1.0"        # with constraint
uv add --dev ruff mypy            # dev group
uv add --group test pytest-cov    # named group
uv add git+https://github.com/org/repo@v2.0   # git
uv add ./libs/my-lib              # local path

uv remove httpx
uv remove --dev ruff
```

---

## Lock & Sync

```bash
uv lock                          # resolve → uv.lock
uv lock --upgrade                # upgrade all
uv lock --upgrade-package httpx  # upgrade one

uv sync                          # install from lockfile
uv sync --locked                 # CI strict: fail if lockfile is outdated
uv sync --frozen                 # use lockfile as-is (skip freshness check)
uv sync --no-dev                 # production only
uv sync --all-groups             # all groups
```

`uv add` auto-runs lock + sync.

| Flag | Behavior |
|------|----------|
| `--locked` | Error if `uv.lock` is out of date vs `pyproject.toml` |
| `--frozen` | Use `uv.lock` without checking if it is up to date |

---

## Tree & Export

```bash
uv tree                          # dependency tree
uv tree --invert --package httpx # who depends on httpx?
uv export --format requirements.txt --no-dev  # → requirements.txt
```

---

## Version Constraints

| Spec | Meaning |
|------|---------|
| `>=1.0` | 1.0 or newer |
| `>=1.0,<2.0` | Range |
| `~=1.4` | `>=1.4,<2.0` |
| `==1.4.2` | Exact |

---

## Private Indexes & Auth (Quick)

```toml
# pyproject.toml
[[tool.uv.index]]
name = "internal"
url = "https://pypi.company.example/simple"
```

```bash
uv add --index internal my-private-package
uv auth login https://pypi.company.example/simple
```

Prefer named indexes + `uv auth` over embedding credentials in URLs.
