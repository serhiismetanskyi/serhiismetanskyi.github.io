---
date: 2026-08-14
tags:
  - python
---

# Functions & Modules

Functions help you organize code into reusable pieces. Modules help you split code across files.

---

## Defining Functions

```python
def greet(name: str) -> str:
    return f"Hello, {name}!"

result = greet("Alice")
print(result)  # "Hello, Alice!"
```

A function should **do one thing** and have a clear name.

---

## Parameters and Arguments

### Positional and Keyword Arguments

```python
def create_user(name: str, age: int, role: str = "tester") -> dict:
    return {"name": name, "age": age, "role": role}

# Positional
user1 = create_user("Alice", 30)

# Keyword
user2 = create_user(name="Bob", age=25, role="developer")
```

### Default Values

```python
def connect(host: str = "localhost", port: int = 5432) -> str:
    return f"{host}:{port}"
```

!!! warning "Never use mutable defaults"
    Do not use `list` or `dict` as default values. Use `None` instead.

```python
# Bad
def add_item(item: str, items: list = []) -> list: ...

# Good
def add_item(item: str, items: list | None = None) -> list:
    if items is None:
        items = []
    items.append(item)
    return items
```

### *args and **kwargs

```python
def log_info(*args: str) -> None:
    for arg in args:
        print(arg)

def build_config(**kwargs: str) -> dict:
    return dict(kwargs)

log_info("start", "process", "end")
config = build_config(host="localhost", port="5432")
```

---

## Return Values

A function can return one or multiple values:

```python
def divide(a: int, b: int) -> tuple[int, int]:
    quotient = a // b
    remainder = a % b
    return quotient, remainder

q, r = divide(10, 3)  # q=3, r=1
```

---

## Lambda Functions

Small, one-line anonymous functions:

```python
square = lambda x: x ** 2
print(square(5))  # 25

users = [{"name": "Bob", "age": 25}, {"name": "Alice", "age": 30}]
sorted_users = sorted(users, key=lambda u: u["age"])
```

!!! tip "Use lambda sparingly"
    If the logic is complex, use a regular `def` function instead.

---

## Modules

A module is a `.py` file with functions, classes, or variables.

### Importing

```python
import json
from pathlib import Path
from typing import Any
```

### Custom Modules

```
project/
├── utils/
│   ├── __init__.py
│   └── helpers.py
├── tests/
│   └── test_helpers.py
└── main.py
```

```python
# utils/helpers.py
def format_name(first: str, last: str) -> str:
    return f"{first} {last}"
```

```python
# main.py
from utils.helpers import format_name

print(format_name("Alice", "Smith"))
```

---

## Packages

A package is a folder with an `__init__.py` file. It groups related modules.

```python
# utils/__init__.py
from utils.helpers import format_name

__all__ = ["format_name"]
```

---

## Useful Built-in Functions

| Function | What It Does |
|----------|-------------|
| `len(x)` | Length of a sequence |
| `range(n)` | Sequence of numbers |
| `enumerate(x)` | Index + value pairs |
| `zip(a, b)` | Pair items from two lists |
| `map(fn, x)` | Apply function to each item |
| `filter(fn, x)` | Keep items where function returns `True` |
| `sorted(x)` | Return sorted copy |
| `any(x)` | `True` if any item is truthy |
| `all(x)` | `True` if all items are truthy |

---

## Best Practices

- Keep functions **small** — one function, one purpose
- Use **type hints** for parameters and return values
- Prefer **pure functions** (no side effects) when possible
- Avoid **global state** — pass data through parameters
- Use `from module import name` for specific imports
- Put all imports **at the top** of the file
- Follow **Single Responsibility Principle** for modules
