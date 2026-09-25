---
date: 2026-07-11
tags:
  - test-automation
  - design-patterns
---

# Fixture Pattern and Factory Pattern

## Fixture Pattern

### Concept

A fixture is a reusable piece of setup (and optional teardown) that provides a known,
controlled state for tests. In pytest this is implemented as a decorated function.

### Types

#### Static Fixtures

Fixed, pre-defined state loaded from files or constants.

```python
@pytest.fixture(scope="session")
def static_config() -> dict:
    return {"base_url": "http://localhost:8000", "timeout": 5}
```

Use when: configuration, read-only reference data, schema definitions.

#### Dynamic Fixtures

State created at runtime, scoped to the test, torn down afterwards.

```python
@pytest.fixture
def created_user(api_client: httpx.Client) -> Generator[dict, None, None]:
    payload = UserBuilder().as_dict()
    response = api_client.post("/users", json=payload)
    user = response.json()
    yield user
    api_client.delete(f"/users/{user['id']}")  # teardown
```

Use when: DB rows, created API resources, authenticated sessions.

### Fixture Scopes

| Scope | Created per | Use case |
|---|---|---|
| `function` (default) | Each test | Mutable resources, DB state |
| `class` | Test class | Shared setup within one suite |
| `module` | Module file | Expensive setup per file |
| `session` | Entire run | DB connection, server process |

### Fixture Composition

Fixtures can depend on other fixtures:

```python
@pytest.fixture
def auth_client(api_client, created_user) -> httpx.Client:
    token = get_token(created_user["email"])
    api_client.headers["Authorization"] = f"Bearer {token}"
    return api_client
```

---

## Factory Pattern (for Tests)

### Concept

A test factory creates instances of services, clients, or domain objects
through a consistent interface, hiding construction details.

Unlike a Builder (fluent field-by-field), a Factory returns a ready-to-use object
based on a named preset or parameters.

### Service Factory

```python
class ApiClientFactory:
    _base_url: str = "http://localhost:8000"

    @classmethod
    def unauthenticated(cls) -> httpx.Client:
        return httpx.Client(base_url=cls._base_url)

    @classmethod
    def authenticated(cls, role: str = "user") -> httpx.Client:
        token = TokenFactory.for_role(role)
        return httpx.Client(
            base_url=cls._base_url,
            headers={"Authorization": f"Bearer {token}"},
        )

    @classmethod
    def with_headers(cls, headers: dict) -> httpx.Client:
        return httpx.Client(base_url=cls._base_url, headers=headers)
```

### Usage in Tests

```python
def test_admin_access():
    client = ApiClientFactory.authenticated(role="admin")
    response = client.get("/admin/users")
    assert response.status_code == 200

def test_unauthorized():
    client = ApiClientFactory.unauthenticated()
    response = client.get("/admin/users")
    assert response.status_code == 401
```

---

## Fixture vs Factory vs Builder

| Pattern | Best for | Returns |
|---|---|---|
| Fixture | Setup + teardown lifecycle | Yielded resource |
| Factory | Creating ready-to-use instances | Instance |
| Builder | Flexible domain object construction | Value object |

Use all three together:

```python
@pytest.fixture
def admin_client() -> Generator[httpx.Client, None, None]:
    client = ApiClientFactory.authenticated(role="admin")
    yield client
    client.close()
```
