---
date: 2026-09-25
tags:
  - spec-driven-development
  - coding-agents
  - test-design
---

# SDD — Writing Good Specs

A spec is only as useful as it is **clear, testable and short enough to review**.
The agent reads it literally — every vague sentence becomes a guess in the code.

## Spec Structure

Spec Kit's template is a good default. Mandatory sections are marked.

| Section | Contents |
|---|---|
| **User Scenarios & Testing** *(mandatory)* | Prioritised user stories (P1, P2…). Each has *why this priority*, an *independent test* and Given/When/Then acceptance scenarios |
| **Edge Cases** | Boundaries, errors, empty states, concurrency |
| **Requirements** *(mandatory)* | Functional requirements `FR-001…` using MUST; key entities |
| **Success Criteria** *(mandatory)* | Measurable outcomes `SC-001…` |
| **Assumptions** | What you take as given |
| **Out of scope / non-goals** | What this change must *not* do or touch |

Keep technology out of the spec: no frameworks, databases or libraries. Those belong in the plan.

## User Stories With Priorities

Each story should be **independently testable** — if you implement only P1, you still have a working slice.

```markdown
### User Story 1 — Create an album (Priority: P1)

A user groups photos into an album so they can find them later.

**Why this priority**: Without albums there is nothing else to organise.

**Independent Test**: Create an album with 3 photos and open it — the photos are shown in the album.

**Acceptance Scenarios**:

1. **Given** the user has 3 photos, **When** they create an album "Trip" with them, **Then** the album "Trip" shows 3 photos
2. **Given** an album "Trip" exists, **When** the user creates another album "Trip", **Then** they see "An album with this name already exists"
```

## Requirements and Success Criteria

Give every requirement an **ID** — it is what tasks, tests and reviews will refer to.

```markdown
- **FR-001**: System MUST let users create albums from selected photos
- **FR-002**: System MUST group photos inside an album by capture date
- **FR-006**: System MUST authenticate users via [NEEDS CLARIFICATION: auth method not specified - email/password, SSO, OAuth?]

- **SC-001**: Users can create an album in under 30 seconds
- **SC-002**: An album with 1,000 photos opens in under 2 seconds
```

`[NEEDS CLARIFICATION: …]` is a deliberate marker: the agent must not guess — the question is answered
in the *clarify* step before planning.

## EARS: Easy Approach to Requirements Syntax

EARS was created at Rolls-Royce (Alistair Mavin et al.) to make requirements unambiguous.
Kiro writes requirements in EARS: `WHEN [condition/event] THE SYSTEM SHALL [expected behavior]`.

| Pattern | Template | Example |
|---|---|---|
| **Ubiquitous** | The system shall … | The mobile phone shall have a mass of less than XX grams. |
| **State-driven** | While …, the system shall … | While there is no card in the ATM, the ATM shall display 'insert card to begin'. |
| **Event-driven** | When …, the system shall … | When 'mute' is selected, the laptop shall suppress all audio output. |
| **Optional feature** | Where …, the system shall … | Where the car has a sunroof, the car shall have a sunroof control panel on the driver door. |
| **Unwanted behaviour** | If …, then the system shall … | If an invalid credit card number is entered, then the website shall display 'please re-enter credit card details'. |
| **Complex** | While …, when …, the system shall … | While the aircraft is on ground, when reverse thrust is commanded, the engine control system shall enable reverse thrust. |

Example from Kiro's docs:

```text
WHEN a user submits a form with invalid data THE SYSTEM SHALL display validation errors next to the relevant fields
```

**EARS or Given/When/Then?**
- **EARS** — compact, one requirement per line, good for system rules and constraints.
- **Given/When/Then** — scenario-based, good for user flows; maps directly to BDD / test cases.
- Both are fine; pick one per project and stay consistent.

## Delta Specs for Existing Systems

For brownfield changes, describe only **what changes** (OpenSpec style):

```markdown
## ADDED Requirements
### Requirement: Theme selection
The app SHALL let users switch between light and dark themes,
defaulting to the system preference.
#### Scenario: User toggles dark mode
- **WHEN** the user clicks the theme toggle
- **THEN** the app switches to dark mode and persists the choice
```

`MODIFIED` and `REMOVED` sections work the same way. After the change ships, deltas are merged into the living spec.

## Plain `SPEC.md` Without a Toolkit

You don't need a framework. A good minimal spec, following Claude Code's guidance, names:
- the **files and interfaces** involved
- what is **out of scope**
- an **end-to-end verification step** at the end

```markdown
# Spec: Rate limiter for public API

## Goal
Protect /api/v1/* from abuse without affecting normal users.

## Requirements
- FR-1: Limit each API key to 100 requests per minute
- FR-2: Return 429 with a Retry-After header when the limit is exceeded
- FR-3: Limits are configurable per key in settings

## Edge cases
- Requests without an API key are limited by IP
- Clock skew between instances must not double the limit

## Out of scope
- UI for managing limits
- Changes to authentication

## Files / interfaces
- app/middleware/rate_limit.py (new)
- app/settings.py — RATE_LIMITS
- tests/api/test_rate_limit.py (new)

## Verification
- `pytest tests/api/test_rate_limit.py` passes
- Manual: 101 requests in a minute → the 101st returns 429 with Retry-After
```

Let the agent help write it — the "interview" prompt from Claude Code's docs:

```text
I want to build [brief description]. Interview me in detail using the AskUserQuestion tool.
Ask about technical implementation, UI/UX, edge cases, concerns, and tradeoffs. Don't ask obvious questions, dig into the hard parts I might not have considered.
Keep interviewing until we've covered everything, then write a complete spec to SPEC.md.
```

Then start a **fresh session** to implement from `SPEC.md`.

## Spec Review Checklist

A spec review is testing the **requirements**, not the code. Before planning, check:

- [ ] Every requirement has an ID and is testable (you can write a pass/fail check for it)
- [ ] No implementation details (frameworks, tables, class names) in the spec
- [ ] Acceptance criteria cover the happy path, errors and edge cases
- [ ] Negative scenarios exist (what must *not* happen)
- [ ] Non-goals / out of scope are written down
- [ ] No open `[NEEDS CLARIFICATION]` markers left
- [ ] Success criteria are measurable (numbers, not "fast" or "user-friendly")
- [ ] Stories are independently testable and prioritised
- [ ] No contradictions between requirements
- [ ] The spec is short enough that someone will actually read it

Apply classic [test design techniques](../test-design-techniques/index.md) — equivalence partitioning,
boundary values, decision tables, state transitions — to find missing acceptance criteria.

---
## See also
- [Spec-Driven Development](index.md)
- [SDD — Concepts & Workflow](01-concepts-workflow.md)
- [SDD — QA, Testing & Best Practices](04-qa-testing-best-practices.md)
- [Test Design Techniques](../test-design-techniques/index.md)
