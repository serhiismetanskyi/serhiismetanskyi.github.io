---
date: 2026-07-21
tags:
  - test-automation
  - architecture
---

# Advanced Framework Patterns

## Fluent Interface

Fluent interfaces chain calls to read like a sentence.
Used for builders, request construction, and assertion chains.

```python
class OrderBuilder:
    def __init__(self) -> None:
        self._items: list = []
        self._user_id: str | None = None
        self._promo_code: str | None = None

    def for_user(self, user_id: str) -> "OrderBuilder":
        self._user_id = user_id
        return self

    def with_item(self, sku: str, qty: int = 1) -> "OrderBuilder":
        self._items.append({"sku": sku, "quantity": qty})
        return self

    def with_promo(self, code: str) -> "OrderBuilder":
        self._promo_code = code
        return self

    def build(self) -> dict:
        return {
            "user_id": self._user_id,
            "items": self._items,
            "promo_code": self._promo_code,
        }
```

```python
order = (
    OrderBuilder()
    .for_user(user.id)
    .with_item("WIDGET-001", qty=2)
    .with_item("GADGET-007")
    .with_promo("SAVE10")
    .build()
)
```

Fluent chaining risks:
- Mutable object — do not reuse builders across tests
- No validation at `with_*` time — catch missing required fields in `build()`

---

## Wrapper Pattern

Wraps a third-party library to isolate the framework from it.
Swapping `requests` for `httpx` touches one file, not 200 tests.

```python
import httpx
import logging

log = logging.getLogger(__name__)


class HttpDriver:
    def __init__(self, base_url: str, timeout: int = 30) -> None:
        self._client = httpx.Client(base_url=base_url, timeout=timeout)

    def get(self, path: str, **kwargs) -> httpx.Response:
        log.debug("GET %s", path)
        response = self._client.get(path, **kwargs)
        log.debug("Response %s: %s", response.status_code, path)
        return response

    def post(self, path: str, **kwargs) -> httpx.Response:
        log.debug("POST %s payload=%s", path, kwargs.get("json"))
        response = self._client.post(path, **kwargs)
        log.debug("Response %s: %s", response.status_code, path)
        return response

    def close(self) -> None:
        self._client.close()
```

---

## Custom Assertion Helpers

Move repeated assertion logic out of tests into named, reusable functions.
Named assertions produce better failure messages.

```python
def assert_user_created(response, expected_email: str) -> None:
    assert response.status_code == 201, (
        f"User creation failed with {response.status_code}: {response.text}"
    )
    body = response.json()
    assert body["email"] == expected_email, (
        f"Email mismatch: expected {expected_email!r}, got {body['email']!r}"
    )
    assert "id" in body, "Response missing 'id' field"


def assert_validation_error(response, field: str) -> None:
    assert response.status_code == 422, (
        f"Expected 422 validation error, got {response.status_code}"
    )
    errors = response.json().get("errors", [])
    field_errors = [e for e in errors if e.get("field") == field]
    assert field_errors, f"No validation error for field '{field}' in {errors}"
```

---

## Template Test Base Class

When many tests share identical setup/teardown, a base class avoids conftest sprawl.
Use sparingly — overuse couples tests to the base class.

```python
import pytest


class BaseApiTest:
    @pytest.fixture(autouse=True)
    def _setup(self, api_client, env_config):
        self.api = api_client
        self.config = env_config

    def assert_success(self, response) -> None:
        assert response.status_code < 400, (
            f"Unexpected error {response.status_code}: {response.text}"
        )
```

```python
class TestUserApi(BaseApiTest):
    def test_get_user_returns_200(self, verified_user):
        response = self.api.get(f"/users/{verified_user['id']}")
        self.assert_success(response)
```

---

## Data-Driven Tests with Parametrize

Run the same test logic with multiple inputs. One function, many scenarios.

```python
import pytest


INVALID_EMAILS = [
    ("no-at-sign", "missing @ symbol"),
    ("@nodomain", "missing local part"),
    ("user@", "missing domain"),
    ("user @domain.com", "space in email"),
    ("", "empty string"),
]


@pytest.mark.parametrize("email,reason", INVALID_EMAILS)
def test_invalid_email_rejected(api_client, email, reason):
    response = api_client.post("/users", json={"email": email})
    assert response.status_code == 422, (
        f"Expected rejection for '{email}' ({reason}), "
        f"got {response.status_code}"
    )
```

When to use `parametrize` vs separate tests:
- Same assertion logic, different inputs → `parametrize`
- Different assertion logic or different setup → separate tests
- More than 7 parameter sets → consider loading from external YAML/JSON
