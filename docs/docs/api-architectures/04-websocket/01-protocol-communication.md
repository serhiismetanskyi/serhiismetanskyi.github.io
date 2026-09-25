---
date: 2026-06-06
tags:
  - api
  - architecture
  - websocket
---

# WebSocket: Protocol, Communication and Messages

## 4.1 Protocol

WebSocket is a protocol for persistent, bidirectional communication between client and server over a single TCP connection. It starts with an HTTP handshake and then upgrades to a different wire format.

### HTTP Upgrade Handshake

Every WebSocket connection begins as a regular HTTP request. The client sends an `Upgrade` header. The server responds with `101 Switching Protocols`. After that, the connection switches from HTTP to the WebSocket binary framing protocol.

```
Client -> Server:
GET /ws HTTP/1.1
Host: example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13

Server -> Client:
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

- `Sec-WebSocket-Key` — random base64 value from client. Server hashes it with a fixed GUID and returns the result in `Sec-WebSocket-Accept`. This proves the server understands the WebSocket protocol.
- `Sec-WebSocket-Version: 13` — the only version in use today (RFC 6455).
- `Sec-WebSocket-Protocol` — optional. Client lists subprotocols it supports (e.g., `graphql-ws, chat.v1`). Server picks one and echoes it back. This is how applications layer their own protocol on top of WebSocket. For example, GraphQL subscriptions use `graphql-ws` subprotocol.
- If the server doesn't support WebSocket, it returns a normal HTTP response (e.g., 400). The client then knows upgrade failed.

### Persistent TCP Connection

After the handshake completes, the TCP connection stays open. There are no repeated handshakes. Both sides can send data at any time without waiting for a response. The connection remains active until one side explicitly closes it or a network error occurs.

This is fundamentally different from HTTP, where each request opens a new connection (or reuses one from a pool with keep-alive, but still follows request-response).

### Connection Closure

Either side can initiate closure by sending a **close frame** with a status code and optional reason string. The other side responds with its own close frame. Then the TCP connection is torn down.

Common close codes:

| Code | Name              | Meaning                                |
|------|-------------------|----------------------------------------|
| 1000 | Normal Closure   | Clean shutdown, no errors              |
| 1001 | Going Away       | Server shutting down or client leaving |
| 1002 | Protocol Error   | Endpoint received malformed frame      |
| 1003 | Unsupported Data | Received data type it cannot handle    |
| 1008 | Policy Violation | Message violates server policy         |
| 1011 | Unexpected Error | Server encountered an unexpected error |

---

## 4.2 Communication Model

### Full-Duplex

Client and server can send messages at the same time over the same connection. There is no request-response pattern. Either side can initiate communication at any moment. This makes WebSocket ideal for scenarios where the server needs to push data without the client asking.

### Event-Driven

The server pushes data when events happen. The client does not poll. It registers handlers and reacts to incoming messages. This is the opposite of REST, where the client must repeatedly ask "anything new?" to get updates.

### When to Use WebSocket

| Use Case               | Why WebSocket                                    |
|------------------------|--------------------------------------------------|
| Real-time chat         | Instant message delivery to all participants     |
| Live dashboards        | Server pushes metric updates as they happen      |
| Online gaming          | Low-latency bidirectional game state sync        |
| Collaborative editing  | Multiple users see changes in real time          |
| Stock tickers          | Price updates pushed every millisecond           |
| Push notifications     | Server-initiated alerts without client polling   |

When NOT to use WebSocket: simple CRUD operations, one-time data fetches, file uploads, or any case where request-response is sufficient.

---

## 4.3 Message Layer

### JSON Messages

The most common message format. Each message is a JSON object with a `type` or `event` field that tells the receiver how to interpret the payload.

```json
{
  "type": "chat.message",
  "data": {"text": "hello", "user_id": "123"},
  "timestamp": "2026-01-01T00:00:00Z"
}
```

### Binary Messages

WebSocket supports binary frames for efficient data transfer. Use binary for media streaming, file transfer, game state, or any case where JSON overhead is too high. The frame opcode (`0x2`) tells the receiver the payload is binary, not text.

### Event Schema

Define a contract for every message type. Each event has a fixed structure. Use an event type and version field so clients and servers can evolve independently.

```json
{
  "event": "user.created",
  "version": 1,
  "data": {"user_id": "abc", "name": "Alice"},
  "timestamp": "2026-01-01T00:00:00Z",
  "message_id": "msg-001"
}
```

Best practice: document all event types in a shared schema. Validate incoming messages server-side (e.g., with Pydantic). Reject messages that don't match any known schema.

### Message Acknowledgment

WebSocket protocol itself does not guarantee application-level delivery. TCP ensures bytes arrive, but your application may fail to process them. Implement an ACK pattern:

1. Client sends message with a unique `message_id`.
2. Server processes the message and sends an ACK with the same `message_id`.
3. Client starts a timer. If no ACK arrives within timeout (e.g., 5 seconds), client retries.
4. Server must handle duplicate messages (idempotency) because retries can cause duplicates.

```json
{"event": "ack", "message_id": "msg-001", "status": "received"}
```

### Heartbeat / Ping-Pong

WebSocket protocol defines **ping** and **pong** control frames (opcodes `0x9` and `0xA`). These detect dead connections.

- Server sends a ping frame every N seconds (e.g., 30s).
- Client must respond with a pong frame.
- If no pong arrives within timeout, the server considers the connection dead and closes it.
- Most WebSocket libraries handle pong responses automatically.

This is critical in production. Without heartbeats, a connection can appear open while the network path is actually broken (half-open connection). The server would hold resources for a dead client indefinitely.

### Compression (permessage-deflate)

WebSocket supports per-message compression via the `permessage-deflate` extension. Negotiated during handshake:

```
Sec-WebSocket-Extensions: permessage-deflate; client_max_window_bits
```

Reduces bandwidth for text-heavy messages (JSON). Adds CPU overhead. Enable for large messages, disable for small frequent messages where latency matters more than size.

### Subprotocols

The `Sec-WebSocket-Protocol` header negotiates application-level protocols:

```
Client: Sec-WebSocket-Protocol: graphql-ws, mqtt
Server: Sec-WebSocket-Protocol: graphql-ws
```

Common subprotocols: `graphql-ws` (GraphQL subscriptions), `mqtt` (IoT messaging), `stomp` (message broker). The server picks one from the client's list. Use subprotocols to version your message format.
