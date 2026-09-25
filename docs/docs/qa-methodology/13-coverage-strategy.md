---
date: 2026-07-05
tags:
  - qa
  - testing
  - rag
---

# Coverage Strategy

## Coverage is not one number

Teams often reduce coverage to line or branch percentage. That is incomplete.
Useful coverage strategy combines product, risk, and technical dimensions.

| Coverage type | Question answered |
|---|---|
| Requirement coverage | Did we validate each requirement? |
| Risk coverage | Did we test the highest-impact risks? |
| Code coverage | Which code paths execute under tests? |
| Data coverage | Did we cover realistic and edge inputs? |
| Environment coverage | Did we validate important runtime contexts? |
| User journey coverage | Are critical workflows protected end-to-end? |

---

## Code coverage limits

High code coverage does not guarantee high quality.

| Good use of code coverage | Bad use of code coverage |
|---|---|
| Detect untested hot paths | Treat 100% as proof of correctness |
| Identify gaps in core modules | Reward meaningless assertion-heavy tests |
| Gate changed lines in risky code | Ignore behavior and requirements |

Recommended interpretation:
- Use code coverage as a signal, not as the only target.
- Combine project-wide baseline with changed-lines coverage.
- Review uncovered lines in critical modules manually.

---

## Risk-based coverage model

Map testing effort to business impact and failure likelihood.

```text
High-risk areas:
- payment
- auth
- data export
- schema migrations
- customer notifications
```

### Practical matrix

| Risk level | Coverage expectation |
|---|---|
| High | Unit + integration + negative + observability + rollback validation |
| Medium | Unit + integration + happy path system coverage |
| Low | Unit + smoke or exploratory only |

---

## Data and edge coverage

Many escaped defects are data-shape problems.

### Cover these classes

- Empty and null values.
- Minimum and maximum boundaries.
- Invalid format and malformed payloads.
- Unicode, long strings, and special characters.
- Duplicate and repeated requests.
- Role- and locale-specific data.

### Example

```text
Good login coverage:
- valid user
- wrong password
- locked account
- expired password
- MFA required
- rate-limited client
```

---

## Environment coverage

Do not validate only one ideal environment.

| Dimension | Examples |
|---|---|
| Browser/device | Chrome, Safari, mobile viewport |
| Infrastructure | single node vs autoscaled |
| Dependency mode | real service, sandbox, degraded dependency |
| Config state | feature flag on/off, region differences |

---

## Coverage review checklist

Before release, ask:
1. Which requirements remain uncovered?
2. Which high-risk areas have only happy-path tests?
3. Which new code changed without integration or contract coverage?
4. Which edge data classes were skipped?
5. Which environments or flag states were not exercised?

Good coverage strategy protects the business, not only the dashboard.
