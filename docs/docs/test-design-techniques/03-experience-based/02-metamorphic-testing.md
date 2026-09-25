---
date: 2026-07-08
tags:
  - testing
  - test-design
---

# Metamorphic Testing

## Concept

Metamorphic testing is used when there is no easy way to determine the exact expected output,
but you know the **relationship** between different inputs and their outputs.

Instead of checking one answer, you check that outputs are **consistent** when inputs change
in a predictable way.

```
Input A → Output A
Input B → Output B

If A and B are related, then A_output and B_output must satisfy a known relation (metamorphic relation).
```

---

## When to Use

| Scenario | Why Exact Output Is Unknown |
|----------|-----------------------------|
| Search / ranking | Too many valid orderings |
| Machine learning models | Ground truth is expensive |
| Numerical computations | Floating-point results vary |
| Sorting with complex keys | Output depends on tie-breaking |
| Recommendation engines | Personalized, non-deterministic |

ISTQB Advanced Level (2025) includes metamorphic testing as a formal technique.

---

## Metamorphic Relations

A metamorphic relation (MR) is a property that must hold between related inputs and outputs.

| MR | Description |
|----|-------------|
| Subset | Narrower query → result is a subset of broader query |
| Monotonicity | More specific input → fewer or equal results |
| Consistency | Same query in different case → same result |
| Permutation | Reordering catalog → same items returned |
| Addition | Adding unrelated data → original results unaffected |

---

## Example: Product Search

```python
def search_products(query: str, catalog: list[str]) -> list[str]:
    return [p for p in catalog if query.lower() in p.lower()]


CATALOG = ["Python Book", "FastAPI Guide", "Python Course", "Go Manual"]


class TestMetamorphicSearch:
    def test_narrower_query_returns_subset(self) -> None:
        broad = search_products("Python", CATALOG)
        narrow = search_products("Python Book", CATALOG)
        assert all(item in broad for item in narrow)
        assert len(narrow) <= len(broad)

    def test_case_insensitivity(self) -> None:
        lower = search_products("python", CATALOG)
        upper = search_products("PYTHON", CATALOG)
        assert lower == upper

    def test_larger_catalog_keeps_old_results(self) -> None:
        original = search_products("Python", CATALOG)
        extended = [*CATALOG, "Rust Handbook"]
        new_results = search_products("Python", extended)
        assert all(item in new_results for item in original)

    def test_empty_query_returns_all(self) -> None:
        result = search_products("", CATALOG)
        assert result == CATALOG
```

---

## Sorting Example

```python
def sort_by_price(items: list[dict]) -> list[dict]:
    return sorted(items, key=lambda x: x["price"])


def test_sort_order_preserved_after_adding_item() -> None:
    items = [{"name": "A", "price": 30}, {"name": "B", "price": 10}]
    sorted_original = sort_by_price(items)
    items_with_middle = [*items, {"name": "C", "price": 20}]
    sorted_extended = sort_by_price(items_with_middle)
    original_names = [i["name"] for i in sorted_original]  # ["B", "A"]
    extended_names = [i["name"] for i in sorted_extended]
    # MR: Adding an unrelated middle element keeps relative order of old elements.
    assert extended_names.index(original_names[0]) < extended_names.index(original_names[1])


def test_sort_is_stable_across_equivalent_prices() -> None:
    items = [{"name": "A", "price": 10}, {"name": "B", "price": 10}]
    result1 = sort_by_price(items)
    result2 = sort_by_price(items)
    assert result1 == result2


def test_search_results_as_set_are_permutation_invariant() -> None:
    original_catalog = ["Python Book", "FastAPI Guide", "Python Course", "Go Manual"]
    permuted_catalog = ["Go Manual", "Python Course", "FastAPI Guide", "Python Book"]
    original = search_products("Python", original_catalog)
    permuted = search_products("Python", permuted_catalog)
    assert set(original) == set(permuted)
```

---

## Combining with Property-Based Testing

The `hypothesis` library extends metamorphic testing with automatic input generation:

```python
from hypothesis import given, strategies as st


@given(st.text(min_size=1))
def test_search_nonempty_query_subset_of_empty(query: str) -> None:
    full = search_products("", CATALOG)
    filtered = search_products(query, CATALOG)
    assert all(item in full for item in filtered)
```

---

## Risks

| Risk | Description | Mitigation |
|------|-------------|------------|
| Weak MR | Relation too loose to catch real bugs | Define MRs from domain invariants, not implementation |
| Missing MR | Not all relationships covered | List all known invariants before writing tests |
| Test depends on order | Output order matters for subset check | Use set comparison when order is irrelevant |
