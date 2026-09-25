---
date: 2026-06-15
tags:
  - design-patterns
  - architecture
---

# OOP — Fundamentals

Object-Oriented Programming organizes code around **objects** — entities that bundle
state (data) and behavior (methods) together. Four pillars define the paradigm.

---

## Encapsulation

Hide internal state. Expose only what callers need.

```python
class BankAccount:
    def __init__(self, balance: float) -> None:
        self._balance = balance          # private — not part of public API

    def deposit(self, amount: float) -> None:
        if amount <= 0:
            raise ValueError("Amount must be positive")
        self._balance += amount

    def get_balance(self) -> float:
        return self._balance
```

**Why it matters:**
- Caller cannot set `_balance = -9999` directly
- Validation lives in one place
- Internal representation can change without breaking callers

---

## Abstraction

Expose *what* an object does, hide *how* it does it.

```python
from abc import ABC, abstractmethod


class PaymentGateway(ABC):
    @abstractmethod
    def charge(self, amount: float, token: str) -> str:
        """Returns transaction ID."""


class StripeGateway(PaymentGateway):
    def charge(self, amount: float, token: str) -> str:
        # Stripe-specific HTTP calls hidden here
        return "stripe_txn_abc123"


class PayPalGateway(PaymentGateway):
    def charge(self, amount: float, token: str) -> str:
        return "paypal_txn_xyz789"
```

The caller works with `PaymentGateway.charge()` — it doesn't know or care whether
Stripe or PayPal is underneath.

---

## Inheritance

A subclass extends or specializes a base class, reusing its behavior.

```python
class Animal:
    def __init__(self, name: str) -> None:
        self.name = name

    def describe(self) -> str:
        return f"I am {self.name}"


class Dog(Animal):
    def speak(self) -> str:
        return "Woof"


class Cat(Animal):
    def speak(self) -> str:
        return "Meow"
```

**When to use:** when the relationship is genuinely "is-a" (Dog **is an** Animal).

**When NOT to use:** when you only want to reuse methods — use composition instead.
Inheritance creates tight coupling. Misuse leads to fragile hierarchies.

---

## Polymorphism

The same interface behaves differently depending on the actual type at runtime.

```python
def make_sound(animals: list[Animal]) -> None:
    for animal in animals:
        print(animal.speak())          # dispatches to Dog.speak or Cat.speak


make_sound([Dog("Rex"), Cat("Whiskers"), Dog("Buddy")])
# Woof
# Meow
# Woof
```

No `if isinstance(animal, Dog)` needed. New types can be added without changing
`make_sound`. This is the **Open/Closed Principle** in action.

---

## Pillar Relationships

| Pillar | Core Idea | Benefit |
|--------|-----------|---------|
| Encapsulation | Hide state, expose interface | Safety, changeability |
| Abstraction | Hide implementation details | Loose coupling |
| Inheritance | Reuse and extend behavior | DRY when appropriate |
| Polymorphism | One interface, many behaviors | Extensibility |

---

## Composition vs Inheritance

Prefer composition when a class **uses** another, not **is** another.

```python
# Inheritance (fragile if Logger changes)
class LoggedService(Logger):
    ...

# Composition (Logger is a dependency, not a parent)
class OrderService:
    def __init__(self, logger: Logger) -> None:
        self._logger = logger
```

Rule of thumb: **if you can describe the relationship as "has-a", use composition**.
