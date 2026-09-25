---
date: 2026-07-13
tags:
  - test-automation
  - design-patterns
  - mocking
  - test-data
---

# Test Data Management

## Data Strategies

### Static Data

Pre-defined, version-controlled data used as-is.

| Use case | Example |
|---|---|
| Reference lookups | Country codes, currency list |
| Schema validation samples | Valid/invalid payload examples |
| Expected response bodies | Snapshot testing |

Stored in: `tests/data/*.json`, `tests/fixtures/*.yaml`

Rules:
- Static data must never be mutated by tests
- Load via fixture, not inline in test body
- Version-control alongside test code

### Generated Data

Data created at runtime using builders, factories, or Faker.

```python
from faker import Faker

fake = Faker()

def generate_user() -> dict:
    return {
        "email": fake.unique.email(),
        "username": fake.unique.user_name(),
        "full_name": fake.name(),
    }
```

Benefits: unique values per test run, no collision risk, parallel-safe.

### Seeded Databases

Known dataset loaded into a database before a test suite runs.

```python
@pytest.fixture(scope="session", autouse=True)
def seed_database(db_session):
    db_session.execute("TRUNCATE TABLE users RESTART IDENTITY CASCADE")
    db_session.bulk_insert_mappings(User, load_seed_data("users.json"))
    db_session.commit()
```

Use with read-only test suites. Never seed and mutate in the same suite.

---

## Isolation

### Test Data Per Test

Each test owns its data and does not rely on data created by another test.

```python
@pytest.fixture
def unique_user(api_client) -> Generator[dict, None, None]:
    user = api_client.post("/users", json=UserBuilder().as_dict()).json()
    yield user
    api_client.delete(f"/users/{user['id']}")
```

### Cleanup Strategies

| Strategy | Mechanism | When to use |
|---|---|---|
| Teardown delete | `api_client.delete(...)` in fixture | REST resources |
| DB transaction rollback | `session.rollback()` after each test | Unit/integration |
| DB truncation | `TRUNCATE TABLE ...` in session scope | Read-only seeded suites |
| Testcontainers ephemeral DB | Fresh container per session | Full isolation |

### Parallel Safety

- Each test uses fixtures that generate unique IDs
- No tests share a user, order, or session object
- Fixture scope is `function` for mutable resources

---

## Data Versioning

### Schema Evolution

When the data schema changes, test data must evolve with it.

| Risk | Mitigation |
|---|---|
| Old fixture missing new required field | Add field to builder defaults |
| Field renamed | Update builder + all fixtures in one PR |
| Type changed (int → str) | Migrate static JSON files + builder |
| Enum value removed | Remove from parameterize lists + static data |

### Versioned Schema Snapshots

Store expected response shapes as versioned JSON Schema files:

```
tests/
  schemas/
    v1/
      user-response.json
    v2/
      user-response.json
```

Compare responses against the active version; bump schema version on breaking changes.

---

## Summary Table

| Strategy | Speed | Isolation | Maintenance |
|---|---|---|---|
| Static JSON | Fast | Low | Low |
| Generated (Faker/Builder) | Fast | High | Medium |
| Seeded DB | Medium | Medium | Medium |
| Testcontainers | Slow (startup) | Very high | High |
