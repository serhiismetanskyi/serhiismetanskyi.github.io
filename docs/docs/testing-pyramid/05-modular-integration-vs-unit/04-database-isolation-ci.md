---
date: 2026-10-07
tags:
  - testing
  - test-strategy
  - integration-testing
  - pytest
  - postgresql
  - ci-cd
---

# Modular Integration vs Unit — Database, Isolation & CI

Unit tests need nothing but Python. Modular integration tests need a real database, a clean state for every test and a way to run in parallel and in CI. Done carelessly, this is what makes integration suites slow and flaky; done right, it costs a few seconds per run.

## The Database Fixtures

```python
# tests/conftest.py
import os

import psycopg
import pytest
from testcontainers.community.postgres import PostgresContainer

from shop.inventory import InventoryModule
from shop.orders import OrdersModule


@pytest.fixture(scope="session")
def pg_url():
    if url := os.environ.get("TEST_DATABASE_URL"):        # CI service container or a local database
        yield url
        return
    with PostgresContainer("postgres:18-alpine", driver=None) as pg:
        yield pg.get_connection_url()


@pytest.fixture(scope="session")
def db_url(pg_url, worker_id):
    """One database per xdist worker (gw0, gw1, ...), schema migrated once."""
    name = f"test_{worker_id}"
    with psycopg.connect(pg_url, autocommit=True) as admin:
        admin.execute(f'DROP DATABASE IF EXISTS "{name}"')
        admin.execute(f'CREATE DATABASE "{name}"')
    url = pg_url.rsplit("/", 1)[0] + f"/{name}"
    with psycopg.connect(url, autocommit=True) as conn:
        OrdersModule.migrate(conn)
        InventoryModule.migrate(conn)
    return url


@pytest.fixture
def conn(db_url):
    with psycopg.connect(db_url, autocommit=True) as conn:
        yield conn
        conn.execute(
            "TRUNCATE orders.order_lines, orders.orders, inventory.reservations, inventory.products"
        )
```

| Fixture | Scope | Job |
|---------|-------|-----|
| `pg_url` | session | Starts one PostgreSQL container for the whole run — or uses `TEST_DATABASE_URL` if CI already provides a database |
| `db_url` | session, per worker | Creates a database for this xdist worker (`test_gw0`, `test_gw1`, …, or `test_master` without `-n`) and applies the schema of every module once |
| `conn` | function | Gives each test a connection and leaves the tables empty for the next test |

- `worker_id` comes from **pytest-xdist**; install it even if you rarely use `-n`, or replace the fixture with a fixed name.
- `driver=None` makes Testcontainers return a plain `postgresql://` URL that psycopg 3 accepts (the default adds `+psycopg2` for SQLAlchemy).
- The schema is created by the **modules' own migration code**, the same code production runs. With Alembic or another tool, run its upgrade here instead — and the tests also check that migrations apply to an empty database.
- **Pin the image tag** (`postgres:18-alpine`) to the major version production runs.

## Cleaning Between Tests

Every test must start from the same state, whatever ran before it. Three common ways:

| Strategy | How | Per test (example suite) | Works when | Breaks when |
|----------|-----|--------------------------|------------|-------------|
| **TRUNCATE** after each test | `TRUNCATE` the module's tables in teardown | 15–35 ms | Always — the code under test commits as in production | Many tables: list them all (or query `pg_tables`), or a forgotten table leaks rows into the next test |
| **Rolled-back transaction** | Wrap the test in an outer transaction that is never committed | 15–20 ms | The code under test uses the **same connection** the test gives it | The code opens its own connections (a pool, a server in another process, a worker), relies on commit-time behaviour (deferred constraints, `LISTEN/NOTIFY`), or tests concurrency |
| **Fresh database from a template** | `CREATE DATABASE t TEMPLATE test_template` per test or per module | 100+ ms | Heavy seed data, schema changes inside tests | Speed — fine per test module, slow per test |

The rolled-back transaction in psycopg 3:

```python
@pytest.fixture
def conn(db_url):
    with psycopg.connect(db_url, autocommit=True) as conn:
        with conn.transaction(force_rollback=True):   # never committed
            yield conn                                # the code's own transaction() blocks become savepoints
```

