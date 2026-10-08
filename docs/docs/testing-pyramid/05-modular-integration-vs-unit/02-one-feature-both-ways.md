---
date: 2026-10-07
tags:
  - testing
  - test-strategy
  - unit-testing
  - integration-testing
  - pytest
  - python
---

# Modular Integration vs Unit — One Feature, Both Ways

One feature, tested both ways: **placing an order** in a small modular monolith. The `orders` module prices the order, stores it, reserves stock in the `inventory` module, charges a payment provider and publishes an event. The same request sent twice (same idempotency key) must not charge twice.

## The Code Under Test

```
shop/
├── app.py                 # FastAPI app factory
├── orders/                # the module under test
│   ├── __init__.py        # public API: OrdersModule, PlaceOrder, errors
│   ├── api.py             # HTTP routes
│   ├── ports.py           # what orders needs from its neighbours
│   ├── pricing.py         # pure functions
│   ├── repository.py      # SQL, schema "orders"
│   └── service.py         # PlaceOrderHandler
└── inventory/             # a neighbour module, schema "inventory"
    └── __init__.py        # public API: InventoryModule
tests/
├── conftest.py            # PostgreSQL container, database per worker, clean-up
├── fakes.py               # FakeInventory, FakePayments, RecordingBus
├── unit/                  # pricing + handler with mocks
├── module/                # OrdersModule through Python API and HTTP
└── contracts/             # the same tests for FakeInventory and InventoryModule
```

### Pricing — pure functions

```python
# shop/orders/pricing.py
from decimal import Decimal

FREE_SHIPPING_FROM = Decimal("100.00")
SHIPPING = Decimal("7.50")


def subtotal(lines: list[tuple[Decimal, int]]) -> Decimal:
    return sum((price * qty for price, qty in lines), Decimal("0"))


def discount(amount: Decimal, coupon: str | None) -> Decimal:
    if coupon == "SAVE10":
        return (amount * Decimal("0.10")).quantize(Decimal("0.01"))
    return Decimal("0")


def total(lines: list[tuple[Decimal, int]], coupon: str | None) -> Decimal:
    goods = subtotal(lines) - discount(subtotal(lines), coupon)
    shipping = Decimal("0") if goods >= FREE_SHIPPING_FROM else SHIPPING
    return goods + shipping
```

### Ports — what the module needs from outside

The handler depends on these protocols, not on the inventory package or a payment SDK. This is where the fakes plug in.

```python
# shop/orders/ports.py
from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol


class InventoryPort(Protocol):
    """What the orders module needs from the inventory module."""

    def price_of(self, sku: str) -> Decimal: ...
    def reserve(self, order_id: str, items: dict[str, int]) -> bool: ...
    def release(self, order_id: str) -> None: ...


class PaymentGateway(Protocol):
    """External payment provider."""

    def charge(self, customer_id: str, amount: Decimal, idempotency_key: str) -> str: ...


@dataclass(frozen=True)
class OrderPlaced:
    order_id: str
    customer_id: str
    total: Decimal


class EventBus(Protocol):
    def publish(self, event: object) -> None: ...
```

### Repository — the module's own SQL

