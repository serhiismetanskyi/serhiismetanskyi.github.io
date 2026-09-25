---
date: 2026-09-12
tags:
  - python
  - libraries
  - fastapi
  - api
---

# FastAPI — Database Integration

## Async Engine & Session Setup

```python
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

engine = create_async_engine(
    "postgresql+asyncpg://user:pass@localhost:5432/mydb",
    pool_size=10, max_overflow=20, pool_recycle=1800, pool_pre_ping=True,
)
async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
```

| Parameter | Purpose |
|-----------|---------|
| `expire_on_commit=False` | Keep attributes accessible after commit (no lazy load in async) |
| `pool_pre_ping=True` | Test connection health before reuse |
| `pool_recycle=1800` | Replace stale connections every 30 min |

---

## Session Dependency

```python
from collections.abc import AsyncGenerator

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        yield session
```

Each request gets its own session. `yield` ensures cleanup after response.

---

## Model + Schemas

```python
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8)


class UserRead(BaseModel):
    id: int
    name: str
    email: EmailStr

    model_config = {"from_attributes": True}
```

| Layer | Class | Role |
|-------|-------|------|
| DB | `User` | SQLAlchemy ORM model |
| Input | `UserCreate` | Request validation (includes `password`) |
| Output | `UserRead` | Response filtering (excludes `hashed_password`) |

---

## Repository Pattern

```python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


class UserRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, user_id: int) -> User | None:
        result = await self.session.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> User | None:
        result = await self.session.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def create(self, user: User) -> User:
        self.session.add(user)
        await self.session.commit()
        await self.session.refresh(user)
        return user

    async def list_all(self, offset: int = 0, limit: int = 20) -> list[User]:
        result = await self.session.execute(select(User).offset(offset).limit(limit))
        return list(result.scalars().all())
```

---

## CRUD Endpoints

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/users", tags=["users"])


def get_user_repo(db: AsyncSession = Depends(get_db)) -> UserRepository:
    return UserRepository(db)


@router.post("/", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(data: UserCreate, repo: UserRepository = Depends(get_user_repo)):
    existing = await repo.get_by_email(data.email)
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(name=data.name, email=data.email, hashed_password="hashed")
    return await repo.create(user)


@router.get("/{user_id}", response_model=UserRead)
async def get_user(user_id: int, repo: UserRepository = Depends(get_user_repo)):
    user = await repo.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
```

---

## Pagination Helper

```python
from typing import Generic, TypeVar

from pydantic import BaseModel
from fastapi import Query
from sqlalchemy import func, select

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    size: int
    pages: int


@router.get("/", response_model=PaginatedResponse[UserRead])
async def list_users(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * size
    total = (await db.execute(select(func.count()).select_from(User))).scalar_one()
    items = (await db.execute(select(User).offset(offset).limit(size))).scalars().all()
    return PaginatedResponse(
        items=items, total=total, page=page, size=size, pages=(total + size - 1) // size,
    )
```

---

## Lifespan Integration

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()

app = FastAPI(lifespan=lifespan)
app.include_router(router)
```

Use `create_all` only in dev/testing. In production, use Alembic.
