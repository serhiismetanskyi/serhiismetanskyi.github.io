---
date: 2026-06-05
tags:
  - api
  - architecture
  - grpc
---

# gRPC: Communication Patterns, Code Generation and Error Model

## 3.4 Communication Patterns

### Unary RPC

Single request, single response. Similar to a REST GET or POST call.
This is the simplest gRPC pattern. Use for standard CRUD operations.

```
Client -- request --> Server
Client <-- response -- Server
```

### Server Streaming

Client sends one request. Server sends a stream of responses.
Use for: real-time feeds, large data downloads, event notifications.

```
Client -- request --------> Server
Client <-- message 1 ------ Server
Client <-- message 2 ------ Server
Client <-- message N ------ Server
Client <-- stream end ----- Server
```

The client reads messages until the stream ends.
Server controls when to close the stream.

### Client Streaming

Client sends a stream of messages. Server sends one response after receiving all messages.
Use for: file uploads, sensor data aggregation, batch processing.

```
Client -- message 1 --> Server
Client -- message 2 --> Server
Client -- message N --> Server
Client -- stream end -> Server
Client <-- response --- Server
```

### Bidirectional Streaming

Both client and server send streams at the same time.
Messages flow independently in both directions.
Use for: chat, gaming, collaborative editing, real-time sync.

```
Client -- msg 1 -->     <-- msg A -- Server
Client -- msg 2 -->     <-- msg B -- Server
(independent streams, no strict ordering between them)
```

### Pattern Selection Guide

| Pattern | Use Case | Example |
|---------------------|-------------------------------|---------------------------|
| Unary | Simple request/response | Get user by ID |
| Server streaming | Server pushes data | Stock price feed |
| Client streaming | Client sends batch | Upload file chunks |
| Bidirectional | Real-time two-way | Chat application |

---

## 3.5 Code Generation

### Stub Generation

Run the `protoc` compiler with a language-specific plugin.
It generates two things:
1. **Message classes** — serialize/deserialize your protobuf messages
2. **Service stubs** — client calls server as if it's a local function

### Language Interoperability

The `.proto` file is language-neutral.
Generate code for Python, Go, Rust, C++, and more.
Services written in different languages communicate without issues.

### Python Example

```bash
python -m grpc_tools.protoc \
  --python_out=. \
  --grpc_python_out=. \
  --proto_path=. \
  user.proto
```

This generates:
- `user_pb2.py` — message classes (User, GetUserRequest, etc.)
- `user_pb2_grpc.py` — service stubs (UserServiceStub, UserServiceServicer)

### Go Example

```bash
protoc --go_out=. --go-grpc_out=. user.proto
```

Generates `user.pb.go` (messages) and `user_grpc.pb.go` (service interfaces).

---

## 3.6 Error Model

### gRPC Status Codes

| Code | Name | HTTP Equivalent | When to Use |
|------|-------------------|----|--------------------------------------|
| 0 | OK | 200 | Success |
| 1 | CANCELLED | 499 | Client cancelled the operation |
| 3 | INVALID_ARGUMENT | 400 | Bad input from client |
| 4 | DEADLINE_EXCEEDED | 504 | Timeout — server too slow |
| 5 | NOT_FOUND | 404 | Resource does not exist |
| 6 | ALREADY_EXISTS | 409 | Duplicate resource |
| 7 | PERMISSION_DENIED | 403 | No permission for this action |
| 8 | RESOURCE_EXHAUSTED | 429 | Rate limited or quota exceeded |
| 13 | INTERNAL | 500 | Server bug |
| 14 | UNAVAILABLE | 503 | Service temporarily unavailable |
| 16 | UNAUTHENTICATED | 401 | Missing or invalid auth token |

### Rich Error Model

Attach detailed error info using `google.rpc.Status`.
The `details` field accepts `google.protobuf.Any` — you can pack any message type.

Common detail types:
- `BadRequest` — field-level validation errors
- `RetryInfo` — retry delay hint
- `DebugInfo` — stack trace (internal use only)
- `ErrorInfo` — structured error reason and metadata

### Metadata

Key-value pairs sent with request or response.
Used for: auth tokens, request IDs, tracing headers (OpenTelemetry).

Rules:
- Text metadata: keys are lowercase ASCII, values are strings
- Binary metadata: keys end with `-bin`, values are base64-encoded
- Example: `authorization: Bearer <token>`
- Example: `x-request-id: abc-123`

Metadata is accessible in interceptors — use for cross-cutting concerns.

### Interceptors (Middleware)

Interceptors are the gRPC equivalent of HTTP middleware. They run before and after every RPC call.

**Client-side interceptors**: add auth tokens, log requests, inject trace context.
**Server-side interceptors**: validate auth, log requests, measure latency, catch errors.

Interceptors chain: `auth -> logging -> tracing -> handler`. Each interceptor can modify the request, abort it, or pass it to the next one.

### Deadline Propagation

Deadlines propagate through the call chain. If service A calls service B with a 5-second deadline, and service A already used 2 seconds, service B receives a 3-second deadline. This prevents cascading timeouts. Always set deadlines on every RPC call — never use infinite timeout.