```python
# shop/orders/repository.py
from decimal import Decimal

import psycopg

SCHEMA = """
CREATE SCHEMA IF NOT EXISTS orders;
CREATE TABLE IF NOT EXISTS orders.orders (
    id              text PRIMARY KEY,
    customer_id     text NOT NULL,
    total           numeric(12, 2) NOT NULL CHECK (total >= 0),
    status          text NOT NULL,
    payment_id      text,
    idempotency_key text NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS orders.order_lines (
    order_id text NOT NULL REFERENCES orders.orders(id),
    sku      text NOT NULL,
    qty      integer NOT NULL CHECK (qty > 0),
    price    numeric(12, 2) NOT NULL,
    PRIMARY KEY (order_id, sku)
);
"""


class OrderRepository:
    def __init__(self, conn: psycopg.Connection) -> None:
        self.conn = conn

    def find_by_key(self, idempotency_key: str) -> dict | None:
        row = self.conn.execute(
            "SELECT id, status, total FROM orders.orders WHERE idempotency_key = %s",
            (idempotency_key,),
        ).fetchone()
        return None if row is None else {"id": row[0], "status": row[1], "total": row[2]}

    def add(self, order_id: str, customer_id: str, total: Decimal, key: str,
            lines: list[tuple[str, int, Decimal]]) -> None:
        self.conn.execute(
            "INSERT INTO orders.orders (id, customer_id, total, status, idempotency_key)"
            " VALUES (%s, %s, %s, 'pending', %s)",
            (order_id, customer_id, total, key),
        )
        with self.conn.cursor() as cur:
            cur.executemany(
                "INSERT INTO orders.order_lines (order_id, sku, qty, price) VALUES (%s, %s, %s, %s)",
                [(order_id, sku, qty, price) for sku, qty, price in lines],
            )

    def mark_paid(self, order_id: str, payment_id: str) -> None:
        self.conn.execute(
            "UPDATE orders.orders SET status = 'paid', payment_id = %s WHERE id = %s",
            (payment_id, order_id),
        )

    def mark_failed(self, order_id: str) -> None:
        self.conn.execute("UPDATE orders.orders SET status = 'failed' WHERE id = %s", (order_id,))

    def get(self, order_id: str) -> dict | None:
        row = self.conn.execute(
            "SELECT id, customer_id, total, status, payment_id FROM orders.orders WHERE id = %s",
            (order_id,),
        ).fetchone()
        if row is None:
            return None
        lines = self.conn.execute(
            "SELECT sku, qty, price FROM orders.order_lines WHERE order_id = %s ORDER BY sku",
            (order_id,),
        ).fetchall()
        return {
            "id": row[0], "customer_id": row[1], "total": row[2], "status": row[3],
            "payment_id": row[4], "lines": [{"sku": s, "qty": q, "price": p} for s, q, p in lines],
        }
```

### Handler — the coordination

```python
# shop/orders/service.py
import uuid
from dataclasses import dataclass
from decimal import Decimal

import psycopg

from shop.orders import pricing
from shop.orders.ports import EventBus, InventoryPort, OrderPlaced, PaymentGateway
from shop.orders.repository import OrderRepository


class OutOfStock(Exception):
    pass


class PaymentDeclined(Exception):
    pass


@dataclass(frozen=True)
class PlaceOrder:
    customer_id: str
    items: dict[str, int]
    idempotency_key: str
    coupon: str | None = None


class PlaceOrderHandler:
    def __init__(self, conn: psycopg.Connection, inventory: InventoryPort,
                 payments: PaymentGateway, events: EventBus) -> None:
        self.conn = conn
        self.orders = OrderRepository(conn)
        self.inventory = inventory
        self.payments = payments
        self.events = events

    def __call__(self, cmd: PlaceOrder) -> str:
        if not cmd.items or any(qty <= 0 for qty in cmd.items.values()):
            raise ValueError("items must have positive quantities")

        with self.conn.transaction():
            existing = self.orders.find_by_key(cmd.idempotency_key)
            if existing is not None:
                return existing["id"]                      # same request again: same order, no new charge

            lines = [(sku, qty, self.inventory.price_of(sku)) for sku, qty in sorted(cmd.items.items())]
            amount = pricing.total([(price, qty) for _, qty, price in lines], cmd.coupon)
            order_id = str(uuid.uuid4())
            self.orders.add(order_id, cmd.customer_id, amount, cmd.idempotency_key, lines)

        if not self.inventory.reserve(order_id, cmd.items):
            with self.conn.transaction():
                self.orders.mark_failed(order_id)
            raise OutOfStock(order_id)

        try:
            payment_id = self.payments.charge(cmd.customer_id, amount, idempotency_key=order_id)
        except PaymentDeclined:
            self.inventory.release(order_id)
            with self.conn.transaction():
                self.orders.mark_failed(order_id)
            raise

        with self.conn.transaction():
            self.orders.mark_paid(order_id, payment_id)
        self.events.publish(OrderPlaced(order_id, cmd.customer_id, amount))
        return order_id
```

