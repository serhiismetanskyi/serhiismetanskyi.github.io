---
date: 2026-06-17
tags:
  - design-patterns
  - architecture
---

# Structural Patterns: Adapter, Decorator, Facade

Structural patterns describe how objects and classes are composed to form larger structures.

## Adapter

Converts the interface of one class to the interface expected by the client. Allows incompatible interfaces to work together.

```python
from typing import Protocol

class ModernPaymentGateway(Protocol):
    def process(self, amount: float, currency: str) -> bool: ...

class LegacyPaymentAPI:
    def make_payment(self, amount_cents: int) -> str:
        return "OK" if amount_cents > 0 else "FAIL"

class LegacyPaymentAdapter:
    def __init__(self, legacy: LegacyPaymentAPI) -> None:
        self._legacy = legacy

    def process(self, amount: float, currency: str) -> bool:
        cents = int(amount * 100)
        return self._legacy.make_payment(cents) == "OK"

adapter = LegacyPaymentAdapter(LegacyPaymentAPI())
result = adapter.process(29.99, "USD")
```

Use when: integrating a third-party library or legacy system whose interface does not match your domain interface.

## Decorator

Add behavior to an object dynamically without changing its class. Wraps the original object.

```python
from typing import Protocol

class DataStore(Protocol):
    def read(self, key: str) -> str: ...
    def write(self, key: str, value: str) -> None: ...

class InMemoryStore:
    def __init__(self) -> None:
        self._data: dict[str, str] = {}

    def read(self, key: str) -> str:
        return self._data.get(key, "")

    def write(self, key: str, value: str) -> None:
        self._data[key] = value

class LoggingDecorator:
    def __init__(self, store: DataStore) -> None:
        self._store = store

    def read(self, key: str) -> str:
        value = self._store.read(key)
        print(f"READ {key}={value!r}")
        return value

    def write(self, key: str, value: str) -> None:
        print(f"WRITE {key}={value!r}")
        self._store.write(key, value)

store: DataStore = LoggingDecorator(InMemoryStore())
store.write("user:1", "Alice")
_ = store.read("user:1")
```

Use when: you need to add cross-cutting behavior (logging, caching, validation, auth) without modifying the core class. Stack multiple decorators.

## Facade

Provide a simple interface over a complex subsystem. Hide implementation details.

```python
class AuthService:
    def validate_token(self, token: str) -> bool: ...

class OrderService:
    def get_orders(self, user_id: str) -> list[dict]: ...

class ShippingService:
    def get_tracking(self, order_id: str) -> dict: ...

class DashboardFacade:
    def __init__(
        self,
        auth: AuthService,
        orders: OrderService,
        shipping: ShippingService,
    ) -> None:
        self._auth = auth
        self._orders = orders
        self._shipping = shipping

    def get_user_dashboard(self, token: str, user_id: str) -> dict:
        if not self._auth.validate_token(token):
            raise PermissionError("Invalid token")
        orders = self._orders.get_orders(user_id)
        tracking = [self._shipping.get_tracking(o["id"]) for o in orders]
        return {"orders": orders, "tracking": tracking}
```

Use when: a subsystem is complex and clients need a simple unified entry point. Client does not need to know the internals.
