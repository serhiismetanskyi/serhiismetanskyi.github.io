---
date: 2026-06-18
tags:
  - design-patterns
  - architecture
---

# Behavioral Patterns: Strategy, Observer, Command

Behavioral patterns describe how objects talk to each other and share work. This note covers three classic patterns from the Gang of Four book.

## Strategy

**Idea:** Replace a long chain of conditions (`if` / `elif` / `match`) with a set of interchangeable algorithms.

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass


class SortStrategy(ABC):
    @abstractmethod
    def sort(self, data: list[int]) -> list[int]: ...


class QuickSort(SortStrategy):
    def sort(self, data: list[int]) -> list[int]:
        return sorted(data)  # simplified


class RadixSort(SortStrategy):
    def sort(self, data: list[int]) -> list[int]:
        return sorted(data)  # simplified


@dataclass
class Sorter:
    strategy: SortStrategy

    def sort(self, data: list[int]) -> list[int]:
        return self.strategy.sort(data)
```

**Where it helps:** Payment providers (Stripe, PayPal, bank transfer). Compression libraries. Report export (PDF, CSV, Excel). Shipping cost rules.

**When to choose it:** You have several ways to do the same job, and you want to pick the way at runtime without giant `if` trees.

## Observer

**Idea:** One object (the subject) tells many listeners (observers) when something important happens.

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass, field


class EventObserver(ABC):
    @abstractmethod
    def update(self, event: str, data: dict) -> None: ...


@dataclass
class EventBus:
    _observers: list[EventObserver] = field(default_factory=list)

    def subscribe(self, observer: EventObserver) -> None:
        self._observers.append(observer)

    def publish(self, event: str, data: dict) -> None:
        for obs in self._observers:
            obs.update(event, data)


class EmailObserver(EventObserver):
    def update(self, event: str, data: dict) -> None:
        if event == "order.placed":
            print(f"Email: order {data['order_id']} confirmation sent")


class AnalyticsObserver(EventObserver):
    def update(self, event: str, data: dict) -> None:
        print(f"Analytics: tracking {event} for order {data.get('order_id')}")


bus = EventBus()
bus.subscribe(EmailObserver())
bus.subscribe(AnalyticsObserver())
bus.publish("order.placed", {"order_id": "ORD-42"})
```

**Where it helps:** UI events (click, scroll). Domain events (order placed → email, stock, analytics). Reactive streams.

**Risks:** Forgetting to unsubscribe can leak memory. Do not depend on the order of `update` calls unless you define it yourself.

## Command

**Idea:** Wrap a request in an object. You can queue it, log it, and often undo it.

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass, field


class Command(ABC):
    @abstractmethod
    def execute(self) -> None: ...

    @abstractmethod
    def undo(self) -> None: ...


@dataclass
class TextEditor:
    _text: str = ""
    _history: list[Command] = field(default_factory=list)

    def run(self, cmd: Command) -> None:
        cmd.execute()
        self._history.append(cmd)

    def undo(self) -> None:
        if self._history:
            self._history.pop().undo()


@dataclass
class InsertText(Command):
    editor: TextEditor
    text: str

    def execute(self) -> None:
        self.editor._text += self.text

    def undo(self) -> None:
        self.editor._text = self.editor._text[: -len(self.text)]
```

**Where it helps:** Transaction logs. Task queues (each job is a command). Undo/redo in editors. Retries with full request data stored on the command object.

**Note:** Renamed `execute` on `TextEditor` to `run` so it does not clash with `Command.execute`.
