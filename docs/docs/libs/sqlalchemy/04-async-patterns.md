---
date: 2026-09-23
tags:
  - python
  - libraries
  - sqlalchemy
  - databases
---

# SQLAlchemy — Async Patterns

## Async Engine & Session

```python
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

engine = create_async_engine(
    "postgresql+asyncpg://user:pass@localhost:5432/mydb",
    echo=False,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)
```

Async requires an async-compatible driver: `asyncpg` (PostgreSQL), `aiosqlite` (SQLite), `aiomysql` (MySQL).

---

## Basic CRUD (Async)

```python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


async def create_user(session: AsyncSession, name: str, email: str) -> User:
    user = User(name=name, email=email)
    session.add(user)
    await session.flush()
    return user


async def get_user(session: AsyncSession, user_id: int) -> User | None:
    return await session.get(User, user_id)


async def list_users(session: AsyncSession) -> list[User]:
    stmt = select(User).order_by(User.name)
    result = await session.scalars(stmt)
    return list(result.all())


async def update_user(session: AsyncSession, user_id: int, name: str) -> User | None:
    user = await session.get(User, user_id)
    if user:
        user.name = name
    return user


async def delete_user(session: AsyncSession, user_id: int) -> bool:
    user = await session.get(User, user_id)
    if user:
        await session.delete(user)
        return True
    return False
```

---

## Async Transaction Patterns

```python
# auto-commit / auto-rollback
async with AsyncSessionLocal() as session:
    async with session.begin():
        session.add(User(name="Alice"))
        session.add(User(name="Bob"))

# manual commit
async with AsyncSessionLocal() as session:
    session.add(User(name="Alice"))
    await session.commit()
```

---

## Loading Strategies (Async)

Lazy loading raises `MissingGreenlet` in async context — always use eager loading.

```python
from sqlalchemy import select
from sqlalchemy.orm import joinedload, selectinload

# selectinload — separate SELECT IN query (recommended for collections)
stmt = select(User).options(selectinload(User.posts))
result = await session.scalars(stmt)
users = result.all()

# joinedload — single JOIN query (good for one-to-one)
stmt = select(User).options(joinedload(User.profile))
result = await session.scalars(stmt)
user = result.first()

# nested eager loading
stmt = select(User).options(
    selectinload(User.posts).selectinload(Post.comments),
)
```

### Model-Level Default Strategy

```python
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    posts: Mapped[list["Post"]] = relationship(
        back_populates="author",
        lazy="selectin",  # always eager-load in async
    )
```

---

## FastAPI Integration (Async)

```python
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

engine = create_async_engine("postgresql+asyncpg://user:pass@localhost/db")
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
```

Use explicit transaction boundaries for writes (`async with db.begin(): ...`) to avoid hidden commits in read-only paths.

```python
from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

app = FastAPI()


@app.get("/users/{user_id}")
async def read_user(user_id: int, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404)
    return user


@app.get("/users")
async def list_users(db: AsyncSession = Depends(get_db)):
    stmt = select(User).order_by(User.name)
    result = await db.scalars(stmt)
    return result.all()
```

---

## AsyncAttrs Mixin

```python
from sqlalchemy.ext.asyncio import AsyncAttrs
from sqlalchemy.orm import DeclarativeBase

class Base(AsyncAttrs, DeclarativeBase):
    pass

# access relationships via awaitable_attrs (avoids MissingGreenlet)
user = await session.get(User, 1)
posts = await user.awaitable_attrs.posts
```

---

## Async vs Sync Comparison

| Feature | Sync | Async |
|---------|------|-------|
| Engine | `create_engine()` | `create_async_engine()` |
| Session factory | `sessionmaker()` | `async_sessionmaker()` |
| Session class | `Session` | `AsyncSession` |
| Get by PK | `session.get(User, 1)` | `await session.get(User, 1)` |
| Execute | `session.execute(stmt)` | `await session.execute(stmt)` |
| Commit | `session.commit()` | `await session.commit()` |
| Lazy loading | Works | Raises `MissingGreenlet` |
| Driver (PG) | `psycopg2` | `asyncpg` |

Always call `await engine.dispose()` at shutdown to cleanly close all pooled connections.
