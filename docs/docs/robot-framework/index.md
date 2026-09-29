---
date: 2026-07-26
tags:
  - robot-framework
  - test-automation
---

# Robot Framework — Complete Guide

**Robot Framework** is an open-source, **keyword-driven** automation framework. Tests and tasks are expressed as human-readable tables; libraries (especially **Python-based**) implement real work behind keywords. Modern **Robot Framework 7.x** improves the core language (native `VAR`, richer control flow, secret variables in 7.4+) and integrates cleanly with CI and custom tooling.

This guide is organised into seven sections: language fundamentals, how suites scale, API and UI automation, running tests reliably, supporting infrastructure, and production decisions.

## Sections

### 1. Fundamentals

| File | Topics |
|------|--------|
| [Fundamentals — Overview](./01-fundamentals/index.md) | Section map: syntax, keywords & variables, libraries |
| [Core Syntax & Test Structure](./01-fundamentals/01-core-syntax-structure.md) | Suite sections, `.robot` / `.resource`, setup/teardown, `[Template]`, tags, `FOR` / `IF` / `TRY` / `WHILE`, `VAR` (RF 7+) |
| [Keywords & Variables](./01-fundamentals/02-keywords-variables.md) | Built-in keywords, arguments, scopes, env & files, `${CURDIR}`, secrets (`${name: Secret}`, RF 7.4+) |
| [Libraries & Extensibility](./01-fundamentals/03-libraries.md) | Standard & external libs, custom Python, `Library` / `Resource`, remote lib, library scope |

### 2. Architecture

| File | Topics |
|------|--------|
| [Architecture — Overview](./02-architecture/index.md) | Layering, keyword design, test data at scale |
| [Layered Architecture](./02-architecture/01-layered-architecture.md) | Five layers, layout, resources vs libraries, dependency flow |
| [Keyword Design Principles](./02-architecture/02-keyword-design.md) | Naming, composition, embedded args, docs & tags |
| [Test Data Management](./02-architecture/03-test-data-management.md) | Builders, factories, `[Template]`, variable files, cleanup |

### 3. API Testing

| File | Topics |
|------|--------|
| [API Testing — Overview](./03-api-testing/index.md) | HTTP testing in RF, structure of API suites |
| [API Architecture & Patterns](./03-api-testing/01-api-architecture-patterns.md) | Client layering, shared keywords, environments |
| [Request Design & Validation](./03-api-testing/02-request-validation.md) | Payloads, assertions, contracts, negative paths |
| [**API — Step by Step**](./03-api-testing/03-api-step-by-step.md) | Simple → keywords → data-driven → full architecture |
| [**Practical — Full API Framework**](./03-api-testing/04-practical-api-framework.md) | Python libs, resources, CRUD tests, run commands |

### 4. UI Testing

| File | Topics |
|------|--------|
| [UI Testing — Overview](./04-ui-testing/index.md) | Browser automation with Robot |
| [Page Objects & Locators](./04-ui-testing/01-page-objects-locators.md) | POM-style keywords, stable selectors |
| [Wait Strategies & Flakiness](./04-ui-testing/02-wait-strategy-flakiness.md) | Waits, retries, stability |
| [**UI — Step by Step**](./04-ui-testing/03-ui-step-by-step.md) | SeleniumLibrary → keywords → Browser (Playwright) |
| [**Practical — Full UI Framework**](./04-ui-testing/04-practical-ui-framework.md) | Page objects, DataFactory, E2E flow |

### 5. Execution & Reliability

| File | Topics |
|------|--------|
| [Execution — Overview](./05-execution-reliability/index.md) | CLI, outputs, organising runs |
| [Parallel Execution with Pabot](./05-execution-reliability/01-parallel-execution.md) | Sharding, concurrency, shared state |
| [Error Handling & Retry Patterns](./05-execution-reliability/02-error-handling-retries.md) | Failures, recovery, robust keywords |
| [Setup, Teardown & Test Organization](./05-execution-reliability/03-setup-teardown.md) | Lifecycle, suite structure |

### 6. Infrastructure

| File | Topics |
|------|--------|
| [Infrastructure — Overview](./06-infrastructure/index.md) | Configuration, secrets, logging, reporting, CI/CD patterns |

### 7. Decisions & Production

| File | Topics |
|------|--------|
| [Decisions — Overview](./07-decisions-production/index.md) | Adoption, risks, maturity |
| [Scalability & Maintainability](./07-decisions-production/01-scalability-maintainability.md) | Growing suites, ownership |
| [Anti-Patterns, Risks & Limitations](./07-decisions-production/02-antipatterns-risks.md) | What to avoid, failure modes |
| [Maturity Model & Engineering Heuristics](./07-decisions-production/03-maturity-model-heuristics.md) | Staged rollout, team practices |

---

## Quick Navigation by Topic

| I want to… | Go to |
|------------|--------|
| Learn `.robot` structure and control flow | [Core Syntax & Test Structure](./01-fundamentals/01-core-syntax-structure.md) |
| Design keywords and variables | [Keywords & Variables](./01-fundamentals/02-keywords-variables.md) |
| Pick or build libraries | [Libraries & Extensibility](./01-fundamentals/03-libraries.md) |
| Structure a large project | [Architecture — Overview](./02-architecture/index.md) |
| Automate HTTP APIs | [API Testing — Overview](./03-api-testing/index.md) |
| Start API testing from scratch | [API — Step by Step](./03-api-testing/03-api-step-by-step.md) |
| See a complete API project | [Practical — Full API Framework](./03-api-testing/04-practical-api-framework.md) |
| Automate browsers | [UI Testing — Overview](./04-ui-testing/index.md) |
| Start UI testing from scratch | [UI — Step by Step](./04-ui-testing/03-ui-step-by-step.md) |
| See a complete UI project | [Practical — Full UI Framework](./04-ui-testing/04-practical-ui-framework.md) |
| Run or parallelise suites | [Execution — Overview](./05-execution-reliability/index.md) |
| Configure CI and secrets | [Infrastructure — Overview](./06-infrastructure/index.md) |
| Decide production fit | [Decisions — Overview](./07-decisions-production/index.md) |

---
## See also
- [Digital Garden: Knowledge Base](../index.md)
- [Test Automation Framework](../test-automation-framework/index.md)
- [Testing Pyramid](../testing-pyramid/index.md)
- [QA & Testing Methodology](../qa-methodology/index.md)
- [Automation](../python-guide/04-automation/index.md)
