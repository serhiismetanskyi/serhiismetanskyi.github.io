---
date: 2026-06-07
tags:
  - api
  - architecture
  - websocket
---

# WebSocket: Reliability Pattern

WebSocket does not provide exactly-once delivery by default.
This document describes a practical "exactly-once-like" pattern for real systems.

## Message contract

Use these fields in every event:

- `message_id`: unique id for deduplication
- `seq`: monotonic sequence number per stream
- `ts`: server timestamp
- `stream_id`: channel/user/session key

Example:

```json
{
  "stream_id": "chat:room-42",
  "message_id": "msg-8c7f",
  "seq": 1052,
  "ts": "2026-03-25T12:00:00Z",
  "event": "chat.message",
  "data": {"text": "hello"}
}
```

## Server responsibilities

- Assign increasing `seq` for each stream.
- Keep replay buffer per stream (time-window or count-window).
- Store a dedup key set (`stream_id + message_id`) with TTL.
- On reconnect, replay from `last_seq + 1`.
- If requested seq is older than replay window, return resync-required signal.

## Client responsibilities

- Persist `last_seq` and recent `message_id` set.
- Send resume request with `last_seq` after reconnect.
- Drop duplicates by `message_id`.
- Detect gaps (`incoming.seq > last_seq + 1`) and request replay.

## Replay window design

| Strategy | Example | Trade-off |
|---|---|---|
| Time-based | Keep 5 minutes of events | Simple, memory depends on traffic |
| Count-based | Keep last 10,000 events | Predictable memory, variable time |
| Hybrid | 5 minutes and max 10,000 | Best practical balance |

## Failure modes

- Duplicate message after reconnect -> solved by `message_id` dedup.
- Missing sequence segment -> solved by replay request.
- Replay overflow -> force snapshot/state sync.
- Multi-server ordering drift -> use per-stream sequencing authority.
