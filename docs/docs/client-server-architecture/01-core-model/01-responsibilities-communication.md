---
date: 2026-06-09
tags:
  - architecture
  - networking
---

# Client-Server Architecture: Core Model

## 1.1 Responsibilities

Client and server have clear, separate responsibilities. This separation is fundamental to all web architecture.

**Client responsibilities:**
- Render UI and handle user interactions
- Manage application state (local and server-derived)
- Orchestrate requests: decide when, where, and how to fetch data
- Handle offline mode and optimistic updates
- Cache responses to reduce network calls

**Server responsibilities:**
- Execute business logic
- Persist and query data
- Authenticate and authorize requests
- Enforce consistency, constraints, and validation rules
- Produce stable, versioned API contracts

Why this matters: when responsibilities leak across the boundary (business logic in the client,
UI state in the server), the system becomes fragile and hard to scale independently.

---

## 1.2 Communication Models

| Model | Protocol | Direction | Example |
|---|---|---|---|
| Request–response | REST, GraphQL over HTTP | Client initiates | Fetching a user profile |
| RPC | gRPC over HTTP/2 | Client initiates | Internal service call |
| Persistent | WebSocket | Both sides | Chat, live dashboard |
| Server-push | SSE (Server-Sent Events) | Server only | Notification stream |
| Streaming | gRPC streaming | Both sides | Video feed, sensor data |

Choose the model based on who initiates and how often data changes.

---

## 1.3 Transport Layer

### HTTP/1.1

- One request per TCP connection (with keep-alive: one at a time).
- Head-of-line blocking: a slow request blocks all others on that connection.
- Still dominant for simple REST APIs and legacy systems.

### HTTP/2

- **Multiplexing:** many concurrent streams share one TCP connection.
- **Header compression (HPACK):** reduces repeated header overhead significantly.
- **Server push:** protocol feature, but browser support is limited in modern web stacks.
- **Binary framing:** more efficient than HTTP/1.1 plain-text format.
- Used by default as the transport for gRPC.

### HTTP/3

- Runs over **QUIC** protocol (RFC 9000) instead of TCP.
- QUIC is UDP-based with built-in TLS 1.3 and per-stream flow control.
- Eliminates TCP head-of-line blocking: packet loss on one stream does not stall others.
- Faster connection setup: **0-RTT** (returning clients) or **1-RTT** (new clients).
  By comparison, TCP requires a 3-way handshake (1 RTT), then TLS 1.3 adds another 1 RTT
  on top — total 2 RTT minimum before the first byte of application data is sent.
  QUIC merges transport and crypto into a single 1-RTT handshake.
- Best for high-latency, lossy networks (mobile, satellite links).

### TCP vs QUIC

| Aspect | TCP | QUIC |
|---|---|---|
| Transport base | TCP + TLS (separate) | UDP + QUIC (TLS 1.3 built-in) |
| Head-of-line blocking | Per-connection | Per-stream only (no cross-stream) |
| Connection setup | 3-way handshake + TLS | 1-RTT or 0-RTT |
| Connection migration | No — bound to IP/port 4-tuple | Yes — uses Connection ID |
| Adoption | Universal | HTTP/3, modern CDNs, Nginx 1.25+ |

**Key insight:** In stable internal networks, HTTP/3 gains are often modest.
The largest gains are usually seen on lossy or mobile networks.

---

## 1.4 Connection Reuse

**Keep-alive (HTTP/1.1)**
Reuses the TCP connection for multiple sequential requests. Removes per-request TCP
handshake cost, but requests still queue behind each other.

**Multiplexing (HTTP/2 and HTTP/3)**
Multiple concurrent streams over one connection. No per-request connection cost and
less blocking than HTTP/1.1. Note: HTTP/2 still runs on TCP, so packet loss at transport
level can impact multiple streams; HTTP/3 reduces this with QUIC stream isolation.

**Connection pooling**
Maintain a fixed pool of open connections to a database or upstream service.
Requests borrow a connection, use it, and return it. Avoids re-handshaking on every call.
Essential for any service that makes many outbound calls (e.g., API gateway, backend service).

---

## 1.5 Practical Decision Rules

| Scenario | Recommended transport |
|---|---|
| Public REST API, broad client support | HTTP/1.1 or HTTP/2 |
| Internal microservice RPC | HTTP/2 via gRPC |
| Mobile clients on variable networks | HTTP/3 (QUIC) |
| Real-time bidirectional events | WebSocket |
| Simple server-to-client push | SSE over HTTP/2 |
| High-throughput streaming pipeline | gRPC streaming over HTTP/2 |

> **Rule of thumb:** use the simplest transport that meets your latency and throughput
> requirements. Add complexity only when measured data justifies it.
