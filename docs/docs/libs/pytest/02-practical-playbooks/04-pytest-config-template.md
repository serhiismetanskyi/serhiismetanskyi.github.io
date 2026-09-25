---
date: 2026-09-21
tags:
  - python
  - libraries
  - pytest
  - testing
---

# Pytest Playbook — Config Template

Production-ready `pyproject.toml` baseline for Python projects.

## Template

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]                          # where pytest looks for tests
python_files = ["test_*.py", "*_test.py"]      # file discovery patterns
addopts = "-ra -q --strict-markers --strict-config --maxfail=1"
markers = [
  "unit: fast isolated tests",
  "integration: tests with DB or external systems",
  "slow: long-running tests",
]
filterwarnings = ["error"]                     # treat warnings as errors
xfail_strict = true                            # xfail tests that pass unexpectedly become failures
asyncio_mode = "auto"                          # skip @pytest.mark.asyncio marker

[tool.coverage.run]
source = ["src"]
branch = true                                  # measure branch coverage

[tool.coverage.report]
show_missing = true
fail_under = 100                               # enforce 100% coverage
exclude_lines = [
  "if TYPE_CHECKING:",                         # type-only imports
  "if __name__ == .__main__.:",                # script guards
]
```

## Why These Defaults

| Flag | Reason |
|------|--------|
| `--strict-markers` | Rejects unregistered markers — catches typos |
| `--strict-config` | Fails on unknown config keys — prevents silent misconfiguration |
| `--maxfail=1` | Stops early for faster local feedback |
| `-ra` | Shows summary of all non-passed tests |
| `-q` | Quiet output — less noise |
| `filterwarnings = ["error"]` | Catches deprecation warnings before they become errors |
| `xfail_strict = true` | xfail tests that unexpectedly pass become failures |
| `fail_under = 100` | Prevents coverage regression |

## Local vs CI

```bash
# local: fast feedback loop
pytest -x --lf -q

# CI: full quality gate
pytest -n auto --cov=src --cov-report=term-missing --cov-fail-under=100
```

## Marker Strategy

| Marker | When to run |
|--------|-------------|
| `unit` | Every PR check |
| `integration` | Dedicated CI job with services |
| `slow` | Nightly |

```bash
pytest -m "unit and not slow"
pytest -m integration
```

## Recommended Plugin Set

```bash
uv add --dev pytest pytest-cov pytest-xdist pytest-asyncio pytest-mock pytest-randomly
```

## Config Review Checklist

- All custom markers registered and actively used.
- Coverage threshold matches team policy.
- Async mode configured if async code exists.
- No legacy `setup.cfg` / `pytest.ini` conflicts.
- `filterwarnings` set to `["error"]`.
