---
date: 2026-07-13
tags:
  - test-automation
  - design-patterns
  - api-testing
---

# API Test Patterns: gRPC and WebSocket

## gRPC

### Stub-Based Testing

gRPC tests use generated stubs. Never call the raw channel directly in tests —
wrap it behind a fixture or client object.

```python
import grpc
import pytest
from myservice.proto import user_pb2, user_pb2_grpc


@pytest.fixture(scope="session")
def grpc_channel():
    channel = grpc.insecure_channel("localhost:50051")
    yield channel
    channel.close()


@pytest.fixture
def user_stub(grpc_channel) -> user_pb2_grpc.UserServiceStub:
    return user_pb2_grpc.UserServiceStub(grpc_channel)
```

### Contract Validation

Validate proto message fields in responses:

```python
def test_get_user_returns_expected_fields(user_stub):
    request = user_pb2.GetUserRequest(id="user-123")
    response = user_stub.GetUser(request)

    assert response.id == "user-123"
    assert response.email != ""
    assert response.HasField("created_at")
```

Validate error codes using `grpc.StatusCode`:

```python
import grpc
from grpc import RpcError

def test_get_user_not_found(user_stub):
    request = user_pb2.GetUserRequest(id="nonexistent")
    with pytest.raises(RpcError) as exc_info:
        user_stub.GetUser(request)
    assert exc_info.value.code() == grpc.StatusCode.NOT_FOUND
```

### Streaming Tests

```python
def test_list_users_stream(user_stub):
    request = user_pb2.ListUsersRequest(page_size=5)
    responses = list(user_stub.ListUsers(request))
    assert len(responses) > 0
    for user in responses:
        assert user.id != ""
```

### gRPC Test Checklist

| Check | Description |
|---|---|
| Status codes | `OK`, `NOT_FOUND`, `INVALID_ARGUMENT`, `UNAUTHENTICATED` |
| Proto field presence | `HasField()` for optional messages |
| Required fields populated | No empty strings for IDs |
| Streaming frame count | Assert frame count and order |
| Metadata headers | `grpc-status`, `grpc-message` |
| Deadline exceeded | Simulate slow response, verify timeout |

---

## WebSocket

### Event-Driven Testing

WebSocket tests must be asynchronous and event-driven. Never use `time.sleep()` —
use `asyncio.wait_for` or explicit message polling.

```python
import asyncio
import json
import pytest
import websockets


@pytest.fixture
async def ws_connection():
    async with websockets.connect("ws://localhost:8000/ws") as ws:
        yield ws


async def test_receive_welcome_message(ws_connection):
    message = await asyncio.wait_for(ws_connection.recv(), timeout=3.0)
    data = json.loads(message)
    assert data["type"] == "welcome"
```

### Message Validation

Validate message schema on receive:

```python
import asyncio
import json
import jsonschema

MESSAGE_SCHEMA = {
    "type": "object",
    "required": ["type", "payload"],
    "properties": {
        "type": {"type": "string"},
        "payload": {"type": "object"},
    },
}

async def receive_and_validate(ws, timeout: float = 3.0) -> dict:
    raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
    message = json.loads(raw)
    jsonschema.validate(message, MESSAGE_SCHEMA)
    return message
```

### Connection Lifecycle Testing

```python
async def test_auth_required_on_connect():
    with pytest.raises(websockets.exceptions.InvalidStatusCode) as exc_info:
        async with websockets.connect("ws://localhost:8000/ws"):
            pass
    assert exc_info.value.status_code == 401


async def test_reconnect_replays_missed_events(ws_connection):
    seq_id = await get_current_sequence(ws_connection)
    # Simulate disconnect by closing
    await ws_connection.close()

    async with websockets.connect(
        f"ws://localhost:8000/ws?last_seq={seq_id}"
    ) as new_ws:
        message = await receive_and_validate(new_ws)
        assert message["seq"] == seq_id + 1
```

### WebSocket Test Checklist

| Check | Description |
|---|---|
| Auth on handshake | 401 without valid token |
| Message schema | Every inbound message validated |
| Ordering | Sequence numbers monotonically increasing |
| Heartbeat | Ping/pong exchanged within interval |
| Reconnect replay | Missed messages delivered after reconnect |
| Clean close | `1000 Normal Closure` on graceful shutdown |
| Backpressure | Client-side buffer does not overflow |

---

## Protocol Comparison for Test Strategy

| Protocol | Test isolation | Key assertion | Tooling |
|---|---|---|---|
| REST | Per HTTP request | Status + schema | `httpx` + `jsonschema` |
| GraphQL | Per query | `data` shape + no `errors` | `gql` + `httpx` |
| gRPC | Per RPC call | Status code + proto fields | `grpcio` + protobuf |
| WebSocket | Per connection + message | Message schema + ordering | `websockets` + `asyncio` |
