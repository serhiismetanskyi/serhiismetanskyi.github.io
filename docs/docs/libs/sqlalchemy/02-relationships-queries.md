---
date: 2026-09-23
tags:
  - python
  - libraries
  - sqlalchemy
  - databases
---

# SQLAlchemy — Relationships & Queries

## One-to-Many Relationship

```python
from sqlalchemy import ForeignKey, String, select
from sqlalchemy.orm import Mapped, mapped_column, relationship


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    posts: Mapped[list["Post"]] = relationship(back_populates="author")


class Post(Base):
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    author: Mapped["User"] = relationship(back_populates="posts")
```

`back_populates` keeps both sides synchronized — adding a Post to `user.posts` auto-sets `post.author`.

---

## Many-to-Many Relationship

```python
from sqlalchemy import Column, ForeignKey, String, Table
from sqlalchemy.orm import Mapped, mapped_column, relationship

tag_posts = Table(
    "tag_posts",
    Base.metadata,
    Column("tag_id", ForeignKey("tags.id"), primary_key=True),
    Column("post_id", ForeignKey("posts.id"), primary_key=True),
)


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)
    posts: Mapped[list["Post"]] = relationship(
        secondary=tag_posts, back_populates="tags",
    )


class Post(Base):
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    tags: Mapped[list["Tag"]] = relationship(
        secondary=tag_posts, back_populates="posts",
    )
```

---

## One-to-One Relationship

Same as one-to-many but add `uselist=False` on the parent and `unique=True` on FK.

```python
class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    profile: Mapped["Profile"] = relationship(back_populates="user", uselist=False)

class Profile(Base):
    __tablename__ = "profiles"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    user: Mapped["User"] = relationship(back_populates="profile")
```

---

## CRUD Operations

```python
from sqlalchemy import select
from sqlalchemy.orm import Session


def create_user(session: Session, name: str, email: str) -> User:
    user = User(name=name, email=email)
    session.add(user)
    session.flush()  # assigns ID without committing
    return user


def get_user_by_id(session: Session, user_id: int) -> User | None:
    return session.get(User, user_id)


def list_users(session: Session, active: bool = True) -> list[User]:
    stmt = select(User).where(User.is_active == active).order_by(User.name)
    return list(session.scalars(stmt).all())


def update_user(session: Session, user_id: int, name: str) -> User | None:
    user = session.get(User, user_id)
    if user:
        user.name = name  # dirty tracking auto-detects changes
    return user


def delete_user(session: Session, user_id: int) -> bool:
    user = session.get(User, user_id)
    if user:
        session.delete(user)
        return True
    return False
```

---

## Select & Filtering

```python
from sqlalchemy import func, or_, select

stmt = select(User).where(User.name == "Alice")
stmt = select(User).where(User.name.like("%ali%"))
stmt = select(User).where(User.name.ilike("%ali%"))
stmt = select(User).where(User.id.in_([1, 2, 3]))
stmt = select(User).where(User.email.is_not(None))
stmt = select(User).where(or_(User.role == "admin", User.role == "editor"))

# ordering & pagination
stmt = select(User).order_by(User.created_at.desc()).limit(20).offset(40)

# aggregation
stmt = select(func.count(User.id)).where(User.is_active == True)
count = session.scalar(stmt)

# group by
stmt = (
    select(User.role, func.count(User.id).label("total"))
    .group_by(User.role)
    .having(func.count(User.id) > 5)
)
rows = session.execute(stmt).all()
```

---

## Joins

```python
from sqlalchemy import select
from sqlalchemy.orm import joinedload, selectinload

# implicit join via relationship filter
stmt = select(User).join(User.posts).where(Post.title.like("%SQLAlchemy%"))

# explicit join
stmt = select(User, Post).join(Post, User.id == Post.user_id)

# outer join
stmt = select(User).outerjoin(User.posts)

# eager loading — joinedload (single query with JOIN)
stmt = select(User).options(joinedload(User.posts)).where(User.id == 1)

# eager loading — selectinload (separate SELECT IN query)
stmt = select(User).options(selectinload(User.posts))
```

### Loading Strategy Comparison

| Strategy | SQL | Best for |
|----------|-----|----------|
| `lazy="select"` (default) | N+1 queries | Rarely accessed relations |
| `selectinload()` | 1 + 1 per relation | Collections, async contexts |
| `joinedload()` | Single JOIN | Single-object lookups, one-to-one |
| `subqueryload()` | 1 + 1 subquery | Large collections, avoids JOIN bloat |
| `raiseload()` | Raises error | Prevent accidental lazy loads |

---

## Bulk Operations

```python
from sqlalchemy import delete, insert, update

session.execute(insert(User), [{"name": "Alice", "email": "a@test.com"}, {"name": "Bob", "email": "b@test.com"}])
session.execute(update(User).where(User.is_active == False).values(role="archived"))
session.execute(delete(User).where(User.last_login < cutoff_date))
```

Bulk ops bypass the identity map — use `insert()`, `update()`, `delete()` for high-volume work.
