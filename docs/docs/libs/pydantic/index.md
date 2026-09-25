---
date: 2026-09-18
tags:
  - python
  - libraries
  - pydantic
---

# Pydantic — Data Validation & Settings

Python's most widely used data validation library. Powered by Rust core in v2 (5–50x faster than v1). Type-hint-driven models with automatic parsing, validation, and serialization.

## Installation

```bash
uv add pydantic
uv add pydantic-settings  # env-based configuration
uv add email-validator     # email string validation
```

## When to Use What

| Tool | Best for |
|------|----------|
| `pydantic.BaseModel` | API request/response schemas, domain objects, config |
| `@dataclass` (pydantic) | Lighter models when you need dataclass compatibility |
| `TypeAdapter` | Validating non-model types (lists, dicts, primitives) |
| `BaseSettings` | App config from env vars, `.env`, secrets |

## Section Map

| File | Topics |
|------|--------|
| [01 Models & Fields](./01-models-fields.md) | BaseModel, Field, types, constraints, nested models, aliases |
| [02 Validators & Serialization](./02-validators-serialization.md) | field_validator, model_validator, model_dump, field_serializer, computed_field |
| [03 Advanced Patterns](./03-advanced-patterns.md) | Discriminated unions, generics, TypeAdapter, BaseSettings, JSON Schema |
| [04 Config & Performance](./04-config-performance.md) | Strict mode, ConfigDict, dataclasses, performance tips, FastAPI integration |

## Cheat Sheet

### Model Basics

```python
from pydantic import BaseModel, Field


class User(BaseModel):
    name: str
    email: str = Field(max_length=255)
    age: int = Field(ge=0, le=150)
    role: str = "viewer"
```

### Create & Validate

```python
user = User(name="Alice", email="alice@example.com", age=30)
user = User.model_validate({"name": "Alice", "email": "alice@example.com", "age": 30})
user = User.model_validate_json('{"name":"Alice","email":"alice@example.com","age":30}')
```

### Serialize

```python
user.model_dump()                        # → dict
user.model_dump(exclude_unset=True)      # only explicitly set fields
user.model_dump(by_alias=True)           # use field aliases
user.model_dump_json()                   # → JSON string
user.model_dump(mode="json")             # dict with JSON-safe types
```

### Validators

```python
from pydantic import field_validator, model_validator


class Order(BaseModel):
    price: float
    quantity: int

    @field_validator("price")
    @classmethod
    def price_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("price must be positive")
        return v

    @model_validator(mode="after")
    def check_total(self) -> "Order":
        if self.price * self.quantity > 10_000:
            raise ValueError("order total exceeds limit")
        return self
```

### Quick Rules

1. **Define models at boundaries** — API input, DB rows, config files.
2. **Use `Field()` constraints** — `ge`, `le`, `min_length`, `max_length`, `pattern`.
3. **Prefer `model_validate()`** over manual `__init__` for dict/JSON input.
4. **Use `field_validator`** for single-field rules, `model_validator` for cross-field.
5. **Call `model_dump(exclude_unset=True)`** for PATCH-style partial updates.
6. **Enable strict mode** when you need exact types without coercion.
7. **Use `TypeAdapter`** to validate plain types (lists, unions) without a model.

---
## See also
- [Digital Garden: Knowledge Base](../../index.md)
- [Python Guide for Automation QA](../../python-guide/index.md)
- [Test Automation Framework](../../test-automation-framework/index.md)
- [CI/CD](../../ci-cd-approaches/index.md)
- [Tools — Practical Reference Guides](../../tools/index.md)
- [Python Libraries](../index.md)

