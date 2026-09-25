---
date: 2026-06-20
tags:
  - design-patterns
  - architecture
---

# Cross-Layer Design Patterns

Patterns that touch both client and server: shared shapes, validation, and types at boundaries.

## Shared Contracts (DTOs)

DTOs define data that crosses a layer. Same idea on server and client; names and fields must match the real API.

```python
# Python (server) — Pydantic DTO
from pydantic import BaseModel

class CreateOrderRequest(BaseModel):
    user_id: str
    items: list[dict[str, object]]
    total: float

class OrderResponse(BaseModel):
    id: str
    status: str
    total: float
```

```python
# Client-side validation — Pydantic validates unknown JSON before use
from pydantic import BaseModel


class OrderResponse(BaseModel):
    id: str
    status: str
    total: float


def parse_order_response(data: dict) -> OrderResponse:
    return OrderResponse.model_validate(data)
```

**Rule:** validate unknown JSON before you treat it as typed data. The network is not type-safe.

## Shared Validation

Users want fast feedback; servers must enforce rules for security. Both sides should agree.

| Approach | Idea | Trade-off |
|----------|------|-----------|
| Dual schema | Pydantic server + client validation | Simple; manual sync |
| Single source | JSON Schema or protobuf → codegen | Strong sync; tooling setup |
| Server only | No client checks | OK for internal tools; worse UX on forms |

```python
# JSON Schema as one possible single source
ORDER_SCHEMA: dict[str, object] = {
    "type": "object",
    "required": ["user_id", "total"],
    "properties": {
        "user_id": {"type": "string"},
        "total": {"type": "number", "minimum": 0},
    },
}
```

## Type Sharing

Keep types aligned with the API contract.

| Approach | How | Fits well when |
|----------|-----|----------------|
| OpenAPI + codegen | Generate Pydantic models from spec | REST, many stacks |
| Protobuf | codegen to Python (and other langs) | gRPC |
| Shared JSON Schema | Generate Pydantic from schema | Mixed teams |
| datamodel-codegen | OpenAPI/JSON Schema → Pydantic | Automation-first |

```python
from enum import StrEnum
from pydantic import BaseModel


class OrderStatus(StrEnum):
    pending = "pending"
    paid = "paid"
    shipped = "shipped"


class ApiOrder(BaseModel):
    id: str
    status: OrderStatus
    total: float
```

## Risks

**Tight coupling:** if the app imports the same Python module as the server, deploys are not independent. Prefer contract files (OpenAPI, JSON Schema) over shared runtime imports.

**Version drift:** removing or renaming fields breaks old clients. Prefer additive changes, deprecation periods, and optional new fields.

```python
# Safer API evolution: new field optional
class OrderResponseV2(BaseModel):
    id: str
    status: str
    total: float
    tracking_url: str | None = None  # old clients ignore
```

## Short Summary

Define DTOs at boundaries, validate on the wire, share types via contracts or codegen, and evolve APIs without breaking clients on every deploy.
