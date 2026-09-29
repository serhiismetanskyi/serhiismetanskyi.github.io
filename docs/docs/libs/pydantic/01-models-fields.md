---
date: 2026-09-18
tags:
  - python
  - libraries
  - pydantic
---

# Pydantic — Models & Fields

## BaseModel Basics

```python
from pydantic import BaseModel


class User(BaseModel):
    id: int
    name: str
    email: str
    is_active: bool = True


user = User(id=1, name="Alice", email="alice@test.com")
print(user.name)          # "Alice"
print(user.model_fields)  # field metadata dict
```

Models are mutable by default in v2 (`frozen=False`). Set `ConfigDict(frozen=True)` to make them immutable. Fields without defaults are required.

---

## Field Constraints

```python
from pydantic import BaseModel, Field


class Product(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    sku: str = Field(pattern=r"^[A-Z]{2}-\d{4}$")
    price: float = Field(gt=0, le=99_999.99)
    quantity: int = Field(ge=0, default=0)
    tags: list[str] = Field(default_factory=list, max_length=10)
```

| Param | Meaning | Param | Meaning |
|-------|---------|-------|---------|
| `gt` / `ge` | Greater than / ≥ | `lt` / `le` | Less than / ≤ |
| `multiple_of` | Divisible by value | `min_length` | Min character count |
| `max_length` | Max character count | `pattern` | Regex pattern |
| `strip_whitespace` | Trim spaces | `to_lower` / `to_upper` | Normalize case |

---

## Common Types

```python
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, HttpUrl


class Status(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class Account(BaseModel):
    id: UUID
    email: EmailStr                        # requires email-validator
    website: HttpUrl
    balance: Decimal
    status: Status
    created_at: datetime
    birth_date: date
    metadata: dict[str, str] = Field(default_factory=dict)
    scores: list[int] = Field(default_factory=list)
    unique_tags: set[str] = Field(default_factory=set)
```

| Type | Accepts | Notes |
|------|---------|-------|
| `str`, `int`, `float`, `bool` | Coerced by default | Use strict mode to disable |
| `list[T]`, `set[T]` | Sequences | Inner type validated |
| `dict[K, V]` | Mappings | Keys and values validated |
| `tuple[int, str]` / `tuple[int, ...]` | Fixed / variable-length | Positional or homogeneous |
| <code>T &#124; None</code> | Nullable | Required unless `= None` |
| `UUID`, `datetime`, `date` | String or native | Auto-parses |
| `Decimal` | String, int, float | Preserves precision |
| `Enum` | Value or member | Validates membership |
| `EmailStr`, `HttpUrl` | String | Requires `email-validator` / built-in |

---

## Nested Models

```python
from pydantic import BaseModel


class Address(BaseModel):
    street: str
    city: str
    zip_code: str


class Company(BaseModel):
    name: str
    address: Address


data = {
    "name": "Acme",
    "address": {"street": "123 Main", "city": "NYC", "zip_code": "10001"},
}
company = Company.model_validate(data)
print(company.address.city)  # "NYC"
```

Nested models validate recursively — inner dicts are auto-parsed into model instances.

---

## Aliases

```python
from pydantic import BaseModel, Field


class Event(BaseModel):
    event_type: str = Field(alias="eventType")
    start_time: str = Field(alias="startTime")
    is_public: bool = Field(alias="isPublic", default=True)

event = Event.model_validate({"eventType": "talk", "startTime": "10:00"})
print(event.event_type)                   # "talk" — Python access
print(event.model_dump(by_alias=True))    # {"eventType": "talk", ...}
```

### Validation Alias with Multiple Sources

```python
from pydantic import AliasChoices, AliasPath, BaseModel, Field


class Config(BaseModel):
    db_host: str = Field(
        validation_alias=AliasChoices("DB_HOST", AliasPath("database", "host")),
    )
```

Accepts `{"DB_HOST": "localhost"}` or `{"database": {"host": "localhost"}}`.

---

## Optional & Default Patterns

```python
from pydantic import BaseModel, Field


class Filter(BaseModel):
    query: str                                     # required
    page: int = 1                                  # default value
    per_page: int = Field(default=25, ge=1, le=100)
    tags: list[str] | None = None                  # optional, defaults to None
    sort_by: str = Field(default="created_at")


f = Filter(query="python")
f.model_dump()                    # all fields, including defaults
f.model_dump(exclude_unset=True)  # {"query": "python"} — only set by caller
f.model_dump(exclude_none=True)   # omits None-valued fields
```

Use `exclude_unset=True` for PATCH semantics — only update fields the client explicitly sent.
