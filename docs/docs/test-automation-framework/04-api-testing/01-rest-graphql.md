---
date: 2026-07-22
tags:
  - test-automation
  - architecture
  - api-testing
---

# API Testing — REST & GraphQL

## REST Testing Architecture

### Client Wrapper

Each domain gets its own client. No raw `httpx` calls in tests.

```python
import httpx
import logging

log = logging.getLogger(__name__)


class UsersClient:
    def __init__(self, driver: HttpDriver) -> None:
        self._driver = driver

    def create(self, data: dict) -> dict:
        log.debug("Creating user: %s", data.get("email"))
        response = self._driver.post("/users", json=data)
        response.raise_for_status()
        return response.json()

    def get(self, user_id: str) -> dict:
        log.debug("Fetching user: %s", user_id)
        return self._driver.get(f"/users/{user_id}").json()

    def update(self, user_id: str, data: dict) -> dict:
        return self._driver.patch(f"/users/{user_id}", json=data).json()

    def delete(self, user_id: str) -> None:
        self._driver.delete(f"/users/{user_id}").raise_for_status()
```

### REST Test Checklist

For every endpoint, cover:

| Category | Tests |
|----------|-------|
| Happy path | 200/201 with valid payload |
| Validation | 422 for each invalid field |
| Auth | 401 without token, 403 with insufficient role |
| Not found | 404 for non-existent resource |
| Conflict | 409 for duplicate creation |
| Error body | Correct `error` field and message |

### Schema Validation

```python
import jsonschema

USER_SCHEMA = {
    "type": "object",
    "required": ["id", "email", "role", "created_at"],
    "properties": {
        "id":         {"type": "string", "format": "uuid"},
        "email":      {"type": "string", "format": "email"},
        "role":       {"type": "string", "enum": ["USER", "ADMIN"]},
        "created_at": {"type": "string", "format": "date-time"},
    },
    "additionalProperties": False,
}


def test_create_user_response_schema(api_client, user_payload):
    response = api_client.users.create(user_payload)
    jsonschema.validate(response, USER_SCHEMA)
```

Schema tests catch contract breaks before clients notice them.

---

## GraphQL Testing

### Query Builder

```python
class GraphQLClient:
    def __init__(self, driver: HttpDriver) -> None:
        self._driver = driver

    def query(self, gql: str, variables: dict | None = None) -> dict:
        payload = {"query": gql}
        if variables:
            payload["variables"] = variables
        response = self._driver.post("/graphql", json=payload)
        response.raise_for_status()
        return response.json()

    def mutate(self, gql: str, variables: dict | None = None) -> dict:
        return self.query(gql, variables)
```

### GraphQL Test Patterns

```python
GET_USER = """
    query GetUser($id: ID!) {
        user(id: $id) {
            id
            email
            role
        }
    }
"""

def test_get_user_by_id(graphql_client, verified_user):
    result = graphql_client.query(GET_USER, variables={"id": verified_user["id"]})

    assert "errors" not in result
    assert result["data"]["user"]["email"] == verified_user["email"]
```

### GraphQL Error Testing

GraphQL returns HTTP 200 even for errors — check `errors` key:

```python
def test_get_nonexistent_user_returns_error(graphql_client):
    result = graphql_client.query(GET_USER, variables={"id": "nonexistent-id"})

    assert "errors" in result
    assert result["errors"][0]["extensions"]["code"] == "NOT_FOUND"
```

---

## REST vs GraphQL Testing Differences

| Aspect | REST | GraphQL |
|--------|------|---------|
| Success check | `status_code == 200` | `"errors" not in result` |
| Not found | `status_code == 404` | `errors[0].extensions.code == "NOT_FOUND"` |
| Auth failure | `status_code == 401` | `errors[0].extensions.code == "UNAUTHORIZED"` |
| Schema | JSON Schema on response | Fragment-based field presence check |
| Partial failure | Not applicable | `data` and `errors` can both be present |

---

## Versioning & Backwards Compatibility Tests

```python
@pytest.mark.parametrize("api_version", ["v1", "v2"])
def test_user_endpoint_across_versions(api_client, api_version, verified_user):
    response = api_client.get(
        f"/{api_version}/users/{verified_user['id']}"
    )
    assert response.status_code == 200
    assert response.json()["email"] == verified_user["email"]
```
