---
date: 2026-07-19
tags:
  - test-automation
  - architecture
---

# Framework Architecture — Layers & Responsibilities

## High-Level Layer Model

```
┌─────────────────────────────────────────────┐
│               TEST LAYER                    │
│  test cases · scenarios · assertions        │
├─────────────────────────────────────────────┤
│           ABSTRACTION LAYER                 │
│  page objects · API clients · service wraps │
├─────────────────────────────────────────────┤
│          CORE FRAMEWORK LAYER               │
│  drivers · utilities · helpers · builders   │
├─────────────────────────────────────────────┤
│          INFRASTRUCTURE LAYER               │
│  HTTP · browser · gRPC · WebSocket          │
├─────────────────────────────────────────────┤
│             DATA LAYER                      │
│  builders · fixtures · factories            │
└─────────────────────────────────────────────┘
```

Each layer depends only on the layer below it. No layer skips levels.

---

## Test Layer

**What it does:** orchestrates a scenario and asserts an outcome.

**What it must NOT contain:**
- HTTP request construction
- Element locator strings
- Data generation logic
- Retry or wait logic

```python
# Good — test layer is clean orchestration
def test_checkout_flow(api_client, user_factory):
    user = user_factory.create_with_payment_method()
    order = api_client.orders.create(user_id=user.id, items=[ITEM_SKU])
    api_client.orders.checkout(order.id)

    assert api_client.orders.get(order.id).status == "COMPLETED"
```

---

## Abstraction Layer

**Page Objects** wrap UI pages. Tests call `login_page.submit()`, not `page.click(selector)`.

**API Clients** wrap HTTP calls. Tests call `api.users.create(email)`, not `requests.post(url, json)`.

**Service Wrappers** group related API clients into a cohesive domain interface.

Rules:
- One class per domain (users, orders, products)
- No assertion logic inside abstractions — they describe capability
- Return typed objects, not raw dicts

---

## Core Framework Layer

**Drivers** — abstract over the communication channel:
- `BrowserDriver` wraps Playwright
- `HttpDriver` wraps `httpx`
- `GrpcDriver` wraps generated stubs
- `WsDriver` wraps WebSocket client

**Utilities** — reusable helpers with no domain knowledge:
- retry decorator
- wait_for helper
- logger factory
- datetime freezer

**Builders** — construct test objects with sensible defaults (see Data Layer).

---

## Infrastructure Layer

Direct integration with external tools. No domain logic here.

| Component | Technology |
|-----------|-----------|
| HTTP client | `httpx` (async) |
| Browser | Playwright |
| gRPC | `grpcio` + generated stubs |
| WebSocket | `websockets` |

This layer is replaceable. Swapping `httpx` for another client touches only this layer.

---

## Data Layer

**Test Data Builders** — fluent, composable objects with unique-by-default fields.

**Fixtures** — pytest fixtures that create and clean up test data.

**Factories** — produce instances of framework components (clients, drivers, builders).

```python
# Factory creates configured client — test doesn't care about auth details
@pytest.fixture
def api_client(env_config: EnvConfig) -> ApiClient:
    return ApiClientFactory.create(env_config)
```

---

## Responsibility Matrix

| Concern | Test | Abstraction | Core | Infra | Data |
|---------|------|-------------|------|-------|------|
| Assertion | ✓ | | | | |
| Navigation | | ✓ | | | |
| HTTP call | | ✓ | | ✓ | |
| Retry logic | | | ✓ | | |
| Auth headers | | | ✓ | | |
| Data creation | | | | | ✓ |
| DB seeding | | | | ✓ | |

---

## Dependency Direction

```
Tests → Abstractions → Core → Infra
Tests → Data Layer
```

Core and Data layers never import from Tests.
Infra never imports from Abstractions.
Tests are the only layer allowed to combine everything.
