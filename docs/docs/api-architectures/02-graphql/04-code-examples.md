---
date: 2026-06-04
tags:
  - api
  - architecture
  - graphql
---

# GraphQL: Code Examples (Python + Pydantic + Playwright)

Practical code examples for testing GraphQL APIs. Uses Pydantic for response validation and Playwright for HTTP requests.

---

## 1. Pydantic Models for GraphQL Responses

These models validate the shape and types of GraphQL responses. Use them in every test to catch unexpected changes early.

```python
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class GraphQLError(BaseModel):
    """Single error entry from GraphQL response."""

    message: str
    locations: Optional[list[dict]] = None
    path: Optional[list[str | int]] = None
    extensions: Optional[dict] = None


class UserNode(BaseModel):
    id: str
    name: str
    email: str
    created_at: datetime


class PostNode(BaseModel):
    id: str
    title: str
    body: str
    author: UserNode


class UserQueryResponse(BaseModel):
    """Validates the full GraphQL response envelope."""

    data: Optional[dict] = None
    errors: Optional[list[GraphQLError]] = None


class UsersListData(BaseModel):
    users: list[UserNode]
```

Key points:
- `UserQueryResponse` handles both success and error cases in one model.
- `Optional` fields allow partial responses (GraphQL can return data + errors together).
- Pydantic raises `ValidationError` if the response shape does not match — test fails fast.

---

## 2. Playwright GraphQL Client Fixture

Playwright's `APIRequestContext` sends HTTP requests without a browser. Good for API testing.

```python
import pytest
from playwright.sync_api import Playwright, APIRequestContext, APIResponse

BASE_URL = "https://api.example.com/graphql"


@pytest.fixture(scope="session")
def gql_context(playwright: Playwright) -> APIRequestContext:
    """Create a reusable GraphQL client for the test session."""
    context = playwright.request.new_context(
        base_url=BASE_URL,
        extra_http_headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer test-token",
        },
    )
    yield context
    context.dispose()


def gql_query(
    context: APIRequestContext,
    query: str,
    variables: dict | None = None,
) -> APIResponse:
    """Send a GraphQL query and return the raw response."""
    payload: dict = {"query": query}
    if variables:
        payload["variables"] = variables
    response = context.post("", data=payload)
    return response
```

Key points:
- Session-scoped fixture reuses one HTTP connection for all tests.
- `gql_query` helper keeps tests clean — each test only defines query + variables.
- Authorization header is set once in the fixture.

---

## 3. Query and Mutation Tests

### Test: fetch a user by ID

```python
def test_query_user(gql_context: APIRequestContext) -> None:
    query = """
    query GetUser($id: ID!) {
        user(id: $id) {
            id
            name
            email
            created_at
        }
    }
    """
    response = gql_query(gql_context, query, {"id": "user-123"})
    assert response.status == 200

    body = UserQueryResponse.model_validate(response.json())
    assert body.errors is None
    assert body.data is not None
```

### Test: query depth limit rejects deep nesting

```python
def test_query_depth_limit(gql_context: APIRequestContext) -> None:
    deep_query = """
    {
      user(id: "1") {
        posts { comments { author { posts { comments {
          author { name }
        } } } } }
      }
    }
    """
    response = gql_query(gql_context, deep_query)
    assert response.status == 200

    body = UserQueryResponse.model_validate(response.json())
    assert body.errors is not None
```

### Test: introspection disabled in production

```python
def test_introspection_disabled(gql_context: APIRequestContext) -> None:
    query = "{ __schema { types { name } } }"
    response = gql_query(gql_context, query)
    assert response.status in (200, 400)

    body = response.json()
    assert "errors" in body
```

### Test: mutation creates a user

```python
def test_mutation_create_user(gql_context: APIRequestContext) -> None:
    mutation = """
    mutation CreateUser($input: CreateUserInput!) {
        createUser(input: $input) {
            id
            name
            email
        }
    }
    """
    variables = {
        "input": {"name": "Alice", "email": "alice@test.com"},
    }
    response = gql_query(gql_context, mutation, variables)
    assert response.status == 200

    body = response.json()
    assert body.get("errors") is None
    assert body["data"]["createUser"]["name"] == "Alice"
```

Key points:
- Every test validates status code AND response body.
- Pydantic `model_validate` catches schema drift automatically.
- Depth limit test proves the server rejects abusive queries.
- Introspection test verifies production security configuration.
