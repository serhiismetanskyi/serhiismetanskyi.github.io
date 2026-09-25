---
date: 2026-09-02
tags:
  - databases
  - postgresql
  - sql
---

# PostgreSQL — Commands & psql

## Connecting

```bash
psql -U myuser -d mydb                         # Local connection
psql -U myuser -h localhost -p 5432 -d mydb    # Explicit host/port
psql "postgresql://myuser:pass@localhost:5432/mydb"  # Connection string

psql -U myuser -d mydb -c "SELECT version();"  # Run single command
psql -U myuser -d mydb -f setup.sql            # Execute SQL file
```

### Environment Variables

```bash
export PGHOST=localhost
export PGPORT=5432
export PGUSER=myuser
export PGDATABASE=mydb
# With these set, just run: psql
```

### Password File (`~/.pgpass`)

```
# hostname:port:database:username:password
localhost:5432:mydb:myuser:secretpass
```

```bash
chmod 600 ~/.pgpass                            # Required permissions
```

## psql Navigation

| Command | Description |
|---------|-------------|
| `\l` | List databases |
| `\c dbname` | Switch to database |
| `\dt` | List tables in current schema |
| `\dt+` | List tables with sizes |
| `\d tablename` | Describe table (columns, types, indexes) |
| `\d+ tablename` | Detailed description (storage, stats) |
| `\di` | List indexes |
| `\dv` | List views |
| `\df` | List functions |
| `\du` | List users/roles |
| `\dn` | List schemas |
| `\dx` | List installed extensions |
| `\s` | Command history |
| `\e` | Open last query in editor |
| `\q` | Quit psql |

## Display & Output

```
\x auto                -- Toggle expanded display (vertical for wide tables)
\timing                -- Show query execution time
\pset format csv       -- Output as CSV
\pset format aligned   -- Back to default table format
\o output.txt          -- Redirect output to file
\o                     -- Stop redirect (back to screen)
```

## Database Operations

```sql
CREATE DATABASE myapp;
CREATE DATABASE myapp OWNER myuser ENCODING 'UTF8';

ALTER DATABASE myapp RENAME TO myapp_v2;
ALTER DATABASE myapp OWNER TO newowner;

DROP DATABASE IF EXISTS myapp;
```

```
\l                     -- List all databases with owner, encoding, size
```

## Schema Operations

```sql
CREATE SCHEMA IF NOT EXISTS api;
SET search_path TO api, public;

DROP SCHEMA api CASCADE;                       -- Drop schema + all objects
```

```
\dn                    -- List schemas
\dt api.*              -- List tables in specific schema
```

## Import & Export

```bash
# Export table to CSV
psql -U myuser -d mydb -c "\copy users TO 'users.csv' WITH CSV HEADER"

# Import CSV into table
psql -U myuser -d mydb -c "\copy users FROM 'users.csv' WITH CSV HEADER"
```

```sql
-- Inside psql:
\copy users TO 'users.csv' WITH CSV HEADER
\copy users FROM 'users.csv' WITH CSV HEADER

-- Export query result
\copy (SELECT * FROM users WHERE active = true) TO 'active.csv' WITH CSV HEADER
```

## Useful psql Tricks

```bash
# Search command history
Ctrl+R                                         # Reverse search (like bash)

# Execute previous command
\g                                             # Re-run last query
\gx                                            # Re-run last query in expanded mode

# Show SQL behind psql shortcuts
\set ECHO_HIDDEN on                            # See actual SQL when using \d, \dt, etc.
```

## Transaction Control

```sql
BEGIN;                                         -- Start transaction
SAVEPOINT sp1;                                 -- Create savepoint
ROLLBACK TO sp1;                               -- Rollback to savepoint
COMMIT;                                        -- Commit transaction
ROLLBACK;                                      -- Rollback entire transaction
```
