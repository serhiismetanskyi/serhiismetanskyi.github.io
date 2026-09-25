---
date: 2026-07-20
tags:
  - test-automation
  - architecture
---

# API & Data Test Design Patterns

## Request Builder

Fluent API for constructing HTTP requests without coupling tests to raw HTTP semantics.

```python
class UserRequestBuilder:
    def __init__(self) -> None:
        self._payload: dict = {}
        self._headers: dict = {}

    def with_email(self, email: str) -> "UserRequestBuilder":
        self._payload["email"] = email
        return self

    def with_role(self, role: str) -> "UserRequestBuilder":
        self._payload["role"] = role
        return self

    def with_auth_token(self, token: str) -> "UserRequestBuilder":
        self._headers["Authorization"] = f"Bearer {token}"
        return self

    def build(self) -> tuple[dict, dict]:
        return self._payload, self._headers
```

Usage in tests:
```python
def test_create_admin_user(api_client, admin_token):
    payload, headers = (
        UserRequestBuilder()
        .with_email("admin@example.com")
        .with_role("ADMIN")
        .with_auth_token(admin_token)
        .build()
    )
    response = api_client.post("/users", json=payload, headers=headers)
    assert response.status_code == 201
```

---

## Response Validator

Centralise assertion logic over HTTP responses.
Tests call validators; raw status codes and field checks live in one place.

```python
class ResponseValidator:
    def __init__(self, response) -> None:
        self._response = response

    def is_created(self) -> "ResponseValidator":
        assert self._response.status_code == 201, (
            f"Expected 201, got {self._response.status_code}: "
            f"{self._response.text}"
        )
        return self

    def has_field(self, field: str, value: object) -> "ResponseValidator":
        body = self._response.json()
        assert field in body, f"Field '{field}' missing from response"
        assert body[field] == value, (
            f"Expected {field}={value!r}, got {body[field]!r}"
        )
        return self

    def matches_schema(self, schema: dict) -> "ResponseValidator":
        from jsonschema import validate
        validate(instance=self._response.json(), schema=schema)
        return self
```

---

## Test Data Builder

Constructs domain objects with unique defaults.
Every test gets fresh, isolated data with one line of setup.

```python
import uuid
from dataclasses import dataclass, field


@dataclass
class UserBuilder:
    email: str = field(default_factory=lambda: f"user-{uuid.uuid4().hex[:8]}@test.com")
    role: str = "USER"
    verified: bool = True
    password: str = "Test@1234"

    def as_admin(self) -> "UserBuilder":
        self.role = "ADMIN"
        return self

    def unverified(self) -> "UserBuilder":
        self.verified = False
        return self

    def with_email(self, email: str) -> "UserBuilder":
        self.email = email
        return self

    def build(self) -> dict:
        return {
            "email": self.email,
            "role": self.role,
            "verified": self.verified,
            "password": self.password,
        }
```

Key properties:
- Defaults are unique (UUID-based) — no test pollution
- Methods return `self` for chaining
- `build()` returns a plain dict — no hidden behaviour

---

## Fixture Pattern

pytest fixtures that create, provide, and clean up resources.

```python
import pytest
from framework.clients import UsersClient


@pytest.fixture
def verified_user(users_client: UsersClient) -> dict:
    user = UserBuilder().build()
    created = users_client.create(user)
    yield created
    users_client.delete(created["id"])  # cleanup guaranteed


@pytest.fixture
def admin_user(users_client: UsersClient) -> dict:
    user = UserBuilder().as_admin().build()
    created = users_client.create(user)
    yield created
    users_client.delete(created["id"])
```

### Fixture Scopes

| Scope | Lifetime | Use for |
|-------|----------|---------|
| `function` (default) | Per test | Mutable resources (users, orders) |
| `module` | Per file | Read-only shared data |
| `session` | Per run | Browser instance, DB connection |

---

## Factory Pattern

Factories create configured framework objects — clients, builders, drivers.
Tests receive ready-to-use objects without knowing construction details.

```python
class ApiClientFactory:
    @staticmethod
    def create(config: EnvConfig) -> "ApiClient":
        return ApiClient(
            base_url=config.base_url,
            timeout=config.timeout_seconds,
            auth=BearerAuth(config.api_token),
        )
```

```python
# conftest.py
@pytest.fixture(scope="session")
def api_client(env_config: EnvConfig) -> ApiClient:
    return ApiClientFactory.create(env_config)
```
