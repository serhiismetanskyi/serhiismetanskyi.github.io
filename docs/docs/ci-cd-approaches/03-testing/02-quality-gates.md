---
date: 2026-08-28
tags:
  - ci-cd
  - devops
  - testing
---

# Quality Gates

## What Is a Quality Gate

A quality gate is an automated threshold that blocks pipeline progression when not met.
Not a warning. A hard stop.

```
Tests pass + Coverage ≥ 90% + No critical vulnerabilities → proceed
Any gate fails → pipeline stops, developer is notified
```

Quality gates make quality non-negotiable — it cannot be "just this once" skipped.

---

## Test Pass Rate Gate

The simplest gate: 100% of tests must pass (excluding quarantined).

```yaml
- name: Run tests
  run: uv run pytest -n auto --junitxml=test-results/junit.xml

- name: Enforce pass rate
  run: |
    python scripts/check_pass_rate.py \
      --junit test-results/junit.xml \
      --min-pass-rate 1.0
```

A single unexpected failure blocks the pipeline. This is correct behaviour.

---

## Coverage Gate

```yaml
- name: Test with coverage
  run: |
    uv run pytest \
      --cov=src \
      --cov-fail-under=90 \
      --cov-report=xml:coverage.xml \
      --cov-report=term-missing
```

`--cov-fail-under=90` exits with code 1 if coverage drops below 90%.
The pipeline stops. The developer either adds tests or explains why coverage dropped.

### Coverage by Layer

| Layer | Threshold |
|-------|----------|
| Unit tests | ≥ 95% |
| Integration | ≥ 80% |
| Overall | ≥ 90% |

Track coverage delta per PR to catch gradual erosion:


```yaml
- name: Coverage comment on PR
  uses: py-cov-action/python-coverage-comment-action@v3
  with:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    MINIMUM_GREEN: 90
    MINIMUM_ORANGE: 80
```


---

## Performance Gate

Enforce latency SLOs as a pipeline gate:

```python
# scripts/check_slo.py — runs after load test
from locust.env import Environment
from locust import events


@events.quitting.add_listener
def assert_slo(environment: Environment, **kwargs) -> None:
    stats = environment.runner.stats.total
    p95 = stats.get_response_time_percentile(0.95)
    error_rate = stats.fail_ratio

    violations = []
    if p95 > 300:
        violations.append(f"p95={p95}ms exceeds 300ms SLO")
    if error_rate > 0.01:
        violations.append(f"error_rate={error_rate:.1%} exceeds 1% SLO")

    if violations:
        for v in violations:
            print(f"SLO BREACH: {v}")
        environment.process_exit_code = 1
```


```yaml
- name: Load test with SLO gate
  run: |
    locust -f tests/performance/locustfile.py \
      --headless -u 50 -r 5 --run-time 60s \
      --host ${{ vars.STAGING_URL }}
```


---

## Dependency Vulnerability Gate

Block deployment if critical CVEs found in dependencies:

```yaml
- name: Vulnerability scan
  run: uv run pip-audit --fail-on-vuln --severity critical
```

Or with Trivy for Docker images:


```yaml
- name: Scan Docker image
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: ghcr.io/${{ github.repository }}:${{ github.sha }}
    exit-code: '1'
    severity: 'CRITICAL,HIGH'
```


---

## Gate Summary

| Gate | Tool | Failure Action |
|------|------|---------------|
| Tests pass | pytest | Block merge |
| Coverage ≥ 90% | pytest-cov | Block merge |
| No lint errors | ruff | Block merge |
| Type safety | mypy | Block merge |
| p95 < 300ms | Locust | Block staging→prod |
| No critical CVEs | pip-audit / Trivy | Block deploy |
| Smoke tests pass | pytest | Block production |

---

## Required Status Checks

Enforce gates at the repository level (GitHub branch protection):

```
Settings → Branches → main → Require status checks:
  ✓ build
  ✓ test / unit
  ✓ test / integration
  ✓ security-scan
```

No merge without all checks green. Not optional. Not overridable without admin.
