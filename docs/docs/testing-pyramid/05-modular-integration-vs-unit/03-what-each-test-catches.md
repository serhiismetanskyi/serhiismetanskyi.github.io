---
date: 2026-10-07
tags:
  - testing
  - test-strategy
  - unit-testing
  - integration-testing
  - pytest
---

# Modular Integration vs Unit — What Each Test Catches

Arguments about test levels usually stay abstract. This page makes them concrete: six changes were applied, one at a time, to the code from [page 02](./02-one-feature-both-ways.md), and both suites were run against each change. Five of the changes are bugs, one is a refactor that keeps behaviour the same.

## The Results

| # | Change | Unit suite (14 tests) | Modular suite (21 tests) | Who is right |
|---|--------|-----------------------|--------------------------|--------------|
| 1 | **Refactor**: `mark_paid` / `mark_failed` → one `set_status(order_id, status, payment_id=None)` | **3 failed** | 21 passed | Modular — behaviour did not change |
| 2 | **Bug**: price and quantity swapped in the order lines | 14 passed | **2 failed** | Modular |
| 3 | **Bug**: column name typo in `mark_paid` (`paymentid`) | 14 passed | **4 failed** | Modular |
| 4 | **Bug**: free shipping from `> 100` instead of `>= 100` | **1 failed** | 21 passed | Unit |
| 5 | **Bug**: out of stock answered with `400` instead of `409` | 14 passed | **1 failed** | Modular (HTTP test) |
| 6 | **Bug in a test double**: `FakeInventory` reserves line by line, keeping a partial reservation | 14 passed | **1 failed** | Contract test |

Neither suite caught everything. Each caught what the other could not.

## 1. The Refactor: Unit Tests Fail, Nothing Is Broken

The repository's two status methods were merged into one:

```python
def set_status(self, order_id: str, status: str, payment_id: str | None = None) -> None:
    self.conn.execute(
        "UPDATE orders.orders SET status = %s, payment_id = coalesce(%s, payment_id) WHERE id = %s",
        (status, payment_id, order_id),
    )
```

and the handler now calls `self.orders.set_status(order_id, "paid", payment_id)`. Orders behave exactly as before.

```text
FAILED tests/unit/test_place_order_mocks.py::test_paid_order_is_marked_paid_and_published
FAILED tests/unit/test_place_order_mocks.py::test_out_of_stock_marks_order_failed
FAILED tests/unit/test_place_order_mocks.py::test_declined_payment_releases_stock
```

The mocked repository accepted `set_status` silently (a `MagicMock` accepts any method), and the assertions on `mark_paid` / `mark_failed` failed. These are **false alarms**: the developer now has to rewrite three tests for a change that broke nothing. After enough of these, people stop refactoring — or stop trusting red tests.

The modular tests did not notice the refactor at all: they read the order back and check `status == "paid"`.

## 2. Swapped Fields: Mocks Accept Anything

The handler built lines as `(sku, price, qty)` while the repository expects `(sku, qty, price)`. The total was still right — `price * qty == qty * price` — so the charge was right, and the mocked repository happily accepted the wrong tuple. All 14 unit tests passed.

PostgreSQL stored quantity `25` and price `2.00` for two books, and the modular tests that read the lines back failed:

```text
FAILED tests/module/test_orders_http.py::test_place_and_read_order
E   At index 0 diff: {'sku': 'book', 'qty': 25, 'price': '2.00'} != {'sku': 'book', 'qty': 2, 'price': '25.00'}
FAILED tests/module/test_place_order.py::test_paid_order_is_stored_charged_and_published
E   AssertionError: assert [('book', 25), ('lamp', 60)] == [('book', 2), ('lamp', 1)]
```

Bugs at the seam between two of your own classes are invisible to tests that replace one of the two.

## 3. Wrong SQL: Only the Database Knows

```text
E   psycopg.errors.UndefinedColumn: column "paymentid" of relation "orders" does not exist
```

Four modular tests failed — every scenario that reaches a successful payment. No unit test runs SQL, so all of them passed. The same applies to a wrong `JOIN`, a missing `WHERE`, a type mismatch, a constraint violation, a forgotten transaction or a migration that was not applied: **SQL is code, and only a database can execute it**.

## 4. The Boundary: Only the Unit Test Looked There

