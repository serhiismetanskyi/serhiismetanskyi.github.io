---
date: 2026-09-02
tags:
  - databases
  - postgresql
  - sql
---

# PostgreSQL — Admin & Operations

## Users & Roles

```sql
-- Create user (role with LOGIN)
CREATE ROLE myuser WITH LOGIN PASSWORD 'strongpass';

-- Create read-only role
CREATE ROLE readonly NOLOGIN;
GRANT CONNECT ON DATABASE mydb TO readonly;
GRANT USAGE ON SCHEMA public TO readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO readonly;

-- Assign role to user
GRANT readonly TO analyst_user;

-- Admin role
GRANT ALL PRIVILEGES ON DATABASE mydb TO myuser;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO myuser;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO myuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO myuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO myuser;

-- Revoke
REVOKE ALL PRIVILEGES ON DATABASE mydb FROM old_user;
DROP ROLE IF EXISTS old_user;
```

```
\du                    -- List all roles
\dp tablename          -- Show table permissions
```

## Backup & Restore

### pg_dump (Logical Backup)

```bash
# Dump single database (custom format — compressed, flexible)
pg_dump -U myuser -d mydb -Fc -f mydb.dump

# Dump as plain SQL
pg_dump -U myuser -d mydb -f mydb.sql

# Dump specific table
pg_dump -U myuser -d mydb -t users -Fc -f users.dump

# Dump schema only (no data)
pg_dump -U myuser -d mydb --schema-only -f schema.sql

# Dump data only (no schema)
pg_dump -U myuser -d mydb --data-only -f data.sql
```

### pg_restore

```bash
# Restore from custom format dump
pg_restore -U myuser -d mydb --clean --if-exists mydb.dump

# Restore specific table
pg_restore -U myuser -d mydb -t users mydb.dump

# Restore from plain SQL
psql -U myuser -d mydb -f mydb.sql
```

### pg_dumpall (All Databases + Roles)

```bash
pg_dumpall -U postgres -f full_backup.sql
psql -U postgres -f full_backup.sql            # Restore everything
```

## Docker Compose Setup

```yaml
services:
  db:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: mydb
      POSTGRES_USER: myuser
      POSTGRES_PASSWORD_FILE: /run/secrets/db_pass
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./init:/docker-entrypoint-initdb.d     # SQL scripts run on first start
    secrets:
      - db_pass
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U myuser -d mydb"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  pgdata:

secrets:
  db_pass:
    file: ./secrets/db_password.txt
```

```bash
docker compose up -d
docker compose exec db psql -U myuser -d mydb  # Connect to running instance
```

Place `.sql` or `.sh` files in `./init/` — they execute alphabetically on first container creation only.

## Key Configuration Parameters

| Parameter | Recommended | Purpose |
|-----------|-------------|---------|
| `shared_buffers` | 25% of RAM | In-memory page cache |
| `effective_cache_size` | 75% of RAM | Planner hint for available cache |
| `work_mem` | 16–64 MB | Memory per sort/hash operation |
| `maintenance_work_mem` | 512 MB–2 GB | VACUUM, CREATE INDEX |
| `max_connections` | 100–200 | Use connection pooler for more |
| `wal_level` | `replica` | Enable replication / point-in-time recovery |
| `log_min_duration_statement` | `500` (ms) | Log slow queries |
| `log_statement` | `ddl` | Log schema changes |

Treat these values as starting points, then tune from measurements in your environment.

> Avoid pushing `max_connections` too high (for many systems, >200 hurts throughput). Use a pooler like **PgBouncer** instead.

## Maintenance

```sql
-- Update table statistics (query planner needs fresh stats)
ANALYZE;
ANALYZE users;

-- Reclaim dead rows (usually handled by autovacuum)
VACUUM;
VACUUM ANALYZE users;
VACUUM FULL users;                             -- Rewrites table, reclaims disk (locks table)

-- Check table and index sizes
SELECT pg_size_pretty(pg_total_relation_size('users'));
SELECT pg_size_pretty(pg_database_size('mydb'));

-- Identify unused indexes
SELECT indexrelname, idx_scan FROM pg_stat_user_indexes
WHERE idx_scan = 0 ORDER BY pg_relation_size(indexrelid) DESC;
```

## Monitoring Queries

```sql
-- Currently running queries
SELECT pid, now() - query_start AS duration, state, query
FROM pg_stat_activity
WHERE state != 'idle' ORDER BY duration DESC;

-- Kill a long-running query
SELECT pg_cancel_backend(pid)                  -- Graceful (cancel query)
FROM pg_stat_activity
WHERE state = 'active'
  AND now() - query_start > interval '5 minutes'
  AND pid <> pg_backend_pid();

SELECT pg_terminate_backend(pid)               -- Force (terminate connection)
FROM pg_stat_activity
WHERE state = 'active'
  AND now() - query_start > interval '15 minutes'
  AND pid <> pg_backend_pid();

-- Table statistics
SELECT relname, seq_scan, idx_scan, n_tup_ins, n_tup_upd, n_tup_del
FROM pg_stat_user_tables ORDER BY seq_scan DESC;

-- Enable pg_stat_statements for query analytics
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 10;
```
