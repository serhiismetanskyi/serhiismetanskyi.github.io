---
date: 2026-09-30 18:00:00
tags:
  - databases
  - redis
  - docker
---

# Redis — Setup & redis-cli

## Running Redis with Docker

```bash
docker run -d --name redis -p 127.0.0.1:6379:6379 redis:8
docker exec -it redis redis-cli                 # interactive shell inside the container
docker exec redis redis-cli INFO server | grep redis_version

docker run -d --name valkey -p 127.0.0.1:6380:6379 valkey/valkey:8   # the Valkey fork, same commands
docker rm -f redis valkey
```

!!! warning "Publish the port on 127.0.0.1"
    The official `redis` image starts with `protected-mode no` and no password, so `-p 6379:6379` (all interfaces) makes an open Redis reachable from your network. Use `-p 127.0.0.1:6379:6379` locally and a password or ACL user everywhere else. See [05 — Security](./05-operations-security.md#security).

Useful server flags — any `redis.conf` directive works as `--directive value`:

```bash
docker run -d --name redis -p 127.0.0.1:6379:6379 redis:8 \
  redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
```

### Docker Compose

```yaml
# compose.yaml
services:
  redis:
    image: redis:8.10                          # pin a minor version
    command: ["redis-server", "--appendonly", "yes", "--requirepass", "${REDIS_PASSWORD:?set REDIS_PASSWORD}"]
    environment:
      REDISCLI_AUTH: ${REDIS_PASSWORD}         # lets redis-cli inside the container authenticate
    ports:
      - "127.0.0.1:6379:6379"
    volumes:
      - redis-data:/data                       # RDB / AOF files live in /data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  redis-data:
```

```bash
export REDIS_PASSWORD=change-me
docker compose up -d --wait                    # waits for the health check
docker compose exec redis redis-cli ping       # PONG — REDISCLI_AUTH is used
docker compose down -v                         # -v also deletes the data volume
```

Other services in the same Compose project reach it as `redis://:change-me@redis:6379/0` — the service name is the host name.

## Connecting with redis-cli

```bash
redis-cli                                      # localhost:6379, db 0
redis-cli -h redis.internal -p 6379 -n 2       # host, port, database index
redis-cli -u redis://app:secret@localhost:6379/0
redis-cli --user app --pass secret             # ACL user; prints a warning about the password
REDISCLI_AUTH=secret redis-cli                 # password from the environment, no warning
redis-cli --tls -h cache.example.com -p 6380   # TLS (managed services)

redis-cli PING                                 # one command, then exit
redis-cli -n 1 DBSIZE
redis-cli --raw GET myapp:report > report.txt  # raw output, no quotes or (nil)
redis-cli --json HGETALL user:42               # {"name":"Ann","visits":"1"}
```

No local install? Use the one from the image: `docker run --rm -it --network host redis:8 redis-cli -p 6379`.

## Everyday Commands

| Command | What it does |
|---------|--------------|
| `PING` | Connectivity check, returns `PONG` |
| `SELECT 2` | Switch to database 2 in this connection |
| `DBSIZE` | Number of keys in the current database |
| `TYPE key` | `string`, `hash`, `list`, `set`, `zset`, `stream`, `ReJSON-RL`, … |
| `EXISTS key [key ...]` | How many of the keys exist |
| `TTL key` / `PTTL key` | Seconds / ms left; `-1` no TTL, `-2` no key |
| `EXPIRETIME key` | Absolute Unix time of expiry (Redis 7.0+) |
| `DEL key` / `UNLINK key` | Delete; `UNLINK` frees memory in a background thread |
| `RENAME old new` | Rename (overwrites `new`) |
| `OBJECT ENCODING key` | Internal encoding: `listpack`, `hashtable`, `skiplist`, … |
| `MEMORY USAGE key` | Bytes used by the key and its value |
| `COMMAND DOCS SET` | Built-in docs for a command |

## Finding Keys: SCAN, not KEYS

Redis executes commands one at a time. `KEYS pattern` walks the whole keyspace in one go and blocks every other client until it finishes — seconds on millions of keys.

```bash
redis-cli --scan --pattern 'myapp:user:*'               # uses SCAN under the hood
redis-cli --scan --pattern 'myapp:session:*' --count 1000 | wc -l
redis-cli --scan --pattern 'myapp:tmp:*' | xargs -r -n 500 redis-cli UNLINK   # batch delete
```

```
SCAN 0 MATCH myapp:user:* COUNT 100     -- returns a cursor + a batch; repeat with the cursor until it is 0
SCAN 0 TYPE hash                        -- filter by type (Redis 6.0+)
```

`SCAN` guarantees that keys present during the whole iteration are returned at least once — a key may come back more than once, so deduplicate if it matters. `COUNT` is a hint for work per call, not the size of the result.

## Inspecting a Server

| Command | Use it for |
|---------|------------|
| `INFO` / `INFO server` | Version, mode, uptime, config file |
| `INFO keyspace` | Keys, keys with TTL and average TTL per database |
| `INFO memory` | `used_memory_human`, `maxmemory_human`, `maxmemory_policy`, fragmentation |
| `INFO stats` | Hits / misses (`keyspace_hits`, `keyspace_misses`), `evicted_keys`, `expired_keys` |
| `INFO clients` | Connected and blocked clients |
| `CLIENT LIST` | Every connection: address, name, db, idle time, last command |
| `CLIENT SETNAME tests-gw0` | Name your connection so it is easy to find |
| `SLOWLOG GET 10` | Commands slower than `slowlog-log-slower-than` (10 ms by default) |
| `LATENCY DOCTOR` | Latency report; needs `CONFIG SET latency-monitor-threshold 100` first |
| `CONFIG GET maxmemory*` | Current settings; `CONFIG SET` changes them at runtime |

```bash
redis-cli --stat                     # rolling keys / memory / clients / ops per second
redis-cli --latency                  # continuous PING latency (min / max / avg ms)
redis-cli --bigkeys                  # largest keys per type (by number of elements)
redis-cli --memkeys                  # largest keys by memory
redis-cli --keystats                 # both, with percentiles (recent redis-cli)
redis-cli MONITOR                    # prints every command — debug only, it slows the server
```

`MONITOR` is the fastest way to see what the application under test really sends: keys, TTLs, number of round trips. Run it on a local or test server only.

## Key Naming

Redis has no tables or schemas — the key name is the structure.

| Rule | Example |
|------|---------|
| Colon-separated segments, from general to specific | `myapp:user:42`, `myapp:user:42:sessions` |
| App or service prefix first | `orders:cart:42`, `billing:invoice:2026-09` |
| Version the format when the value shape changes | `myapp:v2:user:42` — old and new code do not read each other's data |
| Put IDs, not user input, in keys | `myapp:search:<sha256 of the query>` instead of the raw query |
| Keep names short but readable | Key names use memory too — millions of keys × 100 bytes adds up |
| Test and environment prefixes when the server is shared | `test:gw1:myapp:user:42` |

A prefix makes ACL rules (`~myapp:*`), `SCAN MATCH`, monitoring and cleanup safe. In Redis Cluster, `{...}` in a key is a **hash tag**: keys with the same tag go to the same slot, so multi-key commands work on them (`{user:42}:cart`, `{user:42}:profile`).

## Logical Databases

A standalone Redis server has 16 numbered databases by default (`databases 16`), selected with `SELECT n` or `/n` in the URL.

- They share memory, CPU, config and users — they are namespaces, not isolation.
- `FLUSHDB` clears the current database; `FLUSHALL` clears **all** of them.
- Redis Cluster supports only database 0, and many managed services restrict `SELECT`. Code that must run on both should use key prefixes instead.

In tests databases are still handy: give each pytest-xdist worker its own database on a local server — see [06 — Parallel Tests](./06-testing-setup-isolation.md#parallel-tests-with-pytest-xdist).

---
## See also
- [Redis — Overview](./index.md)
- [Redis — Data Types & Commands](./02-data-types-commands.md)
- [Redis — Persistence, Scaling & Security](./05-operations-security.md)
- [Docker — Networking & Volumes](../../tools/docker/04-networking-volumes.md)
- [PostgreSQL — Commands & psql](../postgresql/01-commands-psql.md)
