---
date: 2026-10-25
slug: the-testing-pyramid-everybody-knows-it-nobody-follows-it
description: "The testing pyramid with pytest and Playwright: unit, modular integration, API and E2E tests, the typical mistakes at each level and when the pyramid does not fit."
authors:
  - username
categories:
  - QA
tags:
  - qa
  - testing
  - testing-pyramid
  - test-automation
image: img/blog/the-testing-pyramid-everybody-knows-it-nobody-follows-it.png
---

# The Testing Pyramid: Everybody Knows It, Nobody Follows It

Every QA engineer has heard about the testing pyramid. It comes up when a candidate draws it on a whiteboard during an interview and everyone nods. It comes up when the team lead opens a retro with "we need to rethink our test strategy" after a production incident. It comes up when someone pastes a Martin Fowler link in the architecture channel and nobody replies. Three layers. Unit tests at the bottom, integration in the middle, E2E on top. Simple picture. And yet, somehow, most projects end up with the exact opposite — a handful of random unit tests, no integration tests, and a massive Playwright suite that takes 40 minutes and fails on every second run.

<!-- more -->

The pyramid isn't new. Mike Cohn described it back in 2009 in "Succeeding with Agile." Since then, frontend frameworks appeared, microservices took over, AI agents started writing code and making decisions — and people are still arguing about whether the pyramid even makes sense anymore. It does. Every project is different, but the idea stays the same: unit tests are fast and cheap to run, so write a lot of them. E2E tests are slow and flaky, so keep only the ones that really matter. The teams that ignore it keep wondering why their CI takes an hour and nobody trusts the results.

And now there's AI-generated code making it worse. Copilot writes a function, the developer accepts it, and nobody thinks about what tests should cover it — or at what level. The code appears faster than ever, but the test strategy stays at zero. AI doesn't plan your test pyramid. It generates code that looks right until production proves otherwise. If anything, the speed of AI-assisted development makes the pyramid more important — because the more code ships without thinking, the more bugs slip through without anyone noticing until Friday evening.

With that in mind, let's walk through each level — what it actually looks like in pytest and Playwright, why it matters, and the mistakes that keep showing up on every project regardless of how senior the team is.

## Unit Tests — The Foundation Nobody Respects

Unit tests check isolated pieces of logic. One function, one method, one class. No database, no API calls, no browser. Just code calling code and checking the result. They run in milliseconds, and a project should have thousands of them.

The point is fast feedback. A developer changes the password validation logic, runs the tests, sees a failure in 2 seconds. Not after deploy. Not after QA manually clicks through the registration form. Right there, in the terminal.

But writing unit tests alone isn't enough. Without coverage tracking (`coverage`), linting (`ruff`), and type checking (`mypy`) — the suite quietly rots. Someone merges untested code, nobody notices, and three months later half the codebase has zero coverage. Enforcing these standards in CI is what keeps unit tests meaningful instead of decorative.

```python
import pytest


def validate_password(password: str) -> list[str]:
    errors = []
    if len(password) < 8:
        errors.append("at least 8 characters")
    if not any(char.isupper() for char in password):
        errors.append("one uppercase letter")
    if not any(char.isdigit() for char in password):
        errors.append("one digit")
    if not any(char in "!@#$%^&*" for char in password):
        errors.append("one special character")
    return errors


@pytest.mark.unit
class TestValidatePassword:
    def test_valid_password(self):
        assert validate_password("Str0ng!Pass") == []

    def test_too_short(self):
        assert "at least 8 characters" in validate_password("Ab1!")

    def test_no_uppercase(self):
        assert "one uppercase letter" in validate_password("weak1!pass")

    def test_no_digit(self):
        assert "one digit" in validate_password("NoDigits!Here")

    def test_no_special_char(self):
        assert "one special character" in validate_password("NoSpecial1")

    def test_empty_string_returns_all_errors(self):
        assert len(validate_password("")) == 4
```

Six tests, runs in under a second. Covers the valid case, each rule separately, and the worst-case input. That's the whole idea — quick, focused, and they break the moment someone touches the validation logic.

