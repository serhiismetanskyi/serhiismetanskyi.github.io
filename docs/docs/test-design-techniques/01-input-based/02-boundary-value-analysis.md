---
date: 2026-07-07
tags:
  - testing
  - test-design
---

# Boundary Value Analysis

## Concept

Most bugs live on the edges of valid ranges. BVA focuses specifically on the minimum, maximum,
and values immediately adjacent to each boundary.

```
Partition edge:   min-1 | min | min+1 ... max-1 | max | max+1
                    ↑      ↑      ↑         ↑      ↑      ↑
                 invalid valid  valid     valid  valid  invalid
```

---

## Standard Boundary Points

For a valid range [min, max], always test:

| Point | Value | Reason |
|-------|-------|--------|
| min − 1 | just below lower bound | should be rejected |
| min | lower bound itself | should be accepted |
| min + 1 | just above lower bound | should be accepted |
| max − 1 | just below upper bound | should be accepted |
| max | upper bound itself | should be accepted |
| max + 1 | just above upper bound | should be rejected |

---

## Why Boundaries Break

Developers write:

```python
if age > 18:   # wrong — excludes 18
if age >= 18:  # correct
```

Off-by-one errors in conditions are among the most common bugs.
BVA is the fastest way to expose them.

---

## Example: Age Validation (18–65)

```python
import pytest


def validate_age(age: int) -> str:
    if age < 18:
        return "too_young"
    if age > 65:
        return "too_old"
    return "valid"


@pytest.mark.parametrize("age, expected", [
    (17, "too_young"),  # min - 1
    (18, "valid"),      # min (boundary)
    (19, "valid"),      # min + 1
    (64, "valid"),      # max - 1
    (65, "valid"),      # max (boundary)
    (66, "too_old"),    # max + 1
])
def test_age_boundary_values(age: int, expected: str) -> None:
    assert validate_age(age) == expected
```

Six targeted tests. They catch what 50 random tests in the middle of the range never will.

---

## String Length Boundaries

```python
def validate_username(name: str) -> bool:
    return 3 <= len(name) <= 20


@pytest.mark.parametrize("name, valid", [
    ("ab", False),                # 2 chars — min - 1
    ("abc", True),                # 3 chars — min
    ("abcd", True),               # 4 chars — min + 1
    ("a" * 19, True),             # 19 chars — max - 1
    ("a" * 20, True),             # 20 chars — max
    ("a" * 21, False),            # 21 chars — max + 1
])
def test_username_length_boundaries(name: str, valid: bool) -> None:
    assert validate_username(name) == valid
```

---

## BVA for Collections

When a system has a limit on items (e.g., max 5 items in a cart):

| Boundary | Test |
|----------|------|
| 0 items | empty state |
| 1 item | minimum meaningful |
| 4 items | max − 1 |
| 5 items | max (limit itself) |
| 6 items | should be rejected |

---

## Risks

| Risk | Description | Mitigation |
|------|-------------|------------|
| Skipping min+1 / max-1 | Only testing exact boundary | Always include adjacent values |
| Floating-point precision | 0.1 + 0.2 ≠ 0.3 in Python | Use `decimal.Decimal` or epsilon comparison |
| Inclusive vs exclusive | Ambiguous spec ("up to 65" vs "under 65") | Clarify spec before writing tests |

---

## BVA + EP Together

EP reduces test count by grouping similar inputs.
BVA ensures boundaries between those groups are tested precisely.
Always use them as a pair — EP without BVA leaves the most dangerous values untested.
