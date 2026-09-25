---
date: 2026-09-23
tags:
  - python
  - libraries
  - sqlalchemy
  - databases
---

# SQLAlchemy — Sessions & Transactions

## Session Basics

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

engine = create_engine("postgresql+psycopg2://user:pass@localhost/db")

# context manager — auto-closes on exit, does NOT auto-commit
with Session(engine) as session:
    user = User(name="Alice", email="alice@example.com")
    session.add(user)
    session.commit()
```

A session tracks object identity, manages transactions, and coordinates flushes to the database. One session = one unit of work.

---

## Session Factory

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

engine = create_engine("postgresql+psycopg2://user:pass@localhost/db")

SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

# usage
with SessionLocal() as session:
    session.add(User(name="Bob"))
    session.commit()
```

`expire_on_commit=False` prevents attribute expiry after commit — avoids extra SELECTs when accessing attributes post-commit. Recommended for web apps.

---

## Transaction Patterns

### Auto-Begin + Explicit Commit

```python
with Session(engine) as session:
    session.add(User(name="Alice"))
    session.commit()
    # transaction auto-begins again if you keep using the session
    session.add(User(name="Bob"))
    session.commit()
```

### Begin Context (Auto-Commit / Auto-Rollback)

```python
with Session(engine) as session:
    with session.begin():
        session.add(User(name="Alice"))
        session.add(User(name="Bob"))
    # commits on success, rolls back on exception
```

### Nested Transactions (Savepoints)

```python
with Session(engine) as session:
    with session.begin():
        session.add(User(name="Alice"))

        with session.begin_nested():  # SAVEPOINT
            session.add(User(name="Bad-Data"))
            # if this fails, only the savepoint rolls back
        # outer transaction continues

    session.commit()
```

---

## Object States

| State | In session | In DB | How to get there |
|-------|-----------|-------|-----------------|
| **Transient** | No | No | `User()` — just created |
| **Pending** | Yes | No | `session.add(user)` |
| **Persistent** | Yes | Yes | After `flush()` or `commit()` |
| **Detached** | No | Yes | After `session.close()` or `expunge()` |
| **Deleted** | Yes | Pending delete | `session.delete(user)` |

```python
from sqlalchemy import inspect

state = inspect(user)
state.transient    # True if not attached
state.pending      # True if added, not flushed
state.persistent   # True if flushed/committed
state.detached     # True if session closed
state.deleted      # True if marked for deletion
```

---

## Flush vs Commit

```python
with Session(engine) as session:
    user = User(name="Alice")
    session.add(user)

    session.flush()
    # SQL INSERT sent, user.id is now populated
    # transaction is still open, changes visible only in this session

    session.commit()
    # transaction committed, changes visible to other connections
```

| Operation | SQL sent? | Transaction committed? | ID available? |
|-----------|----------|----------------------|--------------|
| `flush()` | Yes | No | Yes |
| `commit()` | Yes (auto-flushes) | Yes | Yes |
| `rollback()` | No | Rolls back | No (reset) |

---

## Dependency Injection (FastAPI)

```python
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

engine = create_engine("postgresql+psycopg2://user:pass@localhost/db")
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
```

```python
from fastapi import Depends, FastAPI, HTTPException

app = FastAPI()


@app.get("/users/{user_id}")
def read_user(user_id: int, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404)
    return user
```

Use explicit transaction boundaries for writes (for example `with db.begin(): ...` in a service or write endpoint) instead of auto-committing in the DB dependency.

---

## Scoped Session (Thread-Local)

```python
from sqlalchemy.orm import scoped_session, sessionmaker

SessionFactory = sessionmaker(bind=engine)
ScopedSession = scoped_session(SessionFactory)

# each thread gets its own session
session = ScopedSession()
session.add(User(name="Alice"))
session.commit()
ScopedSession.remove()  # clean up at request end
```

Prefer `Session` + dependency injection over `scoped_session` in modern async frameworks.

---

## Best Practices

1. **One session per request** — create at start, close at end.
2. **Use `session.begin()`** — auto-commit on success, auto-rollback on exception.
3. **Call `flush()` when you need IDs** — before commit, within the same transaction.
4. **Set `expire_on_commit=False`** — avoids surprise lazy loads after commit.
5. **Never share sessions across threads** — use `scoped_session` or async patterns.
6. **Use dependency injection** — testable, framework-agnostic session management.
7. **Keep transactions short** — long-held locks degrade concurrency.
