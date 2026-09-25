---
date: 2026-08-27
tags:
  - ci-cd
  - devops
  - testing
---

# Testing in CI/CD — Layers & Strategy

## Test Layers in the Pipeline

Each test layer has different speed, coverage, and placement in the pipeline.

```
┌──────────────────────────────────────────────────────┐
│                   CI Pipeline                        │
│                                                      │
│  [Lint] → [Unit] → [Integration] → [API] → [E2E]    │
│    30s      1min       3min          5min    5min    │
│                                                      │
└──────────────────────────────────────────────────────┘
```

Fail fast: cheapest checks run first.

---

## Unit Tests

**When:** every commit, every PR.
**Speed:** < 2 minutes for 1000+ tests.
**Rule:** no I/O — no DB, no HTTP, no filesystem.

```yaml
- name: Unit tests
  run: uv run pytest -m unit -n auto --tb=short
```

Unit tests failing = code is broken. Stop the pipeline here.

---

## Integration Tests

**When:** after unit tests pass, on PR and main branch.
**Speed:** 3–5 minutes.
**Rule:** real DB and services, no external third parties.

```yaml
services:
  postgres:
    image: postgres:16
    env:
      POSTGRES_PASSWORD: test
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5

steps:
  - name: Integration tests
    run: uv run pytest -m integration -n auto
    env:
      DB_HOST: localhost
      DB_PORT: 5432
```

---

## API Tests

**When:** after deployment to staging.
**Speed:** 5–10 minutes.
**Rule:** tests run against the deployed service, not mocks.


```yaml
- name: API tests
  run: uv run pytest -m api -n auto --timeout=60
  env:
    TEST_ENV: staging
    TEST_BASE_URL: ${{ vars.STAGING_URL }}
    TEST_API_TOKEN: ${{ secrets.STAGING_API_TOKEN }}
```


---

## E2E Tests

**When:** after API tests pass on staging, before production deploy.
**Speed:** 5–10 minutes (smoke only in pipeline).
**Rule:** only critical user journeys. Minimum count, maximum value.

```yaml
- name: E2E smoke tests
  run: |
    uv run playwright install chromium --with-deps
    uv run pytest -m "smoke and e2e" --timeout=90
```

---

## Contract Tests

**When:** on PR, before integration tests, in microservices architectures.
**Speed:** < 1 minute per service pair.
**Rule:** verify API contract between consumer and provider without running both services.

```yaml
- name: Contract tests (Pact)
  run: |
    uv run pytest -m contract
    uv run pact-verifier --provider-base-url=http://localhost:8000
```

Contract tests prevent the "provider changed the API, consumer broke in production" failure mode.

---

## Parallel Execution

Parallelise both jobs and test runners:

```yaml
test:
  strategy:
    matrix:
      python-version: ["3.12", "3.13"]
  steps:
    - run: uv run pytest -n auto   # parallel within each matrix job
```

For large suites, shard tests across workers:


```yaml
test:
  strategy:
    matrix:
      shard: [1, 2, 3, 4]
  steps:
    - run: |
        uv run pytest -n auto \
          --shard-id=${{ matrix.shard }} \
          --num-shards=4
```


---

## Selective Execution

Run different test subsets depending on trigger:

| Trigger | Tests |
|---------|-------|
| PR | lint + unit + integration |
| Merge to main | + API tests on staging |
| Before production deploy | + E2E smoke |
| Nightly schedule | Full regression including slow tests |


```yaml
- name: Run tests
  run: |
    if [[ "${{ github.event_name }}" == "pull_request" ]]; then
      uv run pytest -m "unit or integration" -n auto
    else
      uv run pytest -m "not slow" -n auto
    fi
```

