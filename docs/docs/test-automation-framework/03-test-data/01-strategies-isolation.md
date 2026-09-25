---
date: 2026-07-21
tags:
  - test-automation
  - architecture
  - test-data
---

# Test Data Strategies & Isolation

## Three Data Strategies

### Static Data

Predefined, version-controlled. Loaded from YAML or JSON files.
Good for: configuration data, lookup tables, reference values.

```yaml
# data/fixtures/roles.yaml
roles:
  - name: "ADMIN"
    permissions: ["read", "write", "delete"]
  - name: "USER"
    permissions: ["read"]
  - name: "VIEWER"
    permissions: ["read"]
```

```python
import yaml
import pytest


@pytest.fixture(scope="session")
def roles_data() -> dict:
    with open("data/fixtures/roles.yaml") as f:
        return yaml.safe_load(f)
```

Risks:
- Static data drifts from the actual schema
- Multiple tests sharing same static record cause interference

### Dynamic Data

Created at test runtime, unique per test run.
Good for: users, orders, products — anything tests write to or modify.

```python
import uuid


def unique_email() -> str:
    return f"test-{uuid.uuid4().hex[:8]}@example.com"


def unique_username() -> str:
    return f"user_{uuid.uuid4().hex[:6]}"
```

Unique data eliminates test pollution without cleanup.
Even if cleanup fails, the next run creates a new unique record.

### Randomized Data

Faker-based realistic data for edge case coverage and fuzzing.

```python
from faker import Faker

faker = Faker()


def realistic_user() -> dict:
    return {
        "name": faker.name(),
        "email": faker.email(),
        "address": faker.address(),
        "phone": faker.phone_number(),
    }
```

Risk: randomised tests are non-deterministic by default.
Mitigation: seed Faker with a fixed value when reproducing failures.

```python
faker = Faker()
Faker.seed(42)  # reproducible in CI
```

---

## Data Isolation

### Principle: Each Test Owns Its Data

```
✓  Test creates its own user → modifies it → asserts → deletes it
✗  Test relies on user created by a previous test
✗  Test reads a shared user modified by another test
```

### Isolation Techniques

**Unique identifiers** — the simplest approach.
Each test creates data with a UUID-suffixed identifier.
Collision probability is negligible. No cleanup required.

**Transactional rollback** — for database-touching tests.
Wrap each test in a DB transaction, roll back after assertion.
Fast. No cleanup code needed. Requires DB access from test process.

```python
@pytest.fixture
def db_session(engine):
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
    yield session
    session.close()
    transaction.rollback()
    connection.close()
```

**Dedicated test namespace** — use a test-only tenant or prefix.
All test data lives under `test_*` prefix. A scheduled job deletes it.
Useful when DB access from tests is not available.

---

## Cleanup Strategies

### Strategy 1: Teardown in Fixture

```python
@pytest.fixture
def created_user(users_client) -> dict:
    user = users_client.create(UserBuilder().build())
    yield user
    users_client.delete(user["id"])  # always runs, even on failure
```

`yield` ensures cleanup runs even when the test fails.

### Strategy 2: Cleanup Before, Not After

```python
@pytest.fixture
def clean_test_users(users_client) -> None:
    users_client.delete_all_where(email_contains="@test.com")
```

Run before test instead of after. Advantage: previous run's garbage is cleaned too.

### Strategy 3: Unique Data (No Cleanup Needed)

```python
def test_user_can_update_profile(api_client):
    email = f"test-{uuid.uuid4().hex[:8]}@example.com"
    user = api_client.users.create({"email": email})
    # ... test body
    # No cleanup — unique email, will not conflict with any future test
```

Preferred for fast iteration. Accept minor data accumulation in test environments.

---

## Data Isolation Decision Guide

| Situation | Strategy |
|-----------|----------|
| Tests modify data | Unique IDs or transactional rollback |
| Tests read shared reference data | Static fixtures (session-scoped) |
| Tests need realistic-looking data | Dynamic with Faker |
| CI environment with ephemeral DB | No cleanup needed |
| Shared staging environment | Unique prefix + periodic cleanup job |
