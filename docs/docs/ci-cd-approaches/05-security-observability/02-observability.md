---
date: 2026-08-29
tags:
  - ci-cd
  - devops
  - security
  - observability
---

# Pipeline Observability

## What to Observe

Running a pipeline without observability is flying blind.
Two dimensions matter: **pipeline health** and **deployment health**.

```
Pipeline health  → build times, failure rates, flakiness
Deployment health → latency, error rate, resource usage after deploy
```

---

## Pipeline Logs

Every step must produce structured, searchable logs.

```yaml
# GitHub Actions — log grouping for readability
- name: Run tests
  run: |
    echo "::group::Test output"
    uv run pytest -v --tb=short
    echo "::endgroup::"
```

Key logging practices:
- Log the exact command run with its version
- Log start time and duration for each stage
- Surface failures prominently (not buried in thousands of success lines)
- Archive logs with artifacts for post-mortem analysis

---

## Pipeline Metrics

Track these per pipeline run and trend over time:

| Metric | What It Tells You |
|--------|------------------|
| Pipeline duration (p50/p95) | Overall speed trend |
| Stage duration breakdown | Which stage is slowing down |
| Build success rate | Pipeline health |
| Test failure rate | Code quality trend |
| Flaky test rate | Test reliability |
| Deployment frequency | Engineering velocity |

### Collecting Metrics


```yaml
- name: Record pipeline metrics
  if: always()
  run: |
    python scripts/record_metrics.py \
      --duration=${{ steps.test.outputs.duration }} \
      --status=${{ job.status }} \
      --branch=${{ github.ref_name }} \
      --run-id=${{ github.run_id }}
```


Push to Datadog, Prometheus Pushgateway, or a simple JSON file in S3.

---

## Deployment Health Monitoring

After every deployment, watch these for at least 10 minutes:

```
Deploy v1.4.2 to production
    ↓
Monitor for 10 min:
  - Error rate (should stay < 1%)
  - p95 latency (should stay within SLO)
  - Memory / CPU (should be stable, not climbing)
    ↓
Pass → deployment complete
Fail → automatic rollback trigger
```

### Automated Rollback on Health Breach

```yaml
- name: Verify deployment health
  run: |
    python scripts/check_deployment_health.py \
      --service api \
      --duration 600 \
      --max-error-rate 0.01 \
      --max-p95-ms 300
```


```python
# scripts/check_deployment_health.py
import time
import sys
import requests
import logging

log = logging.getLogger(__name__)


def check_health(
    prometheus_url: str,
    service: str,
    duration_seconds: int,
    max_error_rate: float,
) -> bool:
    deadline = time.monotonic() + duration_seconds
    while time.monotonic() < deadline:
        error_rate = query_prometheus(
            prometheus_url,
            f'rate(http_errors_total{{service="{service}"}}[1m])',
        )
        if error_rate > max_error_rate:
            log.error("Error rate %.2f%% exceeds threshold", error_rate * 100)
            return False
        time.sleep(30)
    return True
```


---

## Deployment Frequency & DORA Metrics

DORA metrics measure engineering delivery performance:

| Metric | Elite | High | Medium | Low |
|--------|-------|------|--------|-----|
| Deployment frequency | Multiple/day | Daily | Weekly | Monthly |
| Lead time for changes | < 1 hour | 1 day | 1 week | 1 month |
| Change failure rate | < 5% | < 10% | < 15% | > 15% |
| Recovery time | < 1 hour | < 1 day | < 1 week | > 1 week |

Track these automatically from pipeline metadata:

```python
def calculate_dora_metrics(deployments: list[dict]) -> dict:
    deployment_count = len(deployments)
    failed = [d for d in deployments if d["status"] == "failed"]
    return {
        "deployment_frequency_per_day": deployment_count / 30,
        "change_failure_rate": len(failed) / max(deployment_count, 1),
        "mean_lead_time_hours": sum(
            d["lead_time_seconds"] for d in deployments
        ) / max(deployment_count, 1) / 3600,
    }
```

---

## Notification Strategy

Not every event needs a notification. Noise kills attention.

| Event | Channel | Who |
|-------|---------|-----|
| Build failure on main | Slack #dev-alerts | Team |
| Deployment to production | Slack #deployments | Team |
| Security vulnerability found | Slack #security | Security + leads |
| Nightly regression failure | Slack #qa-alerts | QA |
| SLO breach after deploy | PagerDuty | On-call |


```yaml
- name: Notify on failure
  if: failure()
  uses: slackapi/slack-github-action@v1
  with:
    payload: |
      {
        "text": ":x: Build failed on `${{ github.ref_name }}`",
        "attachments": [{
          "text": "Run: ${{ github.run_url }}"
        }]
      }
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```
