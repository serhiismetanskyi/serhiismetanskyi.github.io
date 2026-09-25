---
date: 2026-06-03
tags:
  - api
  - architecture
  - graphql
---

# GraphQL: Testing Plan and Risks

## 2.7 Testing Plan

### Schema Tests

| Test Case                    | What to Check                                              |
|-----------------------------|-----------------------------------------------------------|
| Type validation              | All types resolve correctly, required fields marked with `!` |
| Field types match            | `String` fields return strings, `Int` fields return integers |
| Breaking changes detection   | Removed fields, changed types, renamed fields              |
| Schema diffing               | Use GraphQL Inspector to compare schema versions            |

Run schema tests on every PR. Breaking changes should block the merge.

### Query Validation Tests

Test that the server rejects bad queries before execution:

- **Syntax errors** — malformed query string returns a clear parse error.
- **Schema mismatch** — query for non-existent field returns validation error.
- **Type errors** — wrong argument type (string instead of int) returns validation error.
- **Missing required arguments** — omitting a `!` argument returns validation error.
- **Unknown directives** — using undefined directives returns validation error.

Each error response must include a human-readable message and the location in the query.

### Resolver Tests

Unit test each resolver in isolation:

1. **Mock context** — provide fake database, fake auth, fake DataLoader.
2. **Verify data** — resolver returns expected data for valid input.
3. **Error propagation** — resolver throws an error, and it appears in `response.errors` with correct `path`.
4. **Null handling** — nullable fields return null gracefully, non-nullable fields propagate error up.
5. **Authorization** — resolver checks permissions before returning data.

### Performance Tests

| Test                        | Setup                                    | Expected Result               |
|----------------------------|------------------------------------------|-------------------------------|
| Depth limit                 | Query exceeding max depth                | Rejected with clear error     |
| Complexity limit            | Query with high total cost               | Rejected with score in error  |
| Load test                   | N concurrent queries (e.g., 1000 rps)    | p99 < 500ms, error rate < 1%  |
| DataLoader batching         | Query list with nested relations         | SQL query count = 2, not N+1  |
| Large response              | Query returning 10,000 items             | Response time < 2s            |

### Security Tests

- **Introspection disabled in production** — `{ __schema { types { name } } }` returns error or empty result.
- **Query size limit** — extremely large query body (>1MB) returns 413 or error.
- **Batching attack** — sending 100 operations in one request is limited or rejected.
- **Field suggestions disabled** — error messages do not suggest valid field names (information leak).
- **CSRF protection** — mutations require proper headers or tokens.

### Authorization Tests

Test that access control works at field level:

| User Role  | Requested Field  | Expected Result             |
|-----------|-----------------|----------------------------|
| Admin      | `user.email`     | Returns email               |
| Viewer     | `user.email`     | Returns null or error       |
| Anonymous  | `user.email`     | Returns auth error          |
| Owner      | `user.settings`  | Returns settings            |
| Other user | `user.settings`  | Returns null or error       |

### Subscription Tests

1. **Connection lifecycle** — connect, subscribe, receive event, unsubscribe, disconnect.
2. **Event delivery** — create a mutation, verify subscription receives the event.
3. **Filtering** — subscribe to specific events only, verify other events are not received.
4. **Reconnect** — client disconnects, reconnects, re-subscribes. Verify it works.
5. **Concurrent subscriptions** — multiple active subscriptions on one connection.

---

## 2.8 Risks & Limitations

### Performance Risks

| Risk                        | Impact                                    | Mitigation                          |
|----------------------------|------------------------------------------|-------------------------------------|
| Query complexity explosion  | Server CPU spike, slow responses          | Depth + complexity limits           |
| Deep query DoS              | Server resource exhaustion               | Query depth limit (max 10-15)       |
| N+1 resolvers               | Database overload, slow responses        | Always use DataLoader               |
| CPU-heavy execution         | Higher latency than REST for simple cases | Persisted queries, query caching    |

### Caching Risks

| Risk                        | Impact                                    | Mitigation                          |
|----------------------------|------------------------------------------|-------------------------------------|
| No HTTP caching             | POST requests not cached by CDN/browser  | Persisted queries with GET          |
| Cache invalidation          | Stale data shown to users                | Normalized client cache, TTL        |

### Architecture Risks

| Risk                        | Impact                                    | Mitigation                          |
|----------------------------|------------------------------------------|-------------------------------------|
| Schema complexity           | Hard to maintain, slow to evolve          | Modularization, federation          |
| Tight coupling              | Client queries tied to schema shape       | Careful schema evolution, versioning |
| Rate limiting difficulty    | Hard to limit per field or operation      | Complexity-based rate limiting       |
| Over-fetching by server     | Resolvers fetch data client didn't ask for | Use info parameter in resolvers     |

### Operational Risks

- **Monitoring** — harder to monitor than REST because all requests go to one endpoint (`/graphql`). Solution: log operation names, use APM tools that understand GraphQL.
- **Error tracking** — partial errors (200 status with errors in body) can be missed by standard monitoring. Solution: check `errors` array in every response.
- **Schema evolution** — removing a field breaks clients. Solution: deprecate first, remove after migration period. Never rename fields — add new, deprecate old.
