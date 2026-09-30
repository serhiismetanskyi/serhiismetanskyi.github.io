---
date: 2026-09-01
tags:
  - databases
  - postgresql
  - sql
---

# PostgreSQL — Overview

## What Is PostgreSQL

PostgreSQL is an open-source **object-relational database** focused on reliability and flexibility. In practice, it lets you use classic SQL tables and modern data styles (JSON, full-text search, geospatial, vectors) in one system.

## Why PostgreSQL

| Strength | Detail |
|----------|--------|
| **ACID compliance** | Transactions are safe: `COMMIT` saves, `ROLLBACK` cancels |
| **SQL standard** | Strong SQL support for joins, analytics, and constraints |
| **Extensibility** | Extensions add features: `pgvector`, `PostGIS`, `pg_cron` |
| **JSON support** | `jsonb` works well with indexes for document-like data |
| **Concurrency** | Many reads/writes at once without frequent lock pain |
| **Ecosystem** | Mature tools, cloud-managed options (RDS, Cloud SQL, Supabase, Neon) |
| **Open source** | No vendor lock-in, permissive license |

## How It Works in Daily Use

```
App / psql sends SQL
        │
        ├── PostgreSQL validates query and permissions
        ├── Builds execution plan
        ├── Reads/writes data
        └── Returns rows or status
```

This guide stays at the practical SQL/operations level and intentionally skips internal process architecture details.

## PostgreSQL vs Alternatives

| Aspect | PostgreSQL | MySQL | SQLite | MongoDB |
|--------|-----------|-------|--------|---------|
| Type | Object-relational | Relational | Embedded relational | Document |
| ACID | Full | Full (InnoDB) | Full | Per-document |
| JSON support | `jsonb` (indexed) | JSON (limited) | JSON1 extension | Native (BSON) |
| Extensions | Rich (pgvector, PostGIS) | Limited | Minimal | Plugins |
| Scaling | Vertical + read replicas | Vertical + read replicas | Single file | Horizontal (sharding) |
| Best for | General purpose, analytics | Web apps, read-heavy | Embedded, mobile, tests | Flexible schema, prototyping |

## When to Choose PostgreSQL

| Good Fit | Consider Alternative |
|----------|---------------------|
| Complex queries with joins | Simple key-value lookups → Redis |
| ACID transactions required | Schemaless rapid prototyping → MongoDB |
| Mix of SQL + JSON data | Embedded / mobile / serverless → SQLite |
| Full-text search (built-in `tsvector`) | Heavy search workload → Elasticsearch |
| Geospatial (PostGIS) | Graph traversal → Neo4j |
| Vector similarity (pgvector) | Dedicated vector infra at scale → Pinecone |

## Key Extensions

| Extension | Purpose |
|-----------|---------|
| `pgvector` | Vector similarity search (AI/LLM) |
| `PostGIS` | Geospatial data and queries |
| `pg_stat_statements` | Query performance statistics |
| `pg_cron` | Scheduled jobs inside PostgreSQL |
| `pgcrypto` | Encryption functions |
| `uuid-ossp` / `gen_random_uuid()` | UUID generation |
| `hstore` | Key-value pairs in a column |

## Section Map

| File | Topics |
|------|--------|
| [01 — Commands & psql](./01-commands-psql.md) | Connection, navigation, psql shortcuts, import/export |
| [02 — Schema & Data Types](./02-schema-data-types.md) | Tables, columns, types, constraints, indexes |
| [03 — Queries & Performance](./03-queries-performance.md) | EXPLAIN ANALYZE, indexing strategy, pagination, window function tips, anti-patterns |
| [04 — Admin & Operations](./04-admin-operations.md) | Users, roles, backup, Docker setup, tuning |
| [05 — Basic Query Commands](./05-basic-query-commands.md) | SQL cheat sheet: CRUD, filters, joins, CTEs, window functions, set ops, transactions |

## Cheat Sheet

### psql & Connection ([01](./01-commands-psql.md))

| Task | Command |
|------|---------|
| Connect | `psql -U user -d db` |
| Connection string | `psql "postgresql://user:pass@host:5432/db"` |
| List databases | `\l` |
| List tables | `\dt` / `\dt+` (with sizes) |
| Describe table | `\d tablename` / `\d+` (detailed) |
| List indexes | `\di` |
| Show timing | `\timing` |
| Export CSV | `\copy (SELECT ...) TO 'file.csv' WITH CSV HEADER` |
| Import CSV | `\copy table FROM 'file.csv' WITH CSV HEADER` |
| Run SQL file | `psql -f file.sql` |
| Quit | `\q` |

