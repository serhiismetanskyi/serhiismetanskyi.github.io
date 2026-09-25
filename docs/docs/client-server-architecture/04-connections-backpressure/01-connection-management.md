---
date: 2026-06-11
tags:
  - architecture
  - networking
---

# Connection Management

Connection management is about keeping network connections alive and efficient.
Every new connection costs time (TCP handshake + TLS) and memory.

## HTTP Connections

### Keep-alive (HTTP/1.1)

HTTP/1.1 keep-alive reuses one TCP connection for multiple sequential requests.

```
Without keep-alive:
Client → TCP connect → TLS → GET /a → response → TCP close
Client → TCP connect → TLS → GET /b → response → TCP close

With keep-alive:
Client → TCP connect → TLS → GET /a → response → GET /b → response → TCP close
```

Configuration:
- `Connection: keep-alive` header (default in HTTP/1.1).
- Server configures `keepalive_timeout` (e.g. 75s in nginx).
- Set `keepalive_requests` limit to prevent one client holding a connection forever.

### Connection pooling (HTTP clients)

Client-side: maintain a pool of open connections to each backend.
- New request → grab idle connection from pool → send request → return connection to pool.
- Pool size: typically 10-50 connections per backend.
- Idle connections are closed after timeout (avoids holding dead connections).

Example (Python httpx):

```python
import httpx

# Pool is managed automatically; configure limits
client = httpx.Client(
    limits=httpx.Limits(max_connections=100, max_keepalive_connections=20)
)
```

### HTTP/2 multiplexing

HTTP/2 removes the need for multiple connections. One connection, many concurrent streams.
- Each request is a stream with its own stream ID.
- Reduces request queueing compared with HTTP/1.1.
- Note: because HTTP/2 runs on TCP, packet loss can still affect multiple streams.
- One connection to each backend is usually enough.

## gRPC Connections

gRPC uses HTTP/2, so all of the above applies. Additional considerations:

### Multiplexed streams

- Multiple RPCs share one TCP connection.
- Each RPC is an independent HTTP/2 stream.
- One connection can handle hundreds of concurrent RPCs.

### Keepalive pings

gRPC adds application-level keepalive on top of HTTP/2:
- Client sends PING frame every N seconds.
- If no PONG received within timeout, connection is considered dead.
- Prevents half-open connections from being held silently.

```python
import grpc

channel = grpc.insecure_channel(
    "localhost:50051",
    options=[
        ("grpc.keepalive_time_ms", 30_000),        # ping every 30s
        ("grpc.keepalive_timeout_ms", 5_000),       # wait 5s for pong
        ("grpc.keepalive_permit_without_calls", 1), # ping even when idle
    ],
)
```

### Flow control

HTTP/2 has per-stream and per-connection flow control windows.
- Receiver announces how much data it can accept (window size).
- Sender stops sending when window is full. Receiver advertises more when it processes data.
- Default window: 65535 bytes. For high-throughput streaming, increase to 1-16 MB.

## WebSocket Connections

### Persistent connections

WebSocket connection lives as long as both sides want it to.
- Low per-message overhead (no HTTP headers after handshake).
- Server can push any time without client polling.

### Reconnection strategies

Client must handle disconnects:
1. Detect disconnect (error event or close event).
2. Wait with exponential backoff: 1s → 2s → 4s → 8s (+ jitter).
3. Reconnect and restore subscription state.

### Heartbeats (ping/pong)

WebSocket protocol defines ping/pong control frames.
- Server sends ping every 30s.
- Client responds with pong.
- If no pong within 10s, server closes connection.
- Prevents ghost connections (TCP appears open, but peer is gone).
