---
date: 2026-06-01
tags:
  - api
  - architecture
  - rest
---

# REST: Architecture and HTTP Layer

## 1.1 Architecture & Constraints

### Statelessness

Each request from a client must contain all information the server needs to process it.
The server does not store any client context between requests. No sessions, no memory of previous calls.

This matters because any server in a cluster can handle any request.
Scaling becomes simple — just add more servers behind a load balancer.

### Resource-Oriented Design

URLs represent resources (things), not actions.

**Good:** `/users`, `/orders`, `/users/123/orders`
**Bad:** `/getUsers`, `/createOrder`, `/fetchUserOrders`

Rules:
- Use plural nouns: `/users`, not `/user`
- Keep URL hierarchy max 3 levels deep: `/users/123/orders`
- Deeper nesting gets hard to maintain — flatten instead

### Uniform Interface

Four constraints define the uniform interface:
1. **Resource identification** — each resource has a unique URI
2. **Manipulation through representations** — clients send JSON/XML to modify resources
3. **Self-descriptive messages** — each request includes enough info (headers, media type) to process it
4. **HATEOAS** — responses include links to related actions (see below)

### Idempotency Semantics

**Idempotent** means: calling the same operation multiple times produces the same result as calling it once.

| Method | Idempotent | Why |
|--------|-----------|-----|
| GET    | Yes | Reading data does not change it |
| PUT    | Yes | Full replacement — same input gives same result |
| DELETE | Yes | Deleting something twice — resource is still gone |
| POST   | No  | Calling twice may create two resources |
| PATCH  | No  | Depends on implementation (set field = yes, increment = no) |

Why it matters: network failures happen. If a client retries a failed PUT, the result is safe.
If a client retries a failed POST, it may create duplicates.

### HATEOAS

Hypermedia As The Engine Of Application State. The response tells the client what actions are available next.

```json
{
  "id": 123,
  "name": "Alice",
  "status": "active",
  "_links": {
    "self": { "href": "/users/123" },
    "orders": { "href": "/users/123/orders" },
    "deactivate": { "href": "/users/123/deactivate", "method": "POST" }
  }
}
```

Optional but useful. Clients discover available actions instead of hardcoding URLs.
Reduces coupling between client and server.

### Client-Server Separation

Client handles presentation (UI, UX). Server handles business logic and data storage.
They communicate only through the API. This allows independent development and deployment.
A mobile app, web app, and CLI tool can all use the same API.

### Layered System

Design your API assuming intermediaries exist between client and server:
- Load balancers distribute traffic
- Caching layers (CDN, Varnish) store responses
- API gateways handle auth, rate limiting, routing

The client does not know (and should not care) whether it talks to the origin server or a proxy.

### Cacheability

Every response must declare whether it can be cached.
Use `Cache-Control`, `ETag`, and `Expires` headers. Cacheable responses reduce server load and improve latency.
Non-cacheable responses (e.g., user-specific data that changes often) must say so explicitly.

---

## 1.2 HTTP Layer

### Method Semantics

| Method | Purpose | Request Body | Response Body |
|--------|---------|-------------|---------------|
| GET    | Read a resource | No | Yes |
| POST   | Create a resource | Yes | Yes (created resource) |
| PUT    | Full update (replace) | Yes | Yes (updated resource) |
| PATCH  | Partial update | Yes | Yes (updated resource) |
| DELETE | Remove a resource | No | Optional |
| HEAD   | Same as GET, headers only | No | No (only headers) |
| OPTIONS | List allowed methods | No | Yes (`Allow` header) |
| QUERY  | Safe, idempotent query with the query in the body ([RFC 10008](08-query-method.md)) | Yes | Yes (query results) |

> **HEAD** use cases: check resource existence without downloading body, get `Content-Length`, validate `ETag` cheaply. HEAD is safe and idempotent. Monitoring tools use it for healthchecks.

### PATCH: Two Standards

PATCH has two competing formats:

- **JSON Merge Patch** (RFC 7396): send only fields to change. `{"name": "New Name"}` updates name, leaves other fields unchanged. `{"phone": null}` removes the field. Simple and intuitive.
- **JSON Patch** (RFC 6902): send array of operations. `[{"op": "replace", "path": "/name", "value": "New Name"}]`. More powerful — supports add, remove, replace, move, copy, test. Use when you need atomic multi-step updates.

### Safe vs Unsafe Methods

**Safe methods** do not change server state: `GET`, `HEAD`, `OPTIONS`, `QUERY`.
Calling them has no side effects. Caches and crawlers can call them freely.

**Unsafe methods** may change server state: `POST`, `PUT`, `PATCH`, `DELETE`.
They modify data, so they need protection (auth, validation, idempotency).

### Status Codes

**2xx — Success:**
- `200 OK` — request succeeded, response body has data
- `201 Created` — resource created, include `Location` header with new resource URI
- `204 No Content` — success, but no body (common for DELETE)

**4xx — Client Error:**
- `400 Bad Request` — malformed syntax, invalid JSON
- `401 Unauthorized` — no valid credentials provided
- `403 Forbidden` — credentials valid, but no permission for this action
- `404 Not Found` — resource does not exist
- `409 Conflict` — business conflict (e.g., duplicate email, invalid state transition)
- `412 Precondition Failed` — `If-Match` ETag did not match (optimistic locking failure)
- `415 Unsupported Media Type` — wrong `Content-Type` header (e.g., text/plain on a JSON endpoint)
- `422 Unprocessable Entity` — valid JSON, but business validation failed
- `429 Too Many Requests` — rate limit exceeded, include `Retry-After` header

**5xx — Server Error:**
- `500 Internal Server Error` — unexpected server failure
- `502 Bad Gateway` — upstream service returned invalid response
- `503 Service Unavailable` — server is overloaded or in maintenance

### Headers

**Content Negotiation:**
- `Content-Type: application/json` — tells server what format the request body is in
- `Accept: application/json` — tells server what format the client wants in response

**Authentication:**
- `Authorization: Bearer <token>` — JWT or OAuth2 access token
- `X-API-Key: <key>` — API key authentication (simpler, less secure)

**Caching:**
- `Cache-Control: max-age=3600` — response is fresh for 3600 seconds
- `ETag: "abc123"` — version identifier for a resource
- `If-None-Match: "abc123"` — client sends this to check if resource changed (returns 304 if not)

**Idempotency:**
- `Idempotency-Key: <uuid>` — custom header for making POST requests safe to retry.
  Server stores the response for this key. If the same key comes again, server returns the stored response
  instead of processing the request again. Critical for payment APIs and any create operation.
