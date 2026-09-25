---
date: 2026-06-02
tags:
  - api
  - architecture
  - rest
  - security
---

# REST: Error Model, Security and Versioning

## 1.8 Error Model

A good API returns errors that are easy to read, parse, and act on.
Use a consistent schema for **every** error response.

**RFC 9457 (Problem Details)**: the standard format for HTTP API errors. Content-Type: `application/problem+json`. Fields: `type` (error URI), `title`, `status`, `detail`, `instance`. Use this standard if possible — many frameworks support it natively.

### Standardized Error Schema

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request body contains invalid fields",
    "request_id": "req_abc123",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format",
        "code": "INVALID_FORMAT"
      },
      {
        "field": "age",
        "message": "Must be a positive integer",
        "code": "INVALID_TYPE"
      }
    ]
  }
}
```

Key fields:
- `code`: machine-readable error identifier (use for client logic).
- `message`: human-readable explanation (use for logging and debugging).
- `request_id`: trace ID for finding the error in server logs.
- `details`: array of field-level errors (for validation errors).

### Field-Level Validation Errors

Return **all** validation errors at once. Do not fail on the first error.
The client can fix everything in one retry instead of multiple round trips.

Each field error has:
- `field`: path to the invalid field (`"address.zip_code"` for nested).
- `message`: what went wrong in plain language.
- `code`: machine-readable code for programmatic handling.

### Consistent Error Codes

Use codes that clients can match in code. HTTP status codes alone are not enough.

| HTTP Status | Error Code | When to Use |
|---|---|---|
| 400 | `BAD_REQUEST` | Malformed JSON, wrong Content-Type |
| 400 | `VALIDATION_ERROR` | Invalid field values |
| 401 | `UNAUTHORIZED` | Missing or expired token |
| 403 | `FORBIDDEN` | Valid token but insufficient permissions |
| 404 | `NOT_FOUND` | Resource does not exist |
| 409 | `CONFLICT` | Business conflict (duplicate email, invalid state transition) |
| 412 | `PRECONDITION_FAILED` | `If-Match` ETag mismatch — optimistic locking failure |
| 422 | `UNPROCESSABLE_ENTITY` | Semantically invalid (valid JSON, wrong meaning) |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Server bug (never expose details to client) |

### HTTP Status Code Mapping

- **4xx** = client error. The client must fix the request.
- **5xx** = server error. The client can retry later.
- Use `400` for syntax errors, `422` for semantic errors.
- Always return `500` with a generic message. Never expose stack traces.

---

## 1.9 Security

API security is not optional. Every public API is a target.

### Authentication

Common approaches:

- **JWT tokens**: short-lived (15 min access, 7-day refresh). Stateless verification.
  Store access token in memory, refresh token in HttpOnly cookie.
  Never store tokens in `localStorage` (vulnerable to XSS).
- **OAuth2**: use for third-party access. Authorization Code flow for web apps,
  Client Credentials for service-to-service.
- **API keys**: use for server-to-server calls. Send in header, never in URL.
  Rotate keys regularly. Scope keys to specific permissions.

### Authorization

- **RBAC** (Role-Based Access Control): user has a role, role has permissions.
  Example: `admin` can delete users, `viewer` can only read.
  Simple to implement, works for most applications.
- **ABAC** (Attribute-Based Access Control): rules based on attributes.
  Example: "user can edit document if user.department == document.department".
  More flexible but more complex. Use when RBAC is not enough.

### Input Sanitization

- Validate all input on the server. Never trust client data.
- Check types, lengths, ranges, and formats.
- Reject unexpected fields (strict schema validation).
- Trim whitespace, normalize unicode.
- Use allowlists over denylists when possible.

### Rate Limiting

Protect the API from abuse and overload.

- Limit requests per time window per client (by API key, IP, or user ID).
- Return `429 Too Many Requests` with `Retry-After: N` header.
- Common algorithms:
  - **Fixed window**: 100 requests per minute. Simple but has burst at window edges.
  - **Sliding window**: smooths out the burst problem.
  - **Token bucket**: allows short bursts, refills at constant rate. Most flexible.

### Injection Protection

- **SQL injection**: always use parameterized queries. Never build SQL with string concat.
- **NoSQL injection**: validate query operators, reject `$gt`, `$ne` in user input.
- **XSS**: escape HTML in any user-generated content returned by the API.
- **JSON structure**: validate JSON schema before processing.

### Data Exposure Control

- Never return sensitive fields: `password_hash`, `internal_id`, `ssn`.
- Use separate response DTOs (Data Transfer Objects) for each endpoint.
- Filter fields at the serialization layer, not in the query.
- Never expose stack traces or internal error details in production.
- Audit your responses regularly for data leaks.

### CORS (Cross-Origin Resource Sharing)

- Restrict `Access-Control-Allow-Origin` to known domains.
- Never use wildcard `*` in production with credentials.
- Limit allowed methods: `GET, POST, PUT, DELETE`.
- Limit allowed headers to what the client actually sends.
- Set `Access-Control-Max-Age` to reduce preflight requests.

### HTTPS Only

- Redirect all HTTP to HTTPS. Set `Strict-Transport-Security: max-age=31536000`.
- Use TLS 1.2+ only. Disable older protocols. Pin certificates for mobile apps.

---

## 1.10 Versioning

APIs evolve. Versioning lets you change the API without breaking existing clients.

### URL Versioning

```
GET /v1/users
GET /v2/users
```

- Most common approach. Used by Stripe, GitHub, Google.
- Simple to understand, easy to route, CDN-friendly.
- Downside: URL changes when version changes.
- **Recommended for most public APIs.**

### Header Versioning

```
GET /users
Accept: application/vnd.myapi.v2+json
```

Or custom header: `X-API-Version: 2`.

- URLs stay clean and stable.
- More aligned with REST principles (content negotiation).
- Harder to test (cannot just change URL in browser).
- Harder for CDNs to cache (need `Vary` header).

### Backward Compatibility

What is safe:
- Adding new fields to response -> safe (clients should ignore unknown fields).
- Adding new optional query parameters -> safe.
- Adding new endpoints -> safe.

What breaks clients:
- Removing fields from response -> **breaking**.
- Renaming fields -> **breaking**.
- Changing field types (string to integer) -> **breaking**.
- Changing validation rules (making optional field required) -> **breaking**.
- Changing error codes or response structure -> **breaking**.

### Deprecation Strategy

1. **Announce**: add `Sunset: Sat, 01 Jan 2027 00:00:00 GMT` header to responses.
2. **Document**: publish deprecation notice in changelog and API docs.
3. **Monitor**: track usage of deprecated version. Contact active users.
4. **Migrate**: provide migration guide. Keep old version for 6-12 months minimum.
5. **Remove**: shut down old version. Return `410 Gone`. Use `Deprecation` header (RFC 8594) alongside `Sunset`.
