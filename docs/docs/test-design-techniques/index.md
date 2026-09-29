---
date: 2026-07-06
tags:
  - testing
  - test-design
---

# Test Design Techniques

---

## Why Test Design Matters

Test design techniques are ways to stop testing randomly and start testing with logic.
They reduce the number of useless tests while increasing the chance of finding real bugs.

Most defects cluster at edges, unexpected combinations, and state transitions — not in the middle of valid ranges.

---

## Sections

### 1. Input-Based Techniques

| File | Technique | Core Idea |
|------|-----------|-----------|
| [Equivalence Partitioning](./01-input-based/01-equivalence-partitioning.md) | EP | Split inputs into groups; one test per group |
| [Boundary Value Analysis](./01-input-based/02-boundary-value-analysis.md) | BVA | Test values at and around the edge of each partition |
| [Pairwise Testing](./01-input-based/03-pairwise-testing.md) | Pairwise | Cover every pair of parameter values with minimum test count |

### 2. Logic & State-Based Techniques

| File | Technique | Core Idea |
|------|-----------|-----------|
| [Decision Table Testing](./02-logic-state-based/01-decision-table.md) | DT | Map all condition combinations to expected outcomes |
| [State Transition Testing](./02-logic-state-based/02-state-transition.md) | STT | Verify valid/invalid transitions in a state machine |

### 3. Experience-Based Techniques

| File | Technique | Core Idea |
|------|-----------|-----------|
| [CRUD Testing](./03-experience-based/01-crud-testing.md) | CRUD | Verify full data lifecycle: create, read, update, delete |
| [Metamorphic Testing](./03-experience-based/02-metamorphic-testing.md) | MT | Check relationships between outputs when inputs change |
| [Fuzz & Random Testing](./03-experience-based/03-fuzz-random-testing.md) | Fuzz | Send unexpected/random data to expose crashes and edge cases |

## Quick Selection Guide

| Situation | Technique |
|-----------|-----------|
| Numeric ranges, categories | EP + BVA |
| Multiple flags / conditions | Decision Table |
| Multi-step flows, order status | State Transition |
| Cross-browser / cross-OS matrix | Pairwise |
| Data lifecycle integrity | CRUD |
| Search, sorting, ML outputs | Metamorphic |
| Input validation, security | Fuzz |

## Sections

- [Input Based](01-input-based/index.md)
- [Logic State Based](02-logic-state-based/index.md)
- [Experience Based](03-experience-based/index.md)

---
## See also
- [Digital Garden: Knowledge Base](../index.md)
- [QA & Testing Methodology](../qa-methodology/index.md)
- [Test Design Patterns in Test Automation](../test-design-patterns/index.md)
- [Testing Pyramid](../testing-pyramid/index.md)
- [Testing with pytest](../python-guide/03-testing-pytest/index.md)
