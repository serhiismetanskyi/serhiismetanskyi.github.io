---
date: 2026-06-02
tags:
  - api
  - architecture
  - rest
---

# REST API: Code Examples (Python + Pydantic + Playwright)

Practical code examples for REST API testing. Each section shows a pattern you can copy into your project.

## 1. Pydantic Models for API Validation

Define strict input/output schemas. Use `extra = "forbid"` to catch unexpected fields early.

```python
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from uuid import UUID
from enum import Enum

class UserStatus(str, Enum):
    active = "active"
    inactive = "inactive"
    pending = "pending"

class UserCreate(BaseModel):
    """Input schema - no id, no timestamps."""
    name: str = Field(min_length=2, max_length=100)
    email: str = Field(pattern=r'^[\w.+-]+@[\w-]+\.[\w.]+$')
    age: Optional[int] = Field(default=None, ge=0, le=150)
    status: UserStatus = UserStatus.pending
    model_config = {"extra": "forbid"}

class UserResponse(BaseModel):
    """Output schema - includes server-generated fields."""
    id: UUID
    name: str
    email: str
    age: Optional[int] = None
    status: UserStatus
    created_at: datetime
    updated_at: datetime

class ErrorDetail(BaseModel):
    field: str
    message: str
    code: str

class ErrorResponse(BaseModel):
    code: str
    message: str
    request_id: Optional[str] = None
    details: list[ErrorDetail] = Field(default_factory=list)

class PaginatedResponse(BaseModel):
    data: list[UserResponse]
    total: int
    limit: int
    offset: int
    next: Optional[str] = None
    prev: Optional[str] = None
```

## 2. Playwright API Client Setup (pytest fixture)

Create a reusable API context with base URL and auth headers. The fixture lives for the whole test session.

```python
import pytest
from playwright.sync_api import Playwright, APIRequestContext

BASE_URL = "https://api.example.com/v1"

@pytest.fixture(scope="session")
def api_context(playwright: Playwright):
    """Create API context with auth headers."""
    context = playwright.request.new_context(
        base_url=BASE_URL,
        extra_http_headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer test-token-123",
        },
    )
    yield context
    context.dispose()
```

## 3. Test: CRUD Operations

Basic create and read tests. Validate each response against a Pydantic model to catch schema changes.

```python
def test_create_user(api_context):
    """Test POST /users creates a user and validates response schema."""
    payload = {"name": "John Doe", "email": "john@example.com", "age": 30}
    response = api_context.post("/users", data=payload)
    assert response.status == 201
    user = UserResponse.model_validate(response.json())
    assert user.name == "John Doe"

def test_get_user(api_context):
    """Test GET /users/{id} returns valid user."""
    response = api_context.get("/users/550e8400-e29b-41d4-a716-446655440000")
    assert response.status == 200
    user = UserResponse.model_validate(response.json())
    assert user.id is not None
```

## 4. Test: Schema Validation

Check that the server rejects bad input with proper error codes and messages.

```python
def test_reject_unknown_fields(api_context):
    """Server should reject request with unknown fields."""
    payload = {"name": "John", "email": "john@test.com", "role": "admin"}
    response = api_context.post("/users", data=payload)
    assert response.status == 422
    error = ErrorResponse.model_validate(response.json())
    assert error.code == "VALIDATION_ERROR"

def test_required_fields_missing(api_context):
    """Server should return error when required field is missing."""
    payload = {"name": "John"}  # missing email
    response = api_context.post("/users", data=payload)
    assert response.status == 422

def test_invalid_email_format(api_context):
    payload = {"name": "John", "email": "not-an-email"}
    response = api_context.post("/users", data=payload)
    assert response.status == 422
```

## 5. Test: Pagination

Verify offset-based pagination metadata and edge cases like requesting beyond the dataset.

```python
def test_pagination_offset(api_context):
    """Test offset-based pagination returns correct metadata."""
    response = api_context.get("/users?limit=10&offset=0")
    assert response.status == 200
    page = PaginatedResponse.model_validate(response.json())
    assert page.limit == 10
    assert page.offset == 0
    assert len(page.data) <= 10

def test_pagination_beyond_dataset(api_context):
    """Offset beyond total should return empty list."""
    response = api_context.get("/users?limit=10&offset=999999")
    assert response.status == 200
    page = PaginatedResponse.model_validate(response.json())
    assert len(page.data) == 0
```

## 6. Test: Caching and Concurrency
Use ETags for conditional requests and optimistic locking to prevent lost updates.
```python
def test_etag_caching(api_context):
    """Test ETag-based conditional requests."""
    response = api_context.get("/users/550e8400-e29b-41d4-a716-446655440000")
    etag = response.headers.get("etag")
    assert etag is not None
    cached = api_context.get(
        "/users/550e8400-e29b-41d4-a716-446655440000",
        headers={"If-None-Match": etag},
    )
    assert cached.status == 304

def test_optimistic_locking(api_context):
    """Test concurrent update conflict detection."""
    response = api_context.get("/users/550e8400-e29b-41d4-a716-446655440000")
    etag = response.headers.get("etag")
    update1 = api_context.put(
        "/users/550e8400-e29b-41d4-a716-446655440000",
        data={"name": "Updated"},
        headers={"If-Match": etag},
    )
    assert update1.status == 200
    update2 = api_context.put(
        "/users/550e8400-e29b-41d4-a716-446655440000",
        data={"name": "Conflict"},
        headers={"If-Match": etag},
    )
    assert update2.status == 412  # RFC 7232: If-Match failure = 412 Precondition Failed
```

## 7. Test: Idempotency

Use an `Idempotency-Key` header to make POST requests safe to retry without creating duplicates.

```python
import uuid

def test_post_idempotency_key(api_context):
    """Same idempotency key should return same result."""
    key = str(uuid.uuid4())
    payload = {"name": "Jane", "email": "jane@test.com"}
    headers = {"Idempotency-Key": key}
    resp1 = api_context.post("/users", data=payload, headers=headers)
    resp2 = api_context.post("/users", data=payload, headers=headers)
    assert resp1.status == 201
    assert resp2.status == 201
    assert resp1.json()["id"] == resp2.json()["id"]
```
