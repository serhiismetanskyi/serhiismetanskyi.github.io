---
date: 2026-06-11
tags:
  - architecture
  - networking
---

# Backpressure and Flow Control

Backpressure is what happens when a producer sends data faster than a consumer can process it.
Without control, memory grows until the process crashes (OOM).

## REST: Rate Limiting as Backpressure

REST is stateless and request-response. Backpressure is applied proactively via rate limiting.

- **Fixed window**: allow N requests per minute. Simple but can have burst at window edges.
- **Sliding window**: counts requests in a rolling window. Smoother.
- **Token bucket**: N tokens replenish per second. Each request consumes one. Allows short bursts.
- **Leaky bucket**: requests queued and processed at constant rate. Smooths bursts completely.

Return `429 Too Many Requests` with `Retry-After: N` header.
Client waits N seconds before retrying.

## gRPC: HTTP/2 Flow Control

gRPC inherits HTTP/2 flow control. This is the real backpressure mechanism for streaming.

### How it works

- Each side has a receive buffer with a window size (bytes it can accept).
- Sender checks window before sending. If window = 0, sender blocks.
- Receiver reads from buffer → window grows → sends WINDOW_UPDATE → sender can send more.

### Streaming backpressure

For server-streaming RPCs:
- Fast server, slow client: server fills client's buffer.
- Client's window reaches 0.
- gRPC runtime pauses the server's sending goroutine / thread / coroutine automatically.
- No explicit code needed: HTTP/2 does it.

Best practice: set larger window sizes for high-throughput streams.

## WebSocket: Slow Consumer Handling

WebSocket has no built-in flow control at the application level. You must implement it.

### Per-client queues

```python
import asyncio

queue = asyncio.Queue(maxsize=50)  # bounded buffer per connection
```

When queue is full, apply a drop or block strategy.

### Drop strategies

| Strategy     | Action                    | When to use                                |
|--------------|---------------------------|--------------------------------------------|
| Drop oldest  | Remove oldest, add new    | Live data (stock tickers, metrics)         |
| Drop newest  | Reject new, keep existing | Critical ordered messages                  |
| Block sender | Pause reading from source | Ordered streams where loss is unacceptable |

### Flow control signals

Send application-level pause/resume messages:

```json
{"event": "flow.pause", "reason": "buffer full"}
{"event": "flow.resume"}
```

Well-behaved clients reduce send rate on receiving pause.

### Buffer limits

Set max buffer size per WebSocket connection.
Disconnect slow clients that exceed the limit — they should not degrade the entire server.

### Monitoring

Track queue depth per connection. Alert when depth stays above threshold for N seconds.
Rising queue depth = consumer is too slow. Root cause: CPU-bound processing or downstream I/O.

## Cross-cutting backpressure pattern

For any high-volume system, the pattern is:
1. Bound all queues and buffers.
2. Apply back-pressure upstream when downstream is slow.
3. Monitor queue depth, drop rate, and processing latency.
4. Alert and act before OOM, not after.
