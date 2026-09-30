---
date: 2026-09-30 18:00:00
tags:
  - databases
  - redis
---

# Redis — Data Types & Commands

Every key has one type. A command for another type fails with `WRONGTYPE Operation against a key holding the wrong kind of value`. Keys are created on the first write and removed when the last element is removed (an empty list, set or hash does not exist).

| Type | Think of it as | Typical use |
|------|----------------|-------------|
| String | Bytes up to 512 MB, or a number | Cache entries, counters, flags, tokens, locks |
| Hash | Small dict of string fields | Objects, sessions, per-user settings |
| List | Linked list, push / pop at both ends | Simple queues, recent items |
| Set | Unordered unique strings | Tags, "already processed" IDs, unique visitors |
| Sorted set | Unique members ordered by a float score | Leaderboards, priority queues, sliding windows |
| Stream | Append-only log of field-value entries | Event log, work queue with consumer groups |
| JSON | Nested document, JSONPath access | Documents with partial updates (built into Redis 8) |

Command examples below are `redis-cli` sessions; Python equivalents are in [04 — Python Client](./04-python-redis-py.md).

## Strings

```
SET user:42:name "Ann"                    -- OK
GET user:42:name                          -- "Ann"
GET missing                               -- (nil)

SET session:abc "{...}" EX 1800           -- expires in 1800 s (PX for ms, EXAT / PXAT for a Unix time)
SET lock:job "token-1" NX PX 30000        -- OK: only if the key does not exist
SET lock:job "token-2" NX PX 30000        -- (nil): key exists, nothing changed
SET cfg:mode "v2" XX                      -- only if the key already exists
SET cfg:mode "v3" GET                     -- set and return the old value
GETEX session:abc EX 1800                 -- read and refresh the TTL (sliding session)
GETDEL otp:42                             -- read once and delete (one-time codes)

MSET a 1 b 2                              -- several keys in one round trip
MGET a b c                                -- 1) "1"  2) "2"  3) (nil)
```

### Counters

```
INCR page:views                           -- 1 (a missing key counts as 0)
INCRBY page:views 5                       -- 6
DECR stock:sku-1                          -- can go below 0 — check the result
INCRBYFLOAT balance:42 1.5                -- "1.5"
INCR user:42:name                         -- ERR value is not an integer or out of range
```

