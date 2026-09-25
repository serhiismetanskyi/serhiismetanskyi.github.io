---
date: 2026-08-18
tags:
  - python
  - test-automation
---

# Test Design Patterns

Design patterns keep your test code organized, reusable, and easy to maintain.

---

## Page Object Model (POM)

The most important pattern for UI tests. Each page of your app gets a class.

### Why Use POM?

- **One place** to update when UI changes
- Tests read like **user actions**, not code
- Easy to **reuse** page interactions

### Implementation

```python
from playwright.sync_api import Page

class LoginPage:
    def __init__(self, page: Page) -> None:
        self.page = page
        self._username = page.locator("[data-testid='username']")
        self._password = page.locator("[data-testid='password']")
        self._submit = page.locator("[data-testid='submit']")
        self._error = page.locator("[data-testid='error-message']")

    def navigate(self) -> None:
        self.page.goto("/login")

    def login(self, username: str, password: str) -> None:
        self._username.fill(username)
        self._password.fill(password)
        self._submit.click()

    def get_error_message(self) -> str:
        return self._error.text_content() or ""
```

### Using POM in Tests

```python
def test_successful_login(page: Page):
    login_page = LoginPage(page)
    login_page.navigate()
    login_page.login("alice", "password123")
    assert page.url.endswith("/dashboard")

def test_login_with_wrong_password(page: Page):
    login_page = LoginPage(page)
    login_page.navigate()
    login_page.login("alice", "wrong")
    assert login_page.get_error_message() == "Invalid credentials"
```

---

## API Client Pattern

Wrap API calls in a reusable client class.

```python
import requests

class UserClient:
    def __init__(self, base_url: str, token: str) -> None:
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers["Authorization"] = f"Bearer {token}"

    def create(self, name: str, email: str) -> dict:
        response = self.session.post(
            f"{self.base_url}/users",
            json={"name": name, "email": email},
        )
        response.raise_for_status()
        return response.json()

    def get(self, user_id: int) -> dict:
        response = self.session.get(f"{self.base_url}/users/{user_id}")
        response.raise_for_status()
        return response.json()

    def delete(self, user_id: int) -> None:
        response = self.session.delete(f"{self.base_url}/users/{user_id}")
        response.raise_for_status()
```

### Using API Client in Tests

```python
import pytest

@pytest.fixture
def user_client() -> UserClient:
    return UserClient("https://api.staging.com", "test-token")

def test_create_and_get_user(user_client: UserClient):
    created = user_client.create("Alice", "alice@test.com")
    fetched = user_client.get(created["id"])
    assert fetched["name"] == "Alice"
```

---

## Factory Pattern

Create test data without repeating yourself.

```python
from dataclasses import dataclass, field

@dataclass
class UserFactory:
    _counter: int = field(default=0, init=False, repr=False)

    @classmethod
    def build(
        cls,
        name: str | None = None,
        email: str | None = None,
        role: str = "user",
    ) -> dict:
        cls._counter += 1
        return {
            "name": name or f"User_{cls._counter}",
            "email": email or f"user_{cls._counter}@test.com",
            "role": role,
        }
```

```python
def test_user_list():
    users = [UserFactory.build() for _ in range(3)]
    assert len(users) == 3
    assert users[0]["name"] != users[1]["name"]

def test_admin_user():
    admin = UserFactory.build(name="Admin", role="admin")
    assert admin["role"] == "admin"
```

---

## Builder Pattern

For complex test data with many fields:

```python
class RequestBuilder:
    def __init__(self) -> None:
        self._data: dict = {}
        self._headers: dict[str, str] = {}
        self._params: dict[str, str] = {}

    def with_body(self, data: dict) -> "RequestBuilder":
        self._data = data
        return self

    def with_auth(self, token: str) -> "RequestBuilder":
        self._headers["Authorization"] = f"Bearer {token}"
        return self

    def with_param(self, key: str, value: str) -> "RequestBuilder":
        self._params[key] = value
        return self

    def build(self) -> dict:
        return {
            "data": self._data,
            "headers": self._headers,
            "params": self._params,
        }
```

```python
request = (
    RequestBuilder()
    .with_body({"name": "Alice"})
    .with_auth("my-token")
    .with_param("format", "json")
    .build()
)
```

---

## Pattern Summary

| Pattern | Use For | Key Benefit |
|---------|---------|-------------|
| **POM** | UI tests | One place to update locators |
| **API Client** | API tests | Reusable request logic |
| **Factory** | Test data | Quick, unique test data |
| **Builder** | Complex objects | Readable object construction |

---

## Best Practices

- Use **POM** for all UI tests — never put locators directly in tests
- Use **API clients** for all API tests — never use raw `requests` in tests
- Use **factories** for generating test data
- Keep patterns **simple** — do not over-engineer
- Store page objects in a **separate folder** (e.g., `pages/`)
- Store API clients in a **separate folder** (e.g., `clients/`)
