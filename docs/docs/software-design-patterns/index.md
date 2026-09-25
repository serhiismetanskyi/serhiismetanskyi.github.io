---
date: 2026-06-15
tags:
  - design-patterns
  - architecture
---

# Software Design Patterns and Principles

## Section Descriptions

### 1. [Design Principles](01-design-principles/index.md)

| File | Topics |
|------|--------|
| [OOP Fundamentals](01-design-principles/00-oop-fundamentals.md) | Encapsulation, Inheritance, Polymorphism, Abstraction — core OOP concepts |
| [SOLID Principles](01-design-principles/01-solid-principles.md) | SRP, OCP, LSP, ISP, DIP — with Python examples and violation/fix patterns |
| [Fundamental Principles](01-design-principles/02-fundamental-principles.md) | DRY, KISS, YAGNI, Composition over Inheritance, SoC, High Cohesion/Low Coupling |
| [Clean Code](01-design-principles/03-clean-code.md) | Naming, functions, readability, formatting, comments — practical clean code rules |
| [Code Quality Tools](01-design-principles/04-code-quality-tools.md) | Linters, formatters, type checkers, static analysis — tool-based quality enforcement |

### 2. [Creational Patterns](02-creational-patterns/index.md)

| File | Topics |
|------|--------|
| [Creational Patterns](02-creational-patterns/01-patterns.md) | Singleton, Factory Method, Abstract Factory, Builder, Prototype — Python examples, use cases, risks |

### 3. [Structural Patterns](03-structural-patterns/index.md)

| File | Topics |
|------|--------|
| [Adapter, Decorator & Facade](03-structural-patterns/01-adapter-decorator-facade.md) | Adapter, Decorator, Facade — with Python examples |
| [Proxy, Composite, Bridge & Flyweight](03-structural-patterns/02-proxy-composite-bridge-flyweight.md) | Proxy, Composite, Bridge, Flyweight — with risks table |

### 4. [Behavioral Patterns](04-behavioral-patterns/index.md)

| File | Topics |
|------|--------|
| [Strategy, Observer & Command](04-behavioral-patterns/01-strategy-observer-command.md) | Strategy, Observer, Command — real-world uses, risks |
| [Chain, State & Mediator](04-behavioral-patterns/02-chain-state-mediator.md) | Chain of Responsibility, State, Mediator — middleware pipeline, order lifecycle |
| [Iterator, Template & Visitor](04-behavioral-patterns/03-iterator-template-visitor.md) | Iterator, Template Method, Visitor — risks table |

### 5. Composition and Architectural Patterns

| File | Topics |
|------|--------|
| [Advanced Composition](05-composition-architectural/01-composition-advanced.md) | Layout Composer, Aggregator/Composer, Pipeline/Middleware, BFF |
| [Architectural Patterns](05-composition-architectural/02-architectural-patterns.md) | Layered, Clean Architecture, Hexagonal (Ports & Adapters) — Python examples, comparison table |
| [Event-Driven & Isomorphic](05-composition-architectural/03-event-driven-isomorphic.md) | Microservices, Event-Driven (Outbox, idempotency), Isomorphic/Universal Architecture |
| [Queues vs Streams & Messaging](05-composition-architectural/04-queues-streams-messaging.md) | Queues vs Streams, delivery semantics (at-least/exactly-once), ordering, retries, DLQ patterns, Kafka/RabbitMQ/SQS comparison |

### 6. Frontend and Cross-Layer Patterns

| File | Topics |
|------|--------|
| [Frontend Patterns](06-frontend-cross-layer/01-frontend-patterns.md) | Component-Based, Atomic Design, Container/Presentational, Hooks, State Management, BFF Integration |
| [Cross-Layer Patterns](06-frontend-cross-layer/02-cross-layer-patterns.md) | Shared DTOs, Shared Validation, Type Sharing (OpenAPI/Protobuf), versioning risks |

### 7. Decisions, Testing, Anti-Patterns

| File | Topics |
|------|--------|
| [Comparison & Testing](07-decisions-testing-production/01-comparison-testing.md) | Pattern comparison matrix (Strategy vs State, Factory vs Builder, etc.), Unit/Integration/Contract/Property/Mutation testing |
| [Anti-Patterns & Real-World](07-decisions-testing-production/02-antipatterns-real-world.md) | God Object, Spaghetti, Cyclic deps, Overengineering, Anemic model, real-world usage table, heuristics, decision factors |
| [Production Readiness Checklist](07-decisions-testing-production/03-production-readiness.md) | Logging, metrics, tracing, alerting, resiliency, health checks, security, SLO/SLI — gate checklist before deploy |

## Sections

- [Composition Architectural](05-composition-architectural/index.md)
- [Frontend Cross Layer](06-frontend-cross-layer/index.md)
- [Decisions Testing Production](07-decisions-testing-production/index.md)

---
## See also
- [Digital Garden: Knowledge Base](../index.md)
- [Test Design Patterns in Test Automation](../test-design-patterns/index.md)
- [Design Patterns](../test-automation-framework/02-design-patterns/index.md)
- [OOP & Error Handling](../python-guide/02-oop-error-handling/index.md)
- [Client–Server Architecture](../client-server-architecture/index.md)

