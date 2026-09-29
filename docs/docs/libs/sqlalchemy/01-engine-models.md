---
date: 2026-09-23
tags:
  - python
  - libraries
  - sqlalchemy
  - databases
---

# SQLAlchemy — Engine & Models

## Engine Configuration

```python
from sqlalchemy import create_engine

engine = create_engine(
    "postgresql+psycopg2://user:pass@localhost:5432/mydb",
    echo=False,          # True = log all SQL (dev only)
    pool_size=10,        # connections kept open
    max_overflow=20,     # extra connections above pool_size
    pool_timeout=30,     # seconds to wait for a connection
    pool_recycle=1800,   # recycle connections after 30 min
    pool_pre_ping=True,  # test connection health before use
)
```

### Connection URL Format

```
dialect+driver://user:password@host:port/database
```

| Database | URL example |
|----------|-------------|
| PostgreSQL (sync) | `postgresql+psycopg2://user:pass@localhost/db` |
| PostgreSQL (async) | `postgresql+asyncpg://user:pass@localhost/db` |
| SQLite | `sqlite:///app.db` |
| SQLite (async) | `sqlite+aiosqlite:///app.db` |
| MySQL | `mysql+pymysql://user:pass@localhost/db` |

---

## DeclarativeBase

```python
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
```

Use `Base` as parent for all models. Mix in `TimestampMixin` for audit columns.

---

## Mapped Column Definitions

```python
from uuid import UUID, uuid4

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    uuid: Mapped[UUID] = mapped_column(default=uuid4)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    bio: Mapped[str | None] = mapped_column(Text, default=None)
    is_active: Mapped[bool] = mapped_column(default=True)
```

### Type Mapping Rules

| `Mapped[T]` | Nullable | Default column type |
|-------------|----------|-------------------|
| `Mapped[int]` | NOT NULL | `Integer` |
| `Mapped[str]` | NOT NULL | `String` (unbounded) |
| <code>Mapped[str &#124; None]</code> | NULL | `String` (unbounded) |
| `Mapped[bool]` | NOT NULL | `Boolean` |
| `Mapped[float]` | NOT NULL | `Float` |

Use explicit types like `String(100)` in `mapped_column()` when you need length constraints.

---

## mapped_column Parameters

```python
from sqlalchemy import Index
from sqlalchemy.orm import Mapped, mapped_column


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    sku: Mapped[str] = mapped_column(String(50), unique=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    price: Mapped[float] = mapped_column(nullable=False)
    quantity: Mapped[int] = mapped_column(default=0, server_default="0")

    __table_args__ = (
        Index("ix_product_sku_name", "sku", "name"),
    )
```

| Parameter | Purpose |
|-----------|---------|
| `primary_key` | Mark as primary key |
| `unique` | Add unique constraint |
| `index` | Create single-column index |
| `nullable` | Allow NULL (inferred from <code>Mapped[T &#124; None]</code>) |
| `default` | Python-side default value or callable |
| `server_default` | SQL DEFAULT clause (string or `func.now()`) |
| `onupdate` | Value set on each UPDATE |

---

## Composite & Check Constraints

```python
from sqlalchemy import CheckConstraint, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(index=True)
    external_id: Mapped[str] = mapped_column(String(64))
    quantity: Mapped[int] = mapped_column()
    unit_price: Mapped[float] = mapped_column()
    status: Mapped[str] = mapped_column(String(20))

    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_order_qty_positive"),
        CheckConstraint("unit_price >= 0", name="ck_order_price_nonneg"),
        UniqueConstraint("tenant_id", "external_id", name="uq_order_tenant_external"),
    )
```

---

## Enum Columns

```python
import enum

from sqlalchemy import Enum
from sqlalchemy.orm import Mapped, mapped_column


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    EDITOR = "editor"
    VIEWER = "viewer"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, native_enum=True),
        default=UserRole.VIEWER,
    )
```

Set `native_enum=False` on databases without native ENUM support (SQLite, older MySQL).

---

## Auto Table Name & Repr

```python
from sqlalchemy.orm import DeclarativeBase, declared_attr


class Base(DeclarativeBase):
    @declared_attr.directive
    def __tablename__(cls) -> str:
        return cls.__name__.lower() + "s"
```

Auto-generates table names from class name (`User` → `users`).
