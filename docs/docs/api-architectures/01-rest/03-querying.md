---
date: 2026-06-01
tags:
  - api
  - architecture
  - rest
---

# REST: Querying Layer

## Field Selection (Sparse Fieldsets)

Select only needed fields to reduce payload size:
```
GET /users?fields=id,name,email
```
Server returns only requested fields. Reduces bandwidth and serialization time.
Some APIs use `select` or `include` parameter instead of `fields`.

## Search

Full-text search across multiple fields:
```
GET /users?q=alice
GET /products?search=laptop+16gb
```
Search is different from filtering. Filters match specific conditions on known fields (exact value, range, boolean). Search does full-text matching across multiple fields, often with relevance ranking. Consider dedicated search engines (Elasticsearch) for complex search.

When filters get too long or complex for a query string, use the [HTTP QUERY method](08-query-method.md): the query goes in the request body, and the request stays safe, idempotent and cacheable.

---

## Filtering

### Exact Match

The simplest filter. Match a field to a specific value:
```
GET /users?status=active
GET /orders?currency=USD
```

### Range Filters

Use suffixes like `_gte` (greater than or equal) and `_lte` (less than or equal):
```
GET /users?age_gte=18&age_lte=65
GET /orders?created_after=2024-01-01&created_before=2025-01-01
```

### Boolean Filters
```
GET /users?is_verified=true
```
Accept only `true` and `false` as string values. Reject `1`, `0`, `yes`, `no` — be strict.

### AND / OR Logic

**AND** is the default. Multiple query params are combined with AND:
```
GET /users?status=active&is_verified=true
```

**OR** needs explicit syntax. Common approaches:
- Comma-separated (OR within one field): `GET /users?status=active,pending`
- Bracket syntax (OR across fields): `GET /users?filter[or][status]=active&filter[or][role]=admin`

### Nested Filters

Filter on related resource fields using dot notation:
```
GET /orders?user.country=US
GET /orders?product.category=electronics
```
Keep nesting to one level. Deeper nesting makes URLs unreadable and hard to optimize.

### Filter Validation

- Reject unknown filter parameters with `400 Bad Request`
- Validate filter values against expected types (integer, date, enum)
- Return a clear error message listing valid filter fields

---

## Sorting

### Single-Field Sort
```
GET /users?sort=name
GET /users?sort=created_at
```
Default direction is ascending.

### Multi-Field Sort

Comma-separated fields, applied in order:
```
GET /users?sort=name,-created_at
```
Sorts by `name` ascending first, then by `created_at` descending.

### Ascending / Descending

- No prefix = ascending: `sort=name`
- Dash prefix = descending: `sort=-name`

### Invalid Sort Handling

If a client requests sorting by a non-existent field, return `400 Bad Request`
with the list of valid sortable fields.

---

## Pagination

### Offset-Based
```
GET /users?limit=20&offset=0    → items 1-20
GET /users?limit=20&offset=20   → items 21-40
```
**Pros:** Simple, clients can jump to any page.
**Cons:** Slow on large datasets (DB scans offset rows). Data shifts between requests.

### Cursor-Based
```
GET /users?limit=20
GET /users?limit=20&after=eyJpZCI6MTAwfQ
```
The cursor is an opaque token (usually base64-encoded) pointing to the last item of previous page.

**Pros:** Stable results when data changes. Performs well on large datasets.
**Cons:** No random page access. Clients can only go forward or backward.

### Page-Based
```
GET /users?page=1&per_page=20
```
Internally translates to offset: `offset = (page - 1) * per_page`. Same issues as offset-based.

### Pagination Metadata

Always include metadata so clients know what comes next:
```json
{
  "data": [{ "id": 1, "name": "Alice" }, { "id": 2, "name": "Bob" }],
  "pagination": {
    "total": 150, "limit": 20, "offset": 0,
    "next": "/users?limit=20&offset=20", "previous": null
  }
}
```

For cursor-based: include `has_next`, `has_previous`, `next_cursor`, `previous_cursor`.
Note: `total` count can be expensive on large tables. Consider making it optional or cached.

---

## Comparison of Pagination Approaches

| Feature | Offset | Cursor | Page |
|---------|--------|--------|------|
| Random page access | Yes | No | Yes |
| Performance (large data) | Poor | Good | Poor |
| Stable under mutations | No | Yes | No |
| Implementation complexity | Low | Medium | Low |
| Real-time data friendly | No | Yes | No |
| Duplicate/missing risk | Yes | No | Yes |
| Best for | Admin panels | Feeds, timelines | Simple CRUD |

---

## Edge Cases

**limit=0:** Define behavior clearly. Either return empty array with metadata (useful for count only) or return `400`. Pick one and document it.

**Negative limit:** Always reject with `400 Bad Request`. No valid use case exists.

**offset > dataset size:** Return empty array, not an error. The client asked for data beyond what exists.
```json
{ "data": [], "pagination": { "total": 50, "limit": 20, "offset": 100, "next": null } }
```

**Cursor tampering:** Validate on server side — decode, verify structure, check referenced item exists. Return `400` for invalid cursors.

**Duplicate / missing records (offset pagination):**
When data changes between requests:
- New item added before current offset → next page may include a duplicate
- Item deleted before current offset → next page may skip an item

This is a fundamental problem with offset pagination. No fix exists — only mitigation.

**Data mutation between requests:**
Cursor-based pagination handles this well because the cursor points to a specific item, not a position. Even if items are added or removed, the next page starts from the correct point.

For offset-based, two mitigation options:
1. **Snapshot isolation** — query against a consistent database snapshot (expensive)
2. **Accept the trade-off** — document the behavior and let clients handle duplicates
