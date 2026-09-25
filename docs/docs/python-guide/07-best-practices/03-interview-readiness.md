---
date: 2026-08-21
tags:
  - python
---

# Interview Readiness

Prepare for Python Automation QA interviews with these topics, questions, and tasks.

---

## Core Python Questions

### Data Types & Variables

| Question | Key Points |
|----------|-----------|
| What is the difference between `list` and `tuple`? | List is mutable, tuple is immutable |
| What is dynamic typing? | Variable type is determined at runtime |
| What are falsy values in Python? | `0`, `""`, `[]`, `{}`, `None`, `False` |
| What is the difference between `is` and `==`? | `is` checks identity, `==` checks value |

### Functions

| Question | Key Points |
|----------|-----------|
| What is `*args` and `**kwargs`? | `*args` = positional tuple, `**kwargs` = keyword dict |
| What is a lambda function? | Anonymous, one-line function |
| What is a closure? | Function that remembers variables from outer scope |
| What are decorators? | Functions that wrap other functions to add behavior |

### OOP

| Question | Key Points |
|----------|-----------|
| What is encapsulation? | Hiding internal details, exposing interface |
| What is polymorphism? | Same method name, different behavior |
| When to use composition vs inheritance? | Composition for "has a", inheritance for "is a" |
| What are dunder methods? | Special methods like `__init__`, `__str__`, `__eq__` |

---

## Testing Questions

| Question | Key Points |
|----------|-----------|
| What is the test pyramid? | Many unit, fewer integration, fewest E2E |
| What is a fixture in pytest? | Function that provides test setup/data |
| How do you handle flaky tests? | Mock dependencies, isolate state, use proper waits |
| What is POM? | Page Object Model — page interactions in a class |
| What is parametrize? | Run same test with different data sets |
| Difference between mock and stub? | Mock verifies behavior, stub provides data |

---

## Coding Tasks

### Task 1: Reverse a String

```python
def reverse_string(s: str) -> str:
    return s[::-1]

assert reverse_string("hello") == "olleh"
```

### Task 2: Find Duplicates

```python
def find_duplicates(items: list) -> list:
    seen: set = set()
    duplicates: set = set()
    for item in items:
        if item in seen:
            duplicates.add(item)
        seen.add(item)
    return sorted(duplicates)

assert find_duplicates([1, 2, 2, 3, 3, 4]) == [2, 3]
```

### Task 3: Flatten a Nested List

```python
def flatten(nested: list) -> list:
    result: list = []
    for item in nested:
        if isinstance(item, list):
            result.extend(flatten(item))
        else:
            result.append(item)
    return result

assert flatten([1, [2, [3, 4]], 5]) == [1, 2, 3, 4, 5]
```

### Task 4: Count Words

```python
def count_words(text: str) -> dict[str, int]:
    words: dict[str, int] = {}
    for word in text.lower().split():
        words[word] = words.get(word, 0) + 1
    return words

assert count_words("the cat and the dog") == {
    "the": 2, "cat": 1, "and": 1, "dog": 1,
}
```

### Task 5: Validate Email (Simple)

```python
def is_valid_email(email: str) -> bool:
    if "@" not in email:
        return False
    local, domain = email.rsplit("@", 1)
    return bool(local) and "." in domain

assert is_valid_email("user@example.com")
assert not is_valid_email("user@")
assert not is_valid_email("@example.com")
```

---

## Automation-Specific Questions

| Question | Key Points |
|----------|-----------|
| How to validate API response schema? | Use Pydantic models |
| How to handle authentication in tests? | Fixtures with tokens/sessions |
| How to make tests independent? | Each test sets up and cleans up its own data |
| What locator strategy do you use? | `data-testid` > role > text > CSS > XPath |
| How do you debug a flaky test? | Check logs, isolate, mock externals, add waits |

---

## Preparation Tips

1. **Practice coding** — solve 2-3 Python tasks daily
2. **Know pytest** — fixtures, parametrize, markers, conftest
3. **Understand OOP** — SOLID, composition, design patterns
4. **Review your projects** — be ready to explain architecture decisions
5. **Know your tools** — uv, ruff, mypy, playwright
6. **Read error messages** — practice debugging stack traces
