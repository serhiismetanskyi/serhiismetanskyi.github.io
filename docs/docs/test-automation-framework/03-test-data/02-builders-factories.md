---
date: 2026-07-21
tags:
  - test-automation
  - architecture
  - test-data
---

# Builders, Factories & DB Seeding

## Test Data Builder — Full Pattern

A builder creates a single domain object with configurable defaults.
The same builder is used wherever that object is needed.

```python
import uuid
from dataclasses import dataclass, field
from typing import Self


@dataclass
class ProductBuilder:
    sku: str = field(default_factory=lambda: f"SKU-{uuid.uuid4().hex[:6].upper()}")
    name: str = field(default_factory=lambda: f"Product {uuid.uuid4().hex[:4]}")
    price: float = 9.99
    stock: int = 100
    category: str = "GENERAL"
    active: bool = True

    def out_of_stock(self) -> Self:
        self.stock = 0
        return self

    def in_category(self, category: str) -> Self:
        self.category = category
        return self

    def priced_at(self, price: float) -> Self:
        self.price = price
        return self

    def inactive(self) -> Self:
        self.active = False
        return self

    def build(self) -> dict:
        return {
            "sku": self.sku,
            "name": self.name,
            "price": self.price,
            "stock": self.stock,
            "category": self.category,
            "active": self.active,
        }
```

Usage:
```python
# Default in-stock product
product = ProductBuilder().build()

# Specific scenario
out_of_stock = ProductBuilder().out_of_stock().in_category("ELECTRONICS").build()
```

---

## Nested Builders

Compose builders for objects with nested structures.

```python
@dataclass
class OrderBuilder:
    user_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    items: list = field(default_factory=list)
    shipping_address: dict = field(
        default_factory=lambda: AddressBuilder().build()
    )
    status: str = "PENDING"

    def with_item(self, sku: str, qty: int = 1) -> Self:
        self.items.append({"sku": sku, "quantity": qty})
        return self

    def for_user(self, user_id: str) -> Self:
        self.user_id = user_id
        return self

    def build(self) -> dict:
        return {
            "user_id": self.user_id,
            "items": self.items,
            "shipping_address": self.shipping_address,
            "status": self.status,
        }
```

---

## Resource Factory

A factory creates and tracks resources for cleanup.
Useful when tests create multiple resources and need guaranteed teardown.

```python
class UserFactory:
    def __init__(self, client) -> None:
        self._client = client
        self._created: list[str] = []

    def create(self, **overrides) -> dict:
        data = {**UserBuilder().build(), **overrides}
        user = self._client.users.create(data)
        self._created.append(user["id"])
        return user

    def create_admin(self) -> dict:
        return self.create(role="ADMIN")

    def cleanup(self) -> None:
        for user_id in self._created:
            self._client.users.delete(user_id)
        self._created.clear()


@pytest.fixture
def user_factory(api_client) -> UserFactory:
    factory = UserFactory(api_client)
    yield factory
    factory.cleanup()
```

```python
def test_admin_can_see_all_users(api_client, user_factory):
    admin = user_factory.create_admin()
    users = [user_factory.create() for _ in range(3)]

    response = api_client.get("/admin/users", headers=auth(admin))
    assert len(response.json()) >= 3
    # factory.cleanup() runs automatically after test
```

---

## DB Seeding

For tests that require pre-existing data in the database.

### Direct SQL Seed

```python
import pytest
import psycopg2


@pytest.fixture(scope="session")
def seeded_db(db_connection):
    cursor = db_connection.cursor()
    cursor.execute("""
        INSERT INTO product_categories (name, slug)
        VALUES ('Electronics', 'electronics'), ('Books', 'books')
        ON CONFLICT (slug) DO NOTHING
    """)
    db_connection.commit()
    yield
    cursor.execute("DELETE FROM product_categories WHERE slug IN ('electronics', 'books')")
    db_connection.commit()
```

### Migration-Based Seed

Use Alembic data migrations or a dedicated seed script:

```python
# data/seed.py
def seed_reference_data(session) -> None:
    categories = [
        Category(name="Electronics", slug="electronics"),
        Category(name="Books", slug="books"),
    ]
    for cat in categories:
        session.merge(cat)
    session.commit()
```

Run once at session scope in CI, not per-test.

---

## Builder Checklist

| Property | Required |
|----------|---------|
| Unique defaults (UUID-based) | Yes |
| Returns `self` from mutator methods | Yes |
| `build()` returns plain dict or dataclass | Yes |
| No API calls inside builder | Yes |
| Raises error on missing required fields | Recommended |