- The order is stored as `pending` before any side effect, so a crash after the charge still leaves a row to reconcile.
- The order ID is the idempotency key for the payment provider: a retry of `charge` for the same order cannot charge twice.
- The handler creates `OrderRepository` itself. That is a common style — and it forces solitary unit tests to `patch()` the class, as shown below.

### Public API and HTTP routes

```python
# shop/orders/__init__.py
"""Public API of the orders module: other modules and the HTTP layer import only from here."""

from decimal import Decimal

import psycopg

from shop.orders.ports import EventBus, InventoryPort, OrderPlaced, PaymentGateway
from shop.orders.repository import SCHEMA, OrderRepository
from shop.orders.service import OutOfStock, PaymentDeclined, PlaceOrder, PlaceOrderHandler

__all__ = ["OrdersModule", "PlaceOrder", "OrderPlaced", "OutOfStock", "PaymentDeclined"]


class OrdersModule:
    def __init__(self, conn: psycopg.Connection, inventory: InventoryPort,
                 payments: PaymentGateway, events: EventBus) -> None:
        self._conn = conn
        self._place = PlaceOrderHandler(conn, inventory, payments, events)

    @staticmethod
    def migrate(conn: psycopg.Connection) -> None:
        conn.execute(SCHEMA)

    def place_order(self, cmd: PlaceOrder) -> str:
        return self._place(cmd)

    def get_order(self, order_id: str) -> dict | None:
        return OrderRepository(self._conn).get(order_id)

    def order_total(self, order_id: str) -> Decimal | None:
        order = self.get_order(order_id)
        return None if order is None else order["total"]
```

```python
# shop/orders/api.py
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

from shop.orders import OrdersModule, OutOfStock, PaymentDeclined, PlaceOrder

router = APIRouter(prefix="/orders")


class PlaceOrderIn(BaseModel):
    customer_id: str
    items: dict[str, int] = Field(min_length=1)
    coupon: str | None = None


def orders_module(request: Request) -> OrdersModule:
    return request.app.state.orders


@router.post("", status_code=201)
def place_order(body: PlaceOrderIn, idempotency_key: str = Header(),
                orders: OrdersModule = Depends(orders_module)) -> dict:
    try:
        order_id = orders.place_order(PlaceOrder(body.customer_id, body.items, idempotency_key, body.coupon))
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except OutOfStock as exc:
        raise HTTPException(409, "out of stock") from exc
    except PaymentDeclined as exc:
        raise HTTPException(402, "payment declined") from exc
    return {"id": order_id}


@router.get("/{order_id}")
def get_order(order_id: str, orders: OrdersModule = Depends(orders_module)) -> dict:
    order = orders.get_order(order_id)
    if order is None:
        raise HTTPException(404, "order not found")
    return {**order, "total": str(order["total"]),
            "lines": [{**line, "price": str(line["price"])} for line in order["lines"]]}
```

```python
# shop/app.py
from fastapi import FastAPI

from shop.orders import OrdersModule
from shop.orders.api import router


def create_app(orders: OrdersModule) -> FastAPI:
    app = FastAPI()
    app.state.orders = orders
    app.include_router(router)
    return app
```

## Unit Tests

### Pure logic — the best case for unit tests

