---
date: 2026-07-22
tags:
  - test-automation
  - architecture
  - api-testing
---

# API Testing — gRPC & WebSocket

## gRPC Testing

### Architecture

gRPC tests use generated stubs. Never call the raw channel directly from tests.

```
Test  →  ServiceStubWrapper  →  Generated Stub  →  gRPC Channel  →  Service
```

### Stub Wrapper

```python
import grpc
import logging
from generated import user_pb2, user_pb2_grpc

log = logging.getLogger(__name__)


class UserGrpcClient:
    def __init__(self, host: str, port: int) -> None:
        self._channel = grpc.insecure_channel(f"{host}:{port}")
        self._stub = user_pb2_grpc.UserServiceStub(self._channel)
        log.debug("gRPC channel opened: %s:%s", host, port)

    def create_user(self, email: str, role: str = "USER") -> user_pb2.UserResponse:
        request = user_pb2.CreateUserRequest(email=email, role=role)
        log.debug("gRPC CreateUser: %s", email)
        return self._stub.CreateUser(request)

    def get_user(self, user_id: str) -> user_pb2.UserResponse:
        request = user_pb2.GetUserRequest(id=user_id)
        return self._stub.GetUser(request)

    def close(self) -> None:
        self._channel.close()
        log.debug("gRPC channel closed")
```

### gRPC Test Examples

```python
import grpc
import pytest


def test_create_user_via_grpc(grpc_client):
    response = grpc_client.create_user(email="grpc-test@example.com")

    assert response.id != ""
    assert response.email == "grpc-test@example.com"


def test_get_nonexistent_user_raises_not_found(grpc_client):
    with pytest.raises(grpc.RpcError) as exc_info:
        grpc_client.get_user("nonexistent-id")

    assert exc_info.value.code() == grpc.StatusCode.NOT_FOUND
```

### Proto Contract Validation

Test that the response contains all expected fields — catches proto schema drift:

```python
def test_user_response_has_required_fields(grpc_client):
    user = grpc_client.create_user(email="contract@example.com")

    assert user.HasField("id")
    assert user.HasField("email")
    assert user.HasField("created_at")
    assert user.role in ("USER", "ADMIN")
```

---

## WebSocket Testing

### WebSocket Client Wrapper

```python
import asyncio
import json
import logging
import websockets

log = logging.getLogger(__name__)


class WebSocketClient:
    def __init__(self, url: str) -> None:
        self._url = url
        self._ws = None

    async def connect(self) -> None:
        self._ws = await websockets.connect(self._url)
        log.debug("WebSocket connected: %s", self._url)

    async def send(self, event: str, data: dict) -> None:
        message = json.dumps({"event": event, "data": data})
        log.debug("WS send: %s", message)
        await self._ws.send(message)

    async def receive(self, timeout: float = 5.0) -> dict:
        raw = await asyncio.wait_for(self._ws.recv(), timeout=timeout)
        message = json.loads(raw)
        log.debug("WS recv: %s", message)
        return message

    async def close(self) -> None:
        if self._ws:
            await self._ws.close()
            log.debug("WebSocket closed")
```

### Event-Driven Test Examples

```python
import pytest


@pytest.mark.asyncio
async def test_subscribe_receives_order_update(ws_client, api_client, verified_user):
    await ws_client.connect()
    await ws_client.send("subscribe", {"channel": f"orders:{verified_user['id']}"})

    confirm = await ws_client.receive(timeout=2.0)
    assert confirm["event"] == "subscribed"

    order = api_client.orders.create(user_id=verified_user["id"])

    update = await ws_client.receive(timeout=5.0)
    assert update["event"] == "order.created"
    assert update["data"]["order_id"] == order["id"]

    await ws_client.close()
```

### Message Validation

```python
def validate_ws_message(message: dict, expected_event: str) -> None:
    assert "event" in message, f"Missing 'event' key in: {message}"
    assert "data" in message, f"Missing 'data' key in: {message}"
    assert message["event"] == expected_event, (
        f"Expected event '{expected_event}', got '{message['event']}'"
    )
```

### Connection Lifecycle Tests

```python
@pytest.mark.asyncio
async def test_unauthorized_connection_rejected(ws_url):
    with pytest.raises(websockets.exceptions.InvalidStatusCode) as exc_info:
        async with websockets.connect(ws_url) as ws:
            pass

    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_disconnect_cleans_up_subscription(ws_client, verified_user):
    await ws_client.connect()
    await ws_client.send("subscribe", {"channel": f"orders:{verified_user['id']}"})
    await ws_client.close()

    # Reconnect — should not receive stale events from closed session
    await ws_client.connect()
    messages = []
    try:
        msg = await ws_client.receive(timeout=1.0)
        messages.append(msg)
    except asyncio.TimeoutError:
        pass

    assert not any(m.get("event") == "subscribed" for m in messages)
```

---

## gRPC vs WebSocket Testing Comparison

| Aspect | gRPC | WebSocket |
|--------|------|-----------|
| Protocol | HTTP/2 + Protobuf | WS frames + JSON/binary |
| Test style | Synchronous RPC | Async event-driven |
| Error model | `grpc.StatusCode` | Custom event + close code |
| Tooling | Generated stubs | `websockets` + `asyncio` |
| CI complexity | Needs proto compilation | Standard Python |
