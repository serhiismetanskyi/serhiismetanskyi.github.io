---
date: 2026-06-08
tags:
  - api
  - architecture
  - security
  - observability
  - reliability
---

# Cross-Cutting: Performance, Scalability and Reliability

## Performance

### Latency

- **Target SLOs**: p50 < 100ms, p95 < 500ms, p99 < 1000ms for most APIs.
  Adjust per use case. Internal services should be faster than public APIs.

- **Sources of latency**: network round-trip, serialization/deserialization,
  database queries, external service calls, garbage collection pauses.

- **Optimization strategies**:
  - Connection pooling: reuse database and HTTP connections instead of creating new ones
  - Query optimization: add indexes, analyze query plans, avoid N+1 queries
  - Response compression: gzip or brotli for responses larger than 1KB
  - Payload minimization: return only needed fields, use sparse fieldsets
  - Async processing: offload heavy work to background queues (Celery, SQS, Kafka)
  - Caching: cache at multiple levels (CDN, application, database query cache)

### Throughput

- **Measurement**: requests per second (RPS) the system handles
  at acceptable latency. Measure under realistic load, not just peak.

- **Bottlenecks**: CPU (computation, serialization), Memory (caching, buffers),
  I/O (database, network), Connection limits (pool exhaustion).

- **Load testing tools**: k6 (modern, scriptable), Locust (Python-based),
  wrk (raw HTTP benchmarking), Apache Benchmark (simple tests).
  Run load tests before every major release.

### Resource Usage

- **CPU**: serialization, TLS handshakes, compression, business logic.
  Monitor per-request CPU time. Profile hot paths.

- **Memory**: connection state, caches, request buffers.
  Watch for memory leaks in long-running services. Set memory limits.

- **Connections**: database connection pools, HTTP keep-alive connections.
  Set pool size limits. Monitor active vs idle connections.

---

## Scalability

### Horizontal Scaling

- **Stateless services**: easy to scale. Add more instances behind load balancer.
  Store session data externally (Redis, database).

- **Stateful services** (WebSocket, gRPC streaming): need sticky sessions
  or shared state store (Redis Pub/Sub for WebSocket fan-out).

- **Database scaling**:
  - Read replicas: route read queries to replicas, writes to primary
  - Sharding: partition data across multiple databases by key
  - Connection pooling: PgBouncer, ProxySQL to manage connection limits

- **Auto-scaling**: scale based on CPU utilization, memory usage,
  request count, or queue depth. Set minimum and maximum instance counts.

### Load Balancing

- **Algorithms**:
  - Round Robin: simple, even distribution across healthy instances
  - Least Connections: route to instance with fewest active requests
  - IP Hash: sticky sessions based on client IP
  - Weighted: assign different weights to servers with different capacity

- **Health checks**: load balancer calls /health endpoint periodically.
  Remove unhealthy instances from rotation. Restore when healthy again.

- **gRPC consideration**: HTTP/2 connections are long-lived and multiplexed.
  L4 (TCP) load balancing sends all requests on one connection to one server.
  Need L7 (application-layer) load balancing to distribute individual RPCs.

---

## Reliability

### Retry Strategies

- **Exponential backoff**: wait 1s, 2s, 4s, 8s between retries.
  Prevents thundering herd when many clients retry at the same time.

- **Jitter**: add random delay to backoff (e.g., 1s + random(0, 1s)).
  Prevents synchronized retries from many clients hitting at once.

- **Max retries**: set limit (3-5 retries). Don't retry forever.
  Log each retry for debugging.

- **Idempotency requirement**: only retry idempotent operations safely (GET, PUT, DELETE).
  For POST, use idempotency keys so server detects duplicate requests.

- **Retry-After header**: server tells client when to retry (seconds or date).
  Clients must respect this header. Common with 429 and 503 responses.

### Fault Tolerance

- **Circuit breaker**: if service fails N times, stop calling it for M seconds.
  After timeout, try one test request. If success, close circuit. If fail, keep open.
  States: CLOSED (normal) -> OPEN (failing) -> HALF-OPEN (testing).

- **Timeout**: set timeout on every external call. Default 5 seconds.
  Adjust per service based on expected response time. Never use infinite timeout.

- **Bulkhead**: isolate failures. One slow dependency shouldn't block all requests.
  Use separate thread pools or connection pools per external service.

- **Fallback**: if service is down, return cached data or default values.
  Degraded but functional. Better than full failure.

- **Health checks**: /health (liveness) and /ready (readiness) endpoints.
  Health = process is alive. Ready = can serve traffic (database connected, etc.).
  Kubernetes uses both to manage pod lifecycle.

### Graceful Degradation

- **Feature flags**: disable non-critical features under high load.
  Example: disable recommendations but keep core search working.

- **Load shedding**: reject low-priority requests when overloaded.
  Return 503 Service Unavailable with Retry-After header.

- **Priority queues**: process critical requests first.
  Payment processing before analytics events.

- **Graceful shutdown**: on SIGTERM, stop accepting new requests,
  finish in-flight requests (with timeout), then exit.
  Prevents dropped connections during deployments.
