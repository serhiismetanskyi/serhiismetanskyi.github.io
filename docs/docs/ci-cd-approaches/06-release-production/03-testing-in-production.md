---
date: 2026-08-31
tags:
  - ci-cd
  - devops
---

# Testing in Production

## Why Test in Production

Staging is not production. No matter how well staging mirrors production,
the real environment has real data volumes, real traffic patterns,
and real edge cases that staging never sees.

Testing in production means running **safe, non-destructive** verification
against the live system after every deployment.

---

## Smoke Tests

Minimal set of tests run immediately after every deployment.
Must complete in under 2 minutes. Must test the critical path only.

```python
# tests/smoke/test_critical_path.py
import pytest
import requests


BASE_URL = os.environ["SMOKE_BASE_URL"]


@pytest.mark.smoke
def test_health_endpoint():
    response = requests.get(f"{BASE_URL}/health", timeout=5)
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


@pytest.mark.smoke
def test_auth_endpoint_reachable():
    response = requests.post(
        f"{BASE_URL}/auth/token",
        json={"username": "smoke@example.com", "password": "wrong"},
        timeout=5,
    )
    assert response.status_code == 401  # reachable, returns expected error


@pytest.mark.smoke
def test_api_returns_json():
    response = requests.get(f"{BASE_URL}/products?limit=1", timeout=5)
    assert response.status_code == 200
    assert isinstance(response.json(), (list, dict))
```


```yaml
# In deploy pipeline
- name: Smoke tests
  run: |
    uv run pytest -m smoke --timeout=30 -v
  env:
    SMOKE_BASE_URL: ${{ vars.PRODUCTION_URL }}
```


Smoke test failure → automatic rollback trigger.

---

## Synthetic Monitoring

Continuously run test scenarios against production on a schedule.
Not after deploys only — 24/7, every 1–5 minutes.


```yaml
# GitHub Actions — scheduled synthetic monitor
name: Synthetic Monitoring

on:
  schedule:
    - cron: "*/5 * * * *"  # every 5 minutes

jobs:
  monitor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v3
      - name: Run synthetic checks
        run: |
          uv run pytest tests/synthetic/ \
            --timeout=15 -q
        env:
          MONITOR_URL: ${{ vars.PRODUCTION_URL }}
          MONITOR_TOKEN: ${{ secrets.MONITOR_TOKEN }}
      - name: Alert on failure
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          payload: '{"text":":rotating_light: Synthetic monitor failed: ${{ github.run_url }}"}'
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.ONCALL_WEBHOOK }}
```


Synthetic monitoring catches:
- External dependencies that went down
- DNS or certificate issues
- Configuration drift in production
- Gradual performance degradation between deploys

---

## Canary Validation

During canary deployment, validate that the canary version meets SLOs
before routing more traffic to it.

```yaml
# Argo Rollouts analysis template
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: success-rate
spec:
  metrics:
    - name: success-rate
      interval: 2m
      successCondition: result[0] >= 0.99
      failureLimit: 3
      provider:
        prometheus:
          address: http://prometheus:9090
          query: |
            sum(rate(http_requests_total{
              service="api",status=~"2.."
            }[2m])) /
            sum(rate(http_requests_total{service="api"}[2m]))
```

If the success rate drops below 99% three times in a row → canary aborted, rollback.

---

## Observability After Deploy

The 10 minutes after a production deploy are the highest-risk window.
Watch these in real time:

```
Deploy complete
    ↓
T+0m:  Error rate baseline check (should be 0%)
T+2m:  p95 latency check (should be within SLO)
T+5m:  Memory trend (should be stable)
T+10m: DB connection pool (should not be growing)
T+30m: No memory creep → deployment healthy
```

---

## Testing in Production Rules

| Rule | Reason |
|------|--------|
| Tests must be read-only | Never write to production DB in tests |
| Use dedicated test accounts | Isolate test traffic from real users |
| Rate limit test requests | Prevent smoke tests from adding load |
| Never test payment flows for real | Use sandbox mode or skip |
| Log all synthetic requests | Distinguish from real traffic in metrics |

Mark synthetic traffic so it can be filtered from user-facing metrics:

```python
headers = {
    "X-Synthetic-Request": "true",
    "User-Agent": "SyntheticMonitor/1.0",
}
```
