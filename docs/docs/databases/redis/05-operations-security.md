---
date: 2026-09-30
tags:
  - databases
  - redis
  - security
  - performance
  - devops
---

# Redis — Persistence, Scaling & Security

## Persistence: RDB and AOF

| | RDB snapshots | AOF (append-only file) | None |
|--|---------------|------------------------|------|
| How | Forked child writes the full data set to `dump.rdb` | Every write command is appended to a log, replayed on start | Data lives only in RAM |
| Config | `save 3600 1 300 100 60 10000` (default rules) | `appendonly yes`, `appendfsync everysec` | `save ""`, `appendonly no` |
| Data lost on crash | Everything since the last snapshot (minutes) | About 1 s with `everysec`; ~0 with `always` (slow) | Everything |
| Restart speed | Fast | Slower for a large log (rewritten in the background) | Instant, empty |
| Use for | Backups, caches that are nice to keep warm | Queues, sessions, locks you do not want to lose | Pure cache, CI and test servers |

`save 3600 1 300 100 60 10000` means: snapshot if at least 1 change in 3600 s, 100 changes in 300 s, or 10000 changes in 60 s. The official Docker image uses these defaults with AOF off.

```bash
docker run -d --name redis -v redis-data:/data -p 127.0.0.1:6379:6379 redis:8 redis-server --appendonly yes
docker exec redis redis-cli INFO persistence | grep -E 'aof_enabled|rdb_last_bgsave_status'
docker exec redis ls /data /data/appendonlydir
# /data: appendonlydir  dump.rdb
# /data/appendonlydir: appendonly.aof.1.base.rdb  appendonly.aof.1.incr.aof  appendonly.aof.manifest
```

Since Redis 7.0 the AOF is a directory with a base file (RDB format by default, `aof-use-rdb-preamble yes`) plus incremental files and a manifest. Back up the whole directory, or trigger `BGSAVE`, wait for `LASTSAVE` to change and copy `dump.rdb`.

```
BGSAVE                  -- background snapshot
LASTSAVE                -- Unix time of the last successful save
BGREWRITEAOF            -- compact the AOF
CONFIG GET dir          -- where the files are ("/data" in the Docker image)
```

!!! tip "Persistence and forks"
    `BGSAVE` and AOF rewrites use `fork()`. With a large data set the fork itself can pause the server for milliseconds, and copy-on-write can need extra memory up to the size of the data being changed during the save. Leave headroom above `maxmemory`.

## Memory & Eviction

`maxmemory` is `0` (no limit) by default on 64-bit builds — Redis grows until the OS or the container kills it. Always set it, and choose what happens when it is reached:

| `maxmemory-policy` | Evicts | Use for |
|--------------------|--------|---------|
| `noeviction` (default) | Nothing; writes fail with `OOM command not allowed when used memory > 'maxmemory'` | Queues, locks, sessions, any data that must not silently disappear |
| `allkeys-lru` | Least recently used keys | Pure cache |
| `allkeys-lfu` | Least frequently used keys | Cache with stable hot keys |
| `allkeys-random` | Random keys | Rarely a good choice |
| `volatile-lru` / `volatile-lfu` / `volatile-random` | Only keys **with a TTL** | Cache and durable data on one server |
| `volatile-ttl` | Keys with the shortest remaining TTL | Same, "expiring soon" first |

```bash
redis-cli CONFIG SET maxmemory 256mb
redis-cli CONFIG SET maxmemory-policy allkeys-lru
redis-cli INFO stats | grep -E 'evicted_keys|expired_keys|keyspace_(hits|misses)'
```

In a run with `maxmemory 3mb`, `noeviction` rejected writes with `OutOfMemoryError` in redis-py (a subclass of `ResponseError`) after about 8,000 small keys while reads still worked; after switching to `allkeys-lru` the same writes succeeded and `evicted_keys` grew. With a `volatile-*` policy and no keys with a TTL, nothing can be evicted and writes fail as with `noeviction`.

Things that use memory beyond your data: client output buffers (slow Pub/Sub subscribers, huge replies), replication backlog, the fork during saves, fragmentation (`mem_fragmentation_ratio` in `INFO memory`).

## Big Keys and Slow Commands

Commands run one at a time, so one slow command delays every client.

| Risky command | Why | Instead |
|---------------|-----|---------|
| `KEYS *` | Walks the whole keyspace | `SCAN` with `MATCH` |
| `HGETALL`, `SMEMBERS`, `LRANGE 0 -1` on huge collections | Returns millions of elements | `HSCAN` / `SSCAN`, paging, smaller keys |
| `DEL` on a key with millions of elements | Freeing memory takes time | `UNLINK` (background free) |
| `FLUSHALL` / `FLUSHDB` on a big instance | Same | `FLUSHDB ASYNC` |
| Long Lua scripts | Block like a single command | Short scripts, batch work outside |
| `MONITOR` in production | Every command is copied to the monitor client | Local / test servers only |

Find the offenders with `redis-cli --bigkeys` / `--memkeys`, `SLOWLOG GET`, and `LATENCY DOCTOR`.

## Replication, Sentinel and Cluster

