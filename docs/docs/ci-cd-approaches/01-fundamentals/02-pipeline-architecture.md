---
date: 2026-08-26
tags:
  - ci-cd
  - devops
---

# Pipeline Architecture

## Pipeline Stages

A pipeline is a sequence of automated stages. Each stage must pass for the next to run.

```
Source → Build → Test → Package → Deploy → Verify
```

| Stage | What Happens |
|-------|-------------|
| Source | Commit or PR triggers the pipeline |
| Build | Dependencies installed, code compiled, lint/type checks |
| Test | Unit → integration → API → E2E tests, coverage check |
| Package | Docker image built and pushed, artifact archived |
| Deploy | Service updated on target environment |
| Verify | Smoke tests, health checks, monitoring baseline |

Failing fast matters: a lint failure in Build should not waste 5 minutes of Test compute.

---

## Pipeline Types

### Monolithic Pipeline

All stages in a single linear pipeline. Simple, works for small projects.

```
build → test → deploy
```

Problem: one slow E2E test blocks the whole pipeline.

### Multi-Stage Pipeline

Stages run in dependency order. Stages without dependencies run in parallel.

```
         ┌── unit tests ──┐
build ──►│                 ├──► package ──► deploy
         └── lint/types ──┘
```

This is the most common pattern for production systems.

### Distributed Pipelines

Each service has its own pipeline. An orchestrator coordinates cross-service flows.

```
service-a pipeline ──┐
service-b pipeline ──┼──► integration test pipeline ──► deploy
service-c pipeline ──┘
```

Used in microservices architectures.

### Event-Driven Pipelines

Pipelines triggered by events beyond git commits: artifact publication,
scheduled jobs, external webhooks, manual approvals.

```
New Docker image pushed → trigger downstream deploy pipeline
Nightly schedule → trigger regression suite
Slack approval → trigger production deploy
```

---

## Pipeline Triggers

| Trigger | When to Use |
|---------|------------|
| Push to main/master | Deploy to staging; run full regression |
| Pull request opened/updated | Run CI checks; block merge on failure |
| Scheduled (cron) | Nightly full regression, security scans, soak tests |
| Manual | Production deploys requiring human approval |
| Tag / release creation | Versioned artifact builds |
| External webhook | Triggered by upstream service or artifact |

---

## GitHub Actions Pipeline Structure

```yaml
name: CI/CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v3
      - run: uv sync
      - run: uv run ruff check .
      - run: uv run mypy .

  test:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v3
      - run: uv run pytest -n auto --cov=src --cov-fail-under=90

  deploy-staging:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/deploy.sh staging
```

---

## Pipeline as Code

Pipeline configuration must be:
- **Version-controlled** — changes to the pipeline go through code review
- **Reproducible** — running the same pipeline twice on the same commit gives the same result
- **Self-documenting** — reading the YAML tells you exactly what runs

Never configure pipelines through a UI only. Config in UI is invisible, unreviewed, and drifts.
