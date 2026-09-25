---
date: 2026-08-17
tags:
  - python
  - pytest
  - testing
---

# Test Architecture

Good test architecture keeps your test code organized, maintainable, and scalable.

---

## Project Structure

```
project/
├── src/
│   └── app/
│       ├── __init__.py
│       ├── models.py
│       └── services.py
├── tests/
│   ├── conftest.py
│   ├── unit/
│   │   ├── conftest.py
│   │   ├── test_models.py
│   │   └── test_services.py
│   ├── integration/
│   │   ├── conftest.py
│   │   └── test_database.py
│   └── e2e/
│       ├── conftest.py
│       └── test_user_flow.py
├── pyproject.toml
└── uv.lock
```

### Key Rules

- Separate tests by **level** (unit, integration, e2e)
- Mirror the **source structure** in test folders
- Use **`conftest.py`** at each level for shared fixtures
- Keep test files **focused** — one test file per source module

---

## Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Test file | `test_<module>.py` | `test_user.py` |
| Test function | `test_<what>_<condition>` | `test_login_with_valid_credentials` |
| Test class | `Test<Feature>` | `TestUserCreation` |
| Fixture | `<noun>` or `<adjective>_<noun>` | `sample_user`, `auth_headers` |
| conftest | `conftest.py` | Always this name |

---

## Test Configuration

### pyproject.toml

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py"]
python_functions = ["test_*"]
python_classes = ["Test*"]
addopts = "-v --tb=short --strict-markers"
markers = [
    "unit: unit tests",
    "integration: integration tests",
    "e2e: end-to-end tests",
    "slow: slow tests",
]
```

---

## Design Patterns for Tests

### Page Object Model (POM)

Used in UI tests. Each page of the app has a class:

```python
class LoginPage:
    def __init__(self, page) -> None:
        self.page = page
        self.url = "/login"

    def navigate(self) -> None:
        self.page.goto(self.url)

    def login(self, username: str, password: str) -> None:
        self.page.fill("#username", username)
        self.page.fill("#password", password)
        self.page.click("#submit")

def test_successful_login(page):
    login_page = LoginPage(page)
    login_page.navigate()
    login_page.login("alice", "password123")
    assert page.url.endswith("/dashboard")
```

### API Client Abstraction

Wrap API calls in a client class:

```python
class UserApiClient:
    def __init__(self, base_url: str, headers: dict) -> None:
        self.base_url = base_url
        self.headers = headers

    def create_user(self, name: str, email: str) -> dict:
        response = requests.post(
            f"{self.base_url}/users",
            json={"name": name, "email": email},
            headers=self.headers,
        )
        response.raise_for_status()
        return response.json()

    def get_user(self, user_id: int) -> dict:
        response = requests.get(
            f"{self.base_url}/users/{user_id}",
            headers=self.headers,
        )
        response.raise_for_status()
        return response.json()
```

### Singleton Pattern

Use Singleton when you need exactly **one** instance of something across all tests (e.g. a shared browser session or config). Use carefully — it can cause test pollution.

```python
class ConfigManager:
    _instance: "ConfigManager | None" = None

    def __new__(cls) -> "ConfigManager":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._config = {}
        return cls._instance

    def set(self, key: str, value: str) -> None:
        self._config[key] = value

    def get(self, key: str) -> str:
        return self._config.get(key, "")
```

!!! warning "Use Singleton carefully in tests"
    Singleton holds state between tests. Always clean up after each test to avoid test pollution.

---

### Factory Pattern

Create test data with factories:

```python
class UserFactory:
    _counter: int = 0

    @classmethod
    def create(
        cls,
        name: str | None = None,
        email: str | None = None,
    ) -> dict:
        cls._counter += 1
        return {
            "name": name or f"User_{cls._counter}",
            "email": email or f"user_{cls._counter}@test.com",
        }

def test_user_list():
    users = [UserFactory.create() for _ in range(5)]
    assert len(users) == 5
    assert all("@test.com" in u["email"] for u in users)
```

---

## Fixtures Organization

### Layered conftest.py

```
tests/
├── conftest.py          # shared: base_url, auth
├── unit/
│   └── conftest.py      # unit: mocks, stubs
├── integration/
│   └── conftest.py      # integration: db, services
└── e2e/
    └── conftest.py      # e2e: browser, pages
```

---

## Best Practices

- Separate tests by **level** (unit / integration / e2e)
- Use **Page Object Model** for UI tests
- Use **API client classes** for API tests
- Use **factories** to create test data
- Keep test logic **simple** — no loops or conditions in tests
- **Avoid shared state** between tests
- **Avoid test duplication** — use parametrize and fixtures
- Keep test data **close to tests** — in fixtures or factories
