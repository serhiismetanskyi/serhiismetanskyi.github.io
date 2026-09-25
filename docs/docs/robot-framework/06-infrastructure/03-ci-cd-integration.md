---
date: 2026-08-01
tags:
  - robot-framework
  - test-automation
  - ci-cd
---

# CI/CD Integration

Pipelines should give **fast confidence** on every change and **deeper coverage** on a schedule, without hiding failures behind slow jobs or missing artifacts.

## Pipeline design principles

| Principle | What to do |
|-----------|------------|
| Fast feedback | Run **smoke** tests on every push (small, stable tag set). |
| Full regression | Run broad suites **nightly** or on merge to default branch. |
| Fail fast | Stop the pipeline when critical suites fail; avoid burning minutes on dependent steps. |
| Consistent environment | Same Python/Robot/library versions as local (pin deps; consider Docker). |

## GitHub Actions example

Minimal workflow: checkout, Python, install Robot + libraries, run tests, upload reports.

```yaml
name: Robot Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: uv sync
      - run: robot --outputdir results tests/
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-results
          path: results/
```

Pin versions in real projects (`robotframework==7.4.2`, etc.) and inject secrets with `env:` from `${{ secrets.NAME }}`—never print them.

## Parallel execution with `pabot`

Split by suite or test for shorter wall time:

```bash
pabot --processes 4 --outputdir results tests/
```

Merge outputs for a single report when needed:

```bash
rebot --name Combined --outputdir merged results/output*.xml
```

## Artifact management

| Artifact | Why upload |
|----------|------------|
| `log.html` / `report.html` | Human triage without re-run |
| Screenshots / traces | UI failure analysis |
| `output.xml` | `rebot`, custom dashboards, replay |
| `xunit.xml` | CI test tab integration |

Use `if: always()` on upload steps so failed runs still publish logs.

## Tag-based pipeline stages

| Stage | Tags / command | When |
|-------|----------------|------|
| Smoke | `robot --include smoke tests/` | Every push |
| API | `robot --include api tests/` | On PR merge or main |
| Full regression | `robot tests/` (or explicit excludes only) | Nightly |

Example smoke-only job:

```bash
robot --include smoke --outputdir results tests/
```

## Docker-based execution

Build an image with pinned dependencies and run the same command locally and in CI:

```dockerfile
FROM python:3.12-slim
WORKDIR /work
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["robot", "--outputdir", "results", "tests/"]
```

Mount secrets at runtime (`docker run -e API_TOKEN=...`) rather than baking them into images.

## Best practices summary

| Area | Recommendation |
|------|----------------|
| Parallelism | `pabot` + merge with `rebot` when you need one report |
| Speed | Strict smoke tag; avoid “run everything” on every commit |
| Reliability | Pin deps; cache pip; use `if: always()` for artifacts |
| Notifications | Post summary + link to artifacts (Slack/email) |
| Security | CI secrets as env vars; RF `Secret` type for sensitive vars |

## See also

- [Configuration & secrets](01-configuration-secrets.md) — env-specific config in pipelines.
- [Logging, debugging & reporting](02-logging-reporting.md) — JUnit, Allure, and log levels in CI logs.
