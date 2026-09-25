---
date: 2026-06-04
tags:
  - api
  - architecture
  - grpc
---

# gRPC: Contract Layer, Transport and Serialization

## 3.1 Contract Layer

### Protobuf Schema

Protocol Buffers (protobuf) is the default serialization format for gRPC.
You define messages and services in `.proto` files. The compiler generates code for your language.

```protobuf
syntax = "proto3";

message User {
  string id = 1;
  string name = 2;
  string email = 3;
  int32 age = 4;
}

service UserService {
  rpc GetUser(GetUserRequest) returns (User);
  rpc CreateUser(CreateUserRequest) returns (User);
  rpc ListUsers(ListUsersRequest) returns (stream User);
}
```

### Field Numbering

Each field has a unique number. These numbers identify fields in binary format.

Rules:
- Numbers 1–15 use 1 byte — use them for frequent fields
- Numbers 16–2047 use 2 bytes
- Never reuse deleted field numbers
- Use the `reserved` keyword for removed fields

```protobuf
message User {
  reserved 4, 8;
  reserved "old_field_name";
  string id = 1;
  string name = 2;
}
```

### Backward Compatibility

Adding new fields is safe. Old clients simply ignore unknown fields.
Removing fields — mark as `reserved`. Never change a field's type or number.

### Forward Compatibility

Old code can read new messages. Unknown fields are preserved during deserialization in proto3.
This means a proxy service can forward messages it does not fully understand.

### Advanced Field Types

- **`oneof`** — only one field in the group can be set. Like a union/variant type.
  ```protobuf
  oneof payment { CreditCard card = 5; BankTransfer transfer = 6; }
  ```
- **`map`** — key-value pairs. Keys must be string or integer types.
  ```protobuf
  map<string, string> metadata = 7;
  ```
- **Well-known types** — Google's standard messages for common patterns:
  - `google.protobuf.Timestamp` — date/time (seconds + nanos since epoch)
  - `google.protobuf.Duration` — time span
  - `google.protobuf.Struct` — untyped JSON-like structure (use sparingly)

---

## 3.2 Transport

### HTTP/2 Multiplexing

gRPC uses HTTP/2 as its transport protocol.
Multiple RPC calls share one TCP connection. Each call is an independent stream.
No head-of-line blocking between streams — one slow response does not block others.

### Flow Control

HTTP/2 has built-in flow control at the stream level.
The receiver tells the sender how much data it can accept (window size).
This prevents a fast sender from overwhelming a slow receiver.

Flow control works per-stream and per-connection. gRPC manages it automatically,
but you can tune window sizes for high-throughput scenarios.

### Connection Reuse

One TCP connection serves many RPCs at the same time.
This reduces TCP handshake overhead (no new connection per request).

Best practices:
- Use keepalive pings to maintain idle connections
- Set keepalive interval (e.g., 30 seconds) and timeout
- Use connection pooling for high-load services
- Monitor connection count — too many connections wastes resources

### Headers and Trailers

gRPC uses HTTP/2 headers for metadata (auth tokens, request IDs).
Status codes are sent in trailers — after the response body.

This is different from REST where status code comes first.
In gRPC, the server can start sending data before it knows the final status.

---

## 3.3 Serialization

### Binary Encoding

Protobuf encodes data in compact binary format.
Field numbers + wire types replace field names.
This makes the payload much smaller than JSON.

Wire types:
- 0: Varint (int32, int64, bool, enum)
- 1: 64-bit (fixed64, double)
- 2: Length-delimited (string, bytes, embedded messages)
- 5: 32-bit (fixed32, float)

### Payload Efficiency

Protobuf is 3–10x smaller than JSON for the same data.
Serialization and deserialization are faster because:
- No field name parsing
- No text-to-number conversion
- Schema-driven encoding (compiler knows types)

Example — a user object with id, name, email:
- JSON: ~120 bytes
- Protobuf: ~40 bytes

### Comparison with JSON

| Aspect | Protobuf | JSON |
|----------------|----------------------|----------------------|
| Format | Binary | Text |
| Size | Small (3–10x less) | Large |
| Speed | Fast | Slower |
| Human-readable | No | Yes |
| Schema | Required (.proto) | Optional (OpenAPI) |
| Type safety | Strong (compile-time) | Weak (runtime) |
| Browser support | Limited (grpc-web) | Native |
| Debugging | Need tools (grpcurl) | curl / browser |

### When Protobuf Wins

- Service-to-service communication (microservices)
- High-throughput pipelines
- Mobile clients with limited bandwidth
- Strict type contracts between teams

### When JSON Wins

- Public APIs consumed by browsers
- Quick prototyping and debugging
- Human-readable logs and configs
- Loose coupling between teams
