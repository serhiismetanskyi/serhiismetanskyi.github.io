---
date: 2026-06-18
tags:
  - design-patterns
  - architecture
---

# Behavioral Patterns: Chain of Responsibility, State, Mediator

## Chain of Responsibility

**Idea:** Send a request through a line of handlers. Each handler either answers or passes the request to the next one.

```python
from abc import ABC
from dataclasses import dataclass, field


@dataclass
class Handler(ABC):
    _next: "Handler | None" = field(default=None, init=False)

    def set_next(self, handler: "Handler") -> "Handler":
        self._next = handler
        return handler

    def handle(self, request: dict) -> str | None:
        if self._next:
            return self._next.handle(request)
        return None


class AuthHandler(Handler):
    def handle(self, request: dict) -> str | None:
        if not request.get("token"):
            return "401 Unauthorized"
        return super().handle(request)


class RateLimitHandler(Handler):
    def handle(self, request: dict) -> str | None:
        if request.get("rate_exceeded"):
            return "429 Too Many Requests"
        return super().handle(request)


class BusinessHandler(Handler):
    def handle(self, request: dict) -> str | None:
        return "200 OK"


auth = AuthHandler()
rate = RateLimitHandler()
biz = BusinessHandler()
auth.set_next(rate).set_next(biz)

print(auth.handle({"token": "abc"}))  # 200 OK
print(auth.handle({}))  # 401 Unauthorized
print(auth.handle({"token": "x", "rate_exceeded": True}))  # 429
```

**Where it helps:** HTTP middleware (Django, FastAPI). Validation steps. Logging chains. Event processing steps.

## State

**Idea:** The object delegates behavior to a state object. When the state changes, behavior changes without huge `if` blocks.

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass


class OrderState(ABC):
    @abstractmethod
    def ship(self, order: "Order") -> None: ...

    @abstractmethod
    def cancel(self, order: "Order") -> None: ...


class PendingState(OrderState):
    def ship(self, order: "Order") -> None:
        print("Shipping order...")
        order.state = ShippedState()

    def cancel(self, order: "Order") -> None:
        print("Cancelling order...")
        order.state = CancelledState()


class ShippedState(OrderState):
    def ship(self, order: "Order") -> None:
        print("Already shipped.")

    def cancel(self, order: "Order") -> None:
        print("Cannot cancel shipped order.")


class CancelledState(OrderState):
    def ship(self, order: "Order") -> None:
        print("Cannot ship cancelled order.")

    def cancel(self, order: "Order") -> None:
        print("Already cancelled.")


@dataclass
class Order:
    state: OrderState | None = None

    def __post_init__(self) -> None:
        self.state = PendingState()


order = Order()
order.state.ship(order)  # Shipping order...
order.state.cancel(order)  # Cannot cancel shipped order.
```

**Where it helps:** Order lifecycle. Subscription status. Network connection states.

## Mediator

**Idea:** Objects do not call each other directly. They talk through a mediator. Fewer tight links between classes.

```python
from dataclasses import dataclass, field


@dataclass
class ChatRoom:
    _members: list["ChatUser"] = field(default_factory=list)

    def join(self, user: "ChatUser") -> None:
        self._members.append(user)

    def broadcast(self, sender: "ChatUser", message: str) -> None:
        for member in self._members:
            if member is not sender:
                member.receive(sender.name, message)


@dataclass
class ChatUser:
    name: str
    room: ChatRoom

    def send(self, message: str) -> None:
        print(f"{self.name} → {message}")
        self.room.broadcast(self, message)

    def receive(self, from_name: str, message: str) -> None:
        print(f"  [{self.name}] from {from_name}: {message}")
```

**Where it helps:** Forms where fields update each other. Air traffic control. Orchestrators between microservices.
