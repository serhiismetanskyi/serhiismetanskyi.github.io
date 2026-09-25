---
date: 2026-07-09
tags:
  - test-automation
  - design-patterns
---

# Test Types and Levels

## Test Types

### Unit Tests

| Property | Value |
|---|---|
| Scope | Single function / class / module |
| Speed | Sub-millisecond |
| Dependencies | All replaced with mocks/stubs |
| Feedback | Immediate; drives TDD |

Key rules:
- One logical assertion per test
- No I/O, no network, no database
- Test behaviour, not internal state

### Integration Tests

| Property | Value |
|---|---|
| Scope | Two or more components interacting |
| Speed | Milliseconds to seconds |
| Dependencies | Real or containerised (DB, cache, queue) |
| Feedback | Reveals wiring and contract issues |

Key rules:
- Isolate external third-party APIs with stubs
- Use transactions or truncation for DB teardown
- One integration concern per test suite

### API Tests (REST / GraphQL / gRPC / WebSocket)

| Protocol | Focus |
|---|---|
| REST | Status codes, schema (OpenAPI/JSON Schema), headers, pagination |
| GraphQL | Query shape, resolver errors, schema introspection |
| gRPC | Protobuf contract, status codes, streaming frames |
| WebSocket | Handshake, message ordering, reconnect behaviour |

Common patterns: request builder + response validator + schema assertion.

### End-to-End (E2E) Tests

| Property | Value |
|---|---|
| Scope | Full user journey through deployed stack |
| Speed | Seconds to minutes |
| Dependencies | Real environment |
| Feedback | Confirms business flows work |

Risks: flaky selectors, timing issues, environment coupling.
Mitigation: stable locators, explicit waits, retry logic.

### Contract Tests

| Side | Responsibility |
|---|---|
| Consumer | Defines expected API shape |
| Provider | Verifies it can satisfy the consumer contract |

Tools: Pact (HTTP), Pact Broker, gRPC reflection + schema registry.

Consumer-driven contract tests prevent breaking changes across service boundaries.

---

## Test Levels

### Component Level

- Single deployable unit in isolation
- Mocked collaborators
- Focus: internal logic correctness

### Service Level

- Service communicates with real dependencies (DB, cache)
- No UI involvement
- Focus: service contract and data correctness

### System Level

- All services deployed together
- Browser or API client drives flows
- Focus: end-to-end business requirements

---

## Level Mapping to Test Types

| Level | Primary Types | Secondary Types |
|---|---|---|
| Component | Unit | — |
| Service | Integration, API | Contract |
| System | E2E | Performance, Security |

---

## Decision Guide

| Need | Recommended Type |
|---|---|
| Fast feedback in TDD cycle | Unit |
| Verify DB schema and queries | Integration |
| Validate API contracts | API + Contract |
| Smoke test deployed service | E2E (critical paths only) |
| Prevent breaking consumers | Contract |
