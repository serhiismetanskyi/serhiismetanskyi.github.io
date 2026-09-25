---
date: 2026-06-19
tags:
  - design-patterns
  - architecture
---

# Composition and Advanced Structuring Patterns

## Layout Composer Pattern

Compose complex UI from smaller, reusable components. Separate
what a component shows (presentational) from where data comes from (container).

```
Layout
  ├── Header (presentational)
  ├── Sidebar (container: fetches user prefs)
  │     └── NavItem × N (presentational)
  └── MainContent (container: fetches page data)
        └── ContentBlock × N (presentational)
```

**Slot-based composition:** parent defines named blocks; children fill them.
Used in Jinja2 (`{% block %}`), Django templates (`{% block %}`), and Python UI frameworks.

Why it matters: presentational components are pure — easy to test and reuse.
Container components own data logic — easy to swap the view without
touching the fetch logic.

**Risk:** deep nesting creates prop drilling.
Fix: use context or a store at the right level.

---

## Aggregator / Composer Pattern

Combine multiple service responses into one response for the client.
Used in API Gateway, BFF, GraphQL resolvers.

```python
import asyncio
from dataclasses import dataclass

@dataclass
class UserService:
    async def get_user(self, user_id: str) -> dict:
        return {"id": user_id, "name": "Alice"}

@dataclass
class OrderService:
    async def get_orders(self, user_id: str) -> list[dict]:
        return [{"order_id": "ORD-1", "total": 99.0}]

@dataclass
class DashboardComposer:
    users: UserService
    orders: OrderService

    async def compose(self, user_id: str) -> dict:
        # Run in parallel — not sequentially
        user, orders = await asyncio.gather(
            self.users.get_user(user_id),
            self.orders.get_orders(user_id),
        )
        return {"user": user, "orders": orders}
```

**Key rule:** run independent calls in parallel with `asyncio.gather`.
Never chain them sequentially — that adds unnecessary latency.

**Risk:** latency = slowest dependency. Handle partial failure:
return partial data with a degraded flag instead of failing the whole response.

---

## Pipeline / Middleware Pattern

Chain processing steps. Each step receives input, transforms it, passes to next.

```python
from typing import Callable

type Handler = Callable[[dict], dict]


def logging_middleware(next_handler: Handler) -> Handler:
    def handle(request: dict) -> dict:
        print(f"IN  {request}")
        response = next_handler(request)
        print(f"OUT {response}")
        return response
    return handle


def auth_middleware(next_handler: Handler) -> Handler:
    def handle(request: dict) -> dict:
        if not request.get("token"):
            return {"error": "Unauthorized"}
        return next_handler(request)
    return handle


def business_handler(request: dict) -> dict:
    return {"status": "ok", "user": request.get("user")}


pipeline = logging_middleware(auth_middleware(business_handler))
result = pipeline({"token": "abc", "user": "Alice"})
```

**Real use:** Django/FastAPI middleware stacks, WSGI/ASGI pipelines,
ETL data transformation chains, request validation pipelines.

Each middleware is independent and testable in isolation.

---

## Backend-for-Frontend (BFF)

A dedicated backend service built for one specific client type.

- **Mobile BFF:** compact data, smaller images, push token handling, optimized for slow networks.
- **Web BFF:** rich data, admin views, session cookies, analytics aggregation.

```
Mobile App → Mobile BFF → [User Service, Order Service, Notification Service]
Web App    → Web BFF    → [User Service, Order Service, Analytics, Reports]
```

**BFF responsibilities:**
1. Aggregate data from multiple backend services.
2. Transform data into the shape this client needs.
3. Handle client-specific auth flows.
4. Return only what the client needs — no over-fetching.

**Risk:** BFF becomes a fat service if teams add business logic to it.
BFF should aggregate and transform. Business rules belong in domain services.

---

## Risks Summary

| Pattern | Risk |
|---|---|
| Layout Composer | Prop drilling in deep trees |
| Aggregator | Latency from slowest service; partial failure handling |
| Pipeline | Long chain is hard to trace; error handling must be per-step |
| BFF | Becomes a monolith if business logic leaks into it |
