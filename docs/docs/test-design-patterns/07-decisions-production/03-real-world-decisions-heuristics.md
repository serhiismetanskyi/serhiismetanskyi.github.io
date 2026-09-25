---
date: 2026-07-15
tags:
  - test-automation
  - design-patterns
---

# Real-World Test Architectures, Decision Factors, and Heuristics

## Real-World Architectures

### Microservices

| Challenge | Strategy |
|---|---|
| Many services, many contracts | Consumer-driven contract tests (Pact) |
| Service A calls Service B | Stub Service B in A's integration tests |
| Shared event schema | Schema registry + event contract tests |
| Full flow requires 5 services | One E2E per critical path; unit everywhere else |

Contract testing workflow:
```
Consumer test → generates Pact file
                      ↓
          Pact Broker publishes contract
                      ↓
      Provider verification runs in CI
                      ↓
       Deployment gate: can-i-deploy check
```

### Frontend Applications

| Layer | Pattern | When |
|---|---|---|
| Component | Unit test with DOM renderer | Logic in component |
| Integration | API mock + component rendering | Data flow |
| E2E | Playwright user journey | Critical paths |
| Visual | Screenshot diff | UI regressions |

Rules:
- No business logic in UI components — test it at the service layer
- Use `data-testid` for all interactable elements
- API responses mocked with `msw` (Mock Service Worker)

### Realtime Systems (WebSocket)

| Concern | Test approach |
|---|---|
| Message ordering | Assert sequence IDs monotonically increase |
| Reconnect and replay | Close connection, reconnect with `last_seq`, verify replay |
| Fan-out latency | Measure time from publish to all subscribers receiving |
| Concurrent connections | Spin up N connections, assert all receive the same event |

---

## Decision Factors

### Test Speed

| Need | Choice |
|---|---|
| TDD cycle < 1 s | Unit tests only |
| PR gate < 5 min | Unit + API with mocks |
| Pre-release validation | Full suite including E2E |

### Coverage

| Layer | Target |
|---|---|
| Unit | 100 % of business logic |
| API | 100 % of endpoints (happy + error paths) |
| E2E | 100 % of critical user journeys |
| Contract | 100 % of public API consumers |

### Maintainability

| Factor | Trade-off |
|---|---|
| More unit tests | Fast, but don't test wiring |
| More integration | Slower, but catch real bugs |
| More E2E | Confidence, but slow + fragile |
| Contract tests | Medium speed, prevents consumer breakage |

### System Complexity

| Complexity | Test strategy |
|---|---|
| Monolith | Pyramid: unit → integration → E2E |
| Microservices | Contract tests + isolated service tests |
| Event-driven | Event contract tests + saga integration tests |
| Realtime | Connection lifecycle + message ordering + reconnect |

---

## Engineering Heuristics (Senior+)

### Prefer API tests over UI tests

The API is stable; the UI changes constantly.
Test business logic at the API layer. Reserve Playwright for user journeys only.

### Keep tests deterministic

Any test that can fail without a code change is a liability.
Use frozen time, mocked randomness, and unique per-test data.

### Avoid duplication

If the same assertion appears in 5 tests, extract it to a helper.
If the same setup appears in 3 tests, extract it to a fixture.

### Test behaviour, not implementation

Ask: "If I refactor the internals, should this test still pass?"
If yes — it tests behaviour. If no — it tests implementation. Fix it.

### Minimise flakiness

Every flaky test is a trust erosion.
Track, quarantine, and fix flaky tests within one sprint of discovery.

---

## Pattern Selection Guide

| Scenario | Pattern |
|---|---|
| UI test reuse | Page Object Model |
| Multi-actor UI flows | Screenplay |
| Complex test data | Builder |
| Shared setup + teardown | Fixture |
| API call abstraction | Wrapper + Fluent Request |
| Verify side effects | Mock |
| Isolate data source | Stub / Fake |
| Parameterised scenarios | Data-Driven + parametrize |
| CRUD flow reuse | Test Template |
| Readable assertion chains | Custom Assertion helpers |
