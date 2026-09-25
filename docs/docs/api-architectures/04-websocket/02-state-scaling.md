---
date: 2026-06-06
tags:
  - api
  - architecture
  - websocket
---

# WebSocket: State Management, Scaling and Backpressure

## 4.4 State

### Connection Lifecycle

Every WebSocket connection goes through four states:

```
CONNECTING -> OPEN -> CLOSING -> CLOSED
```

- **CONNECTING** — handshake in progress. No messages can be sent yet.
- **OPEN** — handshake complete. Both sides can send and receive.
- **CLOSING** — close frame sent, waiting for the other side's close frame.
- **CLOSED** — connection fully terminated. No more communication.

Only send messages in `OPEN` state. Sending in any other state causes an error.

### Session Handling

A WebSocket connection needs to be tied to a user session. Three common approaches:

**Token in query params or headers** — client includes a JWT or session token in the initial HTTP upgrade request. Server validates before accepting the upgrade. This is the most common approach.

```
GET /ws?token=eyJhbGciOiJIUzI1NiJ9... HTTP/1.1
Upgrade: websocket
```

**Auth message after connect** — connection opens without auth. Client sends an auth message as the first frame. Server rejects and closes if auth fails. Simpler to implement but leaves a brief window of unauthenticated connection.

**Cookie-based auth** — browser automatically sends cookies during the HTTP upgrade. Works well for web apps that already use cookie sessions. Not available for non-browser clients.

### Connection State Tracking

The server must maintain a map of all active connections. This map is the core data structure for WebSocket servers.

```python
connections: dict[str, dict] = {
    "conn-001": {
        "user_id": "user-abc",
        "subscriptions": ["chat.room-1", "notifications"],
        "connected_at": "2026-01-01T10:00:00Z",
        "metadata": {"ip": "192.168.1.1", "user_agent": "..."},
    }
}
```

This map is used to: route messages to specific users, broadcast to all subscribers, track connection health, and clean up on disconnect.

### Reconnection State

When a client reconnects after a drop, it needs to catch up on missed events. Two strategies:

**Last Event ID** — client stores the ID of the last received event. On reconnect, it sends this ID. Server replays all events after that ID. Requires the server to store an event log (e.g., Redis Stream, Kafka topic).

**State Snapshot** — server sends the full current state on reconnect. Simpler but uses more bandwidth. Works well when state is small (e.g., a chat room's current participants).

Best practice: combine both. Send a snapshot for current state, then stream new events.

---

## 4.5 Scaling

### Connection Limits

A single server can handle a large number of concurrent WebSocket connections:

| Connection Type  | Memory per Connection | Typical Limit per Server |
|------------------|-----------------------|--------------------------|
| Idle connections | 2–10 KB               | 200K–500K+              |
| Active connections | 10–100 KB+          | 50K–200K                |

The bottleneck is usually not connection count but message throughput and CPU for serialization.

### Horizontal Scaling

Multiple servers behind a load balancer. The core challenge: client A on server 1 sends a message to client B on server 2. Server 1 doesn't have client B's connection.

```
Client A -> Server 1 -> ??? -> Server 2 -> Client B
```

This requires a message broker between servers.

### Sticky Sessions

The load balancer must route the same client to the same server for the lifetime of the connection. WebSocket connections are stateful — you cannot round-robin them like HTTP requests.

Sticky session strategies:
- **IP hash** — hash client IP to determine server. Simple but breaks with NAT.
- **Cookie-based** — load balancer sets a cookie on first request. Subsequent requests go to same server.
- **Connection ID** — use a custom header or query param.

### Pub/Sub for Cross-Server Communication

Use a message broker to distribute events across all servers:

```
Server 1 -> Redis Pub/Sub -> Server 2
                          -> Server 3
                          -> Server N
```

1. Client A sends a message to server 1.
2. Server 1 publishes the event to a Redis channel (or Kafka topic).
3. All servers subscribed to that channel receive the event.
4. Each server checks if it has relevant connections and delivers the message.

Common brokers: **Redis Pub/Sub** (simple, fast, no persistence), **Kafka** (persistent, ordered, high throughput), **RabbitMQ** (flexible routing, acknowledgments).

### Connection Churn

Opening new connections is expensive. Each TLS handshake costs CPU:

- A single CPU core handles ~1K–3K TLS handshakes per second.
- Connection **rate** is more critical than connection **count**.
- Sudden reconnection storms (e.g., after server restart) can overwhelm the server.

Mitigations: exponential backoff on client reconnect, TLS session resumption, connection pooling for server-to-server links.

---

## 4.6 Backpressure

### The Problem

Messages arrive faster than the server or client can process them. Without flow control, the message queue grows without limit until the process runs out of memory and crashes (OOM).

### Per-Client Message Queues

Give each connection its own bounded queue. In Python:

```python
import asyncio

queue = asyncio.Queue(maxsize=50)
```

When the queue is full, you must decide what to do with the new message.

### Drop Strategies

| Strategy       | Behavior                                      | Best For             |
|----------------|-----------------------------------------------|----------------------|
| Drop oldest    | Remove oldest message, add new one            | Live data (tickers)  |
| Drop newest    | Reject the new message, keep existing queue   | Critical messages    |
| Block sender   | Pause reading from source until space opens   | Ordered streams      |

Choose based on your domain. For live dashboards, dropping old data is fine — users only care about the latest. For chat, dropping messages is not acceptable.

### Flow Control Signals

Send explicit control messages to the client:

```json
{"event": "flow.pause", "reason": "server overloaded"}
{"event": "flow.resume"}
```

Well-behaved clients reduce their send rate when they receive a pause signal.

### Buffering Limits

Set a maximum buffer size per connection. If a client falls too far behind (buffer exceeds limit), disconnect it. A slow client should not affect the entire system.

### Monitoring

Track these metrics for every WebSocket server:

- **Queue depth** per connection — how many messages are waiting.
- **Message processing time** — p50, p95, p99 latency.
- **Dropped messages** — count per second, per connection.
- **Connection count** — total active, rate of new connections.

Alert when queue depth stays above threshold for more than N seconds. This usually means a client or the server cannot keep up.
