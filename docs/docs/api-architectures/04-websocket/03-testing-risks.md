---
date: 2026-06-06
tags:
  - api
  - architecture
  - websocket
---

# WebSocket: Testing Plan and Risks

## 4.7 Testing Plan

### Connection Tests

| Test Case          | Steps                                              | Expected Result                     |
|--------------------|-----------------------------------------------------|-------------------------------------|
| Connect            | Open WebSocket to valid endpoint                    | State is OPEN, server acknowledges  |
| Disconnect         | Send close frame with code 1000                     | State is CLOSED, server cleans up   |
| Reconnect          | Disconnect, reconnect, request state                | State is restored, no data lost     |
| Idle timeout       | Connect, send nothing for timeout duration          | Server closes connection            |
| Invalid handshake  | Send upgrade request with missing headers           | Server rejects with HTTP 400        |
| Wrong protocol     | Send HTTP request to WebSocket endpoint             | Server returns error, no upgrade    |

### Message Tests

| Test Case            | Steps                                           | Expected Result                       |
|----------------------|--------------------------------------------------|---------------------------------------|
| Valid message        | Send well-formed JSON with known event type      | Server processes and responds         |
| Invalid JSON         | Send `{broken json`                              | Server sends error message, no crash  |
| Unknown event type   | Send `{"event": "unknown.type"}`                 | Server sends error or ignores safely  |
| Message size limit   | Send message exceeding max size (e.g., 1 MB)    | Server rejects with error code        |
| Schema validation    | Send message missing required fields             | Server returns validation error       |
| Empty message        | Send empty string                                | Server handles gracefully             |

### Ordering Tests

| Test Case             | Steps                                          | Expected Result                        |
|-----------------------|-------------------------------------------------|----------------------------------------|
| Message sequence      | Send messages A, B, C in order                  | Received in order A, B, C             |
| Concurrent messages   | Multiple clients send simultaneously            | Each client gets correct responses     |
| Sequence numbers      | Send messages with seq numbers, skip one        | Server detects gap, requests resend    |

### Concurrency Tests

| Test Case          | Steps                                             | Expected Result                       |
|--------------------|----------------------------------------------------|---------------------------------------|
| Multiple clients   | Connect 100 clients, broadcast message             | All 100 receive the broadcast         |
| Private messages   | Send message to user A                             | User A receives, user B does not      |
| Race conditions    | Two clients update same resource at same time      | Conflict detected and handled         |
| Broadcast storm    | Server sends 1000 messages rapidly to all clients  | All delivered, no crashes             |

### Fault Tolerance Tests

| Test Case          | Steps                                             | Expected Result                       |
|--------------------|----------------------------------------------------|---------------------------------------|
| Network drop       | Kill network mid-session                           | Client reconnects automatically       |
| Server restart     | Restart server while clients connected             | Clients reconnect, state restored     |
| Retry logic        | Block ACK, verify client retries                   | Client retries within timeout         |
| Partial message    | Send incomplete frame                              | Server handles without crash          |
| Broker failure     | Kill Redis/Kafka during operation                  | Server degrades gracefully, recovers  |

### Backpressure Tests

| Test Case          | Steps                                             | Expected Result                       |
|--------------------|----------------------------------------------------|---------------------------------------|
| Slow consumer      | Send faster than client processes                  | Queue fills, no crash, strategy applied |
| Buffer overflow    | Exceed buffer limit for one connection             | Connection closed gracefully          |
| Flow control       | Server sends pause signal                          | Client reduces send rate              |
| Queue recovery     | Fill queue, then let consumer catch up             | Queue drains, normal operation resumes |

### Security Tests

| Test Case           | Steps                                            | Expected Result                       |
|---------------------|---------------------------------------------------|---------------------------------------|
| No auth token       | Connect without any token                         | Connection rejected                   |
| Invalid token       | Connect with expired or forged token              | Connection rejected with reason       |
| Token expiration    | Wait for token to expire during session           | Server closes connection with reason  |
| Unauthorized action | Send action requiring admin role as regular user  | Server rejects with error message     |
| Origin validation   | Connect from unauthorized origin                  | Server rejects the upgrade            |
| Injection attack    | Send message with script tags or SQL              | Server sanitizes, no injection        |

### Performance Tests

| Metric               | Method                                          | Target                                |
|-----------------------|--------------------------------------------------|---------------------------------------|
| Latency              | Measure roundtrip time for echo message          | p50 < 10ms, p95 < 50ms, p99 < 100ms |
| Memory per connection | Monitor RSS with N connections                  | < 20 KB idle, < 100 KB active        |
| Memory growth        | Monitor over 24 hours with stable connections    | No unbounded growth (leak detection)  |
| Connection scaling   | Test with 100, 1K, 10K connections               | Throughput degrades linearly, not exponentially |
| Message throughput   | Send N messages/sec, measure processing rate     | > 10K messages/sec per server         |

---

## 4.8 Risks & Limitations

### Scaling Complexity

WebSocket connections are stateful. You cannot simply add servers and load-balance like HTTP. Every scaling strategy requires sticky sessions plus a message broker for cross-server communication. This adds operational complexity and potential points of failure.

### Connection Leaks

If connections are not properly cleaned up on disconnect, they accumulate and consume memory. Common causes: missing error handlers, no heartbeat, client crashes without sending close frame. Always implement heartbeat timeouts and periodic connection audits.

### Reconnection State Sync

Restoring state after reconnect is the hardest problem in WebSocket architectures. The server must know what the client has already received. This requires event logs, sequence numbers, or snapshots. Without this, clients miss events or receive duplicates.

### Message Ordering

Within a single connection, TCP guarantees order. Across multiple servers, ordering is not guaranteed. If client A and client B send messages through different servers, the final order depends on broker delivery time. Use logical timestamps or sequence numbers if ordering matters.

### No Built-in Delivery Guarantees

TCP ensures bytes arrive at the transport level. But if the application crashes after receiving the bytes and before processing them, the message is lost. Application-level guarantees need custom ACK, retry, and idempotency patterns.

### Backpressure Failures

Without proper handling, a fast producer fills the consumer's buffer until OOM. This can crash the entire server, affecting all connections — not just the slow one. Per-connection queue limits are essential.

### Security Gaps

Authentication happens only during the HTTP handshake. After that, the connection is open. If a token expires mid-session, the server must actively check and close the connection. Per-message authorization requires custom implementation. CORS-like origin checks only apply to browser clients.

### Debugging Difficulty

Persistent connections are harder to debug than stateless HTTP requests. You cannot simply replay a request. You need structured logging with connection IDs, message tracing, and specialized tools (e.g., Chrome DevTools WebSocket inspector, `wscat`, Wireshark).
