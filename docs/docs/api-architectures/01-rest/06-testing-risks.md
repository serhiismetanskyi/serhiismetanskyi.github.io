---
date: 2026-06-02
tags:
  - api
  - architecture
  - rest
---

# REST: Testing Plan and Risks

## 1.11 Testing Plan

Tests are organized by category. Each test describes input and expected result.

### Schema Validation Tests

| Test Case | Input | Expected |
|---|---|---|
| Missing required field | POST without `name` field | 400 or 422 with field error |
| Unknown field (strict mode) | POST with `foo_bar` extra field | 400 with "unknown field" error |
| Type mismatch | `"age": "not_a_number"` | 400 with type error on `age` |
| Null vs missing | `"name": null` vs no `name` key | Different behavior per spec |
| Invalid nested object | `"address": {"zip": 123}` (zip should be string) | 422 with nested field error |

Test both strict and lenient modes. Strict mode rejects unknown fields.
Lenient mode ignores them. Choose one and be consistent.

### Input Validation Tests

**Query parameters:**
- Invalid type: `?page=abc` -> 400.
- Missing required: `?search=` without `type` param -> 400.
- Unknown param: `?foo=bar` -> ignore (lenient) or 400 (strict).

**Path parameters:**
- Wrong type: `GET /users/not-a-uuid` -> 400.
- Non-existent resource: `GET /users/valid-but-missing-uuid` -> 404.

**Request body:**
- Malformed JSON: `{broken` -> 400 Bad Request.
- Empty body on POST: -> 400.
- Oversized body: > configured limit -> 413 Payload Too Large.

**Content-Type:**
- Wrong header: `Content-Type: text/plain` on JSON endpoint -> 415.
- Missing header: no Content-Type on POST -> 415.

### Query Logic Tests

**Filtering:**
- Filter returns correct subset of results.
- Filter with no matches returns empty array `[]`, not 404.
- Invalid filter field returns 400.
- Multiple filters combine with AND logic.

**Sorting:**
- `?sort=name` returns alphabetical order.
- `?sort=-created_at` returns newest first (descending).
- Multiple sort: `?sort=status,-created_at` -> primary + secondary sort.
- Invalid sort field returns 400.

**Pagination:**
- First page returns correct count and next cursor.
- Last page has no next cursor.
- Beyond last page returns empty array.
- Invalid cursor returns 400.
- Page size limits are enforced (max 100 items, for example).

### Idempotency Tests

| Test Case | Action | Expected |
|---|---|---|
| Repeated GET | GET same resource twice | Same response both times |
| Repeated PUT | PUT same data twice | Same result, no side effects |
| POST with key | Same POST + same Idempotency-Key | Stored response returned |
| POST different body | Same key + different body | 422 error (key mismatch) |
| Concurrent POST | Two identical POSTs at same time | Only one executes |

### HTTP Semantics Tests

- `GET /users` -> 200 with array.
- `POST /users` -> 201 with created resource and `Location` header.
- `PUT /users/1` -> 200 with updated resource.
- `DELETE /users/1` -> 204 No Content.
- `DELETE /users/1` again -> 204 or 404 (both are acceptable).
- `PATCH /users` (unsupported on collection) -> 405 Method Not Allowed.
- `OPTIONS /users` -> 200 with `Allow: GET, POST, OPTIONS` header.

### Error and Auth Tests

- All error responses match the standard error schema.
- Expired JWT returns 401 with `UNAUTHORIZED` code.
- Valid token but wrong role returns 403 with `FORBIDDEN` code.
- Rate limit exceeded returns 429 with `Retry-After` header.
- Internal error returns 500 with generic message (no stack trace).
- Invalid API key returns 401.

### Caching Tests

- Response includes `ETag` header.
- `If-None-Match` with current ETag returns 304 (no body).
- `If-None-Match` with old ETag returns 200 with new data.
- After resource update, ETag value changes.
- `Cache-Control` header is present with correct directives.
- `Last-Modified` header is present and accurate.