## Unit Test Mistakes — The Classics

First classic: the test that doesn't actually test anything. Someone calls the function, doesn't assert the return value, and the test is green — not because the logic is correct, but because nobody checked. This is especially dangerous with functions that return numbers. Wrong shipping cost goes to production, customers are overcharged, support gets tickets.

```python
import pytest


def calculate_shipping(weight_kg: float, express: bool) -> float:
    if weight_kg <= 0:
        raise ValueError("Weight must be positive")
    base = 5.0 + weight_kg * 2.0
    if express:
        base *= 1.5
    return round(base, 2)


@pytest.mark.unit
class TestShippingBad:
    """Bad: calls the function but never checks the result."""

    def test_standard_shipping(self):
        calculate_shipping(3.0, express=False)

    def test_express_shipping(self):
        calculate_shipping(3.0, express=True)
```

Both tests pass even if someone changes the formula and express now costs 10x. The function ran, it didn't crash — and the test said "all good." In production, customers see $165 instead of $16.50 on checkout.

```python
@pytest.mark.unit
class TestShippingGood:
    """Good: every test checks the actual number."""

    def test_standard_shipping(self):
        assert calculate_shipping(3.0, express=False) == 11.0

    def test_express_shipping(self):
        assert calculate_shipping(3.0, express=True) == 16.5

    def test_minimum_weight(self):
        assert calculate_shipping(0.1, express=False) == 5.2

    def test_zero_weight_raises(self):
        with pytest.raises(ValueError, match="Weight must be positive"):
            calculate_shipping(0, express=False)
```

Second classic: not isolating dependencies. A "unit" test that hits a real database or calls a live API is not a unit test. It's an integration test in disguise. It passes locally because the developer has Postgres running, then fails on CI where the container isn't there. Mock external dependencies at the unit level. That's what mocks are for.

## Integration Tests — The Middle Child

Integration tests check how components work together. The function talks to a database, or an API endpoint processes a request and returns JSON, or a service calls another service. The pieces are real — no mocks for the parts being integrated.

Most people think Playwright is only for browser automation. It also ships with `APIRequestContext` — a built-in HTTP client designed for API testing. No extra libraries needed. The test sends real requests to a running service, validates status codes and response bodies, and shares the same fixture infrastructure as E2E tests. One toolchain, two levels of the pyramid. The test sends a real HTTP request to a running service and checks what comes back — just like any client would. If something breaks between layers, you'll know.

```python
import pytest
from playwright.sync_api import Playwright, APIRequestContext


@pytest.fixture(scope="session")
def api_context(playwright: Playwright) -> APIRequestContext:
    context = playwright.request.new_context(
        base_url="http://localhost:8000",
    )
    yield context
    context.dispose()


@pytest.fixture(autouse=True)
def clean_tasks(api_context: APIRequestContext):
    api_context.delete("/tasks")
    yield
    api_context.delete("/tasks")


@pytest.mark.integration
class TestTasksAPI:
    def test_new_task_starts_with_open_status(self, api_context: APIRequestContext):
        response = api_context.post("/tasks", data={
            "title": "Checkout timeout on Safari",
            "assignee": "alice",
        })
        assert response.status == 201
        body = response.json()
        assert body["status"] == "open"
        assert body["assignee"] == "alice"

    def test_move_task_to_in_progress(self, api_context: APIRequestContext):
        create_response = api_context.post(
            "/tasks", data={"title": "Add rate limiting to /api/auth"},
        )
        task_id = create_response.json()["id"]
        update_response = api_context.patch(
            f"/tasks/{task_id}", data={"status": "in_progress"},
        )
        assert update_response.json()["status"] == "in_progress"
        assert update_response.json()["title"] == "Add rate limiting to /api/auth"

    @pytest.mark.parametrize("task_id, expected_status", [
        ("task_999", 404),
        ("nonexistent", 404),
        ("", 404),
    ])
    def test_get_invalid_task_returns_404(
        self, api_context: APIRequestContext, task_id: str, expected_status: int,
    ):
        response = api_context.get(f"/tasks/{task_id}")
        assert response.status == expected_status

    def test_unassigned_task_has_null_assignee(self, api_context: APIRequestContext):
        response = api_context.post(
            "/tasks", data={"title": "Investigate flaky test in CI"},
        )
        assert response.status == 201
        assert response.json()["assignee"] is None
```

