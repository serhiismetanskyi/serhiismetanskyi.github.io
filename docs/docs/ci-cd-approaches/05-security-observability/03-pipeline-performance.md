---
date: 2026-08-30
tags:
  - ci-cd
  - devops
  - security
  - observability
---

# Pipeline Performance & Optimisation

## Why Pipeline Speed Matters

A 30-minute pipeline discourages small commits. Developers batch changes to avoid waiting.
Batched changes = larger PRs = harder reviews = more bugs.

Target: **main branch pipeline under 10 minutes**.

---

## Parallelisation

### Parallel Jobs

Jobs without dependencies run simultaneously:

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - run: uv run ruff check .

  type-check:
    runs-on: ubuntu-latest
    steps:
      - run: uv run mypy .

  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - run: uv run pytest -m unit -n auto

  # All three above run in parallel
  integration-tests:
    needs: [lint, type-check, unit-tests]  # gates wait for all three
    runs-on: ubuntu-latest
    steps:
      - run: uv run pytest -m integration -n auto
```

### Parallel Test Workers

```yaml
- run: uv run pytest -n auto  # uses all available CPU cores
```

`-n auto` detects CPU count and spawns that many workers. For a 4-core runner: 4x speedup.

### Test Matrix Sharding

Split test suite across multiple parallel runners:


```yaml
strategy:
  matrix:
    shard: [1, 2, 3, 4]

steps:
  - run: |
      uv run pytest \
        --shard-id=${{ matrix.shard }} \
        --num-shards=4 \
        -n auto
```


4 runners × 4 workers each = 16× parallelism for the test stage.

---

## Caching

### Dependency Cache


```yaml
- uses: actions/cache@v4
  with:
    path: ~/.cache/uv
    key: uv-${{ runner.os }}-${{ hashFiles('uv.lock') }}
    restore-keys: uv-${{ runner.os }}-
```


Impact: `uv sync` goes from 60s → 2s on cache hit.

### Docker Layer Cache

```yaml
- uses: docker/build-push-action@v5
  with:
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

Docker layer cache: rebuilding an image after a code-only change skips all dependency layers.
Full rebuild: 90s. Cache hit (code change only): 15s.

### Build Output Cache


```yaml
- uses: actions/cache@v4
  with:
    path: .mypy_cache
    key: mypy-${{ hashFiles('src/**/*.py') }}
```


Mypy caches type check results. Re-checking unchanged files: milliseconds.

---

## Selective Execution (Path Filtering)

Only run pipelines when relevant files change:

```yaml
on:
  push:
    paths:
      - 'src/**'
      - 'tests/**'
      - 'pyproject.toml'
      - 'uv.lock'
      - '.github/workflows/**'
```

Changing `README.md` does not trigger the full test pipeline.

For monorepos, run per-service pipelines:

```yaml
on:
  push:
    paths:
      - 'services/orders/**'
      - 'shared/models/**'
```

---

## Pipeline Duration Targets

| Stage | Target | Tools |
|-------|--------|-------|
| Lint + type check | < 1 min | ruff, mypy with cache |
| Unit tests | < 2 min | pytest -n auto |
| Integration tests | < 5 min | pytest -n auto + services in Docker |
| Build Docker image | < 3 min | Layer cache |
| API tests (staging) | < 5 min | pytest -n auto |
| E2E smoke | < 3 min | playwright, 10–15 tests max |
| **Total PR pipeline** | **< 10 min** | |
| **Total deploy pipeline** | **< 15 min** | |

---

## Pipeline Metrics to Track


```yaml
- name: Annotate with timing
  if: always()
  run: |
    echo "Stage completed in ${{ steps.tests.outputs.duration }}s"
    echo "Cache hit: ${{ steps.cache.outputs.cache-hit }}"
```


Run a weekly review: which stage is slowest? What is its trend?
A stage that grew from 2min → 8min over three months needs attention.