```python
shipping = Decimal("0") if goods > FREE_SHIPPING_FROM else SHIPPING   # was >=
```

```text
FAILED tests/unit/test_pricing.py::test_total[lines1-None-expected1]      # exactly 100.00
```

The modular scenarios use totals of 110.00, 57.50 and 97.50 — none of them sits exactly on 100.00, so the bug passed through. Could a modular test check the boundary? Yes, but each case costs a database round trip and a full scenario to read. Parametrized unit tests check six cases in a millisecond. **Edges, rounding and combinations belong in unit tests.**

## 5. The HTTP Mapping: Only a Test Through HTTP Sees It

```text
FAILED tests/module/test_orders_http.py::test_errors_map_to_status_codes[body0-headers0-409]
```

The domain logic was right, the route mapped `OutOfStock` to the wrong status. Python-API tests cannot see this; neither can unit tests of the handler. A client that retries on `409` but not on `400` would break in production.

## 6. A Fake That Drifted

A fake is code, and code has bugs. Here `FakeInventory.reserve` was changed to reserve line by line and return `False` on the first line that does not fit — leaving the earlier lines reserved. The real `InventoryModule` reserves all lines or none in one transaction.

Unit tests and order scenarios still passed: they trust the fake. One test failed — a contract test:

```text
        assert inventory.reserve("o1", {"book": 1, "lamp": 2}) is False
>       assert (inventory.stock_of("book"), inventory.stock_of("lamp")) == (3, 1)
E       assert (2, 1) == (3, 1)
FAILED tests/contracts/test_inventory_contract.py::test_reserve_takes_all_lines_or_none[fake]
```

## Keeping Fakes Honest: Contract Tests

A modular integration test is only as true as the fakes at its border. A **contract test** is one set of tests that runs against both the fake and the real implementation; if the fake drifts, the fake's run fails.

```python
# tests/contracts/test_inventory_contract.py
"""One set of tests for the real inventory module and for the fake the orders tests use.
If the fake drifts from the real module, these tests fail for the fake."""

from decimal import Decimal

import pytest

from shop.inventory import InventoryModule
from tests.fakes import FakeInventory

pytestmark = pytest.mark.module


@pytest.fixture(params=["fake", "real"])
def inventory(request):
    if request.param == "fake":
        inventory = FakeInventory()
    else:
        inventory = InventoryModule(request.getfixturevalue("conn"))
    inventory.add_product("book", Decimal("25.00"), stock=3)
    inventory.add_product("lamp", Decimal("60.00"), stock=1)
    return inventory


def test_price_of_known_sku(inventory):
    assert inventory.price_of("book") == Decimal("25.00")


def test_price_of_unknown_sku_raises_key_error(inventory):
    with pytest.raises(KeyError):
        inventory.price_of("nope")


def test_reserve_takes_all_lines_or_none(inventory):
    assert inventory.reserve("o1", {"book": 1, "lamp": 2}) is False
    assert (inventory.stock_of("book"), inventory.stock_of("lamp")) == (3, 1)


def test_release_returns_reserved_stock(inventory):
    assert inventory.reserve("o1", {"book": 2}) is True
    inventory.release("o1")
    assert inventory.stock_of("book") == 3


def test_release_of_unknown_order_is_a_no_op(inventory):
    inventory.release("never-reserved")
    assert inventory.stock_of("book") == 3
```

The real module, for reference:

