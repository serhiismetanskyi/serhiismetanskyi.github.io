---
date: 2026-07-25
tags:
  - test-automation
  - architecture
  - ci-cd
  - security
---

# Performance Testing Support & Security Testing

## Performance Testing in the Framework

### What to Test

| Type | Measures | Tool |
|------|---------|------|
| Load test | Behaviour under expected traffic | Locust |
| Stress test | Breaking point | Locust ramp-up |
| Soak test | Memory leaks over time | Locust extended run |
| API latency | p50/p95/p99 response times | pytest + timer |

### Baseline Latency Assertions

Embed performance assertions in regular API tests:

```python
import time
import pytest


@pytest.mark.performance
def test_user_list_responds_within_slo(api_client):
    start = time.monotonic()
    response = api_client.get("/users?limit=100")
    elapsed_ms = (time.monotonic() - start) * 1000

    assert response.status_code == 200
    assert elapsed_ms < 200, f"User list took {elapsed_ms:.1f}ms, SLO is 200ms"
```

### Locust Load Test

```python
# tests/performance/locustfile.py
from locust import HttpUser, task, between
import logging

log = logging.getLogger(__name__)


class ApiUser(HttpUser):
    wait_time = between(0.5, 2)

    def on_start(self) -> None:
        response = self.client.post("/auth/token", json={
            "email": "loadtest@example.com",
            "password": "Test@1234",
        })
        self.token = response.json()["access_token"]
        log.info("Load test user authenticated")

    @task(3)
    def get_users(self) -> None:
        self.client.get(
            "/users",
            headers={"Authorization": f"Bearer {self.token}"},
            name="/users",
        )

    @task(1)
    def create_order(self) -> None:
        self.client.post(
            "/orders",
            json={"items": ["SKU-001"]},
            headers={"Authorization": f"Bearer {self.token}"},
            name="/orders",
        )
```

Run:
```bash
locust -f tests/performance/locustfile.py \
  --headless -u 50 -r 5 --run-time 60s \
  --host https://api.staging.example.com
```

### Distributed Execution

Split tests across multiple CI workers for speed:


```yaml
# GitHub Actions matrix
strategy:
  matrix:
    shard: [1, 2, 3, 4]

- run: |
    uv run pytest -n auto \
      --shard-id=${{ matrix.shard }} \
      --num-shards=4
```


---

## Security Testing Support

Security tests are automated checks for known vulnerability patterns.
Not a replacement for penetration testing — a complement to it.

### Authentication Tests

```python
import pytest


@pytest.mark.security
class TestAuthSecurity:
    def test_endpoint_requires_token(self, api_client):
        response = api_client.get("/users", headers={})
        assert response.status_code == 401

    def test_expired_token_rejected(self, api_client, expired_token):
        response = api_client.get(
            "/users",
            headers={"Authorization": f"Bearer {expired_token}"},
        )
        assert response.status_code == 401

    def test_wrong_role_returns_403(self, api_client, user_token):
        response = api_client.delete(
            "/admin/users/some-id",
            headers={"Authorization": f"Bearer {user_token}"},
        )
        assert response.status_code == 403

    def test_tampered_token_rejected(self, api_client):
        tampered = "eyJhbGciOiJIUzI1NiJ9.TAMPERED.signature"
        response = api_client.get(
            "/users",
            headers={"Authorization": f"Bearer {tampered}"},
        )
        assert response.status_code == 401
```

### Input Validation Tests

```python
INJECTION_PAYLOADS = [
    ("sql", "' OR '1'='1"),
    ("sql", "'; DROP TABLE users; --"),
    ("xss", "<script>alert('xss')</script>"),
    ("xss", '"><img src=x onerror=alert(1)>'),
    ("path", "../../../etc/passwd"),
    ("null_byte", "user\x00admin"),
]


@pytest.mark.security
@pytest.mark.parametrize("attack_type,payload", INJECTION_PAYLOADS)
def test_injection_in_username_rejected(api_client, attack_type, payload):
    response = api_client.post("/users", json={"email": f"{payload}@test.com"})
    assert response.status_code in (400, 422), (
        f"{attack_type} injection was not rejected: {response.status_code}"
    )
```

### Rate Limiting Tests

```python
@pytest.mark.security
def test_login_rate_limited_after_failures(api_client):
    for _ in range(10):
        api_client.post("/auth/login", json={
            "email": "brute@example.com",
            "password": "WrongPassword1!",
        })

    response = api_client.post("/auth/login", json={
        "email": "brute@example.com",
        "password": "WrongPassword1!",
    })
    assert response.status_code == 429
    assert "Retry-After" in response.headers
```

---

## Security Test Checklist

| Category | Tests |
|---------|-------|
| Auth | Missing token → 401, expired → 401, wrong role → 403 |
| Input | SQL injection, XSS, path traversal, null bytes |
| Rate limiting | Brute force triggers 429 with Retry-After |
| Data exposure | Response never contains passwords or secrets |
| CORS | Only allowed origins accepted |
| HTTPS | HTTP redirects to HTTPS |