Real HTTP requests to a real running service. If someone changes the endpoint path, renames a field in the response, or breaks the status logic — the test catches it. Not as fast as unit tests, but still runs in seconds. And since it's the same Playwright that runs E2E tests, there's no extra dependency to install.

## Integration Test Mistakes — The Painful Ones

Mistake number one: shared state between tests. One test creates data, another test assumes it's there. Works on a local machine, fails on CI, fails when tests run in a different order. The fix is simple — clean up before and after each test. The `clean_tasks` fixture above does exactly that.

```python
import pytest
from playwright.sync_api import Playwright, APIRequestContext


@pytest.fixture(scope="session")
def api_context(playwright: Playwright) -> APIRequestContext:
    context = playwright.request.new_context(
        base_url="http://localhost:8000",
    )
    yield context
    context.dispose()


@pytest.mark.integration
class TestSharedStateBad:
    """Bad: second test depends on data from the first."""

    def test_add_note(self, api_context: APIRequestContext):
        response = api_context.post(
            "/notes",
            data={"author": "alice", "text": "Reproduced on staging"},
        )
        assert response.status == 201

    def test_list_includes_alice_note(self, api_context: APIRequestContext):
        # Only passes if test_add_note ran first
        response = api_context.get("/notes")
        notes = response.json()
        assert any(note["author"] == "alice" for note in notes)


@pytest.mark.integration
class TestSharedStateGood:
    """Good: each test creates its own data."""

    @pytest.fixture(autouse=True)
    def clean_notes(self, api_context: APIRequestContext):
        api_context.delete("/notes")
        yield
        api_context.delete("/notes")

    def test_add_and_list_note(self, api_context: APIRequestContext):
        api_context.post(
            "/notes",
            data={"author": "bob", "text": "Fixed in commit a1b2c3"},
        )
        response = api_context.get("/notes")
        assert len(response.json()) == 1
        assert response.json()[0]["author"] == "bob"

    def test_empty_list_when_no_notes(self, api_context: APIRequestContext):
        response = api_context.get("/notes")
        assert response.json() == []
```

The "bad" class works only if tests run in a specific order. Add `pytest-randomly` and it breaks on the first shuffle. The "good" class doesn't care — each test creates what it needs and cleans up via the API after.

Another painful one: mocking too much in integration tests. The whole point of an integration test is to verify real interactions. If someone mocks the database, the HTTP layer, and the serializer — what's left? A unit test in a trench coat. If you want to mock, do it at the unit level. At the integration level, let the components actually talk to each other.

## Modular Integration Tests — The Level Nobody Names

Unit tests take one function. The API tests above take a running service. There's a level in between that most teams either don't have or call by five different names — component test, module test, service test. Here it's a modular integration test: take one module of the app, call it the way the rest of the code calls it, and let everything inside it be real.

Picture an `orders` module in a shop. Placing an order means pricing it, storing it in PostgreSQL, reserving stock in the `inventory` module, charging a payment provider, and publishing an event. A modular integration test calls `OrdersModule.place_order()` — the public API, the same door other modules use. The handler, the pricing, the repository, the SQL, the database — all real. Only the neighbours get replaced: inventory, payments, and the event bus become fakes.

That's not the same thing as the second unit test classic above. There, a test hit a database by accident. Here, the database is the point. It's the module's own data, and its SQL is code that has to run somewhere before production.

First, how most teams test that handler — a solitary unit test where everything around it is a mock:

