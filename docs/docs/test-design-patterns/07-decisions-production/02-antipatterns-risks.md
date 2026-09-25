---
date: 2026-07-15
tags:
  - test-automation
  - design-patterns
---

# Test Anti-Patterns and Risks

## Test Anti-Patterns

### 1. Flaky Tests

**Description:** Tests that pass or fail non-deterministically.

**Causes:** `time.sleep()`, shared state, async timing, external service dependency.

**Symptoms:**
- Tests pass locally, fail in CI
- Tests fail on re-run without code change
- Tests pass in isolation, fail in suite

**Fix:**
- Replace `sleep` with `wait_until` polling
- Isolate state with function-scoped fixtures
- Mock unstable external dependencies

---

### 2. Hardcoded Data

**Description:** Literal IDs, emails, or values embedded in test bodies.

```python
# Bad
def test_get_user():
    response = client.get("/users/42")  # hardcoded ID
    assert response.json()["email"] == "john@example.com"  # hardcoded value
```

**Fix:**
```python
def test_get_user(created_user, api_client):
    response = api_client.get(f"/users/{created_user['id']}")
    assert response.json()["email"] == created_user["email"]
```

---

### 3. Over-Mocking

**Description:** Every dependency mocked, including ones that should be real.

**Symptom:** Tests pass, but the real system is broken because wiring was never tested.

**Fix:**
- Mock at the boundary (HTTP, DB), not inside business logic
- Complement with integration tests that use real dependencies
- Use contract tests to verify mocks stay in sync with real APIs

---

### 4. UI-Heavy Tests

**Description:** Business logic and data validation tested through the browser instead of the API.

| Symptom | Impact |
|---|---|
| 80 %+ tests are E2E | Slow feedback (minutes per run) |
| DB state asserted via UI | Fragile, breaks on visual changes |
| All tests launch a browser | High resource consumption |

**Fix:** Move business logic tests to API layer. Use E2E only for critical user journeys.

---

### 5. Tight Coupling to Implementation

**Description:** Tests assert on internal method calls, object attributes, or SQL queries.

```python
# Bad — testing internals
def test_user_service_calls_repo():
    mock_repo = MagicMock()
    service = UserService(repo=mock_repo)
    service.create_user(email="a@b.com")
    mock_repo._session.add.assert_called_once()  # internal detail
```

**Fix:** Test behaviour through the public interface. Assert on the output, not the mechanism.

---

### 6. Test Duplication (God Test)

**Description:** One test function asserts on 15 different things.

**Fix:** Split into focused tests. One logical scenario per test.

---

## Risks and Limitations

### Maintenance Cost

| Risk | Description | Mitigation |
|---|---|---|
| Tests break on every refactor | Coupled to implementation | Test through public interfaces |
| Fixture explosion | 50+ fixtures across project | Group by domain, document each |
| Builder drift | Builder returns stale schema | Review builders on schema migration PRs |

### Slow Execution

| Risk | Description | Mitigation |
|---|---|---|
| Full suite takes 30+ min | Too many E2E / integration tests | Pyramid balance, parallel execution |
| DB setup overhead | Migration runs per test | Session-scoped DB, transaction rollback |
| Playwright slow | Browser tests block CI | Headless, parallel workers, skip in unit stage |

### False Positives / Negatives

| Type | Example | Mitigation |
|---|---|---|
| False positive | Test passes due to over-mocking | Contract + integration tests |
| False negative | Test fails due to environment issue | Retry + quarantine + stable env |

### Environment Dependency

| Risk | Mitigation |
|---|---|
| Test relies on staging data | Use isolated test accounts |
| Test uses production keys | Always use test-only credentials |
| Test fails on timezone difference | Use UTC everywhere; freeze time in tests |

---

## Risk Register Summary

| Risk | Severity | Probability | Mitigation |
|---|---|---|---|
| Flaky tests block CI | High | High | Wait strategies, isolation, quarantine |
| Mocks drift from real API | High | Medium | Contract tests, Pact Broker |
| E2E suite too slow | Medium | High | Pyramid balance, parallel execution |
| Tests tied to UI selectors | Medium | High | `data-testid` attributes |
| Missing test coverage | High | Medium | Coverage gate in CI (100 %) |
