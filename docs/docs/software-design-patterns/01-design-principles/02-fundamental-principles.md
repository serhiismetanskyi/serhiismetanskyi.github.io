---
date: 2026-06-16
tags:
  - design-patterns
  - architecture
---

# Design Principles: Beyond SOLID

SOLID is not the whole story. These ideas work in any language. They reduce accidental complexity and make systems easier to change safely.

---

## 1.2 DRY — Don't Repeat Yourself

Every piece of **knowledge** should have **one clear, authoritative** place in the system. When the rule changes, you change it once.

**Common duplication:**

- **Code duplication:** the same logic copied in two files. One update can be missed.
- **Logic duplication:** the same rule written twice (for example validation in a browser and on the server) without a shared definition.
- **Schema duplication:** the same structure in the database, API contract, and Python model, all edited by hand.

**Fix:** centralize — one validator, one model source, one place that owns the rule.

**Caution:** DRY is not “merge every similar-looking function.” If two pieces **look** the same but **change for different reasons**, one shared function ties them together (bad coupling). Ask: *Do they change together?*

---

## 1.3 KISS — Keep It Simple, Stupid

Pick the **simplest design that solves the problem**. Complexity is a tax on every future reader.

**Minimal abstraction:** add layers or patterns when you have a concrete need (several implementations, testing seams, real reuse). Do not add abstraction “for later.”

**Warning signs:**

- You cannot explain the design in one short sentence.
- New developers need a long time to understand one function.
- A trivial task passes through many indirection layers.

---

## 1.4 YAGNI — You Aren't Gonna Need It

Do not build features or general solutions for **requirements that do not exist yet**. Build what you need **now**. Extend when a real need appears.

**Cost of guessing:** extra code to read, test, and maintain — and the feature may never be used.

**Practical rule:** no ticket, no agreed user story, no real stakeholder need — do not implement it.

---

## 1.5 Composition over Inheritance

Prefer **building behavior from small parts** (composition) over **deep class trees** (inheritance).

**Why inheritance hurts at scale:**

- Deep hierarchies are hard to follow.
- A change in a base class can break many subclasses.
- Subclasses inherit everything, including behavior they do not want.

**Composition example:**

```python
class Logger:
    def log(self, msg: str) -> None:
        ...

class MetricsCollector:
    def record(self, name: str, value: float) -> None:
        ...

class PaymentService:
    def __init__(self, logger: Logger, metrics: MetricsCollector) -> None:
        self._logger = logger
        self._metrics = metrics

    def charge(self, amount: float) -> None:
        self._logger.log(f"charge {amount}")
        self._metrics.record("payment_amount", amount)
```

`PaymentService` **uses** `Logger` and `MetricsCollector`; it does not inherit from them.

---

## 1.6 Separation of Concerns (SoC)

Different **concerns** live in different places. A concern is a distinct responsibility: HTTP, validation, business rules, persistence, logging.

**Typical layers:**

| Layer        | Role |
|-------------|------|
| Controller  | Parse input, call application code, shape the response. |
| Service     | Business rules and orchestration. |
| Repository  | Data access. |
| Middleware  | Cross-cutting: auth, logging, rate limits. |

**Mixing:** a controller that runs raw SQL. A domain service that builds HTTP headers. Both blur boundaries and make tests and changes harder.

---

## 1.7 High Cohesion / Low Coupling

**High cohesion:** everything in a module belongs together for **one** clear purpose. Easier to read, test, and name.

**Low coupling:** modules depend on each other **lightly**. A change in module A should not force large edits across module B.

**Practical checks:**

- How many imports does this file need?
- If you change this module, how many others break?
- Can you test this module with **mocks or fakes** instead of the whole system?

**Goal:** modules you can understand, test, and sometimes deploy or replace with less pain.