`INCR` is atomic: 100 clients doing `INCR` at the same time always end with `100`. Reading a number in Python, adding 1 and writing it back loses updates — see [07 — Race Conditions](./07-testing-recipes.md#race-conditions).

## Hashes

```
HSET user:42 name Ann email ann@example.com visits 0    -- 3 (fields added)
HGET user:42 name                                       -- "Ann"
HMGET user:42 name missing                              -- 1) "Ann"  2) (nil)
HINCRBY user:42 visits 1                                -- 1
HGETALL user:42                                         -- all fields and values
HDEL user:42 email
HEXISTS user:42 email                                   -- 0
HLEN user:42
```

All values are strings — `visits` comes back as `"1"`, not an integer. Nested objects need JSON in a field or the JSON type.

Field-level expiry (Redis 7.4+) sets a TTL on single fields:

```
HEXPIRE user:42 60 FIELDS 1 visits        -- 1) 1
HTTL user:42 FIELDS 2 visits name         -- 1) 60  2) -1
HGETDEL user:42 FIELDS 1 name             -- read and delete a field (Redis 8.0+)
```

## Lists

```
RPUSH queue:emails a b c                  -- 3: push to the tail
LPOP queue:emails                         -- "a": pop from the head (FIFO with RPUSH)
LRANGE queue:emails 0 -1                  -- all elements: "b" "c"
LLEN queue:emails                         -- 2

LPUSH recent:user:1 item-9                -- newest first
LTRIM recent:user:1 0 99                  -- keep the last 100 (capped list)

BLPOP queue:emails 5                      -- block up to 5 s waiting for an element
LMOVE queue:emails queue:processing LEFT RIGHT   -- atomically move to an "in progress" list
```

A list is a simple queue: when a worker pops a job and crashes, the job is gone. `LMOVE` into a processing list, or a stream with consumer groups, lets you recover unfinished jobs.

## Sets

```
SADD tags:post:1 redis python redis       -- 2: duplicates are ignored
SMEMBERS tags:post:1                      -- order is not defined
SISMEMBER tags:post:1 redis               -- 1
SCARD tags:post:1                         -- 2
SREM tags:post:1 python
SADD tags:post:2 python pytest
SINTER tags:post:1 tags:post:2            -- common members
SUNION tags:post:1 tags:post:2
SPOP raffle:tickets                       -- remove and return a random member
```

Use a set with `SADD` for "have I seen this ID?" checks: `SADD` returns `1` for a new member and `0` for a known one, atomically.

## Sorted Sets

Members are unique, ordered by score; equal scores are ordered by member name.

```
ZADD lb 100 ann 250 bob 180 eve           -- 3
ZINCRBY lb 50 ann                         -- "150"
ZRANGE lb 0 -1 REV WITHSCORES             -- bob 250, eve 180, ann 150
ZRANGE lb 0 9 REV                         -- top 10
ZREVRANK lb ann                           -- 2 (0-based position from the top)
ZSCORE lb bob                             -- "250"
ZRANGE lb 100 200 BYSCORE                 -- members with 100 <= score <= 200
ZREMRANGEBYSCORE lb -inf 160              -- drop everything below 160
ZCARD lb
ZADD lb GT 120 ann                        -- update only if the new score is greater
```

Scores are 64-bit floats: exact for integers up to 2^53. With a timestamp as the score, a sorted set becomes a time index — the basis of the sliding-window rate limiter in [03](./03-patterns.md#sliding-window).

## Streams

A stream is an append-only log. Each entry has an ID (`<ms timestamp>-<seq>`) and field-value pairs. Consumer groups share the work: each entry goes to one consumer in the group and stays **pending** until it is acknowledged.

```
XADD orders * id 1 status new                     -- "1790789269433-0" (* = auto ID)
XADD orders MAXLEN ~ 100000 * id 2 status new     -- trim to about 100k entries
XLEN orders
XRANGE orders - + COUNT 10                        -- read by ID range, no group

XGROUP CREATE orders billing $ MKSTREAM           -- group reads new entries only ($); 0 = from the start
XREADGROUP GROUP billing worker-1 COUNT 10 BLOCK 5000 STREAMS orders >   -- > = never delivered
XACK orders billing 1790789269434-1               -- done
XPENDING orders billing                           -- delivered but not acked
XAUTOCLAIM orders billing worker-2 60000 0-0      -- take over entries idle for 60 s
XINFO GROUPS orders                               -- consumers, pending, lag
```

Compare with Pub/Sub and lists in [03 — Pub/Sub vs Streams](./03-patterns.md#pubsub-vs-lists-vs-streams).

## JSON

Redis 8 includes the JSON type (earlier versions need the RedisJSON module or Redis Stack; Valkey has a separate module).

```
JSON.SET doc:1 $ '{"user":{"name":"Ann","tags":["qa"]},"visits":0}'
JSON.GET doc:1 $.user.name                -- ["Ann"]
JSON.NUMINCRBY doc:1 $.visits 1           -- [1]
JSON.ARRAPPEND doc:1 $.user.tags '"python"'
```

If the server may be plain Redis 7 or Valkey, store JSON as a string (`SET key '{"..."}'`) and parse it in the app — this works everywhere.

## Other Types in Brief

| Type | Commands | Use |
|------|----------|-----|
| Bitmap (on a string) | `SETBIT`, `GETBIT`, `BITCOUNT` | Daily active flags per user ID |
| HyperLogLog | `PFADD`, `PFCOUNT` | Approximate unique counts in 12 KB |
| Geo (on a sorted set) | `GEOADD`, `GEOSEARCH` | "Stores within 5 km" |
| Probabilistic, time series, vector sets | `BF.*`, `TS.*`, `VADD` / `VSIM` | Bundled in Redis 8 |

## TTL & Expiry Rules

```
SET k v EX 100          -- TTL 100
TTL k                   -- 100
SET k v2                -- plain SET removes the TTL
TTL k                   -- -1
SET k v3 EX 100
SET k v4 KEEPTTL        -- change the value, keep the TTL
EXPIRE k 60 NX          -- only if there is no TTL yet (Redis 7.0+; also XX, GT, LT)
PERSIST k               -- remove the TTL
TTL missing             -- -2
```

| Rule | Consequence |
|------|-------------|
| `SET` without `EX` / `KEEPTTL` clears the TTL | A cache refresh written as `SET key value` creates a key that never expires |
| `INCR`, `HSET`, `RPUSH`, `SADD` keep the existing TTL | A counter created by `INCR` has **no** TTL until you add one |
| `EXPIRE` with 0 or a negative value deletes the key | Useful to expire a key "now" in tests |
| TTL is on the whole key (except hash fields in 7.4+) | You cannot expire one list element or set member |
| `RENAME` moves the TTL with the value | |
| Expired keys are removed lazily on access plus by a background sampler | An expired key is never returned, but memory is freed a bit later |
| TTLs use the server clock | Changing the clock in your test process does not affect a real Redis |

The last rule matters for testing: the app computes values like "window number" on the client, but expiry happens on the server. [07 — Testing TTL](./07-testing-recipes.md#testing-ttl-and-expiry-without-sleep) shows how to test both.

---
## See also
- [Redis — Overview](./index.md)
- [Redis — Setup & redis-cli](./01-setup-redis-cli.md)
- [Redis — Patterns](./03-patterns.md)
- [Redis — Python Client (redis-py)](./04-python-redis-py.md)
- [Databases — Types, Differences & Selection Guide](../index.md)
