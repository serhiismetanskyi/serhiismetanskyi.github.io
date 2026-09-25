---
date: 2026-09-03
tags:
  - databases
  - postgresql
  - sql
---

# PostgreSQL — Basic Query Commands

Quick-reference for daily SQL work. For performance tuning see [03 — Queries & Performance](./03-queries-performance.md).

## SELECT

```sql
SELECT * FROM users;
SELECT id, email AS user_email FROM users;
SELECT DISTINCT role FROM users;
SELECT * FROM users WHERE active = true;
SELECT * FROM users ORDER BY created_at DESC NULLS LAST;
SELECT * FROM users LIMIT 20 OFFSET 40;
```

## Filtering

```sql
WHERE age >= 18 AND city = 'Kyiv'
WHERE role IN ('admin', 'editor')
WHERE created_at BETWEEN '2026-01-01' AND '2026-12-31'
WHERE email LIKE '%@gmail.com'              -- case-sensitive
WHERE email ILIKE '%@gmail.com'             -- case-insensitive (PostgreSQL)
WHERE deleted_at IS NULL
WHERE deleted_at IS NOT NULL
```

## Aggregation

```sql
SELECT count(*) FROM users;
SELECT city, count(*) AS total FROM users GROUP BY city;
SELECT city, count(*) AS total FROM users GROUP BY city HAVING count(*) > 10;
```

| Function | Description |
|----------|-------------|
| `count(*)` | Number of rows |
| `count(col)` | Non-NULL values |
| `sum(col)` | Total |
| `avg(col)` | Average |
| `min(col)` / `max(col)` | Min / max |
| `array_agg(col)` | Collect into array |
| `string_agg(col, ',')` | Concatenate text |

## JOINs

```sql
SELECT u.id, o.id FROM users u INNER JOIN orders o ON o.user_id = u.id;
SELECT u.id, o.id FROM users u LEFT JOIN orders o ON o.user_id = u.id;
SELECT * FROM users CROSS JOIN regions;
```

| Type | Returns |
|------|---------|
| `INNER JOIN` | Only matching rows from both sides |
| `LEFT JOIN` | All left + matching right (NULL if none) |
| `RIGHT JOIN` | All right + matching left |
| `FULL JOIN` | All rows from both sides |
| `CROSS JOIN` | Cartesian product |

## Subqueries and Existence Checks

```sql
SELECT * FROM users WHERE id IN (SELECT user_id FROM orders);
SELECT * FROM users u WHERE EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id);
SELECT * FROM products WHERE price > ALL (SELECT price FROM products WHERE category = 'books');
```

`EXISTS` is generally faster than `IN` for correlated checks.

## Set Operations

```sql
SELECT email FROM customers UNION     SELECT email FROM leads;          -- deduplicated
SELECT email FROM customers UNION ALL SELECT email FROM leads;          -- keeps duplicates (faster)
SELECT email FROM customers INTERSECT SELECT email FROM newsletter;     -- in both
SELECT email FROM customers EXCEPT    SELECT email FROM unsubscribed;   -- in first but not second
```

`UNION ALL` skips deduplication — prefer it when duplicates are acceptable or impossible.

## CTE and Recursive CTE

```sql
WITH recent AS (
  SELECT * FROM orders WHERE created_at >= now() - interval '7 days'
)
SELECT user_id, count(*) FROM recent GROUP BY user_id;

WITH RECURSIVE tree AS (
  SELECT id, parent_id, name, 1 AS depth FROM categories WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, c.parent_id, c.name, t.depth + 1 FROM categories c JOIN tree t ON c.parent_id = t.id
)
SELECT * FROM tree ORDER BY depth, name;
```

## Window Functions

```sql
SELECT id, total,
       row_number() OVER (ORDER BY total DESC) AS rank,
       sum(total)   OVER () AS grand_total,
       lag(total)   OVER (ORDER BY created_at) AS prev_total
FROM orders;

SELECT user_id, total,
       rank()       OVER (PARTITION BY user_id ORDER BY total DESC) AS user_rank
FROM orders;
```

| Function | Returns |
|----------|---------|
| `row_number()` | Sequential number (no ties) |
| `rank()` | Rank with gaps on ties |
| `dense_rank()` | Rank without gaps |
| `lag(col)` / `lead(col)` | Previous / next row value |
| `sum() OVER` / `avg() OVER` | Running aggregate |

## INSERT / UPDATE / DELETE

```sql
INSERT INTO users (email, name) VALUES ('a@b.com', 'Alice') RETURNING id;
INSERT INTO users (email, name)
VALUES ('a@b.com', 'Alice'), ('b@c.com', 'Bob');

INSERT INTO archive (user_id, email)
SELECT id, email FROM users WHERE active = false;

INSERT INTO users (email, name)
VALUES ('a@b.com', 'Alice')
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
RETURNING id;

UPDATE users SET role = 'admin' WHERE id = 10 RETURNING *;
UPDATE users u SET last_order = o.total
FROM orders o WHERE o.user_id = u.id AND o.id = 500;

DELETE FROM sessions WHERE expires_at < now() RETURNING id;
DELETE FROM users u USING banned b WHERE u.email = b.email;

TRUNCATE orders;                             -- fast full-table wipe, no row-level logging
TRUNCATE orders RESTART IDENTITY CASCADE;    -- reset sequences, cascade to FKs
```

## Conditional Expressions

```sql
SELECT coalesce(phone, 'n/a') FROM users;
SELECT nullif(discount, 0) FROM products;

SELECT name,
       CASE WHEN total >= 100 THEN 'high' WHEN total >= 50 THEN 'mid' ELSE 'low' END AS tier
FROM orders;
```

## Transaction Flow

```sql
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;
-- or ROLLBACK; to undo
```

## Type Casting and Dates

```sql
SELECT '42'::integer;
SELECT CAST('2026-01-01' AS date);
SELECT now(), now()::date, now()::time;
SELECT now() - interval '30 days';
SELECT extract(YEAR FROM created_at) FROM orders;
SELECT date_trunc('month', created_at) FROM orders;
```