```python
# shop/inventory/__init__.py
"""The inventory module: owns stock and prices. Its own schema, its own public API."""

from decimal import Decimal

import psycopg

SCHEMA = """
CREATE SCHEMA IF NOT EXISTS inventory;
CREATE TABLE IF NOT EXISTS inventory.products (
    sku   text PRIMARY KEY,
    price numeric(12, 2) NOT NULL,
    stock integer NOT NULL CHECK (stock >= 0)
);
CREATE TABLE IF NOT EXISTS inventory.reservations (
    order_id text NOT NULL,
    sku      text NOT NULL REFERENCES inventory.products(sku),
    qty      integer NOT NULL,
    PRIMARY KEY (order_id, sku)
);
"""


class UnknownSku(KeyError):
    pass


class InventoryModule:
    def __init__(self, conn: psycopg.Connection) -> None:
        self.conn = conn

    @staticmethod
    def migrate(conn: psycopg.Connection) -> None:
        conn.execute(SCHEMA)

    def add_product(self, sku: str, price: Decimal, stock: int) -> None:
        with self.conn.transaction():
            self.conn.execute("INSERT INTO inventory.products VALUES (%s, %s, %s)", (sku, price, stock))

    def price_of(self, sku: str) -> Decimal:
        row = self.conn.execute("SELECT price FROM inventory.products WHERE sku = %s", (sku,)).fetchone()
        if row is None:
            raise UnknownSku(sku)
        return row[0]

    def stock_of(self, sku: str) -> int:
        return self.conn.execute("SELECT stock FROM inventory.products WHERE sku = %s", (sku,)).fetchone()[0]

    def reserve(self, order_id: str, items: dict[str, int]) -> bool:
        try:
            with self.conn.transaction():                  # all lines or none
                for sku, qty in sorted(items.items()):
                    updated = self.conn.execute(
                        "UPDATE inventory.products SET stock = stock - %s WHERE sku = %s AND stock >= %s",
                        (qty, sku, qty),
                    ).rowcount
                    if updated == 0:
                        raise _NotEnough(sku)
                    self.conn.execute("INSERT INTO inventory.reservations VALUES (%s, %s, %s)", (order_id, sku, qty))
        except _NotEnough:
            return False
        return True

    def release(self, order_id: str) -> None:
        with self.conn.transaction():
            rows = self.conn.execute(
                "DELETE FROM inventory.reservations WHERE order_id = %s RETURNING sku, qty", (order_id,)
            ).fetchall()
            for sku, qty in rows:
                self.conn.execute("UPDATE inventory.products SET stock = stock + %s WHERE sku = %s", (qty, sku))


class _NotEnough(Exception):
    pass
```

- Write contract tests for the **behaviour the consumer relies on** — here: prices, unknown SKUs, all-or-nothing reservation, release — not for every feature of the neighbour.
- The real side runs on the real database, so contract tests are modular integration tests of the **neighbour** module. They usually live with the neighbour's code; the fake lives next to them.
- For an external service (payment provider, LLM API), the "real" side is the provider's sandbox or a recorded session, run on a schedule rather than on every commit. For HTTP services owned by other teams, consumer-driven contracts (Pact) do the same job across repositories.

## Speed

Measured on the example suite (Python 3.13, PostgreSQL 18 in Docker, one laptop):

| | Per test | Fixed cost | 14 / 21 tests |
|---|---|---|---|
| Unit | ~1 ms | none | 0.02 s |
| Modular integration | 15–35 ms with `TRUNCATE` after each test, 15–20 ms with a rolled-back transaction | ~3.3 s once per session to start PostgreSQL | ~4 s |
| Modular, `-n 4` | same | a container (or a database on a shared server) per worker | ~10 s for the whole suite — on a suite this small, workers cost more than they save |

The modular tests are 10–30 times slower per test. In absolute numbers, a few hundred of them still fit in well under a minute, which is fast enough for every commit. What makes integration suites slow in practice is starting a container per test, sleeping instead of waiting, and creating the schema per test — see [page 04](./04-database-isolation-ci.md).

## What Each Suite Is Good At

| Defect | Unit | Modular integration |
|--------|:----:|:-------------------:|
| Calculation, rounding, boundary | Yes | rarely |
| Many input combinations | Yes | too expensive |
| Branching of a rule (`if` / `else` paths) | Yes | Yes, main paths |
| SQL errors, constraints, types | No | Yes |
| Transactions, idempotency in the database | No | Yes |
| Wiring between the module's own classes | No (with mocks) | Yes |
| Routing, validation, status codes, JSON | No | Yes (through HTTP) |
| Wrong assumption about a neighbour | No | Yes, with contract tests |
| Refactoring without behaviour change | false alarms (with mocks) | stays green |
| Pinpointing the broken line | Yes | the traceback names the layer |

---
## See also
- [Modular Integration Testing vs Unit Testing](./index.md)
- [Modular Integration vs Unit — One Feature, Both Ways](./02-one-feature-both-ways.md)
- [Modular Integration vs Unit — Database, Isolation & CI](./04-database-isolation-ci.md)
- [Unit Tests — Common Mistakes](../01-unit-tests/02-common-mistakes.md)
- [Integration Tests — Common Mistakes](../02-integration-tests/02-common-mistakes.md)
