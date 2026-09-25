---
date: 2026-09-02
tags:
  - databases
  - postgresql
  - sql
---

# PostgreSQL — Schema & Data Types

## Common Data Types

| Category | Type | Description |
|----------|------|-------------|
| **Integer** | `INTEGER` / `INT` | 4 bytes, ±2 billion |
| | `BIGINT` | 8 bytes, large IDs / counters |
| | `SMALLINT` | 2 bytes, small enums |
| | `SERIAL` / `BIGSERIAL` | Auto-incrementing integer (legacy) |
| **Text** | `VARCHAR(n)` | Variable-length, max n chars |
| | `TEXT` | Unlimited variable-length |
| | `CHAR(n)` | Fixed-length, padded |
| **Numeric** | `NUMERIC(p,s)` | Exact decimal (money, finance) |
| | `REAL` / `DOUBLE PRECISION` | Floating point (approximate) |
| **Boolean** | `BOOLEAN` | `true` / `false` / `null` |
| **Date/Time** | `TIMESTAMP` | Date + time (no timezone) |
| | `TIMESTAMPTZ` | Date + time with timezone (preferred) |
| | `DATE` | Date only |
| | `INTERVAL` | Duration (`'2 hours'`, `'3 days'`) |
| **UUID** | `UUID` | 128-bit universally unique identifier |
| **JSON** | `JSONB` | Binary JSON with indexing (preferred over `JSON`) |
| **Array** | `INTEGER[]`, `TEXT[]` | Native array type |
| **Network** | `INET`, `CIDR` | IP addresses, subnets |

> Practical defaults: use `TEXT` instead of `VARCHAR`, `TIMESTAMPTZ` instead of `TIMESTAMP`, and `JSONB` instead of `JSON`.

## CREATE TABLE

```sql
CREATE TABLE users (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email       TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    active      BOOLEAN NOT NULL DEFAULT true,
    role        TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator')),
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

> Prefer `GENERATED ALWAYS AS IDENTITY` over `SERIAL`: it is standard SQL and safer against accidental manual ID changes.

## Constraints

| Constraint | Syntax | Purpose |
|------------|--------|---------|
| `PRIMARY KEY` | `id BIGINT PRIMARY KEY` | Unique row identifier |
| `NOT NULL` | `name TEXT NOT NULL` | Disallow NULL |
| `UNIQUE` | `email TEXT UNIQUE` | No duplicate values |
| `CHECK` | `CHECK (age >= 0)` | Custom validation |
| `DEFAULT` | `DEFAULT now()` | Value when not specified |
| `REFERENCES` | `REFERENCES users(id)` | Foreign key |

### Foreign Keys

```sql
CREATE TABLE orders (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total       NUMERIC(10,2) NOT NULL CHECK (total >= 0),
    status      TEXT NOT NULL DEFAULT 'pending',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

| ON DELETE | Behavior |
|-----------|----------|
| `CASCADE` | Delete child rows when parent is deleted |
| `SET NULL` | Set FK column to NULL |
| `SET DEFAULT` | Set FK column to default value |
| `RESTRICT` | Block parent deletion if children exist (immediate check) |
| `NO ACTION` | Default in PostgreSQL; checked at end of statement/transaction |

## ALTER TABLE

```sql
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users DROP COLUMN phone;
ALTER TABLE users ALTER COLUMN name SET NOT NULL;
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'member';
ALTER TABLE users RENAME COLUMN name TO full_name;
ALTER TABLE users ADD CONSTRAINT email_check CHECK (email LIKE '%@%');
```

## Indexes

```sql
CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_orders_user_date ON orders (user_id, created_at DESC);
CREATE UNIQUE INDEX idx_users_email_unique ON users (lower(email));

-- Partial index (only active users)
CREATE INDEX idx_users_active ON users (email) WHERE active = true;

-- GIN index for JSONB
CREATE INDEX idx_users_metadata ON users USING gin (metadata);

-- GIN index for full-text search
CREATE INDEX idx_posts_search ON posts USING gin (to_tsvector('english', title || ' ' || body));
```

| Index Type | Use Case |
|------------|----------|
| **B-tree** (default) | Equality, range, ORDER BY |
| **GIN** | JSONB fields, arrays, full-text search |
| **GiST** | Geospatial (PostGIS), range types |
| **BRIN** | Very large tables with natural ordering (time-series) |
| **Hash** | Equality only (rarely better than B-tree) |

### Index Best Practices (Simple Rules)

- Index columns used in `WHERE`, `JOIN`, `ORDER BY`
- Composite indexes: place the most selective column first
- Avoid over-indexing: each index makes `INSERT`/`UPDATE`/`DELETE` slower
- Use `EXPLAIN ANALYZE` to verify indexes are used
- Partial indexes reduce size when filtering is predictable

## Views

```sql
CREATE VIEW active_users AS
    SELECT id, email, name FROM users WHERE active = true;

CREATE MATERIALIZED VIEW monthly_stats AS
    SELECT date_trunc('month', created_at) AS month, count(*) AS total
    FROM orders GROUP BY 1;

REFRESH MATERIALIZED VIEW monthly_stats;       -- Update materialized view data
```

## Enums vs Check Constraints

```sql
-- Option A: CHECK constraint (simpler, easier to modify)
status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'cancelled'))

-- Option B: ENUM type (strict, harder to modify)
CREATE TYPE order_status AS ENUM ('pending', 'active', 'cancelled');
status order_status NOT NULL DEFAULT 'pending'
```

**Recommendation:** Use `CHECK` constraints for most cases — adding values to an ENUM requires `ALTER TYPE`.
