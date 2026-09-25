---
date: 2026-06-15
tags:
  - design-patterns
  - architecture
---

# Design Principles: SOLID

SOLID is a set of five principles for writing maintainable, extensible software. Robert C. Martin defined them. Each principle targets a specific kind of coupling or cohesion problem. Together they help teams change one part of a system without breaking unrelated parts.

---

## 1.1 SRP — Single Responsibility Principle

A class or module should have **one reason to change**. A “reason to change” is usually one actor or one area of the business that can force a change.

**Violation example:**

```python
class UserService:
    def create_user(self, data): ...
    def send_welcome_email(self, user): ...   # email concern
    def save_to_db(self, user): ...            # persistence concern
```

If email rules change, `UserService` changes. If storage changes, it changes again. That is two reasons — two responsibilities.

**Fix:** split into `UserService`, `EmailService`, and `UserRepository`. Each type has one main reason to change.

**Cohesion:** put code that changes together in one place. Separate code that changes for different reasons.

---

## 1.2 OCP — Open/Closed Principle

Design should be **open for extension** and **closed for modification**. You add new behavior by extending (new types, new plugins), not by editing stable core code.

**Bad:** every new payment method forces edits to a long `if` / `elif` chain.

**Good:** each payment method is a class that shares one interface. A new method means a new class; existing classes stay untouched.

```python
from abc import ABC, abstractmethod

class PaymentProcessor(ABC):
    @abstractmethod
    def charge(self, amount: float) -> bool: ...

class StripeProcessor(PaymentProcessor):
    def charge(self, amount: float) -> bool:
        ...

class PayPalProcessor(PaymentProcessor):
    def charge(self, amount: float) -> bool:
        ...

# Braintree: add BraintreeProcessor — no edits to StripeProcessor or PayPalProcessor
```

---

## 1.3 LSP — Liskov Substitution Principle

A subclass must work anywhere the base class is expected. If you swap the base type for the subtype, the program should stay correct.

**Classic violation:** `Rectangle` has `set_width` and `set_height`. `Square` keeps width and height equal. Code that does `set_width(5)`, `set_height(10)`, then checks area `== 50` breaks for `Square`. So `Square` is not a safe substitute for `Rectangle` in that design.

**Rule:** the subtype must respect the **contract** of the base type (preconditions, postconditions, invariants). Do not make preconditions stricter or postconditions weaker in a way that breaks callers.

```python
class Bird:
    def move(self) -> str: ...

class Duck(Bird):
    def move(self) -> str:
        return "fly"

class Penguin(Bird):
    def move(self) -> str:
        return "swim"
# Both satisfy "Bird can describe how it moves" — valid substitutes for typical use
```

---

## 1.4 ISP — Interface Segregation Principle

Clients should not depend on methods they never use. Prefer **small, focused** interfaces instead of one large interface.

**Bad:** one `Worker` with `work()`, `eat()`, `sleep()`. A `Robot` implements `Worker` but cannot eat or sleep — empty or fake methods.

**Fix:** split into `Workable`, `Eatable`, `Restable`. `Robot` implements only `Workable`.

```python
from typing import Protocol

class Exportable(Protocol):
    def to_json(self) -> str: ...

class Persistable(Protocol):
    def save(self) -> None: ...

# A cache value may only need Exportable, not Persistable
```

---

## 1.5 DIP — Dependency Inversion Principle

High-level modules should not depend on low-level details. **Both** should depend on **abstractions** (interfaces or abstract classes).

**Without DIP:** `OrderService` constructs `MySQLOrderRepository` inside the class. A database change touches `OrderService`.

**With DIP:** `OrderService` depends on `OrderRepository` (abstract). `MySQLOrderRepository` and `PostgresOrderRepository` implement it. `OrderService` does not know which database runs behind the abstraction.

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass

class OrderRepository(ABC):
    @abstractmethod
    def save(self, order: object) -> None: ...

class MySQLOrderRepository(OrderRepository):
    def save(self, order: object) -> None:
        ...

@dataclass
class OrderService:
    repo: OrderRepository  # abstraction, not a concrete DB class

    def place_order(self, order: object) -> None:
        self.repo.save(order)
```

**Dependency injection (DI):** pass the implementation in (constructor or function argument). **Inversion of Control (IoC):** a framework or container can create objects and inject dependencies; the principle stays the same — depend on abstractions.
