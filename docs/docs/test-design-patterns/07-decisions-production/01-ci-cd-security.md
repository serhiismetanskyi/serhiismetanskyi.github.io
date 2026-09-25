---
date: 2026-07-15
tags:
  - test-automation
  - design-patterns
  - security
  - ci-cd
---

# CI/CD Integration and Security Testing

## CI/CD Integration

### Pipeline Test Stages

Recommended stage order for fast feedback:

```
Commit push
  │
  ├─► [1] Lint + Type check      (< 30 s)
  ├─► [2] Unit tests             (< 2 min)
  ├─► [3] Integration tests      (< 5 min)
  ├─► [4] API / Contract tests   (< 5 min)
  ├─► [5] E2E smoke              (< 10 min, on staging)
  └─► [6] Security scan          (nightly or pre-release)
```

Rule: fail early. A lint failure should not trigger integration tests.

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v4
      - run: uv sync
      - run: uv run pytest -m "not slow and not e2e" --cov=src --cov-report=xml

  integration:
    needs: unit
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_PASSWORD: test
        options: --health-cmd pg_isready
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v4
      - run: uv sync
      - run: uv run pytest -m integration
        env:
          TEST_DATABASE_URL: postgresql://postgres:test@localhost:5432/testdb
```

### Fast Feedback

| Technique | Benefit |
|---|---|
| Stage gating | Don't run slow tests after fast test fails |
| Parallel workers (`-n auto`) | Reduce wall-clock time |
| Test result caching | Skip unchanged test files |
| Mark-based selection | Run only affected tests on PR |

### Test Reports

Generate machine-readable reports:

```bash
uv run pytest --junitxml=reports/junit.xml --html=reports/report.html --cov=src --cov-report=html
```

Upload in CI:
```yaml
- uses: actions/upload-artifact@v4
  with:
    name: test-reports
    path: reports/
```

---

## Security Testing

### Input Validation Testing

Test that the API rejects malformed, oversized, or unexpected input:

```python
import pytest

INVALID_PAYLOADS = [
    {"email": ""},                              # empty required field
    {"email": "a" * 300 + "@example.com"},      # oversized value
    {"email": None},                            # wrong type
    {},                                         # missing required fields
    {"email": "valid@test.com", "extra": "x"},  # unexpected field
]

@pytest.mark.parametrize("payload", INVALID_PAYLOADS)
def test_rejects_invalid_user_payload(api_client, payload):
    response = api_client.post("/users", json=payload)
    assert response.status_code in (400, 422)
```

### Auth Testing

```python
def test_unauthenticated_request_returns_401(unauthenticated_client):
    response = unauthenticated_client.get("/users")
    assert response.status_code == 401

def test_insufficient_role_returns_403(viewer_client):
    response = viewer_client.delete("/users/some-id")
    assert response.status_code == 403

def test_expired_token_returns_401(api_client):
    expired_token = generate_expired_token()
    response = api_client.get("/users", headers={"Authorization": f"Bearer {expired_token}"})
    assert response.status_code == 401
```

### Injection Testing

```python
SQL_INJECTION_PAYLOADS = [
    "'; DROP TABLE users; --",
    "1 OR 1=1",
    "admin'--",
]

@pytest.mark.parametrize("payload", SQL_INJECTION_PAYLOADS)
@pytest.mark.security
def test_sql_injection_rejected(api_client, payload):
    response = api_client.get("/users", params={"search": payload})
    assert response.status_code in (200, 400)
    if response.status_code == 200:
        body = response.json()
        assert "DROP TABLE" not in str(body)
        assert "syntax error" not in str(body).lower()
```

---

## Security Test Checklist

| Check | Expected Result |
|---|---|
| No token → 401 | 401 Unauthorized |
| Wrong role → 403 | 403 Forbidden |
| Expired token → 401 | 401 Unauthorized |
| SQL injection in query param | 400 or sanitised result |
| XSS in string field | Field stored safely, not executed |
| Oversized payload | 413 or 422 |
| Enumeration via sequential IDs | 403 or obfuscated IDs |
| Missing CSRF token on state mutation | 403 |
| Sensitive data in error response | No stack trace / PII in 4xx/5xx |