```python
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from shop.orders import PlaceOrder
from shop.orders.service import PlaceOrderHandler


@pytest.fixture
def repo():
    with patch("shop.orders.service.OrderRepository") as repo_cls:
        repo = repo_cls.return_value
        repo.find_by_key.return_value = None
        yield repo


@pytest.mark.unit
class TestPlaceOrderMocked:
    """Every collaborator of the handler is a mock."""

    def test_paid_order_is_marked_paid(self, repo):
        inventory, payments, events = MagicMock(), MagicMock(), MagicMock()
        inventory.price_of.return_value = Decimal("60.00")
        inventory.reserve.return_value = True
        payments.charge.return_value = "pay_1"
        handler = PlaceOrderHandler(MagicMock(), inventory, payments, events)
        order_id = handler(PlaceOrder("c1", {"sku-1": 2}, "key-1"))
        payments.charge.assert_called_once_with(
            "c1", Decimal("120.00"), idempotency_key=order_id,
        )
        repo.mark_paid.assert_called_once_with(order_id, "pay_1")
        events.publish.assert_called_once()
```

Fast, and it does check the branching. But look at what it asserts: `mark_paid` was called, `publish` was called. It describes how the handler works, not what happened. No SQL runs. Nothing gets read back.

Now the same feature, tested as a module. The neighbours become fakes — small working implementations instead of call recorders:

```python
from decimal import Decimal

from shop.orders import PaymentDeclined


class FakeInventory:
    """In-memory stand-in for the inventory module."""

    def __init__(self) -> None:
        self.prices: dict[str, Decimal] = {}
        self.stock: dict[str, int] = {}
        self.reservations: dict[str, dict[str, int]] = {}

    def add_product(self, sku: str, price: Decimal, stock: int) -> None:
        self.prices[sku] = price
        self.stock[sku] = stock

    def price_of(self, sku: str) -> Decimal:
        return self.prices[sku]

    def stock_of(self, sku: str) -> int:
        return self.stock[sku]

    def reserve(self, order_id: str, items: dict[str, int]) -> bool:
        if any(self.stock.get(sku, 0) < qty for sku, qty in items.items()):
            return False  # all lines or none
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

`FakeInventory` keeps stock, refuses a reservation it can't fully cover, and gives stock back on release. Tests check its state — `stock_of("lamp") == 0` — not the calls made to it. A mock gets configured again in every test, and every configuration is a guess about how the real thing behaves. A fake is written once.

The database is a real PostgreSQL in Docker through Testcontainers. One container per session, tables cleaned after each test:

```python
from decimal import Decimal

import psycopg
import pytest
from testcontainers.community.postgres import PostgresContainer

from shop.inventory import InventoryModule
from shop.orders import OrdersModule
from tests.fakes import FakeInventory, FakePayments, RecordingBus


@pytest.fixture(scope="session")
def db_url():
    with PostgresContainer("postgres:18-alpine", driver=None) as pg:
        url = pg.get_connection_url()
        with psycopg.connect(url, autocommit=True) as conn:
            OrdersModule.migrate(conn)
            InventoryModule.migrate(conn)
        yield url


@pytest.fixture
def conn(db_url):
    with psycopg.connect(db_url, autocommit=True) as conn:
        yield conn
        conn.execute(
            "TRUNCATE orders.order_lines, orders.orders, "
            "inventory.reservations, inventory.products"
        )


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
    """The real orders module on a real database. Only the neighbours are fakes."""
    return OrdersModule(conn, inventory, payments, bus)
```

The schema comes from the module's own migration code — the same code production runs. So the tests also check that migrations apply to an empty database. And the tests themselves:

```python
from decimal import Decimal

import pytest

from shop.orders import OrderPlaced, OutOfStock, PaymentDeclined, PlaceOrder


