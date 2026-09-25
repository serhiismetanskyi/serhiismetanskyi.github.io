---
date: 2026-06-02
tags:
  - api
  - architecture
  - rest
---

# REST: Caching, Concurrency and Idempotency

## 1.5 Caching

HTTP caching reduces server load, saves bandwidth, and speeds up responses.
The server tells the client **how** and **how long** to cache using headers.

### Cache-Control Header

The `Cache-Control` header controls caching behavior. Key directives:

| Directive | Meaning | Example |
|---|---|---|
| `max-age=N` | Cache is valid for N seconds | `Cache-Control: max-age=3600` (1 hour) |
| `no-cache` | Must revalidate with server before using cache | `Cache-Control: no-cache` |
| `no-store` | Never store the response anywhere | `Cache-Control: no-store` |
| `public` | Any cache (CDN, proxy) can store it | `Cache-Control: public, max-age=86400` |
| `private` | Only the client browser can cache it | `Cache-Control: private, max-age=600` |

Combine directives: `Cache-Control: public, max-age=3600, stale-while-revalidate=60`.

- Use `no-store` for sensitive data (bank transactions, health records).
- Use `private` for user-specific data (profile, dashboard).
- Use `public` for shared data (product catalog, static assets).

### ETag / If-None-Match

ETag is a fingerprint of the response content.

**Flow:**

1. Server sends response with `ETag: "abc123"`.
2. Client stores the ETag.
3. Client sends next request with `If-None-Match: "abc123"`.
4. Server compares ETags:
   - **Match** -> returns `304 Not Modified` (no body, saves bandwidth).
   - **No match** -> returns `200 OK` with new data and new ETag.

ETags can be **strong** (`"abc123"` — byte-for-byte identical content) or **weak** (`W/"abc123"` — semantically equivalent, minor differences allowed like whitespace).

### Last-Modified / If-Modified-Since

Date-based alternative to ETag. Less precise (1-second resolution).

1. Server sends `Last-Modified: Wed, 25 Mar 2026 10:00:00 GMT`.
2. Client sends `If-Modified-Since: Wed, 25 Mar 2026 10:00:00 GMT`.
3. Server returns `304` if unchanged, or `200` with new data.

### Conditional Requests (304)

Both ETag and Last-Modified produce **conditional requests**.
The client asks: "Has this changed since my last fetch?"

Benefits:
- Saves bandwidth (304 has no body).
- Reduces server computation (can skip serialization).
- Keeps client data fresh without full re-download.

### CDN Behavior

CDNs (Cloudflare, CloudFront, Fastly) cache responses at edge locations.

- CDNs respect `Cache-Control` headers and `Vary` header.
- `Vary: Accept-Encoding` -> CDN stores separate versions for gzip vs plain.
- `Vary: Authorization` -> **dangerous**, can leak user data between users.
- Never cache personalized content at CDN level. Use `private` directive.
- Use cache tags or surrogate keys for targeted CDN purging.

### Cache Invalidation Strategies

| Strategy | How It Works | Best For |
|---|---|---|
| Time-based (TTL) | Cache expires after set time | Data that changes on a schedule |
| Event-based | Purge cache when data changes | Write-heavy applications |
| Versioned URLs | `/v2/styles.css?h=abc123` | Static assets |

Event-based invalidation is most accurate but requires infrastructure (message queue, webhooks).

### Stale Data Handling

Two useful directives for handling stale cache:

- `stale-while-revalidate=N`: Serve stale data immediately, revalidate in background. Client gets fast response; next request gets fresh data.
- `stale-if-error=N`: If origin server is down, serve stale data for N seconds. Improves availability during outages.

Example: `Cache-Control: max-age=300, stale-while-revalidate=60, stale-if-error=3600`.

---

## 1.6 Concurrency Control

When multiple clients update the same resource, data can be lost.
REST uses **optimistic locking** via ETags to prevent this.

### Optimistic Locking

No locks are held during reads. Conflicts are detected at write time.

**Flow:**

1. Client reads resource. Server returns `ETag: "v1"`.
2. Client sends `PUT /resource` with `If-Match: "v1"`.
3. Server checks: does current ETag match `"v1"`?
   - **Yes** -> update succeeds, server returns new ETag `"v2"`.
   - **No** -> return `412 Precondition Failed` (RFC 7232, Section 3.1).

> **412 vs 409**: `If-Match` failure → **412 Precondition Failed** (RFC 7232). `409 Conflict` is for business conflicts (duplicate email, invalid state). Many APIs use 409 for both — common but technically wrong for `If-Match`.

### Lost Update Problem

Without concurrency control:

```
Client A reads resource (version 1)
Client B reads resource (version 1)
Client A updates resource (version 1 -> version 2)  ✓ Success
Client B updates resource (version 1 -> version 2)  ✗ Overwrites A's changes!
```

With optimistic locking:

```
Client A reads resource (ETag: "v1")
Client B reads resource (ETag: "v1")
Client A sends PUT with If-Match: "v1" -> 200 Success (ETag now "v2")
Client B sends PUT with If-Match: "v1" -> 412 Precondition Failed (ETag is "v2", not "v1")
Client B re-reads resource (ETag: "v2"), merges changes, retries
```

### Handling Precondition Failed (412)

When the server returns `412 Precondition Failed` (for `If-Match` failure):

- Include the **current version** of the resource in the response body.
- Client reads the new ETag from the response.
- Client merges its changes with the current state and retries with the new ETag.
- Some APIs return a diff or conflict description to help the client merge.

---

## 1.7 Idempotency

An operation is **idempotent** if calling it N times produces the same result
as calling it once. The system state after N calls is identical to state after 1 call.

### Native Idempotent Methods

| Method | Idempotent? | Why |
|---|---|---|
| GET | Yes | Only reads data, no state change |
| PUT | Yes | Replaces entire resource, same input = same result |
| DELETE | Yes | Deleting already-deleted resource = same end state |
| PATCH | Depends | Can be idempotent (set field) or not (increment counter) |
| POST | No | Creates new resource each time |

### POST Idempotency Keys

POST is not naturally idempotent. Use an `Idempotency-Key` header:

```
POST /payments
Idempotency-Key: "pay_unique_abc123"
Content-Type: application/json

{"amount": 100, "currency": "USD"}
```

Server behavior:
1. Check if `Idempotency-Key` exists in storage.
2. **Key not found** -> process request, store key + response, return result.
3. **Key found** -> return stored response without processing again.

### Deduplication Logic

Server-side implementation:

- Store: `{key, request_hash, response_status, response_body, created_at}`.
- TTL: keep records for 24-48 hours (configurable).
- Validate: request body hash must match. Same key + different body = `422 error`.
- Storage: Redis with TTL is a common choice for idempotency key storage.

### Replay Safety

After a network failure, the client does not know if the server processed the request.
With idempotency keys, the client can safely **retry**:

- If server processed it -> returns stored result (no duplicate side effect).
- If server did not process it -> processes normally.

This is critical for payment APIs, order creation, and any operation with side effects.

### Race Conditions

Two identical POST requests arrive at the same time.
Solution: **distributed lock** on the idempotency key.

1. First request acquires lock on key `"abc"` (use Redis `SET NX`).
2. Second request tries to acquire lock -> waits or gets `409 Conflict`.
3. First request completes, stores result, releases lock.
4. Second request reads stored result and returns it.
