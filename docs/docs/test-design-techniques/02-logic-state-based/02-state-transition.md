---
date: 2026-07-08
tags:
  - testing
  - test-design
---

# State Transition Testing

## Concept

State transition testing verifies that a system moves correctly between states.
It tests both valid transitions (allowed paths) and invalid transitions (should be rejected).

```
State A --[event]--> State B
State A --[invalid event]--> stays in State A (rejected)
```

---

## Key Elements

| Element | Description |
|---------|-------------|
| State | A condition the system can be in |
| Event / Trigger | An action or input that causes a transition |
| Transition | A move from one state to another |
| Guard | A condition that must be true for the transition |
| Action | What happens during a transition |

---

## State Transition Diagram: Order Lifecycle

```
pending → confirmed → shipped → delivered
    ↓           ↓
cancelled   cancelled
```

Valid transitions:
- `pending` → `confirmed`, `cancelled`
- `confirmed` → `shipped`, `cancelled`
- `shipped` → `delivered`
- `delivered` → (none)
- `cancelled` → (none)

---

## Implementation + Tests

```python
class Order:
    TRANSITIONS: dict[str, list[str]] = {
        "pending":   ["confirmed", "cancelled"],
        "confirmed": ["shipped",   "cancelled"],
        "shipped":   ["delivered"],
        "delivered": [],
        "cancelled": [],
    }

    def __init__(self) -> None:
        self.state = "pending"

    def transition(self, new_state: str) -> bool:
        if new_state in self.TRANSITIONS[self.state]:
            self.state = new_state
            return True
        return False


class TestOrderStateTransition:
    def test_valid_full_flow(self) -> None:
        order = Order()
        assert order.transition("confirmed")
        assert order.transition("shipped")
        assert order.transition("delivered")
        assert order.state == "delivered"

    def test_cannot_ship_pending_order(self) -> None:
        order = Order()
        assert not order.transition("shipped")
        assert order.state == "pending"

    def test_cannot_reverse_delivered(self) -> None:
        order = Order()
        order.transition("confirmed")
        order.transition("shipped")
        order.transition("delivered")
        assert not order.transition("pending")

    def test_cancel_from_pending(self) -> None:
        order = Order()
        assert order.transition("cancelled")
        assert order.state == "cancelled"

    def test_cancel_from_confirmed(self) -> None:
        order = Order()
        order.transition("confirmed")
        assert order.transition("cancelled")
        assert order.state == "cancelled"

    def test_cannot_cancel_after_shipped(self) -> None:
        order = Order()
        order.transition("confirmed")
        order.transition("shipped")
        assert not order.transition("cancelled")
```

---

## Coverage Levels

| Level | What to Cover | Effort |
|-------|--------------|--------|
| 0-switch | All states visited | Low |
| 1-switch | All valid transitions | Medium |
| 2-switch | All pairs of transitions | High |
| Invalid | All invalid transitions | Must have |

For most production systems, **1-switch + all invalid transitions** gives strong coverage.

---

## State Transition Table

| Current State | Target State | Result | Valid |
|---------------|-------------|--------|-------|
| pending | confirmed | confirmed | Yes |
| pending | shipped | pending | No |
| pending | cancelled | cancelled | Yes |
| confirmed | shipped | shipped | Yes |
| confirmed | cancelled | cancelled | Yes |
| confirmed | delivered | confirmed | No |
| shipped | delivered | delivered | Yes |
| shipped | cancelled | shipped | No |
| delivered | any | delivered | No |
| cancelled | any | cancelled | No |

---

## When to Use

| Scenario | Use STT |
|----------|---------|
| Order / booking / workflow status | Yes |
| Authentication flow (login → verified → active) | Yes |
| Game states / UI wizard steps | Yes |
| Simple CRUD without status field | No |
| Stateless API endpoints | No |

---

## Risks

| Risk | Description | Mitigation |
|------|-------------|------------|
| Missing invalid transitions | Only testing happy paths | Build full state transition table |
| Shared order instance | Tests pollute each other | Fresh instance per test |
| Undocumented states | States exist in code but not in spec | Map state machine from code, not just docs |
