---
date: 2026-06-21
tags:
  - design-patterns
  - architecture
  - testing
---

# Anti-Patterns, Real-World Usage, Heuristics, and Decision Factors

Simple English (B1). Senior readers: names stay standard; text stays short.

## Production Anti-Patterns

### God Object

One class does everything: hundreds of methods, imports half the app.

**Fix:** split by responsibility. Small types, clear modules.

### Spaghetti Code

Calls go in all directions. No layers, no story when you read the file.

**Fix:** layers (UI → app → domain → infra), clear module borders.

### Cyclic Dependencies

`A` needs `B`, `B` needs `A`. Hard to test and ship pieces alone.

**Fix:** interfaces, events, or a third module for shared bits.

### Big Ball of Mud

No architecture: every part knows every part.

**Fix:** incremental strangler: wrap, extract, route traffic step by step.

### Distributed Monolith

Many deploy units, but every release needs the same coordination.

**Fix:** bounded contexts, owned data, async messages between services.

### Overengineering

Factories of factories for one class. Abstract interfaces that have one concrete
implementation and will never have a second.

**Fix:** YAGNI. Add abstraction when the second real case appears, not before.

### Premature Abstraction

Extracting a base class or shared helper at the first sign of similarity, before
knowing if the two things actually belong together. Similarity is not the same as
shared intent — if they change for different reasons, merging them creates coupling.

**Fix:** wait for the pain. Two or three real uses justify an abstraction.

### Pattern Overuse

Applying patterns because they look good on a diagram, not because they solve a
real problem. A three-layer factory to create one object type. An Event Bus for
five lines of in-process logic. An Abstract Factory where a plain function would do.

**Fix:** ask "what pain does this solve right now?" If there is no good answer,
do not add the pattern. Patterns are vocabulary, not decoration.

### Anemic Domain Model

Entities are bags of fields; all logic sits in `*Service` classes.

**Fix:** behavior on the entity when it fits: `order.cancel()`, not only `service.cancel(order)`.

### Tight DB Coupling

Services share tables and join across “boundaries” in SQL.

**Fix:** one owner per schema; cross-service reads via API or events.

---

## Real-World Pattern Usage

| Situation | Pattern | Why |
|-----------|---------|-----|
| Many payment backends | Strategy | Swap at runtime |
| Config-driven creation | Factory | One place picks the class |
| HTTP / pipeline | Chain of Responsibility | Auth → limit → validate → handler |
| Order lifecycle | State | Rules per phase |
| Mobile + web aggregation | Facade / Aggregator | One response, many sources |
| Cross-cutting concerns | Decorator | Logging, auth without editing core |
| Async side effects | Observer / Pub/Sub | Loose coupling between services |
| Central coordination | Mediator / Saga | Ordered steps with compensation |

```python
# Strategy — pick payment at runtime via callable
from typing import Protocol


class PaymentProcessor(Protocol):
    async def pay(self, amount: float) -> None: ...


async def checkout(amount: float, processor: PaymentProcessor) -> None:
    await processor.pay(amount)
```

```python
# State — behavior follows phase
class Order:
    def __init__(self, phase: str) -> None:
        self.phase = phase

    def ship(self) -> None:
        if self.phase != "paid":
            raise ValueError("invalid transition")
        self.phase = "shipped"
```

---

## Heuristics (Staff-Level)

1. **Composition over inheritance** when behavior varies at runtime.
2. **Two real uses** before you extract a big abstraction.
3. **Optimize for change** — code is read and edited more than written once.
4. **Low coupling** — changing module A should not break unrelated B.
5. **High cohesion** — things that change together live together.
6. **Patterns fix pain** — not goals by themselves.

---

## Risks and Limitations (§14)

| Risk | Description | Mitigation |
|------|-------------|-----------|
| Overengineering | Too many abstractions for simple problems | YAGNI; add layers when real pain exists |
| Pattern misuse | Using the right pattern in the wrong context (e.g. Singleton for a service that should have multiple instances) | Understand intent, not just structure; review the problem before picking a pattern |
| Complexity growth | As patterns multiply, onboarding new developers takes longer; the codebase becomes harder to trace | Document boundaries; keep a pattern index; prefer familiar patterns when unusual ones offer no concrete benefit |
| Performance overhead | Each indirection layer adds a function call and sometimes a heap allocation | Profile before optimizing; avoid patterns in hot paths where a plain function is faster |
| Maintainability | Patterns with hidden wiring (Mediator, complex Observer chains) make bugs hard to trace | Make wiring explicit and visible; log transitions; keep pattern implementations small |

---

## Decision Factors

| Factor | Effect |
|--------|--------|
| Problem size | Small problem → few patterns. Big problem → structure, not more patterns. |
| Team skill | Unknown pattern in production adds risk. Train first. |
| Performance | Indirection costs; measure hot paths. |
| Scale | Some patterns fit many instances (Strategy, Observer). Tight mediators can bottleneck. |
| Maintenance | Good patterns help; pattern spam hurts. |

**Short rule:** match structure to real constraints; test boundaries; avoid fashion without pain.
