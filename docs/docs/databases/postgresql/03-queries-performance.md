---
date: 2026-09-02
tags:
  - databases
  - postgresql
  - sql
---

# PostgreSQL — Queries & Performance

For baseline SQL syntax see [05 — Basic Query Commands](./05-basic-query-commands.md). This file focuses on **query diagnostics, indexing, and performance patterns**.

## EXPLAIN ANALYZE

Main tool for understanding why a query is fast or slow.

```sql
EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 42;
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) SELECT * FROM orders WHERE user_id = 42;
```

### Reading the Output

```
Index Scan using idx_orders_user on orders  (cost=0.43..8.45 rows=5 width=64)
  (actual time=0.023..0.031 rows=5 loops=1)
  Index Cond: (user_id = 42)
  Buffers: shared hit=4
Planning Time: 0.102 ms
Execution Time: 0.051 ms
```

| Key Metric | What to Look For |
|------------|-----------------|
| **Seq Scan** | Reads full table; often means index is missing |
| **Index Scan** | Uses index; ideal for selective filters |
| **Bitmap Heap Scan** | Index found many rows; fetches in bulk then rechecks |
| **Rows Removed by Filter** | Much bigger than returned rows = poor filtering path |
| **shared hit** | Data came from cache (fast) |
| **shared read** | Data came from disk (slower) |
| **actual time** | Real wall-clock time at each step |

### Red Flags

| Problem | Symptom | Fix |
|---------|---------|-----|
| Missing index | `Seq Scan` on large table | `CREATE INDEX` on filter columns |
| Wrong index | Index exists but not used | Check column order, run `ANALYZE` |
| Too many rows filtered | `Rows Removed by Filter` >> returned | Add or adjust index |
| Sorting on disk | `Sort Method: external merge` | Add index matching ORDER BY; tune `work_mem` |
| Hash join spill | `Batches: N` (N > 1) | Increase `work_mem` or reduce result set |

## Indexing Strategy

```sql
CREATE INDEX idx_orders_status ON orders (status);

CREATE INDEX idx_orders_user_status ON orders (user_id, status);

CREATE INDEX idx_orders_covering ON orders (user_id) INCLUDE (total, status);

CREATE INDEX idx_orders_pending ON orders (created_at) WHERE status = 'pending';
```

| Strategy | When to Use |
|----------|-------------|
| Single-column | One column in WHERE |
| Composite | Multi-column WHERE; most selective column first |
| Covering (`INCLUDE`) | Avoids table lookup for extra columns |
| Partial (`WHERE`) | Only a known subset of rows is queried |

**80/20 rule:** Most slowdowns come from missing or incorrect indexes. Always verify with `EXPLAIN ANALYZE`.

## Advanced Filtering Performance

```sql
WHERE metadata @> '{"plan": "pro"}'         -- JSONB containment (needs GIN index)
WHERE tags && ARRAY['python', 'rust']       -- Array overlap (needs GIN index)
WHERE to_tsvector('english', body) @@ to_tsquery('postgres & performance')
```

| Pattern | Required Index Type |
|---------|-------------------|
| JSONB containment (`@>`) | `USING gin (col)` |
| Array overlap (`&&`) | `USING gin (col)` |
| Full-text search (`@@`) | `USING gin (to_tsvector(...))` |
| Geospatial | `USING gist (col)` |

## Pagination

```sql
SELECT * FROM users ORDER BY id LIMIT 20 OFFSET 100;

SELECT * FROM users WHERE id > 100 ORDER BY id LIMIT 20;
```

| Method | Pros | Cons |
|--------|------|------|
| Offset-based | Simple, any page jump | Slow on large offsets (scans skipped rows) |
| Keyset (cursor) | Constant speed, stable ordering | Cannot jump to arbitrary page |

Prefer **keyset pagination** for large datasets.

## Window Functions Performance

```sql
SELECT id, total,
       row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
FROM orders;
```

- Window functions run **after** WHERE/GROUP BY, so filter early to reduce the working set.
- Adding an index on `(partition_col, order_col)` helps avoid in-memory sorts.
- `row_number()` is cheaper than `rank()` / `dense_rank()` when you only need position.

## Common Anti-Patterns

| Anti-Pattern | Why It Hurts | Better Approach |
|-------------|-------------|-----------------|
| `SELECT *` in production | Transfers unnecessary data | List needed columns explicitly |
| `ORDER BY random()` | Full table scan + sort | Sample with `TABLESAMPLE` or app-side random IDs |
| `count(*)` on huge table | Scans all rows | Use `pg_stat_user_tables.n_live_tup` for estimates |
| Nested subqueries | Hard to optimize | Rewrite as JOINs or CTEs |
| `NOT IN (subquery)` with NULLs | Returns no rows if subquery has NULL | Use `NOT EXISTS` instead |
