---
date: 2026-07-07
tags:
  - testing
  - test-design
---

# Decision Table Testing

## Concept

When system behaviour depends on multiple conditions with multiple outcomes, a decision table
maps every combination of condition values to the corresponding expected result.

```
Conditions          → Outcomes
C1 | C2 | C3  ...  → Action
```

Decision tables make hidden combinations visible. Every rule becomes a test case.

---

## Structure

| Element | Description |
|---------|-------------|
| Conditions | Inputs or flags that determine outcome |
| Actions | Expected outputs or behaviour |
| Rules | One column per unique combination |

---

## Example: Discount System

Two conditions: VIP customer, order amount > $1000.
Four rules, four distinct outcomes.

| Condition | Rule 1 | Rule 2 | Rule 3 | Rule 4 |
|-----------|--------|--------|--------|--------|
| is_vip | T | T | F | F |
| amount > 1000 | T | F | T | F |
| **Discount** | **20%** | **10%** | **5%** | **0%** |

```python
import pytest


def calculate_discount(is_vip: bool, amount: float) -> int:
    if is_vip and amount > 1000:
        return 20
    if is_vip:
        return 10
    if amount > 1000:
        return 5
    return 0


@pytest.mark.parametrize("is_vip, amount, expected_discount", [
    (True,  1500, 20),  # Rule 1: VIP + high amount
    (True,   500, 10),  # Rule 2: VIP + low amount
    (False, 1500,  5),  # Rule 3: not VIP + high amount
    (False,  500,  0),  # Rule 4: not VIP + low amount
])
def test_discount_decision_table(
    is_vip: bool,
    amount: float,
    expected_discount: int,
) -> None:
    assert calculate_discount(is_vip, amount) == expected_discount
```

The table makes it impossible to miss rule 3 — the non-VIP customer with a large order
who still deserves a 5% discount.

---

## Three-Condition Example

Three conditions → up to 8 rules. Not all combinations always produce different outcomes;
some can be merged.

```python
def check_content_access(
    logged_in: bool,
    verified: bool,
    has_subscription: bool,
) -> bool:
    return logged_in and verified and has_subscription


@pytest.mark.parametrize("logged_in, verified, has_subscription, can_access", [
    (True,  True,  True,  True),
    (True,  True,  False, False),
    (True,  False, True,  False),
    (True,  False, False, False),
    (False, True,  True,  False),
    (False, True,  False, False),
    (False, False, True,  False),
    (False, False, False, False),
])
def test_content_access(
    logged_in: bool,
    verified: bool,
    has_subscription: bool,
    can_access: bool,
) -> None:
    assert check_content_access(logged_in, verified, has_subscription) == can_access
```

When rules share the same outcome regardless of one condition, that condition is "don't care" (–)
and the rules can be merged to reduce test count.

---

## Reducing Rules

| Technique | When | Result |
|-----------|------|--------|
| Merge "don't care" | Condition doesn't affect outcome | Fewer rules |
| Group by outcome | Same result for multiple combos | Parameterised class |
| Split large table | > 4 conditions | Two smaller tables |

---

## When to Use Decision Tables

| Scenario | Use DT |
|----------|--------|
| Business rules with multiple flags | Yes |
| Pricing / discount logic | Yes |
| Access control (role + status + feature flag) | Yes |
| Simple if/else with one condition | No |
| Continuous numeric ranges | No — use EP + BVA |

---

## Risks

| Risk | Description | Mitigation |
|------|-------------|------------|
| Missing rules | Not all 2^n combinations covered | Count expected rules: 2^n conditions |
| Redundant rules | Same outcome, different combos | Merge using "don't care" |
| Spec ambiguity | Unclear what happens in edge combos | Clarify with PO/dev before writing table |
