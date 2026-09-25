---
date: 2026-07-04
tags:
  - qa
  - testing
---

# Exploratory Testing & Session-Based Test Management

## What exploratory testing is

Exploratory testing is simultaneous learning, test design, and execution.
It is not random clicking. It is structured investigation guided by risk,
domain knowledge, and real-time observation.

| Scripted testing | Exploratory testing |
|---|---|
| Predefined steps | Tester adapts during execution |
| Best for stable flows | Best for ambiguity, edge cases, UX issues |
| Repeatable evidence | Finds unexpected behavior faster |

Use exploratory testing when:
- Requirements are incomplete or changing.
- A feature is new and risks are not yet known.
- UX, workflows, or error handling matter.
- You suspect issues that scripted tests will miss.

---

## Session-Based Test Management

Session-Based Test Management (SBTM) adds discipline to exploratory work.

### Core components

| Component | Purpose |
|---|---|
| Charter | Mission for the session |
| Time-box | Focused uninterrupted session, usually 60-120 min |
| Notes | Evidence of observations, bugs, questions, coverage |
| Debrief | Short review of what was learned |

### Example charter

```md
Mission: Explore checkout failure handling when payment provider is slow.
Focus: Timeouts, retries, duplicate charges, user messaging.
Out of scope: Visual styling and analytics events.
Duration: 90 minutes
```

### Session outcome categories

| Outcome | Meaning |
|---|---|
| Bug | Reproducible product problem |
| Question | Requirement ambiguity or product decision gap |
| Risk | Potential failure not yet reproduced |
| Coverage note | Area investigated with result |

---

## Practical heuristics

Use heuristics to avoid vague exploration.

### Good lenses

- CRUD: create, read, update, delete.
- Boundaries: minimum, maximum, empty, null, malformed.
- Interruptions: refresh, back button, timeout, reconnect.
- Permissions: guest, user, admin, expired session.
- Time: timezone, clock skew, daylight saving, token expiry.
- Data shape: special characters, long strings, large payloads.

### Bug magnets

| Area | Why it is risky |
|---|---|
| New integrations | Contract drift, timeout, auth errors |
| State transitions | Hidden rules between statuses |
| Concurrency | Race conditions and duplicate actions |
| Recovery flows | Retry, cancel, refresh, rollback logic |
| Feature flags | Different behavior across cohorts |

---

## Notes and evidence

Capture enough detail so findings are useful later.

Minimal session notes:
- Charter and duration.
- Build, environment, account, and test data.
- Areas touched.
- Bugs found and links.
- Open questions.
- Follow-up ideas for automation or regression.

### Debrief questions

1. What did we learn about product risk?
2. Which findings need immediate fixes?
3. What should become scripted or automated?
4. Which requirement needs clarification?

---

## When to convert to scripted tests

Exploratory findings should feed the permanent quality system.

| If you discover... | Then do this |
|---|---|
| Stable regression-prone bug | Add automated regression |
| Requirement ambiguity | Update acceptance criteria |
| Repeated setup pain | Create fixture or helper |
| Hidden edge case | Add scripted negative test |

Exploratory testing is strongest as a complement to automation, not a replacement.
