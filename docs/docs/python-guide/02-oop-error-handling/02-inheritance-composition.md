---
date: 2026-08-15
tags:
  - python
---

# Inheritance & Composition

Inheritance and composition are two ways to reuse code. Each has its place.

---

## Inheritance

A child class gets all attributes and methods from a parent class.

```python
class BasePage:
    def __init__(self, driver) -> None:
        self.driver = driver

    def get_title(self) -> str:
        return self.driver.title

class LoginPage(BasePage):
    def login(self, username: str, password: str) -> None:
        self.driver.find_element("id", "user").send_keys(username)
        self.driver.find_element("id", "pass").send_keys(password)
        self.driver.find_element("id", "submit").click()
```

### Using `super()`

Call the parent class method:

```python
class AdminPage(BasePage):
    def __init__(self, driver, admin_token: str) -> None:
        super().__init__(driver)
        self.admin_token = admin_token
```

---

## Polymorphism

Different classes can have the same method name but different behavior:

```python
class EmailNotifier:
    def send(self, message: str) -> None:
        print(f"Email: {message}")

class SlackNotifier:
    def send(self, message: str) -> None:
        print(f"Slack: {message}")

def notify(notifier, message: str) -> None:
    notifier.send(message)

notify(EmailNotifier(), "Test passed")
notify(SlackNotifier(), "Test passed")
```

---

## Abstract Classes

Define a contract that child classes must follow:

```python
from abc import ABC, abstractmethod

class BaseApiClient(ABC):
    @abstractmethod
    def get(self, endpoint: str) -> dict:
        ...

    @abstractmethod
    def post(self, endpoint: str, data: dict) -> dict:
        ...

class RestClient(BaseApiClient):
    def get(self, endpoint: str) -> dict:
        return {"status": "ok"}

    def post(self, endpoint: str, data: dict) -> dict:
        return {"created": True}
```

---

## Composition

Composition means a class **uses** other classes instead of **inheriting** from them.

```python
class Logger:
    def log(self, message: str) -> None:
        print(f"[LOG] {message}")

class ApiClient:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url
        self.logger = Logger()

    def get(self, endpoint: str) -> dict:
        self.logger.log(f"GET {self.base_url}{endpoint}")
        return {"status": "ok"}
```

---

## Composition vs Inheritance

| Aspect | Inheritance | Composition |
|--------|------------|-------------|
| Relationship | "is a" | "has a" |
| Coupling | Tight | Loose |
| Flexibility | Less flexible | More flexible |
| Reuse | Through class hierarchy | Through object inclusion |
| Complexity | Grows with depth | Stays flat |

!!! tip "Prefer composition over inheritance"
    Use inheritance only for clear "is a" relationships. Use composition for everything else.

---

## Dunder (Magic) Methods

Special methods that Python calls automatically:

```python
class TestResult:
    def __init__(self, name: str, passed: bool) -> None:
        self.name = name
        self.passed = passed

    def __str__(self) -> str:
        status = "PASS" if self.passed else "FAIL"
        return f"{self.name}: {status}"

    def __repr__(self) -> str:
        return f"TestResult(name={self.name!r}, passed={self.passed!r})"

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, TestResult):
            return NotImplemented
        return self.name == other.name and self.passed == other.passed

    def __len__(self) -> int:
        return len(self.name)
```

### Common Dunder Methods

| Method | When It Is Called |
|--------|-----------------|
| `__init__` | Object creation |
| `__str__` | `str(obj)` or `print(obj)` |
| `__repr__` | Debug representation |
| `__eq__` | `obj1 == obj2` |
| `__len__` | `len(obj)` |
| `__bool__` | `if obj:` |
| `__hash__` | Using object as dict key |

---

## Best Practices

- **Favor composition** over inheritance for most cases
- Keep inheritance **shallow** — avoid deep class hierarchies
- Use **abstract classes** to define interfaces
- Implement `__str__` and `__repr__` for better debugging
- Follow **Liskov Substitution Principle** — child classes should work everywhere parent classes work
