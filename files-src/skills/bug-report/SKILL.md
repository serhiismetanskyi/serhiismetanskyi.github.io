---
name: bug-report
description: Write clear, reproducible bug reports. Use when the user describes a defect, pastes an error or logs, or asks to file, draft or improve a bug report or issue.
---

# Bug Report Writer

Turn a defect description, error or log into a bug report that a developer can reproduce without asking questions.

## Workflow

1. Collect facts from the user's message, logs and screenshots. Do not invent missing data.
2. If environment, steps or expected result are unknown, ask for them in one short list.
3. Reduce the steps to the minimum that still reproduces the bug.
4. Fill in the template below.
5. Check the report against the checklist before returning it.

## Template

```markdown
**Title:** <Component>: <what is wrong> when <condition>

**Environment:** <app version / build>, <OS / browser / device>, <environment: dev / staging / prod>

**Preconditions:** <user role, data, feature flags>

**Steps to reproduce:**
1. ...
2. ...

**Expected result:** ...

**Actual result:** ...

**Severity:** Critical / Major / Minor / Trivial
**Frequency:** Always / Intermittent (N of M) / Once

**Evidence:** <logs, screenshots, request/response, trace id>

**Notes:** <workaround, first bad version, related issues>
```

## Rules

- One bug per report.
- Title names the component and the symptom; no "doesn't work" or "broken".
- Steps start from a known state and use exact values (URLs, inputs, IDs).
- Expected result cites the requirement or previous behaviour when known.
- Actual result quotes error messages verbatim.
- Remove secrets, tokens and personal data from logs and screenshots.

## Checklist

- [ ] Reproducible from the steps alone
- [ ] Expected and actual results are different and specific
- [ ] Environment and version are present
- [ ] Severity matches impact, not urgency
- [ ] Evidence attached or its absence explained
