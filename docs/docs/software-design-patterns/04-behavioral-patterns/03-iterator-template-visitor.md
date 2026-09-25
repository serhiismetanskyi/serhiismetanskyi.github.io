---
date: 2026-06-18
tags:
  - design-patterns
  - architecture
---

# Behavioral Patterns: Iterator, Template Method, Visitor

## Iterator

**Idea:** Walk through a collection step by step without knowing its inner layout.

Python uses the iterator protocol: `__iter__` and `__next__`, or generators with `yield`.

```python
from collections.abc import Iterator


class NumberRange:
    def __init__(self, start: int, end: int, step: int = 1) -> None:
        self._start = start
        self._end = end
        self._step = step

    def __iter__(self) -> Iterator[int]:
        current = self._start
        while current < self._end:
            yield current
            current += self._step


for n in NumberRange(0, 10, 2):
    print(n)  # 0, 2, 4, 6, 8
```

Custom iterators help when data is lazy: paginated APIs, DB cursors, or large files you do not want to load fully.

**Where it helps:** Cursor pagination, API page loops, streaming files, graph walks (BFS/DFS as generators).

## Template Method

**Idea:** The base class fixes the order of steps. Subclasses only fill in the steps. The skeleton stays stable.

```python
from abc import ABC, abstractmethod


class DataImporter(ABC):
    def run(self) -> None:
        """Template: fixed sequence of steps."""
        raw = self.load_data()
        validated = self.validate(raw)
        self.save(validated)

    @abstractmethod
    def load_data(self) -> list[dict]: ...

    @abstractmethod
    def validate(self, data: list[dict]) -> list[dict]: ...

    def save(self, data: list[dict]) -> None:
        print(f"Saving {len(data)} records")


class CSVImporter(DataImporter):
    def load_data(self) -> list[dict]:
        return [{"name": "Alice"}]  # parse CSV

    def validate(self, data: list[dict]) -> list[dict]:
        return [r for r in data if r.get("name")]


class JSONImporter(DataImporter):
    def load_data(self) -> list[dict]:
        return [{"name": "Bob"}]  # parse JSON

    def validate(self, data: list[dict]) -> list[dict]:
        return data
```

**Where it helps:** Import pipelines, report jobs (load → process → format → export), batch frameworks.

## Visitor

**Idea:** Add a new operation over a tree of types by writing a visitor. You often avoid changing each node class for every new operation.

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass


class ASTNode(ABC):
    @abstractmethod
    def accept(self, visitor: "ASTVisitor") -> None: ...


class ASTVisitor(ABC):
    @abstractmethod
    def visit_number(self, node: "NumberNode") -> None: ...

    @abstractmethod
    def visit_add(self, node: "AddNode") -> None: ...


@dataclass
class NumberNode(ASTNode):
    value: int

    def accept(self, visitor: ASTVisitor) -> None:
        visitor.visit_number(self)


@dataclass
class AddNode(ASTNode):
    left: ASTNode
    right: ASTNode

    def accept(self, visitor: ASTVisitor) -> None:
        visitor.visit_add(self)


class PrintVisitor(ASTVisitor):
    def visit_number(self, node: NumberNode) -> None:
        print(node.value, end="")

    def visit_add(self, node: AddNode) -> None:
        node.left.accept(self)
        print("+", end="")
        node.right.accept(self)
```

**Where it helps:** Compiler AST passes, document export (HTML vs PDF visitor), pricing rules over a cart tree.

## Behavioral pattern risks

| Pattern | Risk |
| --- | --- |
| Strategy | Many tiny classes; simple cases may need only functions |
| Observer | Leaks if not unsubscribed; unclear order; ripple updates |
| Command | Undo and history can grow; complex operations are hard to reverse |
| Chain | Request may leave the chain with no handler |
| State | Too many states for simple flows; messy transitions |
| Mediator | Mediator grows into a “god” module |
| Iterator | Shared iterators need care with threads |
| Template Method | Strong tie to inheritance; subclasses can break rules |
| Visitor | New node types mean every visitor must change |
