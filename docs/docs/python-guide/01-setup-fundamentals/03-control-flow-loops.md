---
date: 2026-08-14
tags:
  - python
---

# Control Flow & Loops

Control flow lets you make decisions in your code. Loops let you repeat actions.

---

## Conditional Statements

### Basic if/elif/else

```python
status_code = 404

if status_code == 200:
    print("OK")
elif status_code == 404:
    print("Not Found")
elif status_code >= 500:
    print("Server Error")
else:
    print("Unknown status")
```

### Comparison Operators

| Operator | Meaning |
|----------|---------|
| `==` | Equal to |
| `!=` | Not equal to |
| `<` | Less than |
| `>` | Greater than |
| `<=` | Less than or equal |
| `>=` | Greater than or equal |

### Logical Operators

```python
age = 25
has_license = True

if age >= 18 and has_license:
    print("Can drive")

if age < 18 or not has_license:
    print("Cannot drive")
```

---

## Ternary Expression

A short way to write a simple `if/else`:

```python
status = "adult" if age >= 18 else "minor"
```

---

## For Loops

Use `for` to iterate over a sequence:

```python
fruits = ["apple", "banana", "cherry"]

for fruit in fruits:
    print(fruit)
```

### Loop with Index

```python
for index, fruit in enumerate(fruits):
    print(f"{index}: {fruit}")
```

### Loop over a Range

```python
for i in range(5):       # 0, 1, 2, 3, 4
    print(i)

for i in range(1, 6):    # 1, 2, 3, 4, 5
    print(i)

for i in range(0, 10, 2): # 0, 2, 4, 6, 8
    print(i)
```

### Loop over a Dictionary

```python
user = {"name": "Alice", "age": 30}

for key, value in user.items():
    print(f"{key}: {value}")
```

---

## While Loops

Use `while` when you do not know how many times to repeat:

```python
count = 0
while count < 5:
    print(count)
    count += 1
```

!!! warning "Avoid infinite loops"
    Always make sure the condition will become `False` at some point.

---

## Loop Control

### break — Stop the Loop

```python
for number in range(10):
    if number == 5:
        break
    print(number)  # prints 0, 1, 2, 3, 4
```

### continue — Skip to Next Iteration

```python
for number in range(5):
    if number == 2:
        continue
    print(number)  # prints 0, 1, 3, 4
```

### pass — Do Nothing (Placeholder)

```python
for item in range(5):
    pass  # will add logic later
```

---

## List Comprehensions

A short way to create lists from loops:

```python
squares = [x ** 2 for x in range(5)]
# [0, 1, 4, 9, 16]

even_numbers = [x for x in range(10) if x % 2 == 0]
# [0, 2, 4, 6, 8]
```

!!! tip "Keep comprehensions simple"
    If a comprehension is hard to read, use a regular `for` loop instead.

---

## Nested Loops

```python
matrix = [[1, 2], [3, 4], [5, 6]]

for row in matrix:
    for item in row:
        print(item, end=" ")
    print()
```

---

## Best Practices

- Use `for` loops when you know the number of iterations
- Use `while` loops when the end condition is dynamic
- Prefer `enumerate()` over manual index tracking
- Keep loops **simple** — extract complex logic into functions
- Use **list comprehensions** for simple transformations
- Avoid deep nesting (more than 2-3 levels)