Swapping it in, the 21 modular tests went from ~0.85 s to ~0.57 s (against an already running PostgreSQL). The example suite uses `TRUNCATE` anyway: the handler's own transactions then commit for real, which is what the idempotency and failure-path tests are about.

!!! warning "Do not clean **before** the test only"
    Cleaning in setup hides leaks: the last test of the run leaves data behind, and the next person who runs one test against a shared database sees it. Clean in teardown (or wrap in a rollback), and make the session fixture start from an empty database.

## Test Data

- **Each test creates the data it reads.** The module fixtures above add two products to the fake inventory; the order tests create their own orders. Nothing depends on another test having run first.
- **Seed through the module's public API** (`inventory.add_product(...)`, `orders.place_order(...)`), not with SQL into another module's tables — the same rule production code follows.
- **Shared reference data** (countries, currencies) can be loaded once per session if no test changes it.
- **Factories** help when objects have many fields: see [Test Data Factories](../../libs/pytest/02-practical-playbooks/02-test-data-factories.md).
- **Do not assert on generated values** (UUIDs, timestamps) — read them from the result, as the tests do with `order_id`.

## Parallel Runs

```bash
uv run pytest -n 4          # four workers: databases test_gw0..test_gw3
uv run pytest -n auto       # one worker per CPU core
```

- **Each xdist worker is a separate process with its own session**, so session fixtures run once per worker. With Testcontainers that means **one container per worker**; with `TEST_DATABASE_URL` all workers share one server and each gets its own database (`db_url`). The fixtures above handle both.
- **One database per worker** removes interference between workers without locks or unique test data.
- **For small suites, workers cost more than they save**: the example's 35 tests took 0.82 s serially and 1.31 s with `-n 4` against an already running server, and more with a container per worker. Parallelism pays off from a few hundred modular tests.

## Markers and Layout

```ini
# pytest.ini
[pytest]
markers =
    module: modular integration tests (real database, fakes at the module boundary)
```

```bash
uv run pytest tests/unit            # by folder: no Docker needed, runs on every save
uv run pytest -m module             # by marker: everything that needs the database
uv run pytest -m "not module"       # quick local run without Docker
```

Two common layouts, both fine — pick one and keep it:

| Layout | Example | Good for |
|--------|---------|----------|
| By test kind | `tests/unit/`, `tests/module/`, `tests/contracts/` | One small or medium app; CI jobs per folder |
| By module, then kind | `orders/tests/unit/`, `orders/tests/module/`, `inventory/tests/...` | A modular monolith where teams own modules; each module's tests move with it |

## CI

The same `conftest.py` runs in CI. Either let Testcontainers start PostgreSQL (the runner needs Docker — GitHub's Ubuntu runners have it) or give the tests a service container and set `TEST_DATABASE_URL`:

```yaml
# .github/workflows/tests.yml
name: tests
on: [push, pull_request]

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
      - run: uv run pytest tests/unit

  module:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:18-alpine
        env:
          POSTGRES_PASSWORD: test
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 2s --health-timeout 5s --health-retries 20
    env:
      TEST_DATABASE_URL: postgresql://postgres:test@localhost:5432/postgres
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
      - run: uv run pytest -m module -n auto
```

- **Run both jobs on every pull request.** Modular tests that only run nightly find bugs a day late and get ignored.
- **The unit job fails first** — seconds instead of a minute — so a broken rule is reported before the database is up.
- **Same database version in CI, locally and in production.**

---
## See also
- [Modular Integration Testing vs Unit Testing](./index.md)
- [Modular Integration vs Unit — What Each Test Catches](./03-what-each-test-catches.md)
- [Modular Integration vs Unit — Strategy & Mistakes](./05-strategy-mistakes.md)
- [Test Environment Design](../../test-design-patterns/05-data-mocking-env/03-environment-design.md)
- [Pytest Playbook — Flakiness Debugging](../../libs/pytest/02-practical-playbooks/03-flakiness-debugging.md)
- [PostgreSQL — Overview](../../databases/postgresql/index.md)
