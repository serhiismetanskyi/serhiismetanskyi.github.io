---
date: 2026-07-14
tags:
  - test-automation
  - design-patterns
  - observability
---

# Performance Testing and Observability in Tests

## Performance Testing

### Metrics

| Metric | Definition | Typical SLO |
|---|---|---|
| Latency (p50) | Median response time | < 100 ms |
| Latency (p95) | 95th percentile | < 300 ms |
| Latency (p99) | 99th percentile | < 1 s |
| Throughput | Requests per second | > 500 rps |
| Error rate | % of failed requests | < 0.1 % |
| Saturation | CPU/Memory under load | < 80 % |

### Load Simulation

Tools: Locust, k6, Artillery.

**Locust example:**
```python
from locust import HttpUser, task, between

class ApiUser(HttpUser):
    wait_time = between(0.5, 2.0)
    host = "http://localhost:8000"

    @task(3)
    def get_users(self):
        with self.client.get("/users", catch_response=True) as response:
            if response.status_code != 200:
                response.failure(f"Unexpected status: {response.status_code}")

    @task(1)
    def create_user(self):
        payload = {"email": f"user-{id(self)}@example.com", "username": f"u{id(self)}"}
        self.client.post("/users", json=payload)
```

Run: `locust -f locustfile.py --headless -u 100 -r 10 --run-time 60s`

### Latency Assertions in pytest

Lightweight SLO checks as part of the API test suite:

```python
import time
import httpx


def test_get_users_latency_slo(api_client: httpx.Client):
    start = time.perf_counter()
    response = api_client.get("/users")
    elapsed = time.perf_counter() - start

    assert response.status_code == 200
    assert elapsed < 0.3, f"GET /users took {elapsed:.3f}s, SLO is 300ms"
```

### Stress Testing

Identify breaking point by linearly increasing load until error rate exceeds threshold.

| Phase | Target RPS | Expected |
|---|---|---|
| Baseline | 10 | < 50 ms p95 |
| Normal load | 100 | < 100 ms p95 |
| Peak load | 500 | < 300 ms p95 |
| Stress | 1000 | Graceful degradation |
| Spike | 2000 for 30 s | No data loss, recovery |

---

## Observability in Tests

### Logging

Every test action should produce structured log output for debugging failures.

```python
import logging
import httpx

logger = logging.getLogger(__name__)


def test_create_user(api_client: httpx.Client):
    payload = UserBuilder().as_dict()
    logger.info("Creating user: email=%s", payload["email"])

    response = api_client.post("/users", json=payload)
    logger.debug("Response: status=%d body=%s", response.status_code, response.text[:300])

    assert response.status_code == 201
```

Configure pytest logging:
```ini
[pytest]
log_cli = true
log_cli_level = DEBUG
log_format = %(asctime)s %(levelname)-8s %(name)s %(message)s
```

### Metrics

Track test suite health metrics in CI:

| Metric | Source |
|---|---|
| Pass rate per suite | `pytest-json-report` |
| Flaky test rate | Retry count / total runs |
| Avg test duration | `pytest-durations` |
| Coverage % | `pytest-cov` |

### Tracing: Request Correlation

Inject a `X-Request-ID` header in every test request for correlation with service logs:

```python
import uuid
import httpx


def make_traced_request(client: httpx.Client, method: str, path: str, **kwargs) -> httpx.Response:
    request_id = str(uuid.uuid4())
    headers = kwargs.pop("headers", {})
    headers["X-Request-ID"] = request_id
    response = client.request(method, path, headers=headers, **kwargs)
    return response
```

In CI, correlate test failures with service traces using the `X-Request-ID`.

---

## Performance Observability Checklist

| Check | Tool |
|---|---|
| SLO latency assertions in CI | `pytest` + `time.perf_counter` |
| Load test baseline on main | Locust / k6 in CI pipeline |
| Trace IDs in test logs | Custom request wrapper |
| DB query count assertion | SQLAlchemy event listeners |
| Memory leak detection | `memray` profiler in CI |