```python
# tests/unit/test_pricing.py
from decimal import Decimal

import pytest

from shop.orders import pricing


@pytest.mark.parametrize(
    ("lines", "coupon", "expected"),
    [
        ([(Decimal("10.00"), 2)], None, Decimal("27.50")),           # 20 + 7.50 shipping
        ([(Decimal("50.00"), 2)], None, Decimal("100.00")),          # exactly the free-shipping line
        ([(Decimal("99.99"), 1)], None, Decimal("107.49")),          # one cent below it
        ([(Decimal("100.00"), 1)], "SAVE10", Decimal("97.50")),      # discount drops it below the line
        ([(Decimal("200.00"), 1)], "SAVE10", Decimal("180.00")),
        ([(Decimal("10.00"), 1)], "UNKNOWN", Decimal("17.50")),      # unknown coupon is ignored
    ],
)
def test_total(lines, coupon, expected):
    assert pricing.total(lines, coupon) == expected


def test_discount_rounds_to_cents():
    assert pricing.discount(Decimal("33.33"), "SAVE10") == Decimal("3.33")
```

Six inputs, the boundary of free shipping on both sides, rounding — all in one table, all in about a millisecond. No module test would try this many combinations, and none needs to.

### The handler with mocks — a solitary unit test

```python
# tests/unit/test_place_order_mocks.py
"""Solitary unit tests: every collaborator of PlaceOrderHandler is a mock."""

from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from shop.orders import OutOfStock, PaymentDeclined, PlaceOrder
from shop.orders.service import PlaceOrderHandler


@pytest.fixture
def repo():
    with patch("shop.orders.service.OrderRepository") as repo_cls:
        repo = repo_cls.return_value
        repo.find_by_key.return_value = None
        yield repo


@pytest.fixture
def deps():
    inventory, payments, events = MagicMock(), MagicMock(), MagicMock()
    inventory.price_of.return_value = Decimal("60.00")
    inventory.reserve.return_value = True
    payments.charge.return_value = "pay_1"
    return inventory, payments, events


def make_handler(deps):
    return PlaceOrderHandler(MagicMock(), *deps)


def test_paid_order_is_marked_paid_and_published(repo, deps):
    inventory, payments, events = deps
    order_id = make_handler(deps)(PlaceOrder("c1", {"sku-1": 2}, "key-1"))

    payments.charge.assert_called_once_with("c1", Decimal("120.00"), idempotency_key=order_id)
    repo.mark_paid.assert_called_once_with(order_id, "pay_1")
    events.publish.assert_called_once()


def test_out_of_stock_marks_order_failed(repo, deps):
    inventory, payments, _ = deps
    inventory.reserve.return_value = False

    with pytest.raises(OutOfStock):
        make_handler(deps)(PlaceOrder("c1", {"sku-1": 1}, "key-1"))

    repo.mark_failed.assert_called_once()
    payments.charge.assert_not_called()


def test_declined_payment_releases_stock(repo, deps):
    inventory, payments, _ = deps
    payments.charge.side_effect = PaymentDeclined("c1")

    with pytest.raises(PaymentDeclined):
        make_handler(deps)(PlaceOrder("c1", {"sku-1": 1}, "key-1"))

    inventory.release.assert_called_once()
    repo.mark_failed.assert_called_once()


def test_repeated_key_returns_existing_order(repo, deps):
    _, payments, _ = deps
    repo.find_by_key.return_value = {"id": "existing", "status": "paid", "total": Decimal("1")}

    assert make_handler(deps)(PlaceOrder("c1", {"sku-1": 1}, "key-1")) == "existing"
    payments.charge.assert_not_called()


@pytest.mark.parametrize("items", [{}, {"sku-1": 0}, {"sku-1": -1}])
def test_rejects_bad_quantities(repo, deps, items):
    with pytest.raises(ValueError):
        make_handler(deps)(PlaceOrder("c1", items, "key-1"))
```

These tests are fast and they do check the branching of the handler. Look at what they assert, though: `mark_paid` was called, `mark_failed` was called, `release` was called. They describe **how** the handler does its work. Nothing here runs SQL, opens a transaction or checks that the order can be read back. [Page 03](./03-what-each-test-catches.md) shows what that costs.

## Modular Integration Tests

### The fakes

