---
date: 2026-08-31
tags:
  - ci-cd
  - devops
---

# Failure Handling in CI/CD

## Pipeline Failure Categories

| Category | Example | Response |
|----------|---------|---------|
| Transient failure | Flaky test, network timeout | Retry |
| Real failure | Test caught a bug | Fix code, do not retry |
| Infrastructure failure | Runner out of disk | Re-run on different runner |
| Partial failure | One of 4 shards failed | Investigate before re-run |

The key question before retrying: **is this a real failure?** Retrying a real failure wastes time and hides the bug.

---

## Retry Strategies

### Automatic Retry for Transient Failures

```yaml
- name: Deploy to staging
  uses: ./actions/deploy
  with:
    environment: staging
  # Retry up to 3 times on failure (network, timeout)
  continue-on-error: false

# Or with retry action
- name: Deploy with retry
  uses: nick-fields/retry@v3
  with:
    timeout_minutes: 10
    max_attempts: 3
    retry_wait_seconds: 30
    command: ./scripts/deploy.sh staging
```

### Retry Only Known-Transient Steps


```yaml
- name: Wait for service to be ready
  run: |
    for i in {1..10}; do
      if curl -sf "${{ vars.STAGING_URL }}/health"; then
        echo "Service is ready"
        exit 0
      fi
      echo "Attempt $i/10 failed, waiting 30s..."
      sleep 30
    done
    echo "Service failed to become ready"
    exit 1
```


Do not retry: lint failures, type errors, test failures.
Do retry: network timeouts, service startup waits, DNS resolution.

---

## Pipeline Recovery

### Continue-on-Error for Non-Critical Steps

```yaml
- name: Upload coverage report
  continue-on-error: true   # not worth failing the pipeline for this
  run: uv run codecov

- name: Send Slack notification
  continue-on-error: true   # notification failure should not block deploy
  run: ./scripts/notify.sh
```

### Always-Run Cleanup

```yaml
jobs:
  test:
    steps:
      - name: Start test database
        run: docker compose up -d postgres

      - name: Run tests
        run: uv run pytest

      - name: Stop test database
        if: always()         # runs even if tests failed
        run: docker compose down
```

`if: always()` ensures cleanup runs regardless of previous step outcome.

---

## Partial Failure Handling

### Matrix Job Failure Control

```yaml
strategy:
  matrix:
    service: [users, orders, products]
  fail-fast: false  # continue other matrix jobs even if one fails
```

`fail-fast: false` — one service test failure does not cancel the others.
All results collected, all failures surfaced, not just the first.

### Allowed Failures


```yaml
strategy:
  matrix:
    python-version: ["3.12", "3.13"]
  include:
    - python-version: "3.13"
      experimental: true

steps:
  - name: Run tests
    continue-on-error: ${{ matrix.experimental }}
```


Python 3.13 failure does not block the pipeline — it is experimental.

---

## Failure Notification Strategy


```yaml
- name: Notify team on failure
  if: failure() && github.ref == 'refs/heads/main'
  uses: slackapi/slack-github-action@v1
  with:
    payload: |
      {
        "text": ":x: Pipeline failed on `main`",
        "attachments": [{
          "color": "danger",
          "fields": [
            {"title": "Run", "value": "${{ github.run_url }}", "short": false},
            {"title": "Triggered by", "value": "${{ github.actor }}", "short": true},
            {"title": "Commit", "value": "${{ github.sha }}", "short": true}
          ]
        }]
      }
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```


Notify on:
- `main` branch failures (team must act)
- Deployment failures (on-call must act)

Do not notify on:
- PR branch failures (developer responsible, not team)
- Scheduled job success (noise)

---

## Incident Response After Pipeline Failure

```
Pipeline failure on main
    │
    ├── Is it a flaky test?
    │   └── Yes → re-run, open flakiness ticket
    │
    ├── Is it a real test failure?
    │   └── Yes → developer who merged fixes immediately
    │
    ├── Is it a deploy failure?
    │   └── Yes → rollback, investigate, fix
    │
    └── Is it infrastructure?
        └── Yes → retry on different runner, alert platform team
```

**Main branch must be green**. A broken main is a team emergency, not one person's problem.