@pytest.mark.module
class TestPlaceOrder:
    def test_paid_order_is_stored_charged_and_published(
        self, orders, inventory, payments, bus,
    ):
        order_id = orders.place_order(PlaceOrder("c1", {"book": 2, "lamp": 1}, "key-1"))
        order = orders.get_order(order_id)
        assert order["status"] == "paid"
        assert order["total"] == Decimal("110.00")  # 50 + 60, free shipping
        assert [(line["sku"], line["qty"]) for line in order["lines"]] == [
            ("book", 2), ("lamp", 1),
        ]
        assert payments.charges == [("c1", Decimal("110.00"), order_id)]
        assert bus.events == [OrderPlaced(order_id, "c1", Decimal("110.00"))]
        assert inventory.stock_of("lamp") == 0

    def test_same_idempotency_key_charges_once(self, orders, payments):
        first = orders.place_order(PlaceOrder("c1", {"book": 1}, "key-1"))
        second = orders.place_order(PlaceOrder("c1", {"book": 1}, "key-1"))
        assert first == second
        assert len(payments.charges) == 1

    def test_out_of_stock_keeps_failed_order_and_charges_nothing(self, orders, payments):
        with pytest.raises(OutOfStock) as exc:
            orders.place_order(PlaceOrder("c1", {"lamp": 2}, "key-1"))
        assert orders.get_order(str(exc.value))["status"] == "failed"
        assert payments.charges == []

    def test_declined_payment_returns_stock(self, orders, inventory, payments, bus):
        payments.decline_next = True
        with pytest.raises(PaymentDeclined):
            orders.place_order(PlaceOrder("c1", {"lamp": 1}, "key-1"))
        assert inventory.stock_of("lamp") == 1
        assert bus.events == []
```

None of these tests knows that `OrderRepository`, `mark_paid`, or `PlaceOrderHandler` exist. Each one describes a scenario in business words and checks outcomes: the stored order and its lines, what the payment provider received, the event, the stock left. Rename half the classes inside the module — the tests won't notice.

The module also gets a small file of tests through HTTP. FastAPI's `TestClient` runs the app in-process — no server, no port — and those tests check what the Python API can't see: routing, request validation, and which status code each error turns into.

The obvious question is cost. A modular test takes 15–35 ms against a real database, plus about 3 seconds once to start the container. A unit test takes about a millisecond. So yes, 10 to 30 times slower per test — and a few hundred of them still finish in well under a minute. Fast enough for every commit.

## Unit vs Modular — Who Catches What

Arguing about test levels in the abstract goes nowhere, so we ran an experiment. The orders example had 14 unit tests and 21 modular integration and contract tests. We broke the code in six different ways, one at a time, and ran both suites against each change.

First, a refactor. Two repository methods, `mark_paid` and `mark_failed`, were merged into one `set_status()`. Orders behaved exactly as before. Three unit tests went red — they were asserting calls to methods that no longer existed. Every modular test stayed green: they read the order back and check that the status is `paid`. Three false alarms for a change that broke nothing. After enough of these, people stop refactoring — or stop trusting red tests.

Then price and quantity got swapped in the order lines. The total was still right — `price * qty` equals `qty * price` — so the charge was right too, and the mocked repository took the wrong tuple without blinking. All 14 unit tests passed. PostgreSQL stored 25 books at $2.00 instead of 2 books at $25.00, and two modular tests failed the moment they read the lines back.

A typo in a column name — `paymentid` instead of `payment_id`. Unit tests: green, none of them runs SQL. Modular tests: four failed with `UndefinedColumn`. SQL is code, and only a database can execute it.

Then free shipping changed from `>= 100` to `> 100`. This time the modular suite missed it — its scenarios use totals of 110.00, 57.50, and 97.50, and none of them sits exactly on the line. The parametrized unit test that checks exactly 100.00 failed right away.

Out of stock started returning `400` instead of `409`. Only the HTTP test saw it. The domain logic was fine — the route just mapped the error to the wrong code. A client that retries on `409` but not on `400` would break in production.

Last one: a bug in the fake itself. `FakeInventory` started reserving line by line and keeping a partial reservation when one line didn't fit. Unit tests and order scenarios all passed — they trust the fake. Only a contract test caught it. More on that below.

Neither suite caught everything. Each one caught what the other couldn't. Unit tests own the edges, the rounding, the combinations. Modular tests own the SQL, the transactions, the wiring between the module's own classes. Mocks of your own repository give you neither — they break on refactors and miss the bugs between the parts.

## Modular Integration Test Mistakes — The Half-Measures

The most common one: mocking the module's own classes "to speed it up." Someone sets up a real database, a test feels slow, and the repository gets patched. Now it's not a test of the module anymore — it's a unit test with Docker overhead. Speed comes from how the database is set up — one container per session, cleaning per test, a separate database per pytest-xdist worker — not from mocks. Replace only what the module doesn't own.

Second: SQLite instead of PostgreSQL. It's in-memory, it's fast, and it's a different database. Types, constraints, `RETURNING`, JSON operators, locking, error classes — all different. Tests pass on SQLite, production fails on Postgres. Test against the engine and the version you actually run. With Testcontainers it's one line in a fixture.

Third: fakes nobody checks. A fake is code, and code has bugs. If `FakeInventory` says "reserved" where the real inventory module says "out of stock," every order test built on top of it is testing a fantasy. The fix is a contract test — one set of tests that runs against both the fake and the real module:

```python
from decimal import Decimal

