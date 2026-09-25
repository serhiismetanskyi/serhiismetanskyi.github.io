---
date: 2026-07-13
tags:
  - test-automation
  - design-patterns
  - mocking
  - test-data
---

# Test Environment Design

## Environments

### Local

Developer machine or CI agent running the full stack via Docker Compose.

| Property | Value |
|---|---|
| Setup | `docker compose up` |
| Data | Ephemeral, reset per run |
| Speed | Fast for unit/integration |
| Use | TDD cycle, rapid feedback |

Rules:
- Services defined in `docker-compose.yml` at project root
- DB migrations run automatically on container start
- No production credentials — always use test secrets

### Staging

Shared, persistent environment deployed from `main` or release branch.

| Property | Value |
|---|---|
| Setup | Deployed by CI/CD |
| Data | Shared — use isolated test accounts |
| Speed | Real network latency |
| Use | Pre-production smoke tests, E2E |

Rules:
- Tests must not pollute shared state — always clean up
- Use dedicated test tenant / user accounts
- Feature flags controlled by environment variable, not code

### Production-Like

Ephemeral environment spun up per PR or per test run, identical to production.

| Property | Value |
|---|---|
| Setup | IaC (Terraform / Pulumi) |
| Data | Seeded snapshot of production-like data |
| Speed | Slow to provision |
| Use | Release validation, security scans |

Tools: Testcontainers Cloud, Ephemeral Envs (Railway, Render, Fly.io).

---

## Configuration

### Environment Variables

All environment-specific values injected via environment variables.

```python
import os

BASE_URL = os.environ["TEST_BASE_URL"]          # e.g. http://localhost:8000
DB_URL   = os.environ["TEST_DATABASE_URL"]      # e.g. postgresql://...
API_KEY  = os.environ["TEST_API_KEY"]           # test-only key, never prod
```

Loaded via `pytest-dotenv` or a `.env.test` file:

```
TEST_BASE_URL=http://localhost:8000
TEST_DATABASE_URL=postgresql://test:test@localhost:5432/testdb
TEST_API_KEY=test-api-key-local
```

`.env.test` is committed. `.env.production` is never committed.

### Feature Flags

Decouple tests from unreleased features:

```python
import os

def is_feature_enabled(flag: str) -> bool:
    return os.environ.get(f"FEATURE_{flag.upper()}", "false").lower() == "true"
```

In tests:
```python
@pytest.mark.skipif(
    not is_feature_enabled("NEW_PAYMENTS"),
    reason="NEW_PAYMENTS feature not enabled",
)
def test_new_payment_flow(api_client):
    ...
```

---

## Dependency Management

### External Services

| Dependency | Local strategy | CI strategy |
|---|---|---|
| PostgreSQL | Docker Compose | Testcontainers or service container |
| Redis | Docker Compose | Testcontainers |
| S3-compatible storage | MinIO in Docker | Localstack / Testcontainers |
| SMTP | Mailhog in Docker | Mock / MailSlurp |
| External HTTP APIs | WireMock / httpx mock | WireMock in CI container |

### Testcontainers (Python)

```python
import pytest
from testcontainers.postgres import PostgresContainer

@pytest.fixture(scope="session")
def postgres():
    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg.get_connection_url()
```

### Databases

Rules:
- Use a dedicated test database, never the development database
- Run migrations in CI before tests: `alembic upgrade head`
- Isolate data per test with transactions or table truncation
- Never use `DROP TABLE` in test teardown — use `TRUNCATE ... RESTART IDENTITY CASCADE`

---

## Environment Decision Table

| Need | Local | Staging | Prod-like |
|---|---|---|---|
| TDD / unit tests | Yes | No | No |
| API integration tests | Yes | Yes | No |
| E2E smoke tests | Yes (Docker) | Yes | Yes |
| Performance tests | No | Yes | Yes |
| Security scans | No | No | Yes |
