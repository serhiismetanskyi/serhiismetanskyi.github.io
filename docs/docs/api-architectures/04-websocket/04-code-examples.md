---
date: 2026-06-07
tags:
  - api
  - architecture
  - websocket
---

# WebSocket: Code Examples (Python + Pydantic + Playwright)

## 1. Pydantic Models for WebSocket Messages

```python
from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime
from enum import Enum


class EventType(str, Enum):
    """All supported WebSocket event types."""

    chat_message = "chat.message"
    user_joined = "user.joined"
    user_left = "user.left"
    error = "error"
    ack = "ack"


class WSMessage(BaseModel):
    """Base WebSocket message schema with event routing."""

    event: EventType
    data: dict[str, Any]
    timestamp: datetime
    message_id: Optional[str] = None


class ChatMessage(BaseModel):
    """Payload schema for chat.message events."""

    text: str = Field(min_length=1, max_length=5000)
    user_id: str
    channel_id: str


class WSError(BaseModel):
    """Error response sent to client on invalid messages."""

    event: str = "error"
    code: int
    message: str
    details: Optional[dict] = None


class AckMessage(BaseModel):
    """Acknowledgment sent after processing a client message."""

    event: str = "ack"
    message_id: str
    status: str = "received"
```

### Usage — Validate Incoming Message

```python
import json

raw = '{"event": "chat.message", "data": {"text": "hi"}, "timestamp": "2026-01-01T00:00:00Z"}'
msg = WSMessage.model_validate(json.loads(raw))
print(msg.event)        # EventType.chat_message
print(msg.timestamp)    # 2026-01-01 00:00:00+00:00
```

Build error: `WSError(code=400, message="Missing required field: user_id").model_dump_json()`

---

## 2. Playwright WebSocket Tests

Playwright intercepts WebSocket frames in browser tests. Use when testing a web app over WebSocket.

```python
import pytest
import json
from playwright.sync_api import Page, WebSocket


def test_websocket_connection(page: Page):
    """Verify WebSocket connects and server sends initial frames."""
    messages: list[dict] = []

    def handle_ws(ws: WebSocket):
        ws.on("framereceived", lambda payload: messages.append(json.loads(payload)))

    page.on("websocket", handle_ws)
    page.goto("https://app.example.com/chat")
    page.wait_for_timeout(2000)

    assert len(messages) > 0, "Expected at least one message from server"


def test_websocket_send_receive(page: Page):
    """Send a chat message via UI and validate the echoed frame."""
    received: list[dict] = []

    def handle_ws(ws: WebSocket):
        ws.on("framereceived", lambda data: received.append(json.loads(data)))

    page.on("websocket", handle_ws)
    page.goto("https://app.example.com/chat")
    page.wait_for_timeout(1000)

    page.fill("#message-input", "Hello, World!")
    page.click("#send-button")
    page.wait_for_timeout(1000)

    for msg in received:
        validated = WSMessage.model_validate(msg)
        assert validated.event in list(EventType)


def test_websocket_close(page: Page):
    """Verify WebSocket close event is captured."""
    closed = []

    def handle_ws(ws: WebSocket):
        ws.on("close", lambda: closed.append(True))

    page.on("websocket", handle_ws)
    page.goto("https://app.example.com/chat")
    page.wait_for_timeout(1000)

    page.click("#disconnect-button")
    page.wait_for_timeout(1000)

    assert len(closed) > 0, "WebSocket should have closed"
```

---

## 3. Direct WebSocket Testing (websockets library)

For testing WebSocket servers directly, without a browser. Uses the `websockets` library with `asyncio`.

```python
import asyncio
import json
import pytest
import websockets


@pytest.mark.asyncio
async def test_ws_echo():
    """Connect to echo server, send message, validate response."""
    uri = "ws://localhost:8080/ws"
    async with websockets.connect(uri) as ws:
        message = {
            "event": "chat.message",
            "data": {"text": "hello", "user_id": "u1"},
            "timestamp": "2026-01-01T00:00:00Z",
            "message_id": "msg-001",
        }
        await ws.send(json.dumps(message))

        response = await asyncio.wait_for(ws.recv(), timeout=5.0)
        data = json.loads(response)

        validated = WSMessage.model_validate(data)
        assert validated.event is not None
        assert validated.message_id is not None


@pytest.mark.asyncio
async def test_ws_invalid_json():
    """Send invalid JSON, expect error response."""
    async with websockets.connect("ws://localhost:8080/ws") as ws:
        await ws.send("{broken json")

        response = await asyncio.wait_for(ws.recv(), timeout=5.0)
        data = json.loads(response)

        error = WSError.model_validate(data)
        assert error.code == 400


@pytest.mark.asyncio
async def test_ws_ack():
    """Send message with ID, expect ACK with same ID."""
    async with websockets.connect("ws://localhost:8080/ws") as ws:
        msg = {
            "event": "chat.message",
            "data": {"text": "ping"},
            "timestamp": "2026-01-01T00:00:00Z",
            "message_id": "msg-999",
        }
        await ws.send(json.dumps(msg))
        response = await asyncio.wait_for(ws.recv(), timeout=5.0)
        ack = AckMessage.model_validate(json.loads(response))
        assert ack.message_id == "msg-999"
```

Run: `uv pip install websockets pydantic pytest pytest-asyncio && uv run pytest test_websocket.py -v`
