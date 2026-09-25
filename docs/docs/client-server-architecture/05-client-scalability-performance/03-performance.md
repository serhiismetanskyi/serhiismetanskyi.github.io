---
date: 2026-06-12
tags:
  - architecture
  - networking
  - performance
---

# Performance

## 11.1 Latency

### Sources of latency

| Source                  | Typical cost      | Mitigation                                  |
| ----------------------- | ----------------- | ------------------------------------------- |
| Network round-trip      | 10–200 ms         | CDN, edge caching, region selection         |
| DNS resolution          | 50–100 ms         | DNS prefetch, keep-alive                    |
| TLS handshake           | 1–3 RTT           | TLS session resumption, HTTP/3              |
| Server processing       | Variable          | DB indexes, caching, async processing       |
| Serialization           | 1–10 ms           | Binary format (protobuf), sparse fieldsets  |

### Reducing latency

- Use CDN for static assets and cacheable API responses.
- Use edge caching to serve common requests without hitting the origin.
- Keep API responses small — sparse fieldsets, pagination.
- Use HTTP/2 or HTTP/3 to eliminate per-request connection overhead.

---

## 11.2 Throughput

Requests per second the system can handle at acceptable latency.

### Load balancing

Distribute load across instances. Each instance processes its share.
Throughput scales linearly with instances if the service is stateless.

### Batching

Process multiple items in one operation:

- DB batch inserts instead of one-by-one rows.
- Kafka consumer batch: process 100 messages per tick.
- Reduces per-item overhead significantly at high volume.

```python
# One batch insert — not 1000 individual INSERTs
await db.execute_many(
    "INSERT INTO events (type, payload) VALUES ($1, $2)",
    [(e.type, e.payload) for e in batch],
)
```

---

## 11.3 Payload Optimization

Large payloads cost bandwidth and processing time on both sides.

### Compression

Enable gzip or brotli on your server or reverse proxy.

- gzip: 60–80% size reduction for JSON.
- brotli: slightly better compression than gzip, supported by all modern
  browsers.
- `Content-Encoding: gzip` header tells the client to decompress.
- **Threshold:** compress responses larger than 1 KB. Compression on small
  payloads wastes CPU.

```nginx
# Nginx — enable gzip for JSON responses
gzip on;
gzip_types application/json text/plain;
gzip_min_length 1024;
```

### Binary format (gRPC / protobuf)

Protobuf payloads are 3–10× smaller than equivalent JSON.

- No field names in binary payload — field numbers are used instead.
- Faster serialization due to schema-driven encoding.
- Use for high-volume internal service calls.

### Sparse fieldsets

Client requests only the fields it needs:

- REST: `?fields=id,name,email`
- GraphQL: client specifies exact fields in the query

Reduces payload size and server-side serialization work.

---

## 11.4 Performance Targets

| Metric      | Target    | Action when exceeded              |
| ----------- | --------- | --------------------------------- |
| p50 latency | < 50 ms   | Optimize hot paths                |
| p95 latency | < 300 ms  | Add caching, optimize DB queries  |
| p99 latency | < 1000 ms | Check tail-latency outliers       |
| Error rate  | < 0.1%    | Reliability review                |
| Throughput  | Per SLO   | Scale horizontally                |

Always measure p95 and p99, not only average. Average hides outliers that
users actually experience.

---

## Key Rules

1. Measure first. Do not optimize without profiling data.
2. Enable compression at the reverse proxy level — not in application code.
3. Set SLO targets for p95 and p99, not just average latency.
4. Use binary serialization (protobuf) for internal high-volume calls.
5. Apply sparse fieldsets on any endpoint that returns large objects.
