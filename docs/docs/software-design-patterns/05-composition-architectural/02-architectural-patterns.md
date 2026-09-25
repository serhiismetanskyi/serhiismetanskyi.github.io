---
date: 2026-06-19
tags:
  - design-patterns
  - architecture
---

# Architectural Patterns: Layered, Clean, Hexagonal

## Layered Architecture

Code is organized in horizontal layers. Each layer has one role.
Dependencies flow downward only — upper layers use lower layers.

```
Presentation Layer     (HTTP controllers, CLI, GraphQL resolvers)
        ↓
Application Layer      (use cases, orchestration, DTOs)
        ↓
Domain Layer           (entities, value objects, business rules)
        ↓
Infrastructure Layer   (database, cache, HTTP clients, message queues)
```

**Rules:**
- Each layer only depends on the layer directly below it.
- Domain layer has no framework imports — pure Python.
- Infrastructure layer implements interfaces defined by domain/application layers.

**Risk:** upper layers skipping layers (controller calls repository directly).
This creates tight coupling. Enforce via code review or architecture linting.

---

## Clean Architecture

Robert C. Martin's refinement. The core rule: **dependencies always point
inward toward the domain.** Outer layers know inner layers, not the reverse.

```
         Entities (Domain — no dependencies)
       ↑
     Use Cases (Application — depends on Entities only)
   ↑
 Interface Adapters (Controllers, Presenters, Gateways)
↑
Frameworks & Drivers (DB, Web, UI, external APIs)
```

**Key properties:**
- Domain is completely isolated — no framework, no ORM, no HTTP imports.
- You can swap the database or web framework without touching business logic.
- Domain and use cases are fully testable without infrastructure.

```python
from dataclasses import dataclass

# Domain entity — pure Python, no framework dependency
@dataclass
class Order:
    id: str
    amount: float

    def is_valid(self) -> bool:
        return self.amount > 0

    def can_be_cancelled(self) -> bool:
        return self.amount > 0  # simplified business rule
```

**Difference from layered:** layered allows domain to reference ORM models.
Clean Architecture enforces that the domain owns nothing from infrastructure.

---

## Hexagonal Architecture (Ports and Adapters)

Alistair Cockburn's pattern. Application = hexagon.
Ports = interfaces. Adapters = concrete implementations.

```
[REST Controller] → [Input Port / Use Case] → [Domain]
                                                    ↓
                                       [Output Port (interface)]
                                                    ↓
                              [DB Adapter / Cache Adapter / API Adapter]
```

**Port types:**
- **Input port:** interface the application exposes. REST controller calls it.
- **Output port:** interface the application depends on. DB adapter implements it.

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass

@dataclass
class Order:
    id: str
    amount: float

    def is_valid(self) -> bool:
        return self.amount > 0


# Output port — owned by domain, implemented by infrastructure
class OrderRepository(ABC):
    @abstractmethod
    def save(self, order: Order) -> None: ...

    @abstractmethod
    def find_by_id(self, order_id: str) -> Order | None: ...


# Use case — depends only on the abstract port, not the DB
class PlaceOrderUseCase:
    def __init__(self, repo: OrderRepository) -> None:
        self._repo = repo

    def execute(self, order_id: str, amount: float) -> None:
        order = Order(id=order_id, amount=amount)
        if not order.is_valid():
            raise ValueError("Invalid order amount")
        self._repo.save(order)
```

**Testing:** replace DB adapter with in-memory adapter. Business logic tested
without a database or network.

```python
class InMemoryOrderRepository(OrderRepository):
    def __init__(self) -> None:
        self._store: dict[str, Order] = {}

    def save(self, order: Order) -> None:
        self._store[order.id] = order

    def find_by_id(self, order_id: str) -> Order | None:
        return self._store.get(order_id)


def test_place_order() -> None:
    repo = InMemoryOrderRepository()
    use_case = PlaceOrderUseCase(repo)
    use_case.execute("ORD-1", 99.0)
    assert repo.find_by_id("ORD-1") is not None
```

---

## Comparison

| Aspect | Layered | Clean | Hexagonal |
|---|---|---|---|
| Dependency rule | Top → Bottom | All → Domain | Outside → Domain |
| Domain isolation | Partial | Full | Full |
| Swap infrastructure | Hard | Easy | Easy |
| Testability | Medium | High | High |
| Complexity | Low | Medium | Medium |
| Best for | Small–medium apps | Large domain-heavy systems | Ports-first API design |
