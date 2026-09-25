---
date: 2026-08-17
tags:
  - python
  - pytest
  - testing
---

# Assertions & Mocking

Custom assertions make tests more readable. Mocking isolates code from external dependencies.

---

## Built-in Assertions

pytest rewrites `assert` statements to show clear error messages:

```python
def test_user_name():
    user = {"name": "Alice", "age": 30}
    assert user["name"] == "Alice"
    # On failure: AssertionError: assert 'Bob' == 'Alice'
```

### Assert with Messages

```python
def test_positive_score(score: int):
    assert score > 0, f"Score must be positive, got {score}"
```

---

## Custom Assertion Helpers

Wrap repeated assertions in helper functions:

```python
def assert_valid_user(user: dict) -> None:
    assert "id" in user, "User must have an id"
    assert "name" in user, "User must have a name"
    assert "email" in user, "User must have an email"
    assert "@" in user["email"], f"Invalid email: {user['email']}"
    assert isinstance(user["id"], int), "User id must be an integer"

def test_create_user():
    user = api.create_user("Alice", "alice@test.com")
    assert_valid_user(user)
```

### Custom Response Assertion

```python
import requests

def assert_status(response: requests.Response, expected: int) -> None:
    assert response.status_code == expected, (
        f"Expected status {expected}, got {response.status_code}. "
        f"Body: {response.text[:200]}"
    )

def test_get_user():
    response = requests.get("/users/1")
    assert_status(response, 200)
```

### Custom Schema Assertion

```python
from pydantic import BaseModel

class UserSchema(BaseModel):
    id: int
    name: str
    email: str

def assert_schema(response: requests.Response, schema: type) -> object:
    return schema.model_validate(response.json())

def test_user_schema():
    response = requests.get("/users/1")
    user = assert_schema(response, UserSchema)
    assert user.name == "Alice"
```

---

## Mocking

A mock replaces a real object with a fake one. Use mocks to isolate your code from:

- External APIs
- Databases
- File system
- Time / random values
- Email / SMS services

### Install pytest-mock

```bash
uv add --dev pytest-mock
```

### Basic Mock

```python
def test_send_email(mocker):
    mock_send = mocker.patch("app.services.send_email")
    mock_send.return_value = True

    result = notify_user("alice@test.com", "Welcome!")

    assert result is True
    mock_send.assert_called_once_with("alice@test.com", "Welcome!")
```

### Mock HTTP Requests

```python
def test_api_call(mocker):
    mock_get = mocker.patch("requests.get")
    mock_get.return_value.status_code = 200
    mock_get.return_value.json.return_value = {"name": "Alice"}

    result = fetch_user(1)

    assert result["name"] == "Alice"
    mock_get.assert_called_once_with("https://api.example.com/users/1")
```

### Mock with `unittest.mock`

```python
from unittest.mock import MagicMock, patch

def test_database_call():
    with patch("app.db.get_user") as mock_db:
        mock_db.return_value = {"id": 1, "name": "Alice"}

        user = get_user_by_id(1)

        assert user["name"] == "Alice"
        mock_db.assert_called_once_with(1)
```

---

## Stubs vs Mocks

| Concept | Purpose | Verifies Calls? |
|---------|---------|----------------|
| **Stub** | Provides fake data | No |
| **Mock** | Provides fake data AND verifies how it was called | Yes |
| **Spy** | Calls real function AND records how it was called | Yes |

```python
# Stub — just returns data
mocker.patch("requests.get").return_value.json.return_value = {"id": 1}

# Mock — verifies behavior
mock_send = mocker.patch("app.email.send")
...
mock_send.assert_called_once_with("alice@test.com")  # verifies call
```

---

## Mock Common Patterns

### Mock Current Time

```python
from datetime import datetime
from unittest.mock import patch

def test_created_at(mocker):
    fixed_time = datetime(2026, 1, 15, 12, 0, 0)
    mocker.patch("app.models.datetime").now.return_value = fixed_time

    record = create_record("data")

    assert record["created_at"] == fixed_time
```

### Mock Environment Variables

```python
def test_config_from_env(monkeypatch):
    monkeypatch.setenv("API_KEY", "test-key-123")
    monkeypatch.setenv("API_URL", "https://staging.example.com")

    config = load_config()

    assert config.api_key == "test-key-123"
```

### Mock File System

```python
def test_read_config(tmp_path):
    config_file = tmp_path / "config.json"
    config_file.write_text('{"env": "test", "debug": true}')

    config = read_config(str(config_file))

    assert config["env"] == "test"
```

---

## Best Practices

- Use **custom assertion helpers** to avoid repeating the same checks
- Use **mocks** to isolate tests from external services
- **Verify mock calls** — not just the return value
- Use **`monkeypatch`** for environment variables and simple attributes
- Use **`tmp_path`** fixture for temporary files (built into pytest)
- Do not over-mock — test real behavior when possible
- Keep mocks **close to the test** — not in a shared file
