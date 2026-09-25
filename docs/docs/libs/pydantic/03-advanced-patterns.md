---
date: 2026-09-19
tags:
  - python
  - libraries
  - pydantic
---

# Pydantic — Advanced Patterns

## Discriminated Unions

Use a literal field to select the correct model variant — faster and more predictable than untagged unions.

```python
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field


class CreditCard(BaseModel):
    method: Literal["credit_card"]
    card_number: str
    cvv: str


class BankTransfer(BaseModel):
    method: Literal["bank_transfer"]
    account_number: str
    routing_number: str


Payment = Annotated[
    Union[CreditCard, BankTransfer],
    Field(discriminator="method"),
]


class Order(BaseModel):
    id: int
    payment: Payment


order = Order.model_validate({
    "id": 1,
    "payment": {"method": "credit_card", "card_number": "4111...", "cvv": "123"},
})
```

### Custom Discriminator Function

```python
from typing import Annotated, Any, Union

from pydantic import BaseModel, Discriminator, Tag


def detect_shape(v: Any) -> str:
    if isinstance(v, dict) and "radius" in v:
        return "circle"
    return "rect"


class Circle(BaseModel):
    radius: float


class Rect(BaseModel):
    width: float
    height: float


Shape = Annotated[
    Union[Annotated[Circle, Tag("circle")], Annotated[Rect, Tag("rect")]],
    Discriminator(detect_shape),
]
```

---

## Generic Models

```python
from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    per_page: int


class User(BaseModel):
    id: int
    name: str


users_page = Page[User].model_validate({
    "items": [{"id": 1, "name": "Alice"}],
    "total": 50,
    "page": 1,
    "per_page": 25,
})
```

---

## TypeAdapter

Validate and serialize non-model types — lists, dicts, unions, primitives.

```python
from pydantic import TypeAdapter

int_adapter = TypeAdapter(int)
int_adapter.validate_python("42")         # 42
int_adapter.validate_json(b'"42"')        # 42

list_adapter = TypeAdapter(list[int])
list_adapter.validate_python(["1", "2"])  # [1, 2]
list_adapter.json_schema()                # {"items": {"type": "integer"}, ...}
```

---

## BaseSettings — Config from Environment

```python
from pydantic import Field
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="APP_", env_file=".env")

    debug: bool = False
    db_url: str = Field(alias="DATABASE_URL")
    secret_key: str
    workers: int = 4
    allowed_hosts: list[str] = Field(default_factory=lambda: ["localhost"])
```

```bash
APP_DEBUG=true
DATABASE_URL=postgresql://user:pass@localhost/db
APP_SECRET_KEY=super-secret
```

### Nested Settings

```python
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict


class DatabaseConfig(BaseModel):
    host: str = "localhost"
    port: int = 5432


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="APP_", env_nested_delimiter="__")
    db: DatabaseConfig = DatabaseConfig()
```

```bash
APP_DB__HOST=db.prod.internal
APP_DB__PORT=5433
```

---

## JSON Schema, Inheritance & Private Attrs

```python
from pydantic import BaseModel, Field, PrivateAttr


class Item(BaseModel):
    name: str = Field(title="Item Name", description="Display name", examples=["Widget"])

Item.model_json_schema()  # full JSON Schema dict


class BaseUser(BaseModel):
    name: str
    email: str

class AdminUser(BaseUser):  # inherits all fields and validators
    permissions: list[str]


class Service(BaseModel):
    name: str
    _client: object = PrivateAttr(default=None)  # excluded from validation/schema
```
