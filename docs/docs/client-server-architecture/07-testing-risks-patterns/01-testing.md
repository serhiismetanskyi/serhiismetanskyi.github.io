---
date: 2026-06-14
tags:
  - architecture
  - networking
  - testing
---

# Testing

## 15.1 API Testing

Test every protocol at the HTTP/contract level. Each protocol has specific tools and scenarios.

### REST and GraphQL

Use **Playwright `APIRequestContext`** for HTTP-level tests. It runs without a browser and is fast.

Validate response shape with **Pydantic models** — not just status codes.

```python
response = await request.get("/api/v1/products/42")
product = ProductSchema.model_validate(response.json())
assert product.id == 42
```

Required test scenarios:

| Scenario | Expected status |
|---|---|
| Valid request | 200 |
| Missing required field | 400 or 422 |
| No auth token | 401 |
| Valid token, wrong role | 403 |
| Resource does not exist | 404 |
| Too many requests | 429 |

Test all six scenarios for every critical endpoint.

### gRPC

Use the `grpcio` client with `pytest`. Generate stubs from `.proto` files.

```python
stub = ProductServiceStub(channel)
response = stub.GetProduct(GetProductRequest(id=42))
product = ProductModel.model_validate(MessageToDict(response))
assert product.id == 42
```

Required test scenarios:

- **Unary call** — single request, single response.
- **Server streaming** — receive multiple messages, validate each.
- **Error status codes** — `NOT_FOUND`, `INVALID_ARGUMENT`, `PERMISSION_DENIED`.
- **Deadline exceeded** — set a short deadline, verify the client handles it.

### WebSocket

Two tools cover both contexts:

- **Playwright `page.on("websocket", ...)`** — for browser-initiated connections; captures frames.
- **`websockets` Python library** — for server-to-server or pure backend tests.

```python
async with websockets.connect("ws://localhost:8000/ws") as ws:
    await ws.send(json.dumps({"type": "subscribe", "channel": "prices"}))
    msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=2.0))
    assert msg["type"] == "price_update"
```

Required test scenarios:

- **Connect/disconnect** — verify clean state on both sides.
- **Message validation** — reject messages with invalid schema.
- **Reconnect logic** — server drops connection; client reconnects.
- **ACK flow** — server sends ACK for every received message.

---

## 15.2 Integration Testing

Test the full request path through multiple services. Do not mock the database or downstream services — use real ones.

**Setup:**

- Spin up dependent services with **Docker Compose**.
- Use **testcontainers-python** for databases — each test run gets a clean DB.
- Seed data in fixtures, clean up after each test.

**What to test:**

- The full path: `client → API gateway → service → DB`.
- Side effects: data stored, events emitted, downstream services called.

**Common integration scenarios:**

```
User registers → profile record created → welcome email queued
Order placed   → inventory decremented → order confirmation event published
Auth token revoked → next request with that token returns 401
```

**Key rule:** an integration test that passes with mocks but fails with the real service is worthless. Run against real dependencies.

---

## 15.3 Load Testing

Test system behavior under high concurrency and sustained traffic. Run before every major release.

**Tools:**

| Tool | Best for |
|---|---|
| k6 | Scriptable JS, CI-friendly, rich metrics |
| Locust | Python, flexible scenario scripting |
| wrk | Raw HTTP throughput benchmarking |

**Required scenarios:**

- **Ramp-up test** — gradually increase virtual users until error rate rises or latency spikes. Find the breaking point.
- **Soak test** — constant moderate load for 30–60 minutes. Detect memory leaks, connection pool exhaustion, slow DB query accumulation.
- **Spike test** — sudden burst to 10× normal load. Verify autoscaling activates and error rate stays within SLO.

**What to measure:**

- `p50 / p95 / p99` latency at each load level — p99 shows the worst real-user experience.
- Error rate — target < 0.1% under normal load.
- Throughput (RPS) — find max sustainable RPS.
- Resource usage — CPU, memory, DB connection pool saturation.

Store results per release. Compare with previous baseline to detect regressions.

---

## 15.4 Chaos Testing

Inject failures into a running system to verify resilience. The goal is to find weaknesses before production incidents do.

**Scenarios to test:**

| Failure | Expected behavior |
|---|---|
| Kill one service instance | Traffic routes to healthy instances |
| Add 200 ms latency to DB | Circuit breaker activates, fallback served |
| Return 500 from external service | Retry + error handling works |
| Drop network packets between services | Timeout triggers, not a hang |

**Tools:**

- **Chaos Monkey** — random instance termination (AWS).
- **Gremlin** — SaaS platform, fine-grained failure injection.
- **Chaos Toolkit** — open-source, scriptable experiments.
- **Litmus** — Kubernetes-native chaos experiments.

**Validate after each experiment:**

- Error rate stays below SLO during the failure.
- Circuit breaker opens at the correct threshold.
- Graceful degradation returns correct fallback data.
- Metrics and alerts fire as expected.

**Where to run:**

- Staging: run full destructive experiments freely.
- Production: run controlled, small-blast-radius experiments during low-traffic windows. Always have a rollback plan.
