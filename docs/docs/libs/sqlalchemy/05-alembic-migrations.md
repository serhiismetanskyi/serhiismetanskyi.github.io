---
date: 2026-09-24
tags:
  - python
  - libraries
  - sqlalchemy
  - databases
---

# SQLAlchemy — Alembic Migrations

## Setup

```bash
uv add alembic
alembic init alembic           # sync template
alembic init -t async alembic  # async template (choose one, not both)
```

### Configure `alembic/env.py`

```python
from app.database import Base  # your DeclarativeBase
from app.config import settings

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

target_metadata = Base.metadata
```

Set `target_metadata` to your `Base.metadata` so Alembic can detect model changes.

---

## Core Commands

| Command | Purpose |
|---------|---------|
| `alembic revision --autogenerate -m "add users table"` | Create migration from model diff |
| `alembic upgrade head` | Apply all pending migrations |
| `alembic downgrade -1` | Roll back one migration |
| `alembic downgrade base` | Roll back all migrations |
| `alembic current` | Show current revision |
| `alembic history` | List all revisions |
| `alembic heads` | Show latest revision(s) |
| `alembic stamp head` | Mark DB as up-to-date without running migrations |

---

## Auto-Generated Migration

```bash
alembic revision --autogenerate -m "add users table"
```

Generates a file like `alembic/versions/abc123_add_users_table.py`:

```python
"""add users table"""

from alembic import op
import sqlalchemy as sa

revision = "abc123"
down_revision = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_email", "users", ["email"])


def downgrade() -> None:
    op.drop_index("ix_users_email", "users")
    op.drop_table("users")
```

Always review auto-generated migrations — they may miss renames, data migrations, or ordering.

---

## Common Operations

### Add Column

```python
def upgrade() -> None:
    op.add_column("users", sa.Column("bio", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "bio")
```

### Rename Column

```python
def upgrade() -> None:
    op.alter_column("users", "name", new_column_name="full_name")


def downgrade() -> None:
    op.alter_column("users", "full_name", new_column_name="name")
```

### Add Index

```python
def upgrade() -> None:
    op.create_index("ix_users_name", "users", ["name"])


def downgrade() -> None:
    op.drop_index("ix_users_name", "users")
```

### Add Foreign Key

```python
def upgrade() -> None:
    op.add_column("posts", sa.Column("user_id", sa.Integer(), nullable=False))
    op.create_foreign_key("fk_posts_user_id", "posts", "users", ["user_id"], ["id"])


def downgrade() -> None:
    op.drop_constraint("fk_posts_user_id", "posts", type_="foreignkey")
    op.drop_column("posts", "user_id")
```

---

## Data Migrations

```python
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


def upgrade() -> None:
    op.add_column("users", sa.Column("role", sa.String(20), server_default="viewer"))
    op.execute(text("UPDATE users SET role = 'admin' WHERE is_superuser = true"))
    op.drop_column("users", "is_superuser")


def downgrade() -> None:
    op.add_column("users", sa.Column("is_superuser", sa.Boolean(), server_default="false"))
    op.execute(text("UPDATE users SET is_superuser = true WHERE role = 'admin'"))
    op.drop_column("users", "role")
```

---

## Async Migrations (`env.py`)

```python
import asyncio

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from app.database import Base
from app.config import settings


def do_migrations(connection):
    context.configure(connection=connection, target_metadata=Base.metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations():
    engine = create_async_engine(settings.database_url)
    async with engine.connect() as connection:
        await connection.run_sync(do_migrations)
    await engine.dispose()


def run_migrations_online():
    asyncio.run(run_async_migrations())


run_migrations_online()
```

---

## Best Practices

1. **Always review autogenerate output** — check renames, data integrity, index order.
2. **Write both `upgrade()` and `downgrade()`** — rollbacks save production incidents.
3. **Use `server_default` for new NOT NULL columns** — avoids failures on existing rows.
4. **Test migrations on a copy of production data** — catches edge cases early.
5. **Run `alembic upgrade head` in CI** — verify migrations apply cleanly.
6. **Squash old migrations periodically** — keeps history manageable.
7. **Never edit already-applied migrations** — create a new revision instead.
