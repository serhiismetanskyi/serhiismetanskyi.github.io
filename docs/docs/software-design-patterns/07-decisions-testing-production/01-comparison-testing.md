---
date: 2026-06-21
tags:
  - design-patterns
  - architecture
  - testing
---

# Pattern Comparison and Testing Strategies

Simple English (B1). Comparisons help you pick a pattern. Testing proves the boundaries behave as designed.

## Pattern Comparison

### Strategy vs State

| Aspect | Strategy | State |
|--------|------------|-------|
| What changes | The algorithm used | Behavior by lifecycle phase |
| Who picks | Caller passes a strategy | Object moves itself by rules |
| Example | Payment provider plug-in | Order: Pending → Paid → Shipped |

### Factory vs Builder

| Aspect | Factory | Builder |
|--------|---------|---------|
| Job | Create one product type | Build one complex object step by step |
| When | Runtime type from config | Many optional parts, fluent setup |

### Decorator vs Inheritance

| Aspect | Decorator | Inheritance |
|--------|-----------|-------------|
| Binding | Runtime, stackable | Compile-time class tree |
| When | Add behavior around existing object | Clear IS-A and Liskov rules |

### Adapter vs Facade

| Aspect | Adapter | Facade |
|--------|---------|--------|
| Goal | Match a foreign interface | Hide a complex subsystem |
| When | Legacy or third-party API | One entry for many calls |

### Observer vs Pub/Sub

| Aspect | Observer | Pub/Sub |
|--------|------------|---------|
| Links | Subject knows observers | Producers and consumers know only the bus |
| Scope | Usually one process | Often many processes or services |

---

## Testing Strategies for Patterns

### Unit Tests

Test one unit. Replace dependencies with fakes or mocks. The pattern boundary is often a mock boundary.

```python
from unittest.mock import MagicMock

def test_order_service_calls_repository() -> None:
    repo = MagicMock()
    svc = OrderService(repo=repo)
    svc.place_order("ORD-1", 99.0)
    repo.save.assert_called_once()
```

**Rule:** mock the port (interface), not random internals.

### Integration Tests

Use real collaborators for the slice you care about. No mocks across that slice.

```python
def test_place_order_persists(real_db_session) -> None:
    repo = SQLAlchemyOrderRepository(real_db_session)
    svc = OrderService(repo=repo)
    svc.place_order("ORD-1", 99.0)
    assert repo.find_by_id("ORD-1") is not None
```

### Contract Tests

Consumer and producer agree on the API shape. Tools like Pact record expectations and verify in CI.

### Property-Based Tests

Many random inputs; check invariants (e.g. amount always positive).

```python
from hypothesis import given
from hypothesis import strategies as st

@given(amount=st.floats(min_value=0.01, max_value=1_000_000, allow_nan=False))
def test_order_amount_valid(amount: float) -> None:
    order = Order(id="x", amount=amount)
    assert order.is_valid() is True
```

### Mutation Testing

Tools change your code (`==` to `!=`, delete lines). If tests still pass, coverage is weak. Use scores as a guide, not a religion.

---

## Decision Hints (Not Rules)

- Many algorithms, one interface → Strategy.
- Unknown object type at runtime (config/input) → Factory.
- Object phases with different rules → State.
- One complex build with options → Builder.
- Add optional cross-cutting behavior at runtime → Decorator.
- One producer, many in-process listeners → Observer.
- Request passes ordered handlers (auth, limit, validation) → Chain.
- Unknown external API → Adapter.
- Many internal calls, one call for clients → Facade.

Pair each pattern with the right test level: unit for pure logic, integration for real I/O, contracts for API stability.
