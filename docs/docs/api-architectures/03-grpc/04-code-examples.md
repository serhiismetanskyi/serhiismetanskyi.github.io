---
date: 2026-06-05
tags:
  - api
  - architecture
  - grpc
---

# gRPC: Code Examples (Python + Pydantic + Playwright)

Playwright is HTTP-based, so for gRPC we use `grpcio` for native calls
and Pydantic for validation. We also show how to test gRPC-Gateway (HTTP/JSON proxy)
with Playwright's API context.

---

## 1. Proto-to-Pydantic Models

```python
from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class UserStatus(str, Enum):
    """Maps to protobuf UserStatus enum."""

    active = "ACTIVE"
    inactive = "INACTIVE"


class UserProto(BaseModel):
    """Pydantic model matching protobuf User message."""

    id: str
    name: str = Field(min_length=1, max_length=100)
    email: str
    age: Optional[int] = Field(default=None, ge=0)
    status: UserStatus = UserStatus.active


class ListUsersResponse(BaseModel):
    """Matches protobuf ListUsersResponse message."""

    users: list[UserProto]
    next_page_token: str = ""
    total_count: int = Field(ge=0)


class GrpcError(BaseModel):
    """Structured gRPC error for validation."""

    code: int
    message: str
    details: list[dict] = Field(default_factory=list)
```

---

## 2. gRPC Native Client Tests (grpcio)

```python
import grpc
import pytest
from user_pb2 import GetUserRequest, ListUsersRequest, CreateUserRequest
from user_pb2_grpc import UserServiceStub

GRPC_TARGET = "localhost:50051"
TIMEOUT_SEC = 5


@pytest.fixture()
def channel():
    """Create gRPC channel, close after test."""
    ch = grpc.insecure_channel(GRPC_TARGET)
    yield ch
    ch.close()


@pytest.fixture()
def stub(channel):
    """Create UserService stub."""
    return UserServiceStub(channel)


def test_unary_get_user(stub):
    """Test unary RPC — get single user."""
    request = GetUserRequest(id="user-123")
    response = stub.GetUser(request, timeout=TIMEOUT_SEC)
    user = UserProto.model_validate(
        {"id": response.id, "name": response.name, "email": response.email}
    )
    assert user.id == "user-123"
    assert user.name != ""


def test_create_user(stub):
    """Test unary RPC — create user."""
    request = CreateUserRequest(name="Alice", email="alice@example.com", age=30)
    response = stub.CreateUser(request, timeout=TIMEOUT_SEC)
    assert response.id != ""
    assert response.name == "Alice"


def test_server_streaming_list_users(stub):
    """Test server streaming — receive multiple users."""
    request = ListUsersRequest(page_size=10)
    users = []
    for user_msg in stub.ListUsers(request, timeout=TIMEOUT_SEC * 2):
        user = UserProto.model_validate(
            {"id": user_msg.id, "name": user_msg.name, "email": user_msg.email}
        )
        users.append(user)
    assert len(users) <= 10


def test_not_found_error(stub):
    """Test error handling — missing resource returns NOT_FOUND."""
    with pytest.raises(grpc.RpcError) as exc_info:
        stub.GetUser(GetUserRequest(id="nonexistent"), timeout=TIMEOUT_SEC)
    assert exc_info.value.code() == grpc.StatusCode.NOT_FOUND


def test_invalid_argument(stub):
    """Test error handling — empty ID returns INVALID_ARGUMENT."""
    with pytest.raises(grpc.RpcError) as exc_info:
        stub.GetUser(GetUserRequest(id=""), timeout=TIMEOUT_SEC)
    assert exc_info.value.code() == grpc.StatusCode.INVALID_ARGUMENT


def test_deadline_exceeded(stub):
    """Test timeout — very short deadline triggers DEADLINE_EXCEEDED."""
    with pytest.raises(grpc.RpcError) as exc_info:
        stub.GetUser(GetUserRequest(id="user-123"), timeout=0.0001)
    assert exc_info.value.code() == grpc.StatusCode.DEADLINE_EXCEEDED
```

---

## 3. gRPC-Gateway Tests with Playwright (HTTP/JSON proxy)

```python
import pytest
from playwright.sync_api import Playwright

BASE_URL = "http://localhost:8080"


@pytest.fixture(scope="session")
def api_context(playwright: Playwright):
    """Create Playwright API context for gRPC-Gateway."""
    ctx = playwright.request.new_context(
        base_url=BASE_URL,
        extra_http_headers={"Content-Type": "application/json"},
    )
    yield ctx
    ctx.dispose()


def test_grpc_gateway_get_user(api_context):
    """Test gRPC-Gateway — GET user by ID."""
    response = api_context.get("/v1/users/user-123")
    assert response.status == 200
    user = UserProto.model_validate(response.json())
    assert user.id == "user-123"


def test_grpc_gateway_create_user(api_context):
    """Test gRPC-Gateway — POST create user."""
    payload = {"name": "Bob", "email": "bob@example.com", "age": 25}
    response = api_context.post("/v1/users", data=payload)
    assert response.status == 200
    user = UserProto.model_validate(response.json())
    assert user.name == "Bob"


def test_grpc_gateway_list_users(api_context):
    """Test gRPC-Gateway — GET list users with pagination."""
    response = api_context.get("/v1/users?page_size=5")
    assert response.status == 200
    data = ListUsersResponse.model_validate(response.json())
    assert len(data.users) <= 5
    assert data.total_count >= 0


def test_grpc_gateway_not_found(api_context):
    """Test gRPC-Gateway — 404 for missing resource."""
    response = api_context.get("/v1/users/nonexistent")
    assert response.status == 404
    error = GrpcError.model_validate(response.json())
    assert error.code == 5  # NOT_FOUND


def test_grpc_gateway_invalid_request(api_context):
    """Test gRPC-Gateway — 400 for bad request."""
    payload = {"name": "", "email": "invalid"}
    response = api_context.post("/v1/users", data=payload)
    assert response.status == 400
```
