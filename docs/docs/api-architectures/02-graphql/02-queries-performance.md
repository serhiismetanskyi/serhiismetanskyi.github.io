---
date: 2026-06-03
tags:
  - api
  - architecture
  - graphql
---

# GraphQL: Queries, Performance and Caching

## 2.3 Query Model

GraphQL gives clients full control over what data they receive. The client writes the query, and the server returns exactly that shape.

### Nested Queries

Queries can go deep into related data:

```graphql
{
  user(id: 1) {
    posts {
      comments {
        author {
          name
        }
      }
    }
  }
}
```

This is powerful but dangerous without limits. A malicious client can nest 50 levels deep and crash the server.

### Fragments

Fragments are reusable sets of fields. Define once, use in many queries:

```graphql
fragment UserFields on User {
  id
  name
  email
}

query {
  user(id: 1) { ...UserFields }
  admin(id: 2) { ...UserFields }
}
```

Fragments reduce duplication and make queries easier to maintain.

### Aliases

Aliases rename fields in the response. Useful when querying the same field with different arguments:

```graphql
{
  admins: users(role: ADMIN) { name }
  regular: users(role: USER) { name }
}
```

Response: `{ "admins": [...], "regular": [...] }` — clear separation in one request.

### Variables

Variables parameterize queries. They prevent string interpolation (which is unsafe):

```graphql
query GetUser($id: ID!) {
  user(id: $id) {
    name
    email
  }
}
```

Variables are sent as a separate JSON object: `{ "id": "user-123" }`. The server validates variable types against the schema.

### Built-in Directives

Every spec-compliant GraphQL server must support these three:

| Directive | Where | Behavior |
|---|---|---|
| `@skip(if: Boolean!)` | Query | Exclude field when `if` is `true` |
| `@include(if: Boolean!)` | Query | Include field only when `if` is `true` |
| `@deprecated(reason: String)` | Schema | Mark field as deprecated, signal clients to migrate |

Example: `user(id: 1) { name  email @skip(if: $hideEmail) }`

### Query Validation

The server validates every query before execution:

| Check                    | Example                           | Result          |
|-------------------------|-----------------------------------|-----------------|
| Unknown field           | `user { foo }`                    | Validation error |
| Wrong argument type     | `user(id: 123)` when ID expected  | Validation error |
| Missing required arg    | `user { name }` (no id)           | Validation error |
| Syntax error            | `{ user( }`                       | Parse error      |

All errors are caught before any resolver runs. This saves server resources.

---

## 2.4 Performance

### Query Depth Limiting

Set a maximum depth (e.g., 10 levels). Reject queries that go deeper:

```
Allowed:    user -> posts -> comments          (depth 3) ✓
Rejected:   user -> posts -> comments -> ...   (depth 15) ✗
```

Depth limiting is the first line of defense against abuse.

### Query Complexity Analysis

Assign a cost to each field. Sum all costs. Reject if total exceeds limit:

| Field Type   | Cost Example |
|-------------|-------------|
| Scalar field | 1           |
| Object field | 5           |
| List field   | 10          |
| Connection   | 20          |

A query requesting 100 list fields would cost 1000. If the limit is 500, the server rejects it with the complexity score in the error message.

### N+1 Problem

This is the most common performance issue in GraphQL:

- **Without DataLoader**: 1 query for parent + N queries for children = N+1 total.
- **With DataLoader**: 1 query for parent + 1 batched query for all children = 2 total.

Always use DataLoader. There is no valid reason to skip it in production.

### Resolver Waterfall

Resolvers run in sequence: parent first, then children. If a resolver is slow, all child resolvers wait:

```
user (200ms) -> posts (150ms) -> comments (100ms) = 450ms total
```

Solutions: optimize slow resolvers, use DataLoader for batching, add caching at resolver level.

---

## 2.5 Transport

### HTTP

Most common transport. All operations use POST with query in request body:

```
POST /graphql
Content-Type: application/json
{ "query": "{ user(id: 1) { name } }", "variables": {} }
```

For persisted queries, GET is possible: `/graphql?extensions={"persistedQuery":{"sha256Hash":"abc123"}}`.

### WebSocket

Used for subscriptions. Two protocols exist:

- `graphql-ws` — modern, recommended.
- `subscriptions-transport-ws` — legacy, deprecated.

Flow: client connects -> sends subscribe message -> server pushes events -> client unsubscribes -> disconnect.

---

## 2.6 Caching

### Client-Side Caching

Apollo Client normalizes data by `__typename` + `id`. When a mutation updates `User:1`, all queries showing that user re-render automatically. No manual cache updates needed.

### Persisted Queries

Client sends a SHA-256 hash instead of the full query string. Server maps hash → query. Benefits: smaller requests, blocks arbitrary queries, enables CDN GET caching.

### Server-Side Caching

| Approach | How It Works | Limitation |
|---|---|---|
| Response caching | Cache by query hash | Low hit rate |
| Field-level caching | Cache resolver results | Complex invalidation |
| CDN caching | Cache persisted GET responses | Persisted queries only |
| DataLoader | Cache within one request | No cross-request benefit |

GraphQL caching is harder than REST. Plan your strategy early.
