---
date: 2026-09-10
tags:
  - python
  - libraries
  - code-quality
---

# Static Analysis — mypy, Pyright, wemake-python-styleguide

## mypy — Static Type Checker (CI Standard)

```bash
uv add --dev mypy
uv run mypy .
uv run mypy src/ --strict
```

### Configuration

```toml
[tool.mypy]
python_version = "3.12"
strict = true
warn_return_any = true
warn_unused_configs = true
disallow_untyped_defs = true
disallow_any_generics = true
no_implicit_reexport = true

[[tool.mypy.overrides]]
module = ["tests.*"]
disallow_untyped_defs = false
```

### Common Type Stubs

```bash
uv add --dev types-requests types-PyYAML types-redis types-toml
```

### Useful Flags

| Flag | Purpose |
|------|---------|
| `--strict` | Enable all strict checks |
| `--ignore-missing-imports` | Skip untyped third-party libs |
| `--show-error-codes` | Show error codes like `[arg-type]` |
| `--no-implicit-optional` | `None` must be explicit in `Optional` |
| `--warn-unreachable` | Detect dead code after `return`/`raise` |

---

## Pyright — IDE Type Checker (Real-Time)

Best for VS Code / Pylance integration with very fast feedback and solid type inference.

### Install (Standalone)

```bash
uv add --dev pyright
uv run pyright
```

### Configuration (`pyproject.toml`)

```toml
[tool.pyright]
pythonVersion = "3.12"
typeCheckingMode = "strict"
reportMissingTypeStubs = "warning"
reportUnusedImport = "error"
```

### mypy vs Pyright

| | mypy | Pyright |
|-|------|---------|
| Speed | Slower (daemon helps) | Usually faster on large projects |
| Conformance | Mature and stable | Very good typing-spec support |
| IDE integration | Basic | Excellent (Pylance) |
| Plugin ecosystem | SQLAlchemy, Django, Pydantic | Limited |
| Best for | CI pipelines | IDE real-time feedback |

**Best practice:** Use both — Pyright in IDE, mypy in CI.

---

## wemake-python-styleguide — Strictest Linter

Flake8 plugin with strict WPS rules. Complements Ruff with additional constraints.

### Install

```bash
uv add --dev wemake-python-styleguide flake8
```

### Run

```bash
uv run flake8 . --select=WPS     # only WPS rules (Ruff handles the rest)
```

### Configuration (`setup.cfg`)

```ini
[flake8]
select = WPS
max-line-length = 100
max-cognitive-score = 12
max-function-score = 8
max-module-members = 10
max-local-variables = 8
max-returns = 5

per-file-ignores =
    tests/*.py: WPS226, WPS432
```

### What WPS Commonly Catches

| Rule | Example |
|------|---------|
| WPS110 | Wrong variable name (`data`, `item`, `info`) |
| WPS125 | Builtin shadowing (`list = [1, 2]`) |
| WPS226 | String constant overuse |
| WPS231 | Too high cognitive complexity |
| WPS432 | Magic number in code |

### Workflow: Ruff + WPS Together

```bash
uv run ruff check . --fix && uv run ruff format .
uv run flake8 . --select=WPS
uv run mypy .
```

Ruff handles speed-critical linting + formatting; WPS adds strictness layer on top.
