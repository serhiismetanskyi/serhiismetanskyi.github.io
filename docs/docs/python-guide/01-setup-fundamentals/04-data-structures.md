---
date: 2026-08-14
tags:
  - python
---

# Data Structures

Python has four main built-in data structures. Each one is good for different tasks.

---

## Overview

| Structure | Ordered | Mutable | Duplicates | Use Case |
|-----------|---------|---------|------------|----------|
| `list` | Yes | Yes | Yes | General collections |
| `tuple` | Yes | No | Yes | Fixed data, function returns |
| `set` | No | Yes | No | Unique values, fast lookup |
| `dict` | Yes | Yes | Keys: No | Key-value mapping |

---

## Lists

A list is an ordered collection that you can change.

```python
fruits = ["apple", "banana", "cherry"]

fruits.append("orange")      # add to end
fruits.insert(0, "mango")   # add at position
fruits.remove("banana")     # remove by value
last = fruits.pop()         # remove and return last item

print(fruits[0])    # first item
print(fruits[-1])   # last item
print(len(fruits))  # number of items
```

### Slicing

```python
numbers = [0, 1, 2, 3, 4, 5]

print(numbers[1:4])   # [1, 2, 3]
print(numbers[:3])    # [0, 1, 2]
print(numbers[3:])    # [3, 4, 5]
print(numbers[::2])   # [0, 2, 4]
```

### Useful List Methods

| Method | What It Does |
|--------|-------------|
| `append(x)` | Add item to end |
| `extend(list)` | Add all items from another list |
| `insert(i, x)` | Insert item at position |
| `remove(x)` | Remove first occurrence |
| `pop(i)` | Remove and return item at position |
| `sort()` | Sort the list in place |
| `reverse()` | Reverse the list in place |
| `index(x)` | Find position of item |
| `count(x)` | Count occurrences |

---

## Tuples

A tuple is like a list, but you **cannot change** it after creation.

```python
point = (10, 20)
rgb = (255, 128, 0)

x, y = point  # unpacking

print(point[0])  # 10
print(len(point))  # 2
```

!!! tip "When to use tuples"
    Use tuples for data that should not change, like coordinates or database rows.

---

## Sets

A set stores **unique values** only. It has no order.

```python
colors = {"red", "green", "blue"}
colors.add("yellow")
colors.discard("red")

print("green" in colors)  # True — fast lookup
```

### Set Operations

```python
a = {1, 2, 3, 4}
b = {3, 4, 5, 6}

print(a | b)  # union: {1, 2, 3, 4, 5, 6}
print(a & b)  # intersection: {3, 4}
print(a - b)  # difference: {1, 2}
```

---

## Dictionaries

A dictionary maps **keys** to **values**.

```python
user = {
    "name": "Alice",
    "age": 30,
    "role": "QA Engineer",
}

print(user["name"])          # "Alice"
print(user.get("email", "")) # "" (default if missing)

user["email"] = "alice@example.com"  # add new key
del user["age"]                       # remove key
```

### Useful Dict Methods

| Method | What It Does |
|--------|-------------|
| `get(key, default)` | Get value safely |
| `keys()` | All keys |
| `values()` | All values |
| `items()` | All key-value pairs |
| `update(dict)` | Merge another dict |
| `pop(key)` | Remove and return value |

### Iterating Over a Dict

```python
for key, value in user.items():
    print(f"{key}: {value}")
```

---

## Choosing the Right Structure

| Need | Use |
|------|-----|
| Ordered, changeable collection | `list` |
| Fixed, unchangeable data | `tuple` |
| Unique values, fast membership check | `set` |
| Key-value pairs, fast lookup by key | `dict` |

---

## Best Practices

- Use **lists** for ordered collections of the same type
- Use **tuples** for fixed groups of related values
- Use **sets** to remove duplicates or check membership
- Use **dicts** for structured data with named fields
- Prefer `dict.get(key, default)` over `dict[key]` to avoid `KeyError`
- Use **type hints** for clarity: `items: list[str]`, `data: dict[str, int]`
