---
date: 2026-08-20
tags:
  - python
---

# Performance & Optimization

Write fast code by choosing the right tools and avoiding common mistakes.

---

## Measure First

!!! warning "Do not guess — measure"
    Never optimize without measuring. Find the slow part first, then fix it.

### Using `time.perf_counter()`

```python
import time

start = time.perf_counter()
result = process_data(large_dataset)
elapsed = time.perf_counter() - start
print(f"Took {elapsed:.3f} seconds")
```

### Using `cProfile`

```bash
uv run python -m cProfile -s cumtime my_script.py
```

This shows which functions take the most time.

---

## Efficient Data Structures

### Choose the Right Structure

| Operation | list | set | dict |
|-----------|------|-----|------|
| Access by index | O(1) | N/A | N/A |
| Search (membership) | O(n) | O(1) | O(1) |
| Insert at end | O(1) | O(1) | O(1) |
| Insert at start | O(n) | N/A | N/A |
| Delete by value | O(n) | O(1) | O(1) |

### Membership Check

```python
# Slow — O(n) for each check
names_list = ["Alice", "Bob", "Charlie", ...]
if "Alice" in names_list: ...

# Fast — O(1) for each check
names_set = {"Alice", "Bob", "Charlie", ...}
if "Alice" in names_set: ...
```

!!! tip "Use sets for membership checks"
    If you only need to check "is this item in the collection?", use a `set`.

---

## String Performance

```python
# Slow — creates new string on each iteration
result = ""
for item in large_list:
    result += str(item) + ", "

# Fast — joins all at once
result = ", ".join(str(item) for item in large_list)
```

---

## List Performance

### List Comprehensions Are Faster

```python
# Slower
result = []
for x in range(10000):
    result.append(x ** 2)

# Faster
result = [x ** 2 for x in range(10000)]
```

### Pre-allocate When Possible

```python
# If you know the size, use a generator
squares = (x ** 2 for x in range(10000))
```

---

## Caching

### functools.lru_cache

Cache function results to avoid repeated computation:

```python
from functools import lru_cache

@lru_cache(maxsize=128)
def get_user_permissions(user_id: int) -> list[str]:
    # Expensive database query
    return fetch_permissions_from_db(user_id)
```

### When to Cache

| Good for Caching | Bad for Caching |
|-----------------|-----------------|
| Same input, same output | Random or changing results |
| Expensive computation | Quick operations |
| Frequently called | Rarely called |
| Small result set | Large result set |

---

## Common Performance Mistakes

### 1. Searching in Lists

```python
# Bad — O(n) per search
if item in large_list: ...

# Good — O(1) per search
large_set = set(large_list)
if item in large_set: ...
```

### 2. Repeated Attribute Access in Loops

```python
# Slower
for item in items:
    result.append(item.value.strip().lower())

# Faster — local reference
append = result.append
for item in items:
    append(item.value.strip().lower())
```

### 3. Loading Everything into Memory

```python
# Bad — loads entire file
data = Path("huge_file.txt").read_text().splitlines()

# Good — process line by line
with Path("huge_file.txt").open() as f:
    for line in f:
        process(line)
```

---

## Optimization Checklist

| Step | Action |
|------|--------|
| 1 | Measure with profiler |
| 2 | Find the bottleneck |
| 3 | Choose the right data structure |
| 4 | Reduce unnecessary work |
| 5 | Cache repeated computations |
| 6 | Measure again to confirm |

---

## Best Practices

- **Measure** before optimizing — do not guess
- Choose the **right data structure** (set for lookup, dict for mapping)
- Use **list comprehensions** and **generator expressions**
- Use **`str.join()`** for building strings
- Use **`lru_cache`** for expensive, pure functions
- **Avoid premature optimization** — clean code first, optimize later
- Process large files **line by line**, not all at once
- Use **async** for I/O-bound tasks, not CPU-bound tasks
