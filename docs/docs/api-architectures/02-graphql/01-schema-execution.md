---
date: 2026-06-03
tags:
  - api
  - architecture
  - graphql
---

# GraphQL: Schema, Architecture and Execution Model

## 2.1 Schema & Architecture

GraphQL uses a schema as a contract between client and server. The schema defines every type, field, and operation available. Clients can only request what the schema allows.

### Type System

GraphQL has a strong type system. All types are defined in the schema before any query can run.

- **Scalars** — basic value types: `Int`, `Float`, `String`, `Boolean`, `ID`. You can add custom scalars like `DateTime`, `Email`, `URL` for domain-specific validation.
- **Enums** — predefined set of values. The server rejects any value not in the set.

```graphql
enum Status { ACTIVE INACTIVE SUSPENDED }
```

- **Object types** — define structure with named fields. Each field has a type.

```graphql
type User {
  id: ID!
  name: String!
  email: String!
  status: Status!
  posts: [Post!]!
}
```

- **Input types** — used only for mutation arguments. Separate from output types.

```graphql
input CreateUserInput {
  name: String!
  email: String!
}
```

- **Unions** — a field can return one of several types. The client uses inline fragments to handle each case.

```graphql
union SearchResult = User | Post | Comment
```

- **Interfaces** — shared fields across types. Types that implement an interface must include all its fields.

```graphql
interface Node {
  id: ID!
}
type User implements Node {
  id: ID!
  name: String!
}
```

### Root Operations

| Operation    | Purpose               | HTTP Analogy     | Side Effects |
|-------------|----------------------|------------------|-------------|
| Query        | Read data             | GET              | No (idempotent) |
| Mutation     | Write / modify data   | POST, PUT, DELETE | Yes         |
| Subscription | Real-time updates     | WebSocket stream | No (server push) |

- **Query** is always safe to retry. It does not change server state.
- **Mutation** changes data. The server processes mutations sequentially (one by one), not in parallel.
- **Subscription** keeps a WebSocket connection open. The server pushes events when data changes.

### Schema Modularization

Large schemas become hard to manage in one file. Split them by domain:

- **Schema stitching** — merge multiple schemas into one at the gateway level.
- **Apollo Federation** — each service owns its types and resolvers. A gateway composes all services into one unified graph. Each service can be deployed independently.

Federation is the modern approach for microservices. Each team owns their part of the graph.

---

## 2.2 Execution Model

### How a Query Runs

The execution engine processes every query in four steps:

```
Client Query -> [Parse] -> [Validate] -> [Execute] -> [Format Response]
```

1. **Parse** — convert query string into AST (Abstract Syntax Tree).
2. **Validate** — check AST against schema. Wrong field names, bad types, missing args — all caught here.
3. **Execute** — run resolver functions for each requested field.
4. **Format** — build JSON response with `data` and `errors` fields.

### Resolver Chain

Each field in the schema has a resolver function. Resolvers run in a tree:

1. Root resolver runs first (e.g., `Query.user`).
2. Return value is passed to child resolvers (e.g., `User.posts`).
3. Each child resolver gets the parent result as first argument.

```
Query.user(id: 1)         -> returns User object
  User.name               -> returns "Alice"
  User.posts              -> returns [Post, Post]
    Post.title             -> returns "Hello"
    Post.comments          -> returns [Comment]
```

### Field-Level Resolution

GraphQL resolves each field independently. If you request `user.name` and `user.email`, both fields run their own resolver. This gives fine-grained control but can cause performance issues.

### DataLoader and the N+1 Problem

Without DataLoader, fetching a list creates N+1 queries:

```
1 query: SELECT * FROM users          -> 10 users
10 queries: SELECT * FROM posts WHERE user_id = ?   -> one per user
```

**DataLoader** collects all IDs during one tick of the event loop, then makes one batch request:

```
1 query: SELECT * FROM users
1 query: SELECT * FROM posts WHERE user_id IN (1,2,3,4,5,6,7,8,9,10)
```

Result: 2 queries instead of 11. DataLoader is essential for any production GraphQL server.

### Error Handling

Errors are collected per field. The response contains both `data` and `errors`:

```json
{
  "data": { "user": { "name": "Alice", "email": null } },
  "errors": [
    { "message": "Not authorized", "path": ["user", "email"] }
  ]
}
```

Partial data is normal in GraphQL. Some fields succeed, some fail. The client must handle both.

### Null Propagation Rules

When a non-nullable field (`String!`) resolves to `null`, the error propagates up to the nearest nullable parent:

- `user.name` is `String!` and returns null → `user` becomes null (if `User` is nullable)
- If `user` is also non-nullable → parent field becomes null, and so on up the tree

This means one failing field can null out an entire subtree. Design nullability carefully — make fields nullable unless you are certain they always resolve.

### Pagination (Relay Connection Spec)

The standard pagination pattern in GraphQL uses the Relay Connection specification:

```graphql
type UserConnection {
  edges: [UserEdge!]!
  pageInfo: PageInfo!
}
type UserEdge {
  node: User!
  cursor: String!
}
type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}
```

Query: `users(first: 10, after: "cursor123")`. This provides cursor-based pagination with metadata. Most GraphQL APIs follow this pattern for lists.
