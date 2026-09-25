---
date: 2026-07-25
tags:
  - test-automation
  - architecture
  - ci-cd
---

# Risks, Real-World Patterns & Decision Heuristics

## Framework Risks & Limitations

### High Maintenance Cost

A test automation framework is a product with ongoing maintenance.
Every application refactor has a framework cost. Budget for it.

| Risk | Description | Mitigation |
|------|-------------|-----------|
| API drift | App changes break framework clients | Typed clients + contract tests |
| Selector rot | UI redesign invalidates page objects | `data-testid` convention + component ownership |
| Test count explosion | 2000+ tests with no strategy | Layer limits (max 70% API, 20% integration, 10% E2E) |
| Slow suite | CI takes 30+ minutes | Parallel execution, layer separation, smoke runs |
| Tool lock-in | Playwright v3 breaks test suite | Wrapper pattern — swap drivers, not tests |

### Complexity Growth

Frameworks accumulate abstractions. Review and prune quarterly.

Signs of over-engineered framework:
- New engineers take > 1 day to write their first test
- Adding a new API endpoint requires changes in 5+ framework files
- Base classes more complex than the tests using them

---

## Real-World Application Patterns

### Microservices — API-First Testing

In microservices, integration tests across services are expensive and fragile.
Prefer contract testing at service boundaries.

```
Service A  ←→  Service B
              [Contract tests verify the interface, not the full integration]
```

Contract testing with Pact:
```python
from pact import Consumer, Provider

pact = Consumer("OrderService").has_pact_with(Provider("UserService"))

def test_get_user_contract():
    (pact
        .given("a user with ID user-123 exists")
        .upon_receiving("a request to get user details")
        .with_request("GET", "/users/user-123")
        .will_respond_with(200, body={"id": "user-123", "email": "test@example.com"}))

    with pact:
        user = UserServiceClient(pact.uri).get_user("user-123")
        assert user["email"] == "test@example.com"
```

### Frontend-Heavy Apps — Component + E2E Mix

```
Unit tests      → business logic (discounts, validation, formatters)
API tests       → backend service contracts
Component tests → isolated service/module behaviour (pytest with mocks)
E2E tests       → critical user journeys only (login → checkout)
```

Avoid: testing every UI state with E2E. Use component tests for UI logic.

### Realtime Systems — WebSocket Testing

Realtime flows are async and event-driven. Key patterns:
- Subscribe before triggering the event, not after
- Set explicit timeouts for all `receive()` calls
- Test connection lifecycle: connect, subscribe, disconnect, reconnect
- Mock the WS server for unit tests of client logic

---

## Engineering Heuristics (Senior Level)

### Prefer API Tests Over UI Tests

API tests are 10-50x faster, 5x more stable, and easier to maintain.
UI tests prove the full stack is wired. API tests prove it works correctly.

Ratio target: **70% API / 20% integration / 10% E2E**

### Keep Tests Independent

A test must pass whether run first, last, alone, or in parallel.
Any test that depends on order is a time bomb.

### Use Builders for Data

Hard-coded data in tests is a coupling point. Builders are a stability point.
One schema change fixes one builder. Not 40 test files.

### Centralise Assertions

Named assertion functions produce better failure messages than inline asserts.
`assert_user_created(response, email)` beats `assert response.json()["email"] == email`.

### Minimise Flakiness

Every flaky test costs: developer investigation, CI reruns, trust erosion.
Flakiness budget: < 1% of tests per run.

### Optimise for Maintainability

Fast tests that are impossible to maintain become slow tests that no one fixes.
Readability > raw execution speed in test code.

---

## Decision Factors

Choose the level of framework investment based on:

| Factor | Low investment | High investment |
|--------|---------------|----------------|
| System complexity | Single monolith | Microservices, multi-protocol |
| Team size | 1-3 engineers | 5+ engineers writing tests |
| Test coverage target | 60% | 90%+ |
| Release frequency | Monthly | Multiple per day |
| Customer impact of bugs | Low | Financial, safety-critical |
| Longevity | Prototype | Long-lived production system |

### Framework Maturity Stages

| Stage | Characteristics |
|-------|---------------|
| 0 — Scripts | Tests are scripts, no structure |
| 1 — Organised | Folders, conftest, basic fixtures |
| 2 — Abstracted | Page objects, API clients, builders |
| 3 — Layered | Full layer model, marks, CI integration |
| 4 — Productised | Custom plugin, metrics, onboarding guide, versioning |

Most projects need Stage 2 or 3. Stage 4 is justified for large-scale QA platforms.
