---
date: 2026-07-12
tags:
  - test-automation
  - design-patterns
---

# Assertion Pattern, Test Template Pattern, Data-Driven Pattern

## Assertion Pattern

### Concept

Centralise assertion logic in reusable helpers or custom matchers to:
- Avoid duplication of complex assertion blocks
- Provide meaningful error messages
- Version assertion logic alongside the schema

### Custom Assertion Helpers

```python
import httpx


def assert_created(response: httpx.Response, *, id_field: str = "id") -> dict:
    assert response.status_code == 201, (
        f"Expected 201 Created, got {response.status_code}: {response.text}"
    )
    body = response.json()
    assert id_field in body, f"Response missing '{id_field}' field: {body}"
    return body


def assert_validation_error(response: httpx.Response, *, field: str) -> None:
    assert response.status_code == 422, (
        f"Expected 422 Unprocessable, got {response.status_code}"
    )
    errors = response.json().get("detail", [])
    fields = [e["loc"][-1] for e in errors if isinstance(e.get("loc"), list)]
    assert field in fields, f"Expected validation error on '{field}', got errors on: {fields}"


def assert_paginated(response: httpx.Response, *, min_items: int = 0) -> dict:
    assert response.status_code == 200
    body = response.json()
    for key in ("items", "total", "page", "size"):
        assert key in body, f"Paginated response missing '{key}'"
    assert len(body["items"]) >= min_items
    return body
```

### Pytest Custom Matchers (pytest-check style)

```python
import pytest


class ResponseMatcher:
    def __init__(self, response: httpx.Response) -> None:
        self._r = response

    def has_status(self, code: int) -> "ResponseMatcher":
        assert self._r.status_code == code, (
            f"Expected status {code}, got {self._r.status_code}\nBody: {self._r.text}"
        )
        return self

    def has_field(self, key: str) -> "ResponseMatcher":
        assert key in self._r.json(), f"Response missing field '{key}'"
        return self

    def field_equals(self, key: str, value) -> "ResponseMatcher":
        actual = self._r.json().get(key)
        assert actual == value, f"Field '{key}': expected {value!r}, got {actual!r}"
        return self
```

---

## Test Template Pattern

### Concept

A test template defines a reusable flow (sequence of steps) that parameterises
the variable parts, ensuring all scenarios follow the same structure.

Useful for: CRUD flows, auth scenarios, validation sweeps.

### Base Template Class

```python
import abc
import httpx


class CrudTestTemplate(abc.ABC):
    @abc.abstractmethod
    def create_payload(self) -> dict: ...

    @abc.abstractmethod
    def update_payload(self) -> dict: ...

    @abc.abstractmethod
    def resource_path(self) -> str: ...

    def run_crud_flow(self, client: httpx.Client) -> None:
        # Create
        res = client.post(self.resource_path(), json=self.create_payload())
        assert res.status_code == 201
        resource_id = res.json()["id"]

        # Read
        res = client.get(f"{self.resource_path()}/{resource_id}")
        assert res.status_code == 200

        # Update
        res = client.patch(f"{self.resource_path()}/{resource_id}", json=self.update_payload())
        assert res.status_code == 200

        # Delete
        res = client.delete(f"{self.resource_path()}/{resource_id}")
        assert res.status_code == 204


class UserCrudTest(CrudTestTemplate):
    def create_payload(self) -> dict:
        return UserBuilder().as_dict()

    def update_payload(self) -> dict:
        return {"username": "updated-name"}

    def resource_path(self) -> str:
        return "/users"
```

---

## Data-Driven Pattern

### Concept

Data-driven tests separate test logic from test data.
The same test function runs with multiple data sets via parameterisation.

### pytest.mark.parametrize

```python
import pytest

VALID_EMAILS = ["user@example.com", "user+tag@example.co.uk", "u@x.io"]
INVALID_EMAILS = ["notanemail", "@nodomain", "missing@", "double@@domain.com"]

@pytest.mark.parametrize("email", VALID_EMAILS)
def test_valid_email_accepted(api_client, email):
    response = api_client.post("/users", json=UserBuilder().email(email).as_dict())
    assert response.status_code == 201

@pytest.mark.parametrize("email", INVALID_EMAILS)
def test_invalid_email_rejected(api_client, email):
    response = api_client.post("/users", json=UserBuilder().email(email).as_dict())
    assert_validation_error(response, field="email")
```

### External Data Sources

```python
import json
import pathlib
import pytest

DATA_DIR = pathlib.Path(__file__).parent / "data"

def load_cases(name: str) -> list[dict]:
    return json.loads((DATA_DIR / f"{name}.json").read_text())

@pytest.mark.parametrize("case", load_cases("user_validation"))
def test_user_validation(api_client, case):
    response = api_client.post("/users", json=case["input"])
    assert response.status_code == case["expected_status"]
```

### Data-Driven vs Parameterized

| Approach | Source | Best for |
|---|---|---|
| `parametrize` inline | Code | Small, stable data sets |
| `parametrize` from function | Code lists | Medium data sets |
| External JSON / CSV | Files | Large, business-owned data sets |
| Property-based (Hypothesis) | Generated | Edge-case discovery |