### Concurrency Tests

- Client A and Client B read resource (same ETag).
- Client A updates with `If-Match` -> 200 success, new ETag in response.
- Client B updates with old `If-Match` -> **412 Precondition Failed** (RFC 7232).
- 412 response includes current resource state and current ETag.
- Client B retries with new ETag -> 200 success.

### Rate Limiting Tests

| Test Case | Action | Expected |
|---|---|---|
| Below threshold | Send requests within limit | All succeed (200) |
| Exceed threshold | Send requests above limit | 429 Too Many Requests |
| Retry-After header | Trigger rate limit | Response includes `Retry-After` header |
| Retry after wait | Wait for Retry-After duration, retry | Request succeeds |
| Per-client isolation | Client A hits limit | Client B is not affected |
| Different endpoints | Separate limits per endpoint | Each endpoint has its own counter |

### Security Tests

| Test Case | Action | Expected |
|---|---|---|
| SQL injection | Send `'; DROP TABLE users;--` in param | No SQL execution, 400 error |
| NoSQL injection | Send `{"$gt": ""}` in filter | Rejected, no data leak |
| XSS in input | Send `<script>alert(1)</script>` in field | Stored escaped, not executable |
| Mass assignment | POST with `{"role": "admin"}` extra field | Field ignored or 422 error |
| Overposting | PATCH with `{"created_at": "..."}` | Internal field not changed |
| Data exposure | GET response for regular user | No password_hash or internal fields |
| CORS violation | Request from unauthorized origin | Blocked by CORS headers |

### Performance Tests

| Test | Target | Measure |
|---|---|---|
| Response time (p95) | < 200ms for simple reads | Under normal load |
| Response time (p99) | < 500ms for complex queries | Under normal load |
| Throughput | > 1000 RPS per instance | Sustained load |
| Large list pagination | < 300ms for 100 items | With cursor pagination |
| Connection pool | No connection exhaustion | Under sustained load |
| Concurrent writes | No data corruption | 50+ parallel updates |

### Advanced Policy: Conditional Writes

For mutating methods (`PUT`, `PATCH`, `DELETE`), require `If-Match` header with current ETag.

| Case | Expected response |
|---|---|
| Missing `If-Match` | `428 Precondition Required` |
| Stale `If-Match` value | `412 Precondition Failed` |
| Valid `If-Match` | `200` or `204` success |

Operational checklist:
- Return clear machine code (`PRECONDITION_REQUIRED`, `PRECONDITION_FAILED`).
- Add current `ETag` in `412` response to support client retry flow.
- Do not cache `428` responses.
- Log provided and current ETag with `request_id` for conflict analysis.

---

## 1.12 Risks and Limitations

| Risk | Impact | Solution |
|---|---|---|
| Over-fetching | Client gets more data than needed, wasted bandwidth | Sparse fieldsets `?fields=id,name` or GraphQL |
| Under-fetching | Multiple requests needed, higher latency | Include related resources `?include=author` |
| N+1 requests | 51 HTTP calls instead of 1-2, slow on mobile | Bulk endpoints, embed related data in list |
| Multiple round-trips | High total latency to build one screen | Compound documents, batch endpoints |
| Weak typing (JSON) | No native date/decimal types, precision issues | Document formats (ISO 8601), validate on server |
| Versioning complexity | Multiple versions to maintain and test | Strict backward compatibility, minimize versions |
| Cache invalidation | Stale data or no caching benefit | Event-based invalidation, short TTLs |
| Pagination inconsistency | Duplicates/missing items with offset pagination | Cursor-based pagination for stable results |
| No real-time support | Client must poll, delayed updates | WebSocket for real-time, webhooks for events |
| Large payloads | Slow mobile transfers, high bandwidth cost | `Accept-Encoding: gzip`, CDN compression |
| Inconsistent API design | Developer confusion, longer integration time | API style guide, linters (Spectral), code reviews |
| Security risks (OWASP) | Data breaches, unauthorized access | Security testing in CI/CD, input validation, auth |