import pytest

from shop.inventory import InventoryModule
from tests.fakes import FakeInventory


@pytest.fixture(params=["fake", "real"])
def inventory(request):
    if request.param == "fake":
        inventory = FakeInventory()
    else:
        inventory = InventoryModule(request.getfixturevalue("conn"))
    inventory.add_product("book", Decimal("25.00"), stock=3)
    inventory.add_product("lamp", Decimal("60.00"), stock=1)
    return inventory


@pytest.mark.module
class TestInventoryContract:
    def test_price_of_unknown_sku_raises_key_error(self, inventory):
        with pytest.raises(KeyError):
            inventory.price_of("nope")

    def test_reserve_takes_all_lines_or_none(self, inventory):
        assert inventory.reserve("o1", {"book": 1, "lamp": 2}) is False
        assert (inventory.stock_of("book"), inventory.stock_of("lamp")) == (3, 1)

    def test_release_returns_reserved_stock(self, inventory):
        assert inventory.reserve("o1", {"book": 2}) is True
        inventory.release("o1")
        assert inventory.stock_of("book") == 3
```

The same three tests, run twice. If the fake drifts, its run fails. That's exactly what caught the partial-reservation bug from the experiment: the `[fake]` run of `test_reserve_takes_all_lines_or_none` failed with `assert (2, 1) == (3, 1)` — one book stayed reserved for an order that never happened. Write contract tests for the behaviour the module relies on, not for every feature of the neighbour.

Fourth: testing every edge case at this level. The shipping boundary bug walked straight through 21 modular tests. Could a modular test check exactly 100.00? Sure. Then 99.99, then 100.01, then with a coupon — each one a database round trip and a full scenario to read. Six parametrized unit cases do the same in a millisecond. Scenarios go here. Edges go to unit tests.

Fifth: running them nightly. "They need a database, let's move them to a separate pipeline." Then bugs show up a day late, and after a week nobody opens the nightly report. With one container per session they run in seconds — put them on every pull request, right after the unit job.

## E2E Tests — The Expensive Truth

End-to-end tests drive the whole application. A real browser, a real page, real clicks and inputs. Playwright launches Chromium, navigates to the app, fills in forms, clicks buttons, and checks what the user would see. This is the most realistic type of test — and the most expensive to run and maintain.

A good E2E test covers a real user flow — login, create something, verify it's there. How many flows to cover and how deep to go depends entirely on the project's use cases and risk areas. The point is to test what actually matters to users, not to blindly minimize or maximize the number of scenarios.

```python
import re

import pytest
from playwright.sync_api import Page, expect


@pytest.fixture()
def logged_in_page(page: Page) -> Page:
    page.goto("http://localhost:3000/login")
    page.get_by_label("Email").fill("qa@company.com")
    page.get_by_label("Password").fill("securepass123")
    page.get_by_role("button", name="Sign In").click()
    expect(page.get_by_role("heading", name="Dashboard")).to_be_visible()
    return page


