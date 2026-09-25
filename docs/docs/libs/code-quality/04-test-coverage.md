---
date: 2026-09-11
tags:
  - python
  - libraries
  - code-quality
  - rag
---

# Test Coverage — Measurement, Enforcement, Mutation Testing

## pytest-cov + coverage.py

`pytest-cov` is the pytest plugin that wraps `coverage.py` for seamless integration.

### Install

```bash
uv add --dev pytest-cov
```

### Commands

```bash
uv run pytest --cov=src                           # line coverage
uv run pytest --cov=src --cov-branch              # + branch coverage
uv run pytest --cov=src --cov-fail-under=100      # fail if < 100%
uv run pytest --cov=src --cov-report=html         # HTML report → htmlcov/
uv run pytest --cov=src --cov-report=term-missing # show uncovered lines
uv run pytest --cov=src --cov-report=xml          # Cobertura XML (CI)
```

---

## Configuration (`pyproject.toml`)

```toml
[tool.coverage.run]
source = ["src"]
branch = true
omit = ["*/migrations/*", "*/conftest.py"]

[tool.coverage.report]
show_missing = true
fail_under = 100
exclude_lines = [
    "if TYPE_CHECKING:",
    "if __name__",
    "@overload",
    "raise NotImplementedError",
]

[tool.coverage.html]
directory = "htmlcov"
```

---

## Line vs Branch Coverage

| Type | What it measures | Catches |
|------|-----------------|---------|
| Line | Which lines executed | Basic dead code |
| Branch | Every `if/else/for/while` path | Missed edge conditions |

Always use `branch = true`. Line-only coverage misses cases like `if x: return` when `x` is always truthy.

---

## CI Enforcement

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: astral-sh/setup-uv@v5
    with:
      enable-cache: true
  - run: uv sync --locked
  - run: uv run pytest --cov=src --cov-branch --cov-fail-under=100 --cov-report=xml
  - uses: codecov/codecov-action@v5
    with:
      files: coverage.xml
```

---

## Coverage Is Not Enough

High line coverage does not mean good tests. A test can execute code without asserting anything useful.

```python
def test_bad_coverage():
    result = calculate_price(100, 0.2)
    # 100% coverage — 0% value (no assertion!)

def test_good_coverage():
    result = calculate_price(100, 0.2)
    assert result == 80.0
```

---

## Mutation Testing

Introduces small code changes (mutants) and checks if tests catch them. If a mutant survives — the test is weak.

### pytest-gremlins (Recommended)

```bash
uv add --dev pytest-gremlins
uv run pytest --gremlins src/pricing.py
```

Fast: mutation switching (no file rewrites), coverage-guided selection, incremental caching.

### cosmic-ray (Alternative)

```bash
uv add --dev cosmic-ray
uv run cosmic-ray init config.toml src/
uv run cosmic-ray exec config.toml
uv run cr-report config.toml
```

Better for large codebases; supports parallel workers.

### When to Use Mutation Testing

| Scenario | Use it? |
|----------|---------|
| Critical business logic (pricing, auth) | Yes |
| Simple CRUD / glue code | No (diminishing returns) |
| CI on every push | No (too slow) |
| Nightly / weekly CI job | Yes |

---

## Coverage Reporting Tools

| Tool | Format | Use case |
|------|--------|----------|
| `--cov-report=term-missing` | Terminal | Local dev |
| `--cov-report=html` | HTML (`htmlcov/`) | Visual inspection |
| `--cov-report=xml` | Cobertura XML | CI / Codecov / SonarQube |
| `--cov-report=json` | JSON | Custom tooling |
| `--cov-report=lcov` | LCOV | IDE integrations |
