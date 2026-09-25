---
date: 2026-08-11
tags:
  - performance
  - load-testing
  - observability
---

# Performance Bottlenecks

A bottleneck is the **constraint that limits overall throughput**.
Fixing anything else first is wasted effort. Find the bottleneck, fix it, repeat.

---

## Backend (Application Server)

### CPU Saturation

**Symptoms:** latency increases linearly with load, CPU at 90–100%.

**Causes:**
- Compute-heavy logic running synchronously in request handlers
- Unoptimized serialization / deserialization
- Excessive logging with synchronous I/O

**Fix:** profile with `py-spy` or `cProfile`, move heavy work to background tasks.

---

### Thread / Worker Exhaustion

**Symptoms:** latency spikes at a specific RPS, queue depth grows, errors appear suddenly.

**Causes:**
- All WSGI/ASGI workers are blocked waiting for DB or downstream services
- Thread pool too small for the concurrency level

**Fix:** increase worker count, switch to async (FastAPI + asyncio), or add connection pooling.

---

### Blocking Operations

**Symptoms:** high latency despite low CPU.

**Causes:**
- Synchronous file I/O in async context
- `time.sleep()` in request handler
- Synchronous HTTP calls to external services

**Fix:** use async I/O (`aiofiles`, `httpx` async client), offload blocking calls.

---

## Database

### Slow Queries

**Symptoms:** DB CPU low, but query time high. EXPLAIN shows sequential scans.

**Fix:** add indexes for WHERE/ORDER BY columns. Use `EXPLAIN ANALYZE` to verify.

---

### Missing Indexes

A full table scan on 10M rows takes seconds. An indexed lookup takes microseconds.
Missing indexes are the **single most common cause** of DB bottlenecks.

```sql
EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 42;
-- Seq Scan → no index. Add:
CREATE INDEX CONCURRENTLY idx_orders_user_id ON orders(user_id);
```

---

### Lock Contention

**Symptoms:** queries are fast in isolation, slow under concurrent load.

**Causes:**
- Long-running transactions holding row locks
- `SELECT FOR UPDATE` on hot rows
- Schema migrations running in production

**Fix:** shorten transactions, use optimistic locking, schedule migrations off-peak.

---

### N+1 Queries

**Symptoms:** 100 items in a list → 101 DB queries. Latency scales with result set size.

**Fix:** use `JOIN` or ORM eager loading (`select_related`, `prefetch_related` in Django).

---

## Network

### Bandwidth Limits

**Symptoms:** throughput plateaus, no CPU/DB pressure.

**Fix:** compress responses (gzip/brotli), use pagination, reduce payload size.

---

### High Network Latency

**Symptoms:** fast server processing, slow total response time.

**Causes:** cross-region service calls, no connection reuse.

**Fix:** use persistent connections, HTTP/2, place services in the same availability zone.

---

## Application Logic

| Anti-pattern | Impact | Fix |
|-------------|--------|-----|
| N+1 queries | O(n) DB calls per request | Eager load / JOIN |
| Synchronous external calls | Latency = sum of all calls | Parallelize with asyncio |
| Unbounded result sets | Memory + time grows with data | Paginate |
| In-memory sorting of large sets | CPU spike | Sort in DB with indexes |
| Regex on every request | CPU-heavy for long strings | Cache compiled patterns |
