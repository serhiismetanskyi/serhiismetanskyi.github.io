---
date: 2026-07-06
tags:
  - testing
  - test-design
---

# Equivalence Partitioning

## Concept

Split all possible inputs into groups (partitions) where each value in the group behaves the same way.
Test one representative value per partition instead of every possible value.

```
Input space → [invalid low] | [valid] | [invalid high]
                    ↑               ↑           ↑
               one test       one test     one test
```

---

## When to Apply

- Numeric ranges (age, price, quantity, score)
- String categories (email format, country code, role name)
- Enumerated inputs (status, type, permission level)
- Any input where the system reacts identically to a whole group of values

---

## Partitioning Rules

1. Every input value belongs to exactly one partition
2. Partitions must not overlap
3. Together, partitions must cover all possible inputs (valid + invalid)
4. One test per partition is sufficient — more is waste

---

## Example: Age Validation (18–65)

| Partition | Range | Representative | Expected |
|-----------|-------|---------------|----------|
| Invalid low | < 18 | 10 | `too_young` |
| Valid | 18–65 | 25 | `valid` |
| Invalid high | > 65 | 70 | `too_old` |

```python
import pytest


def validate_age(age: int) -> str:
    if age < 18:
        return "too_young"
    if age > 65:
        return "too_old"
    return "valid"


@pytest.mark.parametrize("age, expected", [
    (25, "valid"),      # valid partition: 18–65
    (10, "too_young"),  # invalid partition: < 18
    (70, "too_old"),    # invalid partition: > 65
])
def test_age_equivalence_partitioning(age: int, expected: str) -> None:
    assert validate_age(age) == expected
```

Three tests instead of hundreds. Each one represents an entire class of inputs.

---

## Multi-Dimensional Partitioning

When multiple inputs interact, partition each independently, then combine:

```python
def check_edit_permission(role: str, status: str) -> bool:
    return status == "active" and role in ("admin", "editor")


@pytest.mark.parametrize("role, status, can_edit", [
    ("admin", "active", True),
    ("editor", "active", True),
    ("viewer", "active", False),
    ("admin", "inactive", False),
    ("editor", "inactive", False),
    ("viewer", "inactive", False),
])
def test_edit_permission(role: str, status: str, can_edit: bool) -> None:
    assert check_edit_permission(role, status) == can_edit
```

---

## Risks

| Risk | Description | Mitigation |
|------|-------------|------------|
| Wrong partition boundaries | Wrong assumption about where groups split | Review spec carefully; use BVA alongside EP |
| Missing invalid partitions | Only testing valid inputs | Always define at least one invalid partition |
| Overlapping partitions | Value belongs to two groups | Redefine partition boundaries clearly |

---

## EP vs BVA

EP picks one representative from inside each partition.
BVA focuses on the edges between partitions.
Use both together — EP reduces test count, BVA catches off-by-one errors.
