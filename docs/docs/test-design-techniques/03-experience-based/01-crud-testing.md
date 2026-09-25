---
date: 2026-07-08
tags:
  - testing
  - test-design
---

# CRUD Testing

## Concept

CRUD testing verifies the full data lifecycle: Create, Read, Update, Delete.
The key insight is to verify **data state after every operation**, not only at creation.

```
Create → Read (verify) → Update → Read (verify) → Delete → Read (verify not found)
```

---

## Why CRUD Testing Matters

Common bugs CRUD testing catches:

- Delete works in UI but record stays in database
- Update changes one field and silently nulls another
- Create succeeds but Read returns stale data (cache issue)
- Duplicate create allowed when it shouldn't be
- Delete of non-existent record causes crash instead of graceful error

---

## Full Lifecycle Example

```python
import pytest


class UserStorage:
    def __init__(self) -> None:
        self._users: dict[str, dict[str, str]] = {}

    def create(self, user_id: str, name: str) -> dict[str, str]:
        if user_id in self._users:
            raise ValueError("User already exists")
        self._users[user_id] = {"id": user_id, "name": name}
        return self._users[user_id]

    def read(self, user_id: str) -> dict[str, str]:
        if user_id not in self._users:
            raise KeyError("User not found")
        return self._users[user_id]

    def update(self, user_id: str, name: str) -> dict[str, str]:
        if user_id not in self._users:
            raise KeyError("User not found")
        self._users[user_id]["name"] = name
        return self._users[user_id]

    def delete(self, user_id: str) -> bool:
        if user_id not in self._users:
            raise KeyError("User not found")
        del self._users[user_id]
        return True


class TestCRUD:
    def setup_method(self) -> None:
        self.storage = UserStorage()

    def test_create_and_read(self) -> None:
        self.storage.create("1", "Alice")
        assert self.storage.read("1")["name"] == "Alice"

    def test_update_changes_data(self) -> None:
        self.storage.create("1", "Alice")
        self.storage.update("1", "Bob")
        assert self.storage.read("1")["name"] == "Bob"

    def test_delete_removes_record(self) -> None:
        self.storage.create("1", "Alice")
        self.storage.delete("1")
        with pytest.raises(KeyError):
            self.storage.read("1")

    def test_create_duplicate_raises(self) -> None:
        self.storage.create("1", "Alice")
        with pytest.raises(ValueError):
            self.storage.create("1", "Alice")

    def test_full_lifecycle(self) -> None:
        self.storage.create("1", "Alice")
        assert self.storage.read("1")["name"] == "Alice"
        self.storage.update("1", "Bob")
        assert self.storage.read("1")["name"] == "Bob"
        self.storage.delete("1")
        with pytest.raises(KeyError):
            self.storage.read("1")
```

---

## CRUD Test Checklist

| Operation | What to Verify |
|-----------|---------------|
| Create | Record exists after creation; all fields stored correctly |
| Create | Duplicate creation is rejected with correct error |
| Read | Returns correct data; non-existent ID raises correct error |
| Update | Only updated fields change; other fields unchanged |
| Update | Update on non-existent ID raises correct error |
| Delete | Record no longer accessible after deletion |
| Delete | Delete on non-existent ID raises correct error |
| Lifecycle | Full C→R→U→R→D sequence produces consistent state |

---

## Isolation Requirement

Each test must start with a clean state. Never share storage instances between tests.

```python
# Good: fresh instance per test
def setup_method(self) -> None:
    self.storage = UserStorage()

# Bad: shared state causes test pollution
storage = UserStorage()  # class-level, shared between all tests
```

---

## CRUD in API Testing

For HTTP APIs, the same pattern applies:

```
POST /users       → assert 201, body has id and name
GET  /users/{id}  → assert 200, correct data
PUT  /users/{id}  → assert 200, updated fields
GET  /users/{id}  → assert updated data (not cached old data)
DELETE /users/{id} → assert 204
GET  /users/{id}  → assert 404
```

---

## Risks

| Risk | Description | Mitigation |
|------|-------------|------------|
| Read-only after create | Skipping re-read after update | Always read after every write |
| Shared test data | One test changes data another expects | Unique IDs per test; `setup_method` |
| Soft delete not verified | Record marked deleted but still returned | Test that soft-deleted record is excluded from reads |
