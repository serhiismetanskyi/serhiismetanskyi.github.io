---
date: 2026-08-18
tags:
  - python
  - test-automation
---

# API Testing

API testing checks that your backend works correctly. You send HTTP requests and verify the responses.

---

## HTTP Basics

| Method | Purpose | Example |
|--------|---------|---------|
| `GET` | Read data | Get list of users |
| `POST` | Create data | Create a new user |
| `PUT` | Replace data | Update entire user |
| `PATCH` | Partial update | Update user's email |
| `DELETE` | Remove data | Delete a user |

### Common Status Codes

| Code | Meaning |
|------|---------|
| `200` | OK — success |
| `201` | Created — resource created |
| `204` | No Content — success, no body |
| `400` | Bad Request — invalid input |
| `401` | Unauthorized — not logged in |
| `403` | Forbidden — no permission |
| `404` | Not Found — resource missing |
| `500` | Server Error — backend bug |

---

## Using the `requests` Library

### Install

```bash
uv add requests
```

### GET Request

```python
import requests

response = requests.get("https://api.example.com/users")
assert response.status_code == 200

users = response.json()
assert len(users) > 0
```

### POST Request

```python
import requests

payload = {"name": "Alice", "email": "alice@example.com"}
response = requests.post(
    "https://api.example.com/users",
    json=payload,
)
assert response.status_code == 201

created_user = response.json()
assert created_user["name"] == "Alice"
```

### Request with Headers

```python
import requests

headers = {
    "Authorization": "Bearer my-token",
    "Content-Type": "application/json",
}
response = requests.get(
    "https://api.example.com/profile",
    headers=headers,
)
```

### Request with Query Parameters

```python
import requests

params = {"page": 1, "limit": 10, "status": "active"}
response = requests.get(
    "https://api.example.com/users",
    params=params,
)
# URL becomes: /users?page=1&limit=10&status=active
```

---

## Response Validation

### Check Status Code

```python
assert response.status_code == 200
```

### Check Response Body

```python
data = response.json()
assert data["name"] == "Alice"
assert "email" in data
assert isinstance(data["age"], int)
```

### Check Response Headers

```python
assert response.headers["Content-Type"] == "application/json"
```

### Validate with Pydantic

```python
from pydantic import BaseModel

class UserResponse(BaseModel):
    id: int
    name: str
    email: str

response = requests.get("https://api.example.com/users/1")
user = UserResponse.model_validate(response.json())
assert user.name == "Alice"
```

!!! tip "Use Pydantic for schema validation"
    Pydantic validates the response structure automatically and gives clear error messages.

---

## API Test Example (Full)

```python
import pytest
import requests

BASE_URL = "https://api.example.com"

@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"Authorization": "Bearer test-token"}

class TestUserApi:
    def test_create_user(self, auth_headers: dict[str, str]):
        payload = {"name": "Alice", "email": "alice@test.com"}
        response = requests.post(
            f"{BASE_URL}/users",
            json=payload,
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Alice"

    def test_get_users(self, auth_headers: dict[str, str]):
        response = requests.get(
            f"{BASE_URL}/users",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_get_nonexistent_user(self, auth_headers: dict[str, str]):
        response = requests.get(
            f"{BASE_URL}/users/99999",
            headers=auth_headers,
        )
        assert response.status_code == 404
```

---

## Best Practices

- Use **API client classes** — do not put raw `requests` calls in every test
- Validate **response schema** with Pydantic, not just status codes
- Use **fixtures** for authentication headers and base URL
- Test **positive and negative** scenarios (success + errors)
- Do not **hardcode** test data — use factories or fixtures
- Check **response time** for performance-sensitive endpoints
- Use **parametrize** for testing multiple status codes or inputs
