---
date: 2026-10-07
tags:
  - testing
  - test-strategy
  - unit-testing
  - integration-testing
---

# Modular Integration vs Unit — Strategy & Mistakes

"How many unit tests and how many integration tests?" has no single answer, because modules differ. A pricing engine is almost all logic; a CRUD admin module is almost all wiring. The useful question is narrower: **for this piece of code, where do its bugs usually come from?** Write the test that sees that kind of bug.

## Which Test for Which Code

| Code | Bugs usually come from | Main test | Supporting test |
|------|------------------------|-----------|-----------------|
| Pure rules: pricing, tax, discounts, eligibility, state machines | Edges, rounding, combinations | **Unit**, parametrized | One modular scenario per rule to prove it is wired in |
| Parsers, formatters, mappers, validators | Unusual inputs | **Unit** (or property-based with Hypothesis) | — |
| Handlers / use cases that coordinate repositories and ports | Order of steps, error paths, transactions, idempotency | **Modular integration** | Unit tests only for branches that are hard to reach from outside |
| Repositories, queries, migrations | SQL, types, constraints, indexes, locking | **Modular integration** (or narrow integration against the real DB) | — |
| HTTP routes, serializers, auth dependencies | Validation, status codes, field names, permissions | **Modular integration through HTTP** | — |
| Adapters to other modules | Wrong assumption about the neighbour | **Contract tests** run against the fake and the real module | — |
| Adapters to external services (payments, email, LLM) | Changed API, auth, timeouts, rate limits | Narrow integration against a stub server or the sandbox | Contract tests on a schedule |
| Glue with no logic (thin controllers, config) | Wiring | Covered by modular tests; no dedicated tests | — |

## The Mix per Module

The share of each kind follows the share of logic vs wiring in the module:

| Module type | Example | Unit | Modular integration | Shape |
|-------------|---------|------|---------------------|-------|
| Logic-heavy | Pricing, risk scoring, scheduling | Many — every rule and edge | A handful of scenarios per use case | Pyramid |
| Balanced | Orders, bookings, billing | Rules and calculations | Every use case, its main error paths, the HTTP mapping | Diamond / trophy |
| Glue-heavy | CRUD admin, integrations, BFF | Few — there is little to unit-test | Most of the suite | Honeycomb |

This is why the "70 / 20 / 10" rule is unreliable: it was drawn for a codebase in general, not for a module. The [pyramid strategy page](../04-pyramid-strategy/01-shape-antipatterns-alternatives.md) covers the Testing Trophy; the Honeycomb (Spotify) applies the same idea to microservices, with integrated tests of one service in the middle — which is a modular integration test.

## A Workflow That Works

1. **Start a new use case with one modular integration test** for its main scenario. It fixes the public API and the outcome before the internals exist.
2. **Write the handler**, its SQL and its route until the test passes.
3. **Pull the rules out into pure functions** (pricing, validation) and **cover them with parametrized unit tests** — edges, rounding, invalid inputs.
4. **Add modular tests for each error path** the caller can see: out of stock, payment declined, duplicate request, not found, invalid input.
5. **Add contract tests** the first time a fake is introduced for a neighbour.
6. **Refactor freely.** If a refactor breaks only unit tests that check calls, delete or rewrite those tests rather than undo the refactor.

## Common Mistakes — Unit Tests

| Mistake | What goes wrong | Fix |
|---------|-----------------|-----|
| Mocking the module's own repository in every handler test | SQL never runs in tests; refactors break tests ([page 03](./03-what-each-test-catches.md)) | Test handlers through a modular integration test; unit-test the pure logic |
| Asserting calls instead of results | `assert_called_once_with` checks the implementation, not the behaviour | Assert return values and state; check a call only for a side effect that has no other trace (an email sent) |
| `patch()` by import path everywhere | Tests know the module's internal file layout; moving a class breaks them | Inject dependencies through the constructor; use fakes at the border |
| Mocks that return impossible values | A mocked repository returns a dict the real one never returns; the test proves nothing | Fakes with real behaviour, checked by contract tests |
| Unit-testing glue | Tests for a controller that only calls a service, line by line | Cover glue with modular tests |
| Coverage as the goal | 95 % line coverage with mocks, and the SQL is wrong | Measure which bugs the tests catch, not which lines they run |

