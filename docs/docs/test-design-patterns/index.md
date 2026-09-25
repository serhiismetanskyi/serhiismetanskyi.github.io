---
date: 2026-07-09
tags:
  - test-automation
  - design-patterns
---

# Test Design Patterns in Test Automation

## Section Descriptions

### 1. [Fundamentals](01-fundamentals/index.md)

| File | Topics |
|------|--------|
| [Test Types & Levels](./01-fundamentals/01-test-types-levels.md) | Unit, Integration, API (REST/GraphQL/gRPC/WebSocket), E2E, Contract tests; Component/Service/System levels |
| [Test Pyramid & Principles](./01-fundamentals/02-test-pyramid-principles.md) | Test pyramid vs trophy, speed/coverage trade-offs, DRY, KISS, Isolation, Determinism, Readability, Maintainability |
| [Test Architecture](./01-fundamentals/03-test-architecture.md) | UI/API/Service layers, test suites/modules/cases, separation of test logic from data and assertions |

### 2. Core Test Design Patterns

| File | Topics |
|------|--------|
| [Page Object Model](./02-core-patterns/01-page-object-model.md) | POM structure, locators, actions, component composition, risks (God POM, tight coupling) |
| [Screenplay Pattern](./02-core-patterns/02-screenplay-pattern.md) | Actor/Task/Interaction/Question/Ability model, comparison with POM, when to use |
| [Test Data Builder](./02-core-patterns/03-test-data-builder.md) | Fluent builder for test objects, unique defaults, parameterised tests, nested builders |
| [Fixture & Factory](./02-core-patterns/04-fixture-factory.md) | Static/dynamic fixtures, fixture scopes, factory pattern for clients and services |

### 3. [Advanced Patterns](03-advanced-patterns/index.md)

| File | Topics |
|------|--------|
| [Wrapper & Fluent Interface](./03-advanced-patterns/01-wrapper-fluent-interface.md) | HTTP client wrapper, domain-specific API layer, fluent request builder, chaining risks |
| [Assertion, Template & Data-Driven](./03-advanced-patterns/02-assertion-template-data-driven.md) | Custom assertion helpers, response matchers, test template base class, data-driven with parametrize and external sources |

### 4. [API Test Patterns](04-api-test-patterns/index.md)

| File | Topics |
|------|--------|
| [REST & GraphQL](./04-api-test-patterns/01-rest-graphql.md) | REST request builder, response validator, schema validation, GraphQL query builder, resolver-level testing, test checklists |
| [gRPC & WebSocket](./04-api-test-patterns/02-grpc-websocket.md) | gRPC stub-based testing, proto contract validation, WebSocket event-driven testing, message validation, connection lifecycle |

### 5. Data Management, Mocking, Environment

| File | Topics |
|------|--------|
| [Test Data Management](./05-data-mocking-env/01-test-data-management.md) | Static/generated/seeded data strategies, per-test isolation, cleanup, schema versioning |
| [Mocking & Stubbing](./05-data-mocking-env/02-mocking-stubbing.md) | Mock vs Stub vs Fake vs Spy, failure simulation, over-mocking risks, decision guide |
| [Environment Design](./05-data-mocking-env/03-environment-design.md) | Local/staging/prod-like environments, env vars, feature flags, Testcontainers, DB dependency management |

### 6. Execution, Reliability, Performance, Observability

| File | Topics |
|------|--------|
| [Execution Strategies](./06-execution-reliability/01-execution-strategies.md) | Parallel execution, thread safety, resource isolation, marks/tags, selective runs, retry strategies |
| [Reliability & Flakiness](./06-execution-reliability/02-reliability-flakiness.md) | Flakiness causes and solutions, wait strategies, frozen time, quarantine pattern, flakiness risk register |
| [Performance & Observability](./06-execution-reliability/03-performance-observability.md) | Latency/throughput SLOs, Locust load simulation, structured test logging, request tracing, CI metrics |

### 7. Decisions, Production, Anti-Patterns

| File | Topics |
|------|--------|
| [CI/CD & Security](./07-decisions-production/01-ci-cd-security.md) | Pipeline stage design, GitHub Actions example, input validation, auth testing, injection testing, security checklist |
| [Anti-Patterns & Risks](./07-decisions-production/02-antipatterns-risks.md) | Flaky tests, hardcoded data, over-mocking, UI-heavy tests, implementation coupling, maintenance/execution risks |
| [Real-World Decisions & Heuristics](./07-decisions-production/03-real-world-decisions-heuristics.md) | Microservices contract testing, frontend architecture, realtime WebSocket testing, decision factors, senior heuristics |

## Sections

- [Core Patterns](02-core-patterns/index.md)
- [Data Mocking Env](05-data-mocking-env/index.md)
- [Execution Reliability](06-execution-reliability/index.md)
- [Decisions Production](07-decisions-production/index.md)

---
## See also
- [Digital Garden: Knowledge Base](../index.md)
- [Test Automation Framework](../test-automation-framework/index.md)
- [Testing Pyramid](../testing-pyramid/index.md)
- [Automation](../python-guide/04-automation/index.md)
- [Pytest — Python Testing Framework](../libs/pytest/index.md)