```python
# tests/fakes.py
from decimal import Decimal

from shop.orders import PaymentDeclined


class FakeInventory:
    """In-memory stand-in for the inventory module. Kept honest by tests/contracts."""

    def __init__(self) -> None:
        self.prices: dict[str, Decimal] = {}
        self.stock: dict[str, int] = {}
        self.reservations: dict[str, dict[str, int]] = {}

    def add_product(self, sku: str, price: Decimal, stock: int) -> None:
        self.prices[sku] = price
        self.stock[sku] = stock

    def price_of(self, sku: str) -> Decimal:
        return self.prices[sku]                  # KeyError for an unknown SKU, like the real module

    def stock_of(self, sku: str) -> int:
        return self.stock[sku]

    def reserve(self, order_id: str, items: dict[str, int]) -> bool:
        if any(self.stock.get(sku, 0) < qty for sku, qty in items.items()):
            return False                         # all lines or none
        for sku, qty in items.items():
            self.stock[sku] -= qty
        self.reservations[order_id] = dict(items)
        return True

    def release(self, order_id: str) -> None:
        for sku, qty in self.reservations.pop(order_id, {}).items():
            self.stock[sku] += qty


class FakePayments:
    def __init__(self) -> None:
        self.charges: list[tuple[str, Decimal, str]] = []
        self.decline_next = False

    def charge(self, customer_id: str, amount: Decimal, idempotency_key: str) -> str:
        if self.decline_next:
            self.decline_next = False
            raise PaymentDeclined(customer_id)
        self.charges.append((customer_id, amount, idempotency_key))
        return f"pay_{len(self.charges)}"


class RecordingBus:
    def __init__(self) -> None:
        self.events: list[object] = []

    def publish(self, event: object) -> None:
        self.events.append(event)
```

