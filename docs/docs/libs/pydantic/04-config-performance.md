---
date: 2026-09-19
tags:
  - python
  - libraries
  - pydantic
---

# Pydantic — Config & Performance

## ConfigDict

```python
from pydantic import BaseModel, ConfigDict


class StrictUser(BaseModel):
    model_config = ConfigDict(
        strict=True,              # no type coercion
        frozen=True,              # immutable instances
        extra="forbid",           # reject unknown fields
        str_strip_whitespace=True,
        validate_assignment=True, # re-validate on attr set
        populate_by_name=True,    # accept both alias and field name
        use_enum_values=True,     # store enum value, not member
    )

    name: str
    age: int
```

| Option | Default | Effect |
|--------|---------|--------|
| `strict` | `False` | Disable type coercion |
| `frozen` | `False` | Make model immutable (hashable) |
| `extra` | `"ignore"` | `"allow"`, `"forbid"`, or `"ignore"` unknown fields |
| `validate_assignment` | `False` | Re-validate when setting attributes |
| `populate_by_name` | `False` | Accept both field name and alias |
| `str_strip_whitespace` | `False` | Strip whitespace from strings |
| `use_enum_values` | `False` | Store enum `.value` instead of member |
| `validate_default` | `False` | Validate default values |

---

## Strict Mode

Prevents automatic type coercion — values must match the declared type exactly.

```python
from pydantic import BaseModel, ConfigDict, Field, ValidationError


class Measurement(BaseModel):
    model_config = ConfigDict(strict=True)
    value: float
    unit: str


Measurement(value=3.14, unit="kg")        # OK
try:
    Measurement(value="3.14", unit="kg")  # ValidationError — str ≠ float
except ValidationError as e:
    print(e.errors()[0]["type"])           # "float_type"


class Mixed(BaseModel):
    strict_id: int = Field(strict=True)   # per-field strict
    flexible_name: str                     # coercion allowed
```

---

## Pydantic Dataclasses

Validation with stdlib dataclass interface.

```python
from pydantic import ConfigDict, field_validator
from pydantic.dataclasses import dataclass


@dataclass(config=ConfigDict(strict=True, frozen=True))
class Point:
    x: float
    y: float

    @field_validator("x", "y")
    @classmethod
    def must_be_finite(cls, v: float) -> float:
        if not (-1e6 <= v <= 1e6):
            raise ValueError("coordinate out of range")
        return v
```

Supports `__post_init__`, `field_validator`, `model_validator`, and `ConfigDict`.

---

## Performance Tips

### 1. Use model_validate_json for JSON Input

```python
user = User.model_validate_json(raw_json_bytes)
```

Faster than `json.loads()` + `model_validate()` — Rust-based parser handles both steps.

### 2. Direct JSON Output

```python
json_str = user.model_dump_json()  # no intermediate dict
```

Prefer `model_dump_json()` over `json.dumps(model.model_dump())`.

### 3. Discriminated Unions Short-Circuit

```python
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field


class Cat(BaseModel):
    pet_type: Literal["cat"]
    meow_volume: int


class Dog(BaseModel):
    pet_type: Literal["dog"]
    bark_volume: int


Pet = Annotated[Union[Cat, Dog], Field(discriminator="pet_type")]
```

### 4. Frozen Models for Caching

```python
from functools import lru_cache

from pydantic import BaseModel, ConfigDict


class CacheKey(BaseModel):
    model_config = ConfigDict(frozen=True)
    endpoint: str
    params: tuple[tuple[str, str], ...]


@lru_cache(maxsize=128)
def fetch(key: CacheKey) -> dict:
    ...
```

`frozen=True` makes models hashable — compatible with `lru_cache`, sets, dict keys.

---

## FastAPI Integration

```python
from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI()


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str


class UserRead(BaseModel):
    id: int
    name: str
    email: str


@app.post("/users", response_model=UserRead, status_code=201)
async def create_user(user: UserCreate) -> UserRead:
    db_user = await save_user(user)
    return UserRead.model_validate(db_user)
```

Pattern: `Base` for shared fields, `Create` adds write-only, `Update` makes all optional, `Read` adds read-only.

---

## v1 → v2 Migration

| v1 | v2 |
|----|-----|
| `.dict()` | `.model_dump()` |
| `.json()` | `.model_dump_json()` |
| `.parse_obj(d)` | `.model_validate(d)` |
| `.parse_raw(s)` | `.model_validate_json(s)` |
| `.schema()` | `.model_json_schema()` |
| `@validator` | `@field_validator` |
| `@root_validator` | `@model_validator` |
| `Config` class | `model_config = ConfigDict(...)` |
| `orm_mode = True` | `from_attributes=True` |

Run `bump-pydantic` to auto-migrate most v1 code to v2 syntax.
