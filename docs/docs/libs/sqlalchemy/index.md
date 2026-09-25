---
date: 2026-09-22
tags:
  - python
  - libraries
  - sqlalchemy
  - databases
---

# SQLAlchemy — Python ORM & SQL Toolkit

Modern database toolkit for Python. Two layers: **Core** (SQL expression language) and **ORM** (object-relational mapper). SQLAlchemy 2.0+ uses typed mappings, `select()` style queries, and full async support.

## Installation

```bash
uv add sqlalchemy
uv add alembic                # database migrations
uv add asyncpg                # async PostgreSQL driver
uv add psycopg2-binary        # sync PostgreSQL driver
uv add aiosqlite              # async SQLite driver (dev/testing)
```

## When to Use What

| Layer | Best for |
|-------|----------|
| ORM (`Mapped`, `Session`) | CRUD, domain models, relationships, identity tracking |
| Core (`select`, `insert`) | Complex queries, bulk operations, reports |
| `text()` | Raw SQL when ORM/Core is overkill |
| Async (`AsyncSession`) | FastAPI, async web frameworks, high-concurrency apps |

## Section Map

| File | Topics |
|------|--------|
| [01 Engine & Models](./01-engine-models.md) | Engine, DeclarativeBase, Mapped, mapped_column, column types |
| [02 Relationships & Queries](./02-relationships-queries.md) | One-to-many, many-to-many, CRUD, select, join, filtering |
| [03 Sessions & Transactions](./03-sessions-transactions.md) | Session lifecycle, transactions, unit of work, context managers |
| [04 Async Patterns](./04-async-patterns.md) | AsyncEngine, AsyncSession, loading strategies, FastAPI integration |
| [05 Alembic Migrations](./05-alembic-migrations.md) | Setup, auto-generate, operations, versioning, async migrations |
| [06 Advanced Recipes](./06-advanced-recipes.md) | Hybrid properties, events, connection pooling, testing, performance |

## Quick Start

```python
from sqlalchemy import create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column()
    email: Mapped[str] = mapped_column(unique=True)


engine = create_engine("sqlite:///app.db", echo=True)
Base.metadata.create_all(engine)

with Session(engine) as session:
    session.add(User(name="Alice", email="alice@example.com"))
    session.commit()

    stmt = select(User).where(User.name == "Alice")
    user = session.scalars(stmt).one()
    print(user.email)
```

## Common Column Types

| Python type | SQLAlchemy type | DB type |
|-------------|----------------|---------|
| `int` | `Integer` | INTEGER |
| `str` | `String(n)` | VARCHAR(n) |
| `str` (unbounded) | `Text` | TEXT |
| `float` | `Float` | FLOAT |
| `bool` | `Boolean` | BOOLEAN |
| `datetime` | `DateTime` | TIMESTAMP |
| `date` | `Date` | DATE |
| `Decimal` | `Numeric(p, s)` | NUMERIC |
| `bytes` | `LargeBinary` | BLOB |
| `uuid.UUID` | `Uuid` | UUID (PG) / CHAR(32) |
| `dict` / `list` | `JSON` | JSON / JSONB |

## Quick Rules

1. **Use 2.0 style** — `Mapped[]`, `mapped_column()`, `select()`.
2. **Keep sessions short-lived** — one per request or unit of work.
3. **Never share sessions across threads** — use `scoped_session` or async.
4. **Use `selectinload`/`joinedload`** — avoid N+1 queries.
5. **Alembic for migrations** — never use `metadata.create_all()` in production.
6. **Use connection pooling defaults** — tune `pool_size` and `max_overflow` for load.
7. **Prefer `session.scalars()`** — returns ORM objects directly, cleaner than `.execute().scalars()`.

---
## See also
- [Digital Garden: Knowledge Base](../../index.md)
- [Python Guide for Automation QA](../../python-guide/index.md)
- [Test Automation Framework](../../test-automation-framework/index.md)
- [CI/CD](../../ci-cd-approaches/index.md)
- [Tools — Practical Reference Guides](../../tools/index.md)
- [Python Libraries](../index.md)

