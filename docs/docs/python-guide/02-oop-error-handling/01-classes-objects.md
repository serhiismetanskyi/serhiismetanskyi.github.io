---
date: 2026-08-15
tags:
  - python
---

# Classes & Objects

A class is a blueprint for creating objects. Objects have data (attributes) and behavior (methods).

---

## Creating a Class

```python
class User:
    def __init__(self, name: str, email: str) -> None:
        self.name = name
        self.email = email

    def display(self) -> str:
        return f"{self.name} <{self.email}>"
```

### Creating Objects

```python
user = User("Alice", "alice@example.com")
print(user.display())  # "Alice <alice@example.com>"
print(user.name)        # "Alice"
```

---

## The `__init__` Method

`__init__` is the **constructor**. It runs when you create a new object.

```python
class ApiClient:
    def __init__(self, base_url: str, timeout: int = 30) -> None:
        self.base_url = base_url
        self.timeout = timeout

client = ApiClient("https://api.example.com")
```

---

## Instance vs Class Attributes

```python
class TestConfig:
    max_retries: int = 3  # class attribute (shared)

    def __init__(self, env: str) -> None:
        self.env = env  # instance attribute (per object)

config1 = TestConfig("staging")
config2 = TestConfig("production")

print(config1.max_retries)  # 3 (from class)
print(config1.env)          # "staging" (from instance)
```

---

## Methods

### Instance Methods

Regular methods that work with `self`:

```python
class Calculator:
    def __init__(self) -> None:
        self.history: list[str] = []

    def add(self, a: int, b: int) -> int:
        result = a + b
        self.history.append(f"{a} + {b} = {result}")
        return result
```

### Class Methods

Work with the class, not an instance:

```python
class User:
    def __init__(self, name: str, role: str) -> None:
        self.name = name
        self.role = role

    @classmethod
    def create_admin(cls, name: str) -> "User":
        return cls(name, role="admin")

admin = User.create_admin("Alice")
```

### Static Methods

Do not use `self` or `cls`:

```python
class Validator:
    @staticmethod
    def is_valid_email(email: str) -> bool:
        return "@" in email and "." in email
```

---

## Properties

Use `@property` to control access to attributes:

```python
class Circle:
    def __init__(self, radius: float) -> None:
        self._radius = radius

    @property
    def radius(self) -> float:
        return self._radius

    @radius.setter
    def radius(self, value: float) -> None:
        if value < 0:
            raise ValueError("Radius cannot be negative")
        self._radius = value

    @property
    def area(self) -> float:
        return 3.14159 * self._radius ** 2
```

```python
circle = Circle(5.0)
print(circle.area)    # 78.53975
circle.radius = 10.0  # uses setter
```

---

## Naming Conventions

| Convention | Meaning |
|-----------|---------|
| `name` | Public attribute |
| `_name` | Protected (internal use) |
| `__name` | Private (name mangling) |

---

## Best Practices

- Keep classes **small and focused** — one class, one responsibility
- Use `__init__` to set up all attributes
- Use **type hints** for all attributes and methods
- Use `@property` instead of getter/setter methods
- Prefix internal attributes with `_`
- Avoid classes with too many methods (God objects)
