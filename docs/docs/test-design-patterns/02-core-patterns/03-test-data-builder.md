---
date: 2026-07-11
tags:
  - test-automation
  - design-patterns
---

# Test Data Builder

## Concept

A Builder provides a fluent interface for constructing test objects with sensible defaults,
overriding only the fields relevant to a specific test.

Problem without Builder:
```python
# Each test sets all 12 fields even if only email matters
user = {"id": 1, "email": "a@b.com", "role": "user", "active": True, ...}
```

With Builder:
```python
user = UserBuilder().email("a@b.com").build()  # defaults fill the rest
```

---

## Implementation

```python
import dataclasses
import uuid


@dataclasses.dataclass
class UserPayload:
    email: str
    username: str
    role: str
    active: bool
    external_id: str


class UserBuilder:
    def __init__(self) -> None:
        self._email = f"user-{uuid.uuid4().hex[:6]}@example.com"
        self._username = f"user-{uuid.uuid4().hex[:6]}"
        self._role = "viewer"
        self._active = True
        self._external_id = str(uuid.uuid4())

    def email(self, value: str) -> "UserBuilder":
        self._email = value
        return self

    def username(self, value: str) -> "UserBuilder":
        self._username = value
        return self

    def role(self, value: str) -> "UserBuilder":
        self._role = value
        return self

    def inactive(self) -> "UserBuilder":
        self._active = False
        return self

    def build(self) -> UserPayload:
        return UserPayload(
            email=self._email,
            username=self._username,
            role=self._role,
            active=self._active,
            external_id=self._external_id,
        )

    def as_dict(self) -> dict:
        return dataclasses.asdict(self.build())
```

---

## Use Cases

### Complex Object Setup

```python
# Only the test-relevant field differs
admin = UserBuilder().role("admin").build()
inactive = UserBuilder().inactive().build()
duplicate = UserBuilder().email("taken@example.com").build()
```

### Parameterized Tests

```python
@pytest.mark.parametrize("role,expected_status", [
    ("viewer", 403),
    ("editor", 200),
    ("admin",  200),
])
def test_access_control(api_client, role, expected_status):
    user = UserBuilder().role(role).build()
    response = api_client.get("/resource", user=user)
    assert response.status_code == expected_status
```

### Nested Objects

```python
class OrderBuilder:
    def __init__(self) -> None:
        self._items: list = []
        self._user = UserBuilder().build()

    def with_item(self, product_id: str, qty: int) -> "OrderBuilder":
        self._items.append({"product_id": product_id, "qty": qty})
        return self

    def for_user(self, user: UserPayload) -> "OrderBuilder":
        self._user = user
        return self

    def build(self) -> dict:
        return {"user_id": self._user.external_id, "items": self._items}
```

---

## Rules

| Rule | Reason |
|---|---|
| Unique defaults for string fields | Prevents collisions in parallel tests |
| UUIDs for identifiers | No hardcoded IDs that break on re-run |
| Builder per domain aggregate | One builder = one domain concept |
| `build()` returns immutable object | No accidental mutation after creation |
| Keep builders in `tests/builders/` | Single location for test data construction |

---

## Comparison

| Approach | Reusability | Readability | Flexibility |
|---|---|---|---|
| Raw dict literals | Low | Poor | Low |
| Factory functions | Medium | Medium | Medium |
| Builder (fluent) | High | High | High |
| Faker / Polyfactory | High | Medium | High |