```mermaid
flowchart LR
    subgraph HA["Replication + Sentinel"]
        P1[("primary")] -- async --> R1[("replica")]
        P1 -- async --> R2[("replica")]
        S["Sentinel ×3<br/>monitor + failover"] -.-> P1
    end
    subgraph C["Cluster: 16384 hash slots"]
        A[("primary A<br/>slots 0–5460")] --- A1[("replica")]
        B[("primary B<br/>slots 5461–10922")] --- B1[("replica")]
        D[("primary C<br/>slots 10923–16383")] --- D1[("replica")]
    end
```

| Setup | What it gives | What to know |
|-------|---------------|--------------|
| **Replication** (`REPLICAOF host port`) | Read replicas, a warm copy | Asynchronous: acknowledged writes can be lost on failover; `WAIT n ms` waits until n replicas got the write |
| **Sentinel** | Monitoring, automatic failover, primary discovery | Run 3+ Sentinels; clients ask Sentinel for the current primary (`Sentinel.master_for` in redis-py) |
| **Cluster** | Sharding across primaries + failover | Keys are mapped to 16384 slots by CRC16; only database 0; multi-key commands and scripts only within one slot |

Cluster rules that show up in application tests:

- `MGET a b`, `SUNION`, `MULTI` or a Lua script on keys from different slots fails with `CROSSSLOT Keys in request don't hash to the same slot`.
- **Hash tags** force keys into one slot: `{user:42}:cart` and `{user:42}:profile` hash only `user:42` (both are slot 15880), so they can be used together.
- Clients follow `MOVED` / `ASK` redirects — use a cluster-aware client (`RedisCluster`), not a plain `Redis` pointed at one node.
- If production is a cluster, run at least a smoke suite against a cluster (or the managed service): code that works on a single node can fail with `CROSSSLOT`.

## Security

A reachable Redis without authentication gives full control over the data and, historically, over the host: attackers used `CONFIG SET dir` + `SAVE` to write files such as SSH keys. Internet scans for open port 6379 are constant.

| Control | How |
|---------|-----|
| Network | Private network or VPC only; `bind` to specific interfaces; firewall / security group; never a public IP |
| Protected mode | On by default in `redis.conf` (without a password only loopback clients are accepted). The official Docker image runs with `protected-mode no` and `bind *` — its port mapping is your only guard |
| Authentication | `requirepass` (password for the `default` user) or ACL users; disable the passwordless `default` user in shared environments |
| ACL (Redis 6+) | Per-service users with key patterns and command categories |
| TLS | `tls-port`, certificates; `rediss://` in clients — required outside a trusted network |
| Dangerous commands | Deny `@dangerous` (`FLUSHALL`, `KEYS`, `CONFIG`, `DEBUG`, …) for application users |
| Protected configs | Since Redis 7.0 `CONFIG SET dir` is refused by default (`enable-protected-configs no`); `DEBUG` is disabled (`enable-debug-command no`) |
| Patching | Keep the server updated — the Lua engine and parsers have had critical CVEs |

```
ACL SETUSER app on >app-secret ~app:* &app:* +@read +@write -@dangerous
ACL SETUSER tests on >tests-secret ~* +@all -flushall -flushdb
ACL LIST
ACL WHOAMI
```

```bash
redis-cli --user app --pass app-secret SET app:x 1       # OK
redis-cli --user app --pass app-secret SET other 1       # NOPERM No permissions to access a key
redis-cli --user app --pass app-secret FLUSHALL          # NOPERM User app has no permissions to run the 'flushall' command
redis-cli --user app --pass app-secret KEYS '*'          # NOPERM — KEYS is in @dangerous
```

- `~pattern` — keys the user can access; `&pattern` — Pub/Sub channels; `+@category` / `-command` — allowed commands.
- Store ACLs in an `aclfile` (or `redis.conf`) — `ACL SETUSER` at runtime is lost on restart unless you run `ACL SAVE`.
- In redis-py: `redis.Redis(username="app", password="app-secret")` or `redis://app:app-secret@host:6379/0`.
- Security tests worth automating: the app user cannot `FLUSHALL` / `CONFIG` / `KEYS`, cannot read other prefixes, and a connection without credentials gets `NOAUTH`.

## Monitoring

| Metric (`INFO`) | Watch for |
|-----------------|-----------|
| `used_memory` vs `maxmemory` | Approaching the limit: evictions or OOM errors next |
| `evicted_keys` | Growing on a server that should not evict (queues, sessions) |
| `keyspace_hits` / `keyspace_misses` | Cache hit ratio = hits / (hits + misses); a drop after a deploy often means a key format change |
| `connected_clients`, `rejected_connections` | Connection leaks, `maxclients` (10000 by default) reached |
| `blocked_clients` | Workers waiting on `BLPOP` / `XREADGROUP` — expected; growing without traffic is not |
| `instantaneous_ops_per_sec` | Traffic shape during load tests |
| `rdb_last_bgsave_status`, `aof_last_write_status` | Persistence failures (full disk) |
| `master_link_status`, `master_repl_offset` | Replica health and lag |

For Prometheus, `redis_exporter` exposes these metrics; managed services have their own dashboards. During load tests record Redis metrics next to API latency — a cache that stops hitting, or evictions, often explain a latency jump.

---
## See also
- [Redis — Overview](./index.md)
- [Redis — Setup & redis-cli](./01-setup-redis-cli.md)
- [PostgreSQL — Admin & Operations](../postgresql/04-admin-operations.md)
- [Code Security](../../code-security/index.md)
- [Performance Testing](../../performance-testing/index.md)
