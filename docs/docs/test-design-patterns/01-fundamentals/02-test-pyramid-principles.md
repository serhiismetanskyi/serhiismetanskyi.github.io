---
date: 2026-07-10
tags:
  - test-automation
  - design-patterns
---

# Test Pyramid, Trophy and Core Principles

## Test Pyramid

```
        ▲
       /E2E\       ← few, slow, expensive
      /------\
     /  API   \    ← moderate, medium speed
    /----------\
   /   Unit     \  ← many, fast, cheap
  /______________\
```

| Layer | Count | Speed | Confidence |
|---|---|---|---|
| Unit | 70–80 % | < 1 ms | Logic correctness |
| API / Integration | 15–20 % | ms–s | Wiring correctness |
| E2E | 5–10 % | s–min | Business flow |

### Trade-offs: Speed vs Coverage

| Approach | Speed | Coverage |
|---|---|---|
| All unit | Very fast | Low integration coverage |
| All E2E | Very slow | High but brittle |
| Pyramid | Balanced | Comprehensive |

---

## Test Trophy (Kent C. Dodds)

```
      [E2E]
   [Integration]   ← largest slice
  [Unit] [Static]
```

Trophy prioritises integration tests over unit tests. Useful when:
- Business logic lives in orchestration rather than pure functions
- UI + API interaction is the product's core value

---

## Core Test Design Principles

### DRY — Don't Repeat Yourself

| Problem | Solution |
|---|---|
| Duplicated setup blocks | Shared fixtures and helpers |
| Repeated request builders | Reusable factory functions |
| Copy-pasted assertions | Custom assertion helpers |

Rule: if test setup appears more than twice, extract it.

### KISS — Keep It Simple, Stupid

- Test one behaviour per test case
- Avoid conditional logic inside tests
- Prefer explicit over clever

Bad: `if condition: assert A else: assert B`
Good: two separate test cases with clear names.

### Isolation

| Rule | Reason |
|---|---|
| Tests must not share state | Order-dependent failures |
| Each test owns its data | Parallel execution safety |
| External side-effects cleaned up | No pollution between runs |

Isolation strategies: per-test DB transaction rollback, in-memory fakes, test-scoped DI containers.

### Determinism

- Same input → same output on every run
- No `time.now()` calls inside test logic (inject clock)
- No random seeds without explicit fixture
- No `sleep()` — use event-driven waits or polling with timeout

### Readability

Structure every test with **Arrange / Act / Assert** (AAA):

```
# Arrange
user = build_user(role="admin")
client = AuthenticatedClient(user)

# Act
response = client.get("/api/resource/1")

# Assert
assert response.status_code == 200
assert response.json()["id"] == 1
```

Test names: `test_<subject>_<scenario>_<expected_outcome>`

### Maintainability

| Risk | Mitigation |
|---|---|
| Tests break on every refactor | Test behaviour, not implementation |
| Fragile locators in UI tests | Stable `data-testid` attributes |
| Tests tightly coupled to schema | Schema-validated responses, not field-by-field |
| Long setup blocks | Extract to fixture factories |
