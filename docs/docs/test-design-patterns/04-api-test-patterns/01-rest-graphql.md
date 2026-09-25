---
date: 2026-07-12
tags:
  - test-automation
  - design-patterns
  - api-testing
---

# API Test Patterns: REST and GraphQL

## REST

### Request Builder

Encapsulate request construction. Keep tests readable and DRY.

```python
class RestRequestBuilder:
    def __init__(self, client: httpx.Client) -> None:
        self._client = client
        self._path = "/"
        self._params: dict = {}
        self._headers: dict = {}
        self._body: dict | None = None

    def get(self, path: str) -> "RestRequestBuilder":
        self._path = path
        self._method = "GET"
        return self

    def post(self, path: str) -> "RestRequestBuilder":
        self._path = path
        self._method = "POST"
        return self

    def with_param(self, key: str, value) -> "RestRequestBuilder":
        self._params[key] = value
        return self

    def with_body(self, body: dict) -> "RestRequestBuilder":
        self._body = body
        return self

    def send(self) -> httpx.Response:
        method = getattr(self._client, self._method.lower())
        kwargs: dict = {"params": self._params, "headers": self._headers}
        if self._body is not None:
            kwargs["json"] = self._body
        return method(self._path, **kwargs)
```

### Response Validator

Centralize contract checks on responses:

```python
import jsonschema


class RestResponseValidator:
    def __init__(self, response: httpx.Response) -> None:
        self._response = response

    def expect_status(self, code: int) -> "RestResponseValidator":
        assert self._response.status_code == code, (
            f"Expected {code}, got {self._response.status_code}\n{self._response.text}"
        )
        return self

    def expect_schema(self, schema: dict) -> "RestResponseValidator":
        jsonschema.validate(self._response.json(), schema)
        return self

    def expect_header(self, key: str, value: str) -> "RestResponseValidator":
        assert self._response.headers.get(key) == value
        return self

    def json(self) -> dict:
        return self._response.json()
```

### Schema Validation

Validate every response against an OpenAPI-derived JSON Schema:

```python
import jsonschema
import pathlib
import json

SCHEMAS = json.loads(pathlib.Path("tests/schemas/api.json").read_text())

def validate_response(response: httpx.Response, schema_name: str) -> None:
    jsonschema.validate(response.json(), SCHEMAS[schema_name])
```

### Test Checklist for REST

| Check | Description |
|---|---|
| Status code | Correct code for each scenario |
| Schema | Response body matches schema |
| Error format | RFC 9457 Problem Details structure |
| Headers | `Content-Type`, `ETag`, `Cache-Control` present |
| Pagination | `items`, `total`, `page`, `size` fields |
| Idempotency | Repeated PUT/DELETE returns same result |
| Auth | 401 without token, 403 with wrong role |

---

## GraphQL

### Query Builder

```python
class GraphQLQueryBuilder:
    def __init__(self, client: httpx.Client, url: str = "/graphql") -> None:
        self._client = client
        self._url = url

    def query(self, query_str: str, variables: dict | None = None) -> dict:
        payload: dict = {"query": query_str}
        if variables:
            payload["variables"] = variables
        response = self._client.post(self._url, json=payload)
        assert response.status_code == 200, f"GraphQL transport error: {response.text}"
        body = response.json()
        assert "errors" not in body, f"GraphQL errors: {body['errors']}"
        return body["data"]

    def query_with_errors(self, query_str: str, variables: dict | None = None) -> dict:
        payload: dict = {"query": query_str}
        if variables:
            payload["variables"] = variables
        response = self._client.post(self._url, json=payload)
        return response.json()
```

### Schema Validation for GraphQL

Validate against introspection schema:

```python
from gql import Client, gql
from gql.transport.httpx import HTTPXTransport

def make_gql_client(url: str, token: str) -> Client:
    transport = HTTPXTransport(
        url=url,
        headers={"Authorization": f"Bearer {token}"},
    )
    return Client(transport=transport, fetch_schema_from_transport=True)
```

### Resolver-Level Testing

Test individual resolver behaviour:

| Resolver scenario | Test |
|---|---|
| Field returns null | Query field, assert `null` |
| N+1 detection | Count DB queries via middleware |
| Auth on field | Query with insufficient role, expect error |
| Pagination | `first`/`after` args return correct slice |

### Test Checklist for GraphQL

| Check | Description |
|---|---|
| HTTP 200 always | GraphQL errors are in body, not status |
| `errors` field absent on success | No partial error states |
| `errors[].extensions.code` | Machine-readable error codes present |
| Depth limit | Query exceeding max depth returns error |
| Complexity limit | Overly expensive query rejected |
| Introspection disabled in prod | Security check |
