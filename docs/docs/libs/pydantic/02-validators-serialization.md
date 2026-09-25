---
date: 2026-09-19
tags:
  - python
  - libraries
  - pydantic
---

# Pydantic — Validators & Serialization

## Field Validators

Run on a single field after type parsing. Must be `@classmethod`.

```python
from pydantic import BaseModel, field_validator


class User(BaseModel):
    username: str
    email: str
    age: int

    @field_validator("username")
    @classmethod
    def username_alphanumeric(cls, v: str) -> str:
        if not v.isalnum():
            raise ValueError("must be alphanumeric")
        return v

    @field_validator("email")
    @classmethod
    def email_lower(cls, v: str) -> str:
        return v.lower()
```

### Validator Modes

| Mode | Receives | Use case |
|------|----------|----------|
| `mode="after"` (default) | Parsed value | Business rules on final type |
| `mode="before"` | Raw input | Pre-processing, normalization |
| `mode="wrap"` | Raw input + handler | Full control over parsing pipeline |
| `mode="plain"` | Raw input | Replaces default validation entirely |

```python
from pydantic import BaseModel, field_validator


class Flexible(BaseModel):
    tags: list[str]

    @field_validator("tags", mode="before")
    @classmethod
    def split_csv(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            return [t.strip() for t in v.split(",")]
        return v
```

---

## Model Validators

Validate relationships between fields. Access the full model.

```python
from pydantic import BaseModel, model_validator


class DateRange(BaseModel):
    start: str
    end: str

    @model_validator(mode="after")
    def end_after_start(self) -> "DateRange":
        if self.end <= self.start:
            raise ValueError("end must be after start")
        return self
```

### Before Mode — Pre-process Raw Data

```python
from typing import Any

from pydantic import BaseModel, model_validator


class NormalizedInput(BaseModel):
    name: str
    value: int

    @model_validator(mode="before")
    @classmethod
    def strip_whitespace(cls, data: Any) -> Any:
        if isinstance(data, dict):
            return {k: v.strip() if isinstance(v, str) else v for k, v in data.items()}
        return data
```

---

## Annotated Validators (Reusable)

Attach validators to types via `Annotated` — share across models.

```python
from typing import Annotated

from pydantic import AfterValidator, BaseModel


def must_be_positive(v: float) -> float:
    if v <= 0:
        raise ValueError("must be positive")
    return v


PositiveFloat = Annotated[float, AfterValidator(must_be_positive)]


class Product(BaseModel):
    price: PositiveFloat
    weight: PositiveFloat
```

Available: `BeforeValidator`, `AfterValidator`, `WrapValidator`, `PlainValidator`.

---

## Serialization — model_dump

```python
from pydantic import BaseModel, Field


class Item(BaseModel):
    name: str
    price: float
    tags: list[str] = Field(default_factory=list)
    internal_id: int = 0


item = Item(name="Widget", price=9.99, tags=["sale"])
item.model_dump()                          # full dict
item.model_dump(include={"name", "price"}) # only selected
item.model_dump(exclude={"internal_id"})   # exclude fields
item.model_dump(exclude_defaults=True)     # omit defaults
item.model_dump_json()                     # JSON string (Rust-based, fast)
item.model_dump(mode="json")               # dict with JSON-safe types
```

`mode="json"` converts `datetime` → ISO string, `UUID` → string, `Decimal` → string, etc.

---

## Field Serializer & Computed Fields

```python
from datetime import datetime

from pydantic import BaseModel, computed_field, field_serializer


class Order(BaseModel):
    name: str
    start: datetime
    price: float
    quantity: int

    @field_serializer("start")
    def serialize_start(self, dt: datetime) -> str:
        return dt.strftime("%Y-%m-%d %H:%M")

    @computed_field
    @property
    def total(self) -> float:
        return self.price * self.quantity
```

- `@field_serializer` — customize output format for specific fields.
- `@computed_field` — derived property auto-included in `model_dump()` and JSON Schema (read-only, not accepted as input).
- `@model_serializer` — full control over entire model's serialization output.

---

## Error Handling

```python
from pydantic import BaseModel, ValidationError


class User(BaseModel):
    name: str
    age: int

try:
    User(name="", age="not_a_number")
except ValidationError as e:
    print(e.error_count())    # number of errors
    print(e.errors())         # list of error dicts — each has loc, msg, type
    print(e.json())           # JSON string of errors
```