`FakeInventory` behaves like the inventory module: it keeps stock, refuses a reservation it cannot fully meet and returns stock on release. Tests check its state (`stock_of("lamp") == 0`), not the calls made to it. The [contract tests](./03-what-each-test-catches.md#keeping-fakes-honest-contract-tests) make sure it keeps behaving like the real module.

### Fixtures

The database fixtures (`pg_url`, `db_url`, `conn`) are on [page 04](./04-database-isolation-ci.md). On top of them, the module fixtures build the real module with fake neighbours:

```python
# tests/module/conftest.py
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from shop.app import create_app
from shop.orders import OrdersModule
from tests.fakes import FakeInventory, FakePayments, RecordingBus


@pytest.fixture
def inventory():
    inventory = FakeInventory()
    inventory.add_product("book", Decimal("25.00"), stock=10)
    inventory.add_product("lamp", Decimal("60.00"), stock=1)
    return inventory


@pytest.fixture
def payments():
    return FakePayments()


@pytest.fixture
def bus():
    return RecordingBus()


@pytest.fixture
def orders(conn, inventory, payments, bus):
    """The real orders module on a real database; only its outside neighbours are fakes."""
    return OrdersModule(conn, inventory, payments, bus)


@pytest.fixture
def client(orders):
    with TestClient(create_app(orders)) as client:
        yield client
```

### Through the Python API

```python
# tests/module/test_place_order.py
"""Modular integration tests: the orders module through its public API, real PostgreSQL."""

from decimal import Decimal

import pytest

from shop.orders import OrderPlaced, OutOfStock, PaymentDeclined, PlaceOrder

pytestmark = pytest.mark.module


def test_paid_order_is_stored_charged_and_published(orders, inventory, payments, bus):
    order_id = orders.place_order(PlaceOrder("c1", {"book": 2, "lamp": 1}, "key-1"))

    order = orders.get_order(order_id)
    assert order["status"] == "paid"
    assert order["total"] == Decimal("110.00")                    # 50 + 60, free shipping
    assert [(line["sku"], line["qty"]) for line in order["lines"]] == [("book", 2), ("lamp", 1)]
    assert payments.charges == [("c1", Decimal("110.00"), order_id)]
    assert bus.events == [OrderPlaced(order_id, "c1", Decimal("110.00"))]
    assert inventory.stock_of("lamp") == 0


def test_same_idempotency_key_charges_once(orders, payments):
    first = orders.place_order(PlaceOrder("c1", {"book": 1}, "key-1"))
    second = orders.place_order(PlaceOrder("c1", {"book": 1}, "key-1"))

    assert first == second
    assert len(payments.charges) == 1


def test_out_of_stock_keeps_a_failed_order_and_charges_nothing(orders, payments, conn):
    with pytest.raises(OutOfStock) as exc:
        orders.place_order(PlaceOrder("c1", {"lamp": 2}, "key-1"))

    assert orders.get_order(str(exc.value))["status"] == "failed"
    assert payments.charges == []


def test_declined_payment_returns_stock(orders, inventory, payments, bus):
    payments.decline_next = True

    with pytest.raises(PaymentDeclined):
        orders.place_order(PlaceOrder("c1", {"lamp": 1}, "key-1"))

    assert inventory.stock_of("lamp") == 1
    assert bus.events == []


def test_coupon_and_shipping_are_applied_to_the_stored_total(orders):
    order_id = orders.place_order(PlaceOrder("c1", {"book": 4}, "key-1", coupon="SAVE10"))

    assert orders.order_total(order_id) == Decimal("97.50")      # 100 - 10 + 7.50 shipping
```

Each test describes a **scenario** in business words and checks **outcomes**: the stored order and its lines, the charge the provider received, the event, the stock left. None of them knows that `OrderRepository`, `mark_paid` or `PlaceOrderHandler` exist.

### Through HTTP

```python
# tests/module/test_orders_http.py
"""The same module through its HTTP entry point: routing, validation, status codes, JSON."""

import pytest

pytestmark = pytest.mark.module


def test_place_and_read_order(client):
    created = client.post(
        "/orders",
        json={"customer_id": "c1", "items": {"book": 2}},
        headers={"Idempotency-Key": "key-1"},
    )
    assert created.status_code == 201

    order = client.get(f"/orders/{created.json()['id']}").json()
    assert order["status"] == "paid"
    assert order["total"] == "57.50"
    assert order["lines"] == [{"sku": "book", "qty": 2, "price": "25.00"}]


@pytest.mark.parametrize(
    ("body", "headers", "status"),
    [
        ({"customer_id": "c1", "items": {"lamp": 5}}, {"Idempotency-Key": "k"}, 409),
        ({"customer_id": "c1", "items": {"book": 0}}, {"Idempotency-Key": "k"}, 422),
        ({"customer_id": "c1", "items": {}}, {"Idempotency-Key": "k"}, 422),
        ({"customer_id": "c1", "items": {"book": 1}}, {}, 422),          # header missing
    ],
)
def test_errors_map_to_status_codes(client, body, headers, status):
    assert client.post("/orders", json=body, headers=headers).status_code == status


def test_unknown_order_is_404(client):
    assert client.get("/orders/nope").status_code == 404
```

The HTTP tests add what the Python API tests cannot see: routing, request validation by Pydantic, the header, the mapping of domain errors to status codes and the JSON shape (decimals as strings). `TestClient` runs the app in-process — no server, no port.

!!! tip "Which entry point?"
    If HTTP is the only way in, enter through HTTP. If the module has a Python facade that other modules call **and** routes, test the scenarios through the facade and keep a small HTTP file for routing, validation and error mapping — as here.

## Running Them

```bash
uv run pytest tests/unit                 # 14 passed in 0.02s — no Docker needed
uv run pytest -m module                  # 21 passed in ~4s — starts PostgreSQL once
uv run pytest -n 4                       # everything, 4 workers, a database each
```

---
## See also
- [Modular Integration Testing vs Unit Testing](./index.md)
- [Modular Integration vs Unit — Concepts & Boundaries](./01-concepts-boundaries.md)
- [Modular Integration vs Unit — What Each Test Catches](./03-what-each-test-catches.md)
- [FastAPI — Testing](../../libs/fastapi/05-testing.md)
- [Pytest — Advanced Patterns](../../libs/pytest/01-core-guides/02-advanced-patterns.md)