@pytest.mark.e2e
class TestLoginFlow:
    def test_successful_login_redirects_to_dashboard(self, page: Page):
        page.goto("http://localhost:3000/login")
        page.get_by_label("Email").fill("qa@company.com")
        page.get_by_label("Password").fill("securepass123")
        page.get_by_role("button", name="Sign In").click()
        expect(page.get_by_role("heading", name="Dashboard")).to_be_visible()
        expect(page).to_have_url(re.compile(r".*/dashboard"))

    def test_wrong_password_shows_error(self, page: Page):
        page.goto("http://localhost:3000/login")
        page.get_by_label("Email").fill("qa@company.com")
        page.get_by_label("Password").fill("wrongpass")
        page.get_by_role("button", name="Sign In").click()
        expect(page.get_by_text("Invalid credentials")).to_be_visible()
        expect(page).to_have_url(re.compile(r".*/login"))


@pytest.mark.e2e
class TestTaskBoard:
    def test_create_task_appears_on_board(self, logged_in_page: Page):
        logged_in_page.get_by_role("link", name="Tasks").click()
        logged_in_page.get_by_role("button", name="New Task").click()
        logged_in_page.get_by_label("Title").fill("Fix checkout timeout")
        logged_in_page.get_by_label("Assignee").select_option("alice")
        logged_in_page.get_by_role("button", name="Create").click()
        expect(logged_in_page.get_by_text("Fix checkout timeout")).to_be_visible()
        expect(logged_in_page.get_by_text("alice")).to_be_visible()
```

Playwright offers locators like `get_by_role`, `get_by_label`, `get_by_text` — they find elements the way a user would and tend to survive refactoring better than deeply nested CSS selectors. That said, CSS selectors and `data-testid` attributes are still valid and widely used, especially when accessible roles or labels aren't available. The key is to pick locators that are stable and meaningful for the project, not to follow one approach dogmatically.

## E2E Test Mistakes — The Flaky Nightmares

One common E2E pain point is overly specific selectors. Something like `page.locator("#root > div:nth-child(3) > form > button")` works fine until the markup changes — and then the test breaks for no functional reason. CSS selectors are perfectly fine when they target stable attributes like `data-testid` or IDs. The recommendation is to avoid selectors that depend on DOM depth and element order — they tend to break on every refactor.

```python
import pytest
from playwright.sync_api import Page, expect


@pytest.mark.e2e
class TestCreateTaskBad:
    """Bad: selectors copied from Chrome DevTools."""

    def test_create_task(self, page: Page):
        page.goto("http://localhost:3000/tasks")
        page.locator(
            "#root > div.layout > main > div.toolbar > button:nth-child(2)"
        ).click()
        page.locator(
            "div.modal-body > form > input.form-control-lg"
        ).fill("Fix payment bug")
        page.locator(
            "div.modal-footer > button.btn-primary"
        ).click()
        # No wait — checks once, flaky if API is slow
        assert page.locator("td.task-title").first.is_visible()


@pytest.mark.e2e
class TestCreateTaskGood:
    """Good: locators based on what the user sees."""

    def test_create_task(self, page: Page):
        page.goto("http://localhost:3000/tasks")
        page.get_by_role("button", name="New Task").click()
        page.get_by_label("Title").fill("Fix payment bug")
        page.get_by_role("button", name="Create").click()
        expect(page.get_by_text("Fix payment bug")).to_be_visible()
```

The bad version uses deeply nested selectors with `nth-child` and structure-dependent class names — they work, but tend to break when the layout changes. In practice, CSS and XPath selectors are sometimes the only option, especially with complex or legacy UIs. The real issue here is relying on DOM structure depth, not the selector type itself. Another thing: `is_visible()` checks the element once and moves on. If the page hasn't finished loading yet — the test fails. `expect(...).to_be_visible()` keeps retrying for a few seconds, which handles normal network delays. The good version also uses `get_by_role` and `get_by_label` where it can — these read more like user actions and don't break when someone renames a CSS class.

CSS and XPath work fine when they target something stable. Use `data-testid` attributes (`[data-testid="create-task-btn"]`), unique IDs (`#login-form`), or short class-based selectors that the team agrees to keep stable (`button.submit-primary`). The problem starts when a selector describes the path through the DOM — `div > section:nth-child(2) > form > button` — because any layout change breaks it. A simple rule: if the selector still works after you wrap the component in a new `<div>`, it's stable enough.

