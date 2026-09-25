---
date: 2026-06-17
tags:
  - design-patterns
  - architecture
---

# Creational Patterns

Creational patterns control how objects are created. They remove direct coupling between code and specific classes.

## Singleton

Ensures only one instance of a class exists. Useful for shared resources: config, connection pool, logger.

```python
class Config:
    _instance: "Config | None" = None

    def __new__(cls) -> "Config":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

cfg_a = Config()
cfg_b = Config()
assert cfg_a is cfg_b  # True
```

Python note: a module itself is a singleton — imported once, cached. Prefer a module-level instance over a Singleton class when possible.

Risks: global state hides dependencies. Hard to test in isolation (tests share state). Use with discipline — pass the singleton through DI rather than accessing it globally.

## Factory Method

Define an interface for creating an object, but let subclasses decide which class to instantiate.

```python
from abc import ABC, abstractmethod

class Notification(ABC):
    @abstractmethod
    def send(self, message: str) -> None: ...

class EmailNotification(Notification):
    def send(self, message: str) -> None:
        print(f"Email: {message}")

class SMSNotification(Notification):
    def send(self, message: str) -> None:
        print(f"SMS: {message}")

def get_notifier(channel: str) -> Notification:
    match channel:
        case "email": return EmailNotification()
        case "sms":   return SMSNotification()
        case _: raise ValueError(f"Unknown channel: {channel}")
```

Use when: the exact type to create depends on runtime configuration or input data.

## Abstract Factory

Create families of related objects without specifying their concrete classes.

```python
from abc import ABC, abstractmethod

class Button(ABC):
    @abstractmethod
    def render(self) -> str: ...

class Checkbox(ABC):
    @abstractmethod
    def render(self) -> str: ...

class UIFactory(ABC):
    @abstractmethod
    def create_button(self) -> Button: ...
    @abstractmethod
    def create_checkbox(self) -> Checkbox: ...

class DarkButton(Button):
    def render(self) -> str: return "<button class=dark>"

class DarkCheckbox(Checkbox):
    def render(self) -> str: return "<input class=dark type=checkbox>"

class DarkThemeFactory(UIFactory):
    def create_button(self) -> Button: return DarkButton()
    def create_checkbox(self) -> Checkbox: return DarkCheckbox()
```

Use when: you need to ensure that products from the same family work together (e.g. all UI widgets use the same theme).

## Builder

Build complex objects step by step. Separate construction from representation.

```python
from dataclasses import dataclass, field

@dataclass
class QueryBuilder:
    _table: str = ""
    _conditions: list[str] = field(default_factory=list)
    _limit: int | None = None

    def from_table(self, name: str) -> "QueryBuilder":
        self._table = name
        return self

    def where(self, condition: str) -> "QueryBuilder":
        self._conditions.append(condition)
        return self

    def limit(self, n: int) -> "QueryBuilder":
        self._limit = n
        return self

    def build(self) -> str:
        sql = f"SELECT * FROM {self._table}"
        if self._conditions:
            sql += " WHERE " + " AND ".join(self._conditions)
        if self._limit is not None:
            sql += f" LIMIT {self._limit}"
        return sql

query = (
    QueryBuilder()
    .from_table("orders")
    .where("status = 'active'")
    .limit(50)
    .build()
)
```

Use when: an object has many optional parts, or when you need different representations of the same data.

## Prototype

Create new objects by copying an existing instance (clone).

```python
import copy
from dataclasses import dataclass

@dataclass
class ReportTemplate:
    title: str
    sections: list[str]
    metadata: dict

base = ReportTemplate("Q4 Report", ["Summary", "Details"], {"author": "Alice"})
q4_version = copy.deepcopy(base)
q4_version.metadata["version"] = "v2"
```

Use when: creating a new instance is expensive (DB load, complex initialization), and you can start from a known good state.

## Use Cases and Risks

| Pattern | When to use | Risk |
|---|---|---|
| Singleton | Shared resource, single config | Global state, test pollution |
| Factory Method | Runtime type decision | Can become complex if too many types |
| Abstract Factory | Related object families | More classes, more indirection |
| Builder | Complex object with many options | Verbose if object is simple |
| Prototype | Expensive creation, clone variants | Deep copy pitfalls, hidden state |
