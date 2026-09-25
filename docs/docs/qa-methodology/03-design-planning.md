---
date: 2026-07-02
tags:
  - qa
  - testing
---

# Test Design Techniques, Test Case Design & Test Planning

## Test Design Techniques

### Black-Box Techniques

Test without knowledge of internal code. Input → expected output.

| Technique | When to use | Example |
|---|---|---|
| **Equivalence Partitioning** | Large input spaces | Age field: valid (0–120), invalid (<0, >120) |
| **Boundary Value Analysis** | Numeric ranges, limits | Age 0, 1, 119, 120, -1, 121 |
| **Decision Tables** | Complex logic with multiple conditions | Discount rules: loyal + premium = 30% off |
| **State Transition** | Flows with states and events | Order: New → Paid → Shipped → Delivered |
| **Use Case Testing** | End-to-end user scenarios | "User places order, pays, receives confirmation" |

### White-Box Techniques

Test using knowledge of code structure.

| Technique | Coverage metric | Focus |
|---|---|---|
| **Statement coverage** | % of lines executed | Basic code reachability |
| **Branch coverage** | % of branches (if/else) taken | Conditional logic paths |
| **Path testing** | All independent paths | Complex functions with many conditions |

### Experience-Based Techniques

| Technique | Description |
|---|---|
| **Exploratory testing** | Simultaneous learning, design, and execution; use charters |
| **Error guessing** | Based on past bugs, common pitfalls, domain knowledge |
| **Checklist-based** | Reusable quality checklists for features or regression |

> Full technique deep-dives: [Test Design Techniques](../test-design-techniques/index.md)

---

## Test Case Design

### Test Case Structure

```
ID:          TC-001
Title:       User cannot log in with wrong password
Preconditions:
  - User account exists with email user@example.com
  - User is on the login page
Steps:
  1. Enter email: user@example.com
  2. Enter password: wrong_password
  3. Click "Login"
Expected result:
  - Error message: "Invalid credentials" is displayed
  - User stays on the login page
  - No session cookie is set
Actual result:   (filled during execution)
Status:          PASS / FAIL / BLOCKED
```

### Principles for Good Test Cases

| Principle | What it means |
|---|---|
| **Clarity** | Anyone can execute it without asking questions |
| **Atomicity** | One test case = one verifiable outcome |
| **Independence** | Does not depend on execution order or other tests |
| **Reusability** | Steps and data can be reused across similar cases |
| **Maintainability** | Easy to update when requirements change |

---

## Test Planning

### Test Plan

A document that answers: **what**, **how**, **who**, **when**, and **where** testing will happen.

| Section | Contents |
|---|---|
| **Scope** | What is in / out of scope for testing |
| **Objectives** | What the test effort should achieve |
| **Test levels & types** | Which testing approaches will be used |
| **Resources** | Team, tools, environments needed |
| **Schedule** | Milestones, start/end dates |
| **Risks & mitigations** | What could block testing and how to handle it |
| **Entry criteria** | Conditions required to start testing |
| **Exit criteria** | Conditions required to declare testing complete |

### Test Strategy vs Test Plan

| | Test Strategy | Test Plan |
|---|---|---|
| Scope | Organisation-wide or project-wide approach | Specific release or sprint |
| Audience | Management, architects | QA team, developers |
| Content | Test levels, tools, standards, approach | Concrete schedule, scope, resources |
| Stability | Rarely changes | Updated per release |

### Entry & Exit Criteria

**Entry criteria** — conditions that must be met before testing begins:
- Build is deployed and stable
- Requirements are reviewed and signed off
- Test data and environments are ready

**Exit criteria** — conditions that declare testing done:
- All planned test cases executed
- No open Critical or High severity defects
- Test coverage target met (e.g. 80% of requirements covered)
- Test summary report approved by stakeholders
