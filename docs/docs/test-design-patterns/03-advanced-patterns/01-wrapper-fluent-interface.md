---
date: 2026-07-12
tags:
  - test-automation
  - design-patterns
---

# Wrapper / Abstraction Layer and Fluent Interface Pattern

## Wrapper / Abstraction Layer

### Concept

A wrapper hides the implementation details of a library, HTTP client, or browser API
behind a domain-specific interface. Tests interact with the wrapper, not the underlying tool.

```
Test  →  ApiWrapper.get_user(id)  →  httpx.Client.get("/users/{id}")
```

Benefits:
- Swap underlying library without changing tests
- Add logging, retries, schema validation in one place
- Simplify test code by removing protocol boilerplate

### HTTP Client Wrapper

```python
import logging
import httpx

logger = logging.getLogger(__name__)


class ApiClient:
    def __init__(self, base_url: str, token: str | None = None) -> None:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        self._client = httpx.Client(base_url=base_url, headers=headers)
        logger.debug("ApiClient initialised: base_url=%s", base_url)

    def get(self, path: str, **kwargs) -> httpx.Response:
        logger.debug("GET %s params=%s", path, kwargs.get("params"))
        response = self._client.get(path, **kwargs)
        logger.debug("Response: status=%d", response.status_code)
        return response

    def post(self, path: str, json: dict, **kwargs) -> httpx.Response:
        logger.debug("POST %s body=%s", path, json)
        response = self._client.post(path, json=json, **kwargs)
        logger.debug("Response: status=%d body=%s", response.status_code, response.text[:200])
        return response

    def delete(self, path: str, **kwargs) -> httpx.Response:
        logger.debug("DELETE %s", path)
        return self._client.delete(path, **kwargs)

    def close(self) -> None:
        self._client.close()
```

### Domain-Specific Wrapper Layer

On top of `ApiClient`, add a resource-level wrapper:

```python
class UserApiClient:
    def __init__(self, client: ApiClient) -> None:
        self._client = client

    def create(self, payload: dict) -> dict:
        response = self._client.post("/users", json=payload)
        response.raise_for_status()
        return response.json()

    def get(self, user_id: str) -> dict:
        response = self._client.get(f"/users/{user_id}")
        response.raise_for_status()
        return response.json()

    def delete(self, user_id: str) -> None:
        self._client.delete(f"/users/{user_id}").raise_for_status()
```

### When to Use

| Scenario | Use Wrapper |
|---|---|
| Multiple tests call the same endpoint | Yes |
| Need request/response logging in all tests | Yes |
| Swapping HTTP clients in future | Yes |
| Single test, one-off call | No |

---

## Fluent Interface Pattern

### Concept

Fluent interface enables readable, chained method calls that describe a sequence of steps.
Each method returns `self` (or the next step object).

```python
response = (
    ApiRequest()
    .to("/users")
    .with_method("POST")
    .with_header("X-Request-ID", "abc123")
    .with_body(UserBuilder().role("admin").as_dict())
    .execute(client)
)
```

### Request Builder (Fluent)

```python
class ApiRequest:
    def __init__(self) -> None:
        self._path = "/"
        self._method = "GET"
        self._headers: dict = {}
        self._body: dict | None = None
        self._params: dict = {}

    def to(self, path: str) -> "ApiRequest":
        self._path = path
        return self

    def with_method(self, method: str) -> "ApiRequest":
        self._method = method.upper()
        return self

    def with_header(self, key: str, value: str) -> "ApiRequest":
        self._headers[key] = value
        return self

    def with_body(self, body: dict) -> "ApiRequest":
        self._body = body
        return self

    def with_params(self, **params) -> "ApiRequest":
        self._params.update(params)
        return self

    def execute(self, client: ApiClient) -> httpx.Response:
        method = getattr(client, self._method.lower())
        kwargs: dict = {"headers": self._headers, "params": self._params}
        if self._body is not None:
            kwargs["json"] = self._body
        return method(self._path, **kwargs)
```

### Benefits

| Benefit | Description |
|---|---|
| Readability | Reads like a sentence |
| Composability | Steps can be conditionally added |
| Discoverability | IDE autocomplete on each step |

### Risks

| Risk | Mitigation |
|---|---|
| Long chains become hard to debug | Break chains into named variables at key steps |
| Mutation through shared builder | Return new instance or use `copy.copy()` |
| Hides errors in chains | Each method should validate its input |
