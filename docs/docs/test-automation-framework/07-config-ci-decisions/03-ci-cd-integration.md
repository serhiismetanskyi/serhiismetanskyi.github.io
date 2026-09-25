---
date: 2026-07-25
tags:
  - test-automation
  - architecture
  - ci-cd
---

# CI/CD Integration

## Pipeline Design Principles

Tests in CI must be:
- **Fast** — fast feedback prevents context switching
- **Reliable** — false positives kill trust in the pipeline
- **Informative** — failures must point to root cause immediately

---

## Pipeline Stages

```
Push / PR
    │
    ▼
[1] Lint & Type Check    (ruff, mypy) — ~30s
    │
    ▼
[2] Unit Tests           (-m unit, no I/O) — ~1 min
    │
    ▼
[3] Integration Tests    (-m integration) — ~3 min
    │
    ▼
[4] API Tests            (-m api) — ~5 min
    │
    ▼
[5] Smoke E2E            (-m smoke and e2e) — ~3 min
    │
    ▼
[6] Report & Publish     (Allure, coverage badge)
```

Each stage gates the next. Linting failures block all test stages.

---

## GitHub Actions Example


```yaml
name: Test Suite

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v3
      - run: uv run ruff check .
      - run: uv run mypy .

  unit-tests:
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v3
      - run: uv run pytest -m unit -n auto --junitxml=test-results/junit.xml
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: unit-test-results
          path: test-results/

  api-tests:
    needs: unit-tests
    runs-on: ubuntu-latest
    env:
      TEST_ENV: staging
      TEST_API_TOKEN: ${{ secrets.STAGING_API_TOKEN }}
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v3
      - run: |
          uv run pytest -m api -n auto \
            --timeout=60 \
            --reruns=2 \
            --junitxml=test-results/junit.xml \
            --alluredir=test-results/allure-results
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: api-test-results
          path: test-results/

  e2e-smoke:
    needs: api-tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v3
      - run: uv run playwright install chromium --with-deps
      - run: |
          uv run pytest -m "smoke and e2e" \
            --timeout=90 \
            --junitxml=test-results/e2e-junit.xml
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: e2e-results
          path: test-results/
```


---

## Quality Gates

Gates prevent merging code that degrades test quality.

| Gate | Threshold | Action on Fail |
|------|-----------|---------------|
| Test pass rate | 100% (excluding quarantined) | Block merge |
| Coverage | ≥ 90% (unit), ≥ 80% (integration) | Block merge |
| Flakiness reruns | ≤ 2% of total tests | Warning |
| E2E duration | ≤ 5 min for smoke suite | Warning |

### Security Gates

Add security gates as first-class pipeline checks (not optional reporting).

| Gate | Tool Example | Threshold | Action on Fail |
|------|--------------|-----------|----------------|
| Secret scanning | Gitleaks / TruffleHog | 0 leaked secrets | Block merge |
| Dependency vulnerabilities | pip-audit / OSV-Scanner / Trivy | 0 critical, 0 high in prod deps | Block merge |
| SAST | Semgrep / CodeQL | 0 critical findings | Block merge |
| SBOM generation | CycloneDX / Syft | SBOM artifact required | Block release |

```yaml
# Example security job (GitHub Actions)
security-gates:
  needs: lint
  runs-on: ubuntu-latest
  permissions:
    contents: read
    security-events: write
  steps:
    - uses: actions/checkout@v4
    - uses: astral-sh/setup-uv@v3
    - name: Secrets scan
      run: uv run gitleaks detect --source . --verbose
    - name: Dependency scan
      run: uv run pip-audit --strict
    - name: SAST scan
      run: uv run semgrep --config auto --error
    - name: Generate SBOM
      run: uv run cyclonedx-py environment --output-file test-results/sbom.json
    - uses: actions/upload-artifact@v4
      if: always()
      with:
        name: sbom
        path: test-results/sbom.json
```

### Coverage Gate

```bash
uv run pytest --cov=src --cov-fail-under=90 -m "unit or integration"
```

### Coverage Badge in README

```yaml
- name: Generate coverage badge
  run: |
    uv run coverage-badge -o coverage.svg -f
```

---

## Pre-Commit Integration

Catch issues before push — saves CI time:

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.4.0
    hooks:
      - id: ruff
      - id: ruff-format

  - repo: local
    hooks:
      - id: unit-tests
        name: Unit Tests
        entry: uv run pytest -m unit -q
        language: system
        pass_filenames: false
```

---

## Test Environment Provisioning

Tests are deterministic only when environments are deterministic.
Use ephemeral environments per PR and bootstrap them from code.

Guidelines:
- Create isolated preview environments for pull requests.
- Pin runtime versions (Python, browser, DB image, migration version).
- Apply migrations and seed baseline test data on each run.
- Reset test data per run (truncate/recreate schema or rollback snapshot).
- Destroy preview environments after pipeline completion.

```yaml
# Ephemeral environment sketch
preview-env:
  if: github.event_name == 'pull_request'
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: astral-sh/setup-uv@v3
    - name: Start stack
      run: docker compose -f docker-compose.test.yml up -d --wait
    - name: Bootstrap schema
      run: uv run alembic upgrade head
    - name: Seed deterministic baseline
      run: uv run python data/seed.py --env preview --deterministic
    - name: Run tests
      run: uv run pytest -m "integration or api"
    - name: Teardown stack
      if: always()
      run: docker compose -f docker-compose.test.yml down -v
```

---

## Test Impact Analysis (TIA)

Run only relevant tests for fast PR feedback, but keep a safe fallback policy.

Recommended policy:
- PR pipeline: run impacted unit/integration/API tests based on changed files.
- If mapping confidence is low, run full unit + integration suites.
- Always run smoke E2E for critical journeys.
- Nightly: run full regression suite regardless of change scope.

```bash
# Example: changed files -> impacted pytest marks
CHANGED_FILES=$(git diff --name-only origin/main...HEAD)
uv run python scripts/select_tests.py --changed "$CHANGED_FILES" > .impacted_marks
MARK_EXPR=$(cat .impacted_marks)

if [ -z "$MARK_EXPR" ]; then
  uv run pytest -m "unit or integration" -n auto
else
  uv run pytest -m "$MARK_EXPR" -n auto
fi
```

Fallback triggers (force broader run):
- Changes in `framework/`, `conftest.py`, shared fixtures, auth, or DB migrations.
- Changes touching selectors/page objects used across multiple flows.
- Any flaky or unstable impacted subset in two consecutive runs.

---

## Nightly Full Suite


```yaml
name: Nightly Full Regression

on:
  schedule:
    - cron: "0 2 * * *"  # 02:00 UTC daily

jobs:
  full-regression:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v3
      - run: uv run playwright install --with-deps
      - run: |
          uv run pytest -n auto \
            --timeout=120 \
            --reruns=1 \
            --alluredir=test-results/allure
      - name: Notify on failure
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          payload: '{"text":"Nightly regression failed: ${{ github.run_url }}"}'
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