### Schema & DDL ([02](./02-schema-data-types.md))

| Task | SQL |
|------|-----|
| Create table | `CREATE TABLE t (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, ...);` |
| Add column | `ALTER TABLE t ADD COLUMN col TEXT;` |
| Drop column | `ALTER TABLE t DROP COLUMN col;` |
| Rename column | `ALTER TABLE t RENAME COLUMN old TO new;` |
| Add constraint | `ALTER TABLE t ADD CONSTRAINT chk CHECK (col > 0);` |
| Foreign key | `col BIGINT REFERENCES other(id) ON DELETE CASCADE` |
| Create index | `CREATE INDEX idx ON t (col);` |
| JSONB index | `CREATE INDEX idx ON t USING gin (jsonb_col);` |
| Partial index | `CREATE INDEX idx ON t (col) WHERE active = true;` |
| Create view | `CREATE VIEW v AS SELECT ...;` |
| Materialized view | `CREATE MATERIALIZED VIEW v AS SELECT ...; REFRESH MATERIALIZED VIEW v;` |

### Queries ([05](./05-basic-query-commands.md))

| Task | SQL |
|------|-----|
| Filter | `WHERE col IN (...)` / `BETWEEN` / `LIKE` / `ILIKE` / `IS NULL` |
| Upsert | `INSERT ... ON CONFLICT (col) DO UPDATE SET ...` |
| Bulk insert | `INSERT INTO t SELECT ... FROM ...` |
| Update from join | `UPDATE t SET col = s.val FROM source s WHERE s.id = t.id` |
| Delete with join | `DELETE FROM t USING other o WHERE t.fk = o.id` |
| Union (dedup) | `SELECT ... UNION SELECT ...` |
| Union (keep all) | `SELECT ... UNION ALL SELECT ...` |
| Window rank | `row_number() OVER (PARTITION BY col ORDER BY col)` |
| Previous row | `lag(col) OVER (ORDER BY col)` |
| Conditional | `CASE WHEN ... THEN ... ELSE ... END` |
| Safe NULL | `coalesce(col, default)` |
| Cast | `col::type` or `CAST(col AS type)` |
| Truncate | `TRUNCATE table RESTART IDENTITY CASCADE` |

### Performance ([03](./03-queries-performance.md))

| Task | SQL |
|------|-----|
| Explain query | `EXPLAIN (ANALYZE, BUFFERS) SELECT ...` |
| Filter JSONB | `WHERE data @> '{"key": "val"}'` |
| Array overlap | `WHERE tags && ARRAY['a', 'b']` |
| Full-text search | `WHERE to_tsvector('english', body) @@ to_tsquery('term')` |
| Cursor pagination | `WHERE id > last_id ORDER BY id LIMIT n` |
| Estimate row count | `SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = 't'` |

### Admin & Ops ([04](./04-admin-operations.md))

| Task | Command |
|------|---------|
| Create user | `CREATE ROLE name WITH LOGIN PASSWORD '...';` |
| Grant read-only | `GRANT SELECT ON ALL TABLES IN SCHEMA public TO role;` |
| Backup DB | `pg_dump -U user -d db -Fc -f backup.dump` |
| Restore DB | `pg_restore -U user -d db --clean --if-exists backup.dump` |
| Docker connect | `docker compose exec db psql -U user -d db` |
| Update stats | `ANALYZE;` / `ANALYZE tablename;` |
| Vacuum | `VACUUM ANALYZE;` |
| Active queries | `SELECT pid, now()-query_start AS dur, query FROM pg_stat_activity WHERE state = 'active';` |
| Kill query | `SELECT pg_cancel_backend(pid);` |
| Table size | `SELECT pg_size_pretty(pg_total_relation_size('table'));` |
| DB size | `SELECT pg_size_pretty(pg_database_size('db'));` |

---
## See also
- [Digital Garden: Knowledge Base](../../index.md)
- [SQLAlchemy — Python ORM & SQL Toolkit](../../libs/sqlalchemy/index.md)
- [FastAPI — Modern Async Web Framework](../../libs/fastapi/index.md)
- [OOP & Error Handling](../../python-guide/02-oop-error-handling/index.md)
- [Test Data](../../test-automation-framework/03-test-data/index.md)
- [Databases — Types, Differences & Selection Guide](../index.md)
- [Redis — Overview](../redis/index.md)
