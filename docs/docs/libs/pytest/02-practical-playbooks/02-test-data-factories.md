---
date: 2026-09-21
tags:
  - python
  - libraries
  - pytest
  - testing
---

# Pytest Playbook — Test Data Factories

Patterns for creating consistent, readable test data.

## Minimal Valid Object Rule

Every factory should return the **smallest valid object**. Override only what the test cares about — defaults handle the rest.

---

## Fixture Factory Pattern

```python
import pytest


@pytest.fixture
def make_user():
    """Factory fixture: call with overrides, get a valid user dict."""
    def _make(
        name: str = "Alice",
        email: str = "alice@example.com",
        role: str = "viewer",
    ) -> dict:
        return {"name": name, "email": email, "role": role}
    return _make


def test_admin_access(make_user):
    # only override what matters for this test
    admin = make_user(role="admin")
    assert admin["role"] == "admin"
    assert admin["name"] == "Alice"  # default preserved


def test_multiple_users(make_user):
    users = [make_user(name=f"User-{i}") for i in range(3)]
    assert len(users) == 3
    assert users[0]["name"] == "User-0"
```

---

## Deterministic Random Data

Use Faker with a fixed seed for reproducible but realistic data:

```python
import pytest
from faker import Faker


@pytest.fixture
def fake():
    """Seeded Faker instance — same data every run."""
    f = Faker()
    f.seed_instance(42)
    return f


@pytest.fixture
def make_order(fake):
    """Factory that produces order dicts with realistic data."""
    def _make(**overrides) -> dict:
        defaults = {
            "order_id": fake.uuid4(),
            "product": fake.word(),
            "quantity": fake.random_int(min=1, max=100),
            "total": round(fake.pyfloat(min_value=1, max_value=500), 2),
        }
        return {**defaults, **overrides}
    return _make
```

---

## FactoryBoy (Optional)

For projects with ORM models, `factory_boy` automates creation:

```python
import factory
from myapp.models import User


class UserFactory(factory.Factory):
    class Meta:
        model = User

    name = factory.Faker("name")
    email = factory.LazyAttribute(lambda o: f"{o.name.lower().replace(' ', '.')}@test.com")
    role = "viewer"


def test_admin_flag():
    admin = UserFactory(role="admin")
    assert admin.role == "admin"
    assert "@test.com" in admin.email
```

---

## Anti-Patterns

| Anti-pattern | Fix |
|--------------|-----|
| Hardcoded data duplicated across tests | Extract into a factory fixture |
| Randomized data without seed | Always pass `seed=` for reproducibility |
| Tests that depend on factory defaults | Assert only the values you explicitly set |
| Giant fixture returning nested structures | Split into composable factory fixtures |

---

## Best Practices

- **One factory per domain entity** — `make_user`, `make_order`, `make_product`.
- **Override only what matters** — defaults keep tests focused on the behavior under test.
- **Seed all randomness** — tests must be deterministic across runs.
- **Compose factories** — `make_order(user=make_user(role="admin"))`.
- **Keep factories in `conftest.py`** — or a shared `tests/factories.py` module.
