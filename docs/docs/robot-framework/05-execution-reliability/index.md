---
date: 2026-07-30
tags:
  - robot-framework
  - test-automation
---

# Robot Framework — Execution & Reliability

Short, practical notes on running Robot Framework faster (parallelism), recovering from transient failures (retries and native error handling), and keeping suites maintainable (setup/teardown and structure). Pair this with the official [parallel execution guide](https://docs.robotframework.org/docs/parallel) and your CI documentation.

## Topics in this section

| Topic | What you will learn |
|-------|---------------------|
| [Parallel Execution with Pabot](01-parallel-execution.md) | Suite vs test-level splits, key `pabot` flags, isolation rules, PabotLib locks, tagging for selective runs, CI-oriented splitting. |
| [Error Handling & Retry Patterns](02-error-handling-retries.md) | `TRY`/`EXCEPT` (RF 5+), built-in recovery keywords, `Wait Until Keyword Succeeds`, fail-fast options, Python-side retries, failure logging. |
| [Setup, Teardown & Test Organization](03-setup-teardown.md) | Suite/test/keyword setup scopes, guaranteed teardown behavior, realistic examples, tags and naming, `robot` CLI outputs and variables. |

## Quick orientation

- **Parallel runs** buy wall-clock time only when tests are **isolated**: no shared files, DB rows, or browser sessions unless coordinated (for example with PabotLib).
- **Retries** belong around **bounded, idempotent** operations (API polling, element appearance), not around whole tests that hide product bugs.
- **Teardown** is where you **release** resources; **setup** is where you **prove** prerequisites so failures are obvious early.

---
## See also
- [Digital Garden: Knowledge Base](../../index.md)
- [Test Automation Framework](../../test-automation-framework/index.md)
- [Testing Pyramid](../../testing-pyramid/index.md)
- [QA & Testing Methodology](../../qa-methodology/index.md)
- [Automation](../../python-guide/04-automation/index.md)
- [Robot Framework — Complete Guide](../index.md)
