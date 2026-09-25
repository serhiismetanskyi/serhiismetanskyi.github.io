---
date: 2026-07-10
tags:
  - test-automation
  - design-patterns
---

# Test Architecture

## Test Layers

### UI Layer

Responsibilities:
- Browser or native app interactions
- User journey validation
- Accessibility and visual regression

Tools: Playwright, Selenium

Rules:
- Thin layer — delegate to Page Objects or Screenplay actors
- No business logic inside UI test steps
- Stable locators: `data-testid` or ARIA roles, never CSS class names

### API Layer

Responsibilities:
- HTTP / gRPC / WebSocket protocol validation
- Schema and contract verification
- Auth flows, error handling

Tools: `httpx`, `pytest`, `grpcio`, `playwright` (network interception)

Rules:
- Request construction separate from assertion
- Schema validation on every response
- Auth tokens managed by fixture, not hardcoded

### Service Layer

Responsibilities:
- Internal business logic through service interfaces
- Database state validation
- Message queue interactions

Tools: direct service class instantiation, in-memory fakes, `testcontainers`

Rules:
- No HTTP in service-layer tests
- Side effects verified through output state, not internal calls

---

## Test Structure

### Test Suites

A suite groups related scenarios sharing the same:
- Subject under test (e.g. `UserService`)
- Context (e.g. `unauthenticated requests`)
- Protocol (e.g. `WebSocket connection lifecycle`)

Naming: `<Subject>_<Context>_Tests`

### Test Modules

| Module type | Contents |
|---|---|
| Happy path | Core success scenarios |
| Error handling | 4xx / 5xx / domain errors |
| Edge cases | Boundary values, empty inputs |
| Security | Auth bypass, injection attempts |
| Performance | Latency SLO checks |

One module = one `.py` file, one class or set of related functions.

### Test Cases

| Property | Rule |
|---|---|
| Name | Describes scenario and expected result |
| Length | ≤ 30 lines (longer = extract helpers) |
| Assertions | One logical assertion group per test |
| Dependencies | Injected via fixture, never imported globally |

---

## Separation of Concerns

### Test Logic vs Test Data

| Concern | Location |
|---|---|
| What is being verified | Test function body |
| How inputs are built | Builder / Factory / Fixture |
| Where data comes from | Fixture file or factory method |

Never embed raw data structures inside test assertions. Always name and extract them.

### Assertions vs Setup

Bad pattern — mixed concerns:
```python
def test_create_user():
    db.execute("INSERT INTO users ...")   # setup mixed with test
    response = client.post("/users", json={...})
    db_row = db.execute("SELECT ...")     # teardown inside test
    assert response.status_code == 201
```

Good pattern:
```python
@pytest.fixture
def existing_user(db_session):
    user = UserFactory.create()
    yield user
    db_session.rollback()

def test_create_user(api_client, existing_user):
    response = api_client.post("/users", json=UserBuilder().email("a@b.com").build())
    assert response.status_code == 201
```

---

## Architecture Decision Table

| Need | Pattern |
|---|---|
| Reuse setup across suites | Fixture |
| Build complex test objects | Builder |
| Abstract UI interactions | Page Object / Screenplay |
| Validate HTTP contracts | Schema validator + API client wrapper |
| Isolate external services | Fake / Stub / Mock |
| Run in parallel safely | Scoped fixtures + isolated data |
