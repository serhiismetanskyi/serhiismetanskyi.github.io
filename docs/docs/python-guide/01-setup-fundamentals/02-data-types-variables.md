---
date: 2026-08-14
tags:
  - python
---

# Data Types & Variables

Python has simple and powerful data types. This page covers the basics you use every day.

---

## Basic Data Types

| Type | Example | Description |
|------|---------|-------------|
| `int` | `42` | Whole numbers |
| `float` | `3.14` | Decimal numbers |
| `str` | `"hello"` | Text (strings) |
| `bool` | `True`, `False` | Logical values |
| `NoneType` | `None` | No value / empty |

---

## Variables

A variable stores a value. You do not need to declare the type — Python figures it out.

```python
name = "Alice"
age = 30
is_active = True
salary = 50000.50
nothing = None
```

---

## Dynamic Typing

In Python, a variable can change its type at any time:

```python
value = 10       # int
value = "hello"  # now it is str
```

!!! warning "Be careful with dynamic typing"
    Changing types can cause bugs. Use **type hints** to make your code clear.

---

## Type Hints

Type hints tell other developers (and tools) what type a variable should have:

```python
name: str = "Alice"
age: int = 30
is_active: bool = True
scores: list[int] = [90, 85, 92]
```

Type hints do **not** stop the code from running. They are for readability and tools like `mypy`.

---

## Type Checking with `type()` and `isinstance()`

```python
x = 42
print(type(x))           # <class 'int'>
print(isinstance(x, int)) # True
```

Use `isinstance()` instead of `type()` — it works with inheritance.

---

## Type Conversion

Convert between types when needed:

```python
number = int("42")       # str -> int
text = str(42)           # int -> str
decimal = float("3.14")  # str -> float
flag = bool(1)           # int -> bool (True)
```

---

## String Basics

```python
greeting = "Hello"
name = "World"

# Concatenation
message = greeting + " " + name

# f-strings (recommended)
message = f"{greeting} {name}"

# Useful methods
print(name.lower())    # "world"
print(name.upper())    # "WORLD"
print(name.strip())    # remove whitespace
print(name.replace("o", "0"))  # "W0rld"
```

!!! tip "Use f-strings"
    f-strings are the cleanest way to format strings in modern Python.

---

## Numbers

```python
a = 10
b = 3

print(a + b)   # 13 — addition
print(a - b)   # 7  — subtraction
print(a * b)   # 30 — multiplication
print(a / b)   # 3.333... — division (float)
print(a // b)  # 3  — integer division
print(a % b)   # 1  — remainder
print(a ** b)  # 1000 — power
```

---

## Boolean Logic

```python
x = True
y = False

print(x and y)  # False
print(x or y)   # True
print(not x)     # False
```

**Falsy values** in Python: `0`, `0.0`, `""`, `[]`, `{}`, `None`, `False`.

Everything else is **truthy**.

---

## Duck Typing

In Python, you do not need to check a type — you just call the method. If the object has that method, it works.

```python
class Dog:
    def speak(self) -> str:
        return "Woof!"

class Cat:
    def speak(self) -> str:
        return "Meow!"

def make_sound(animal) -> None:
    print(animal.speak())  # works for Dog, Cat, or any object with speak()

make_sound(Dog())  # "Woof!"
make_sound(Cat())  # "Meow!"
```

!!! tip "Duck typing means: if it walks like a duck and quacks like a duck, it is a duck."
    Python does not care about the class — it cares about the behavior.

---

## Comments & Docstrings

### Single-line Comments

```python
# This is a comment — Python ignores this line
x = 42  # inline comment
```

### Multi-line Comments

```python
# First line
# Second line
# Third line
```

### Docstrings

A docstring is a string at the top of a function, class, or module. It explains **what** the code does.

```python
def calculate_discount(price: float, percent: float) -> float:
    """Calculate the final price after applying a discount.

    Args:
        price: Original price in USD.
        percent: Discount as a decimal (e.g. 0.2 for 20%).

    Returns:
        Final price after discount.
    """
    return price * (1 - percent)
```

Access a docstring with `help()` or `.__doc__`:

```python
print(calculate_discount.__doc__)
```

---

## Indentation Rules

Python uses **indentation** (spaces) to define blocks of code. This is not optional — it is required.

```python
# Correct — 4 spaces
if True:
    print("inside block")
    if True:
        print("nested block")

# Wrong — inconsistent indentation causes IndentationError
if True:
  print("2 spaces — will work but not PEP 8")
    print("4 spaces after 2 spaces — IndentationError!")
```

| Rule | Detail |
|------|--------|
| Use **4 spaces** per level | Standard across Python community (PEP 8) |
| **Never mix** tabs and spaces | Will cause `TabError` |
| Configure your editor | Set "indent = 4 spaces" and "insert spaces" |

---

## Best Practices

- Use **meaningful names**: `user_name` not `x`
- Follow **snake_case** for variables and functions
- Use **UPPER_CASE** for constants: `MAX_RETRIES = 3`
- Add **type hints** to function parameters and return values
- Avoid **magic values** — use named constants instead
- Write **docstrings** for every function, class, and module
- Use **comments** to explain *why*, not *what* the code does