## Common Mistakes — Modular Integration Tests

| Mistake | What goes wrong | Fix |
|---------|-----------------|-----|
| Entering through an internal class | The test breaks when the class is renamed, like a unit test, but runs slower | Enter through the public API or the routes |
| Mocking the module's own classes "to speed it up" | It is no longer a test of the module | Replace only neighbours; speed comes from the database setup, not from mocks |
| SQLite instead of PostgreSQL | Different types, constraints, errors, locking; tests pass and production fails | Testcontainers with the production engine and version |
| A container or a schema per test | Seconds per test; the suite gets moved to nightly | Container per session, schema per worker, cleaning per test ([page 04](./04-database-isolation-ci.md)) |
| Tests that depend on each other's data | Pass in order, fail alone or in parallel | Each test creates its data; clean in teardown |
| Fakes nobody checks | The fake says "reserved" where the real module says "out of stock" | Contract tests against the fake and the real implementation |
| Real third-party calls | Flaky, slow, costs money, sends real emails | Fakes or a stub server at the module border; sandbox runs on a schedule |
| Testing every edge case here | Slow suite, and the edges are still missed (they need many inputs) | Edges in unit tests; scenarios here |
| `time.sleep()` to wait for async work | Flaky and slow | Wait for a condition with a timeout, or make the work synchronous in tests |
| Asserting the whole JSON body | Breaks on every new field | Assert the fields the scenario is about |

## How to Tell Which Kind You Are Looking At

| If the test… | It is effectively a… |
|--------------|----------------------|
| Calls a function and checks the return value, no doubles | Unit test (the good kind) |
| Builds a class with mocks and checks which methods were called | Solitary unit test — check whether it earns its keep |
| Calls the module's public API or routes, uses the real database, fakes only neighbours | Modular integration test |
| Calls a repository directly against the real database | Narrow integration test |
| Needs several modules or services deployed together | Broad integration / system test |
| Drives a browser or a deployed environment | End-to-end test |

## Checklist

**Unit tests**

- [ ] Rules, calculations and parsers are pure functions with parametrized unit tests
- [ ] Boundaries are tested on both sides; rounding and invalid inputs are covered
- [ ] Unit tests assert results, not calls — except for side effects with no other trace
- [ ] No unit test mocks the module's own repository just to reach a handler

**Modular integration tests**

- [ ] Every use case has a scenario test through the module's public API or routes
- [ ] Every error path a caller can see has a test (status code or exception)
- [ ] The database is the production engine and version, started once per session (or per worker)
- [ ] Tables are cleaned in teardown (or each test runs in a rolled-back transaction)
- [ ] Only neighbours are replaced, with fakes; each fake has contract tests against the real implementation
- [ ] Tests run in any order and in parallel (pytest-randomly, `pytest -n auto`)

**Pipeline**

- [ ] Unit tests run on every save and first in CI
- [ ] Modular integration tests run on every pull request, not nightly
- [ ] A refactor that keeps behaviour does not require rewriting modular tests

---
## See also
- [Modular Integration Testing vs Unit Testing](./index.md)
- [Modular Integration vs Unit — Concepts & Boundaries](./01-concepts-boundaries.md)
- [Pyramid Shape, Anti-Patterns & Alternatives](../04-pyramid-strategy/01-shape-antipatterns-alternatives.md)
- [Test Pyramid, Trophy and Core Principles](../../test-design-patterns/01-fundamentals/02-test-pyramid-principles.md)
- [Mocking & Test Isolation](../../test-automation-framework/06-execution-reliability/03-mocking-isolation.md)
- [Shift-Left Testing](../../qa-methodology/16-shift-left-testing.md)