Second classic mistake: not waiting for network or state changes. Someone clicks a button and immediately checks for a success message, but the API call hasn't finished yet. Playwright's `expect` handles most of this automatically, but only if it's used instead of raw `assert`. A test that does `assert page.locator(".toast").is_visible()` checks once and moves on. `expect(page.get_by_text("Saved")).to_be_visible()` retries until timeout. That difference is the line between a stable test and a flaky one.

Third one: testing everything through E2E. Login flow works? Great. Now someone writes E2E tests for every validation rule on the registration form — empty email, short password, invalid phone format. That's a unit test job. The password validator from the unit test section above already covers that in milliseconds. E2E should cover the critical paths — the ones where a real user would notice a failure. Not every field-level error message.

## The Shape of the Pyramid

The width of each layer represents how many tests of that type a project should have. Lots of unit tests at the base. A reasonable number of integration tests in the middle. A handful of E2E tests at the top.

The numbers look roughly like this on a typical project:

Unit tests run in 0.001–0.01 seconds each. Integration tests take about 0.1–1 second. E2E tests need 5–30 seconds each. A project with 2000 unit tests, 200 integration tests, and 30 E2E tests runs the full suite in a few minutes. Flip the pyramid upside down — 30 unit tests and 2000 E2E tests — and the suite takes hours. That's the ice cream cone anti-pattern, and it's surprisingly common.

The ice cream cone happens naturally when teams skip unit and integration tests during development and then try to cover everything with Playwright at the end. It's slow, flaky, expensive to maintain, and gives late feedback. If a bug in discount calculation only surfaces in a slow E2E run hours later — the feedback loop is too long. A unit test would catch it in seconds, right where the code was written.

## When the Pyramid Doesn't Fit

The pyramid is a guideline, not a law. Frontend-heavy projects might lean towards the "Testing Trophy" proposed by Kent C. Dodds — more integration tests, fewer unit tests, with static analysis (linters, type checkers) replacing part of the unit layer. Makes sense when UI components are hard to test in isolation but easy to test through rendered output.

Microservice projects might need more integration and contract tests than the classic pyramid suggests. When ten services talk to each other, unit testing each service in isolation only goes so far. The bugs live at the boundaries — API contracts, message formats, authentication flows.

The same goes for a single module. A pricing engine is almost all logic — lots of unit tests, a handful of modular scenarios, a classic pyramid. A CRUD admin module is almost all wiring — there's barely anything to unit-test, and most of its suite should be modular tests. That's also why "70 / 20 / 10" rarely survives contact with a real codebase: it was drawn for a codebase in general, not for a module. The useful question is narrower — where do the bugs in this piece of code usually come from? Write the test that sees that kind of bug.

The point isn't to follow the exact shape religiously. The point is to avoid the ice cream cone — where all the testing effort goes to the slowest, most expensive, most fragile layer. Whatever shape the suite ends up being, it should catch bugs fast and not make the team wait an hour for feedback.

## So What

The testing pyramid is one of those concepts that everyone knows and few actually follow. Teams nod during the architecture review, agree on the strategy, and then ship 200 E2E tests and 15 unit tests because "we didn't have time for proper unit testing." Meanwhile the CI pipeline takes 45 minutes and nobody trusts it.

The pyramid works when it's treated as an everyday practice, not a slide in a presentation. Unit tests catch logic bugs in seconds. Modular integration tests catch what mocks hide — the SQL, the transactions, the bugs between your own classes. Integration tests verify that components actually talk to each other. E2E tests confirm that the user can actually use the product. Each level has its job. Skip one, and the others can't compensate.

The tools are right there. pytest handles the unit layer. pytest with Testcontainers handles the modular one — a real database in Docker, started once per run. Playwright covers both integration (API testing) and E2E (browser testing) with the same library. One dependency for two levels of the pyramid. The pyramid isn't complicated. The hard part is actually building it instead of just talking about it.
