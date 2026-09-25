---
date: 2026-07-03
tags:
  - qa
  - testing
  - tdd-bdd
---

# TDD, BDD & ATDD

## Overview

All three are **test-first** approaches — tests are written before (or alongside)
production code. They differ in scope, audience, and language.

| | TDD | BDD | ATDD |
|---|---|---|---|
| **Stands for** | Test-Driven Development | Behavior-Driven Development | Acceptance Test-Driven Development |
| **Focus** | Code correctness | Business behavior | Acceptance criteria |
| **Primary audience** | Developers | Dev + QA + Product | Dev + QA + Business stakeholders |
| **Language** | Code (assertions) | Gherkin (Given/When/Then) | Acceptance criteria → tests |
| **Test level** | Unit | Integration / E2E | Acceptance / system |
| **Question asked** | "Does this code work?" | "Does the system behave as expected?" | "Does it meet the requirement?" |

---

## TDD — Test-Driven Development

### The Red → Green → Refactor cycle

```
1. RED    — write a failing test that describes desired behaviour
2. GREEN  — write the minimal code to make the test pass
3. REFACTOR — clean up code while keeping tests green; repeat
```

### Example (Python / pytest)

```python
# Step 1: RED — test written first, no implementation yet
def test_discount_applied_for_premium_user():
    cart = Cart(user_type="premium", total=100.0)
    assert cart.final_price() == 80.0  # 20% discount

# Step 2: GREEN — minimal implementation
class Cart:
    DISCOUNTS = {"premium": 0.20, "regular": 0.0}

    def __init__(self, user_type: str, total: float) -> None:
        self.user_type = user_type
        self.total = total

    def final_price(self) -> float:
        discount = self.DISCOUNTS.get(self.user_type, 0.0)
        return self.total * (1 - discount)

# Step 3: REFACTOR — extract constant, add logging, etc.
```

### When to use TDD

| Good fit | Poor fit |
|---|---|
| Business logic, calculations, validations | UI rendering / layout |
| Backend services and APIs | Exploratory prototypes |
| Pure functions with clear inputs/outputs | Legacy code with no seams |
| Anywhere fast feedback matters | Integration-heavy flows |

### Benefits
- Forces small, testable units and good interface design.
- Instant regression net as the codebase grows.
- Teams using TDD release up to **60% faster** (BrowserStack, 2025).

---

## BDD — Behavior-Driven Development

BDD extends TDD outward — from code units to **user-observable behaviour**,
described in a language both engineers and non-engineers can read.

### Gherkin syntax

```gherkin
Feature: User login

  Scenario: Successful login with valid credentials
    Given the user is on the login page
    And the user has an account with email "user@example.com"
    When the user enters valid credentials and clicks Login
    Then the user is redirected to the dashboard
    And a welcome message "Hello, User" is displayed

  Scenario: Login fails with wrong password
    Given the user is on the login page
    When the user enters email "user@example.com" and wrong password
    Then an error "Invalid credentials" is displayed
    And the user stays on the login page
```

### Frameworks

| Language | Framework |
|---|---|
| Python | `pytest-bdd`, `behave` |
| Go | `godog` |
| Rust | `cucumber-rs` |

### When to use BDD

- User journeys and acceptance scenarios.
- Teams where Product or QA writes scenarios; Dev implements step definitions.
- When requirements are ambiguous — Gherkin forces concrete examples.
- API and UI automation at the story level.

### Hidden win

BDD forces the team to **agree on definitions** before writing code.
Disagreements surface in the Gherkin review, not in production.

---

## ATDD — Acceptance Test-Driven Development

ATDD focuses on **acceptance criteria** — the conditions a story must satisfy
to be "done". The whole team (Dev + QA + Product) defines these criteria
**before** development starts.

### The ATDD flow

```
1. Discuss   — Three Amigos (Dev + QA + Product) agree on acceptance criteria
2. Distil    — Criteria become executable acceptance tests
3. Develop   — Dev implements until all acceptance tests pass
4. Deliver   — Passing acceptance tests = Definition of Done
```

### ATDD vs BDD

| | ATDD | BDD |
|---|---|---|
| Primary concern | Requirements coverage | Behaviour specification |
| Who writes tests | Team collaboration | Often QA / Product with Gherkin |
| Trigger | Each user story | Each user scenario |
| Overlap | High — BDD is often the implementation format for ATDD |

In practice: **ATDD is the process; BDD is often the format**.
Teams use Gherkin scenarios as their acceptance tests.

---

## Combining All Three

The approaches are not mutually exclusive — they operate at different levels:

```
ATDD  →  defines acceptance criteria for each story  (story level)
 BDD  →  expresses those criteria as Gherkin scenarios  (feature level)
 TDD  →  drives the internal implementation of each behaviour  (unit level)
```

### Recommended combination

| Layer | Approach | Example tool |
|---|---|---|
| Unit logic | TDD | pytest |
| Feature / API | BDD | behave, pytest-bdd |
| Story acceptance | ATDD | Gherkin scenarios as acceptance tests |

---

## Anti-Patterns

| Anti-pattern | Problem | Fix |
|---|---|---|
| Writing tests after code | Defeats design benefit of TDD | Red first, always |
| Gherkin written only by QA | BDD loses cross-team communication value | Three Amigos session per story |
| Over-specifying with Gherkin | Brittle scenarios tied to implementation details | Describe **what**, not **how** |
| 100% BDD on unit level | Slow, verbose, wrong tool | BDD at feature level; TDD at unit level |
