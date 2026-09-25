---
date: 2026-08-27
tags:
  - ci-cd
  - devops
---

# Build Stage

## What the Build Stage Does

The build stage transforms source code into a deployable artifact.
It must be **fast**, **deterministic**, and **reproducible**.

Same code + same dependencies = same output. Always.

---

## Build Process Steps

### 1. Dependency Installation

Install all project dependencies. Cache aggressively — this is the slowest step.


```yaml
# GitHub Actions — Python with uv
- uses: actions/cache@v4
  with:
    path: ~/.cache/uv
    key: uv-${{ hashFiles('uv.lock') }}

- run: uv sync --frozen
```


`--frozen` ensures the exact lockfile is used. No silent upgrades in CI.

### 2. Compilation / Transpilation

For compiled languages (Go, Rust, C++), the build stage produces a binary. Python skips compilation but still validates the package:

```yaml
# Python — validate package builds correctly
- run: uv build                    # build wheel + sdist
- run: uv run python -c "import myapp"  # verify importability
```

### 3. Linting & Type Checking

Fast static analysis catches issues before running tests.

```yaml
- run: uv run ruff check .         # lint
- run: uv run ruff format --check  # format check
- run: uv run mypy .               # type check
```

Fail here before wasting test compute on fundamentally broken code.

---

## Caching Strategy

Caching dependencies is the single most effective build optimisation.

| What to Cache | Cache Key |
|--------------|----------|
| Python packages (uv) | `hash(uv.lock)` |
| Python packages (pip) | `hash(requirements.txt)` |
| Docker layer cache | Layer hash |
| Go modules | `hash(go.sum)` |


```yaml
- uses: actions/cache@v4
  with:
    path: |
      ~/.cache/uv
      ~/.cache/pip
    key: deps-${{ runner.os }}-${{ hashFiles('uv.lock') }}
    restore-keys: |
      deps-${{ runner.os }}-
```


`restore-keys` provides a fallback: if the exact key misses, use the most recent partial match.

---

## Incremental Builds

Only rebuild what changed. For monorepos:

```yaml
# Use paths filter — only run service A pipeline when service A changes
on:
  push:
    paths:
      - 'services/service-a/**'
      - 'shared/utils/**'
```

For Docker:
- Layer caching ensures only changed layers rebuild
- Multi-stage builds minimise the final image size

---

## Docker Build in CI


```yaml
- name: Build Docker image
  uses: docker/build-push-action@v5
  with:
    context: .
    push: true
    tags: |
      ghcr.io/${{ github.repository }}:${{ github.sha }}
      ghcr.io/${{ github.repository }}:latest
    cache-from: type=gha
    cache-to: type=gha,mode=max
```


`type=gha` uses GitHub Actions cache for Docker layers. Typically cuts build time by 60–80%.

---

## Build Reproducibility

A build is reproducible when:
- Dependency versions are pinned (`uv.lock`, `Cargo.lock`, `go.sum`)
- Base Docker image is pinned by digest, not tag
- No network calls during build (dependencies pre-installed)
- Timestamps and random values are not embedded in artifacts

```dockerfile
# Pinned by digest — immune to tag mutation
FROM python:3.12-slim@sha256:abc123...

WORKDIR /app
COPY uv.lock pyproject.toml ./
RUN uv sync --frozen --no-dev

COPY src/ ./src/
```
