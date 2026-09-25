---
date: 2026-09-24
tags:
  - python
  - libraries
  - sqlalchemy
  - databases
---

# SQLAlchemy — Advanced Recipes

## Hybrid Properties

Attributes that behave differently at instance level (Python) and class level (SQL).

```python
from sqlalchemy import String, select
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import Mapped, mapped_column


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    first_name: Mapped[str] = mapped_column(String(50))
    last_name: Mapped[str] = mapped_column(String(50))

    @hybrid_property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"

    @full_name.expression
    @classmethod
    def full_name(cls):
        return cls.first_name + " " + cls.last_name


# instance: Python concatenation
user.full_name  # "Alice Smith"

# query: SQL concatenation
stmt = select(User).where(User.full_name == "Alice Smith")
```

---

## Event Listeners

```python
from sqlalchemy import event
from sqlalchemy.orm import Session


@event.listens_for(User, "before_insert")
def set_defaults(mapper, connection, target):
    if not target.role:
        target.role = "viewer"


@event.listens_for(Session, "before_flush")
def validate_before_flush(session, flush_context, instances):
    for obj in session.new:
        if isinstance(obj, User) and not obj.email:
            raise ValueError("User email is required")


@event.listens_for(User.email, "set", retval=True)
def normalize_email(target, value, oldvalue, initiator):
    if value:
        return value.lower().strip()
    return value
```

### Common Events

| Event | Trigger |
|-------|---------|
| `before_insert` / `after_insert` | Row inserted |
| `before_update` / `after_update` | Row updated |
| `before_delete` / `after_delete` | Row deleted |
| `before_flush` | Session about to flush |
| `after_commit` | Transaction committed |
| `set` (attribute) | Column value changed |

---

## Connection Pooling

```python
from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool, QueuePool

# default QueuePool — connection reuse for web apps
engine = create_engine(
    "postgresql+psycopg2://user:pass@localhost/db",
    poolclass=QueuePool,
    pool_size=10,
    max_overflow=20,
    pool_timeout=30,
    pool_recycle=1800,
    pool_pre_ping=True,
)

# NullPool — no pooling, new connection each time (for serverless / tests)
engine = create_engine(
    "postgresql+psycopg2://user:pass@localhost/db",
    poolclass=NullPool,
)
```

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `pool_size` | 5 | Persistent connections |
| `max_overflow` | 10 | Extra connections above pool_size |
| `pool_timeout` | 30 | Seconds to wait for available connection |
| `pool_recycle` | -1 | Seconds before connection recycled |
| `pool_pre_ping` | False | Health check before use |

---

## Soft Delete Pattern

```python
from datetime import UTC, datetime

from sqlalchemy import DateTime, String, select
from sqlalchemy.orm import Mapped, mapped_column


class SoftDeleteMixin:
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None,
    )

    def soft_delete(self) -> None:
        self.deleted_at = datetime.now(UTC)

    @classmethod
    def active(cls):
        return select(cls).where(cls.deleted_at.is_(None))


class Article(SoftDeleteMixin, Base):
    __tablename__ = "articles"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))

# usage
stmt = Article.active().where(Article.title.like("%SQLAlchemy%"))
```

---

## Testing with In-Memory SQLite

```python
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.database import Base


@pytest.fixture
def engine():
    engine = create_engine("sqlite://", echo=False)
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def session(engine):
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
    yield session
    session.close()
    transaction.rollback()
    connection.close()
```

Each test gets a rolled-back transaction — fast, isolated, no cleanup needed.

For async testing use `create_async_engine("sqlite+aiosqlite://")` with `pytest_asyncio` fixtures and `async_sessionmaker`.

---

## Performance Tips

1. **Use `selectinload` over lazy loading** — avoids N+1 query problem.
2. **Bulk operations for large datasets** — `insert().values([...])` bypasses ORM overhead.
3. **Use `yield_per()` for large result sets** — `select(User).execution_options(yield_per=100)`.
4. **Index frequently filtered columns** — `mapped_column(index=True)`.
5. **Use `text()` for complex analytics** — ORM overhead is unnecessary for read-only reports.
6. **Enable `pool_pre_ping`** — prevents stale connection errors in long-running apps.
7. **Profile with `echo=True`** — spot unexpected queries during development.
