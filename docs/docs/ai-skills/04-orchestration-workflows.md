---
date: 2026-06-25
tags:
  - ai-agents
  - coding-agents
---

# Orchestration & Workflows

## From Single Skills to Workflows

Individual skills solve local tasks. Workflow skills (orchestrators) chain them into end-to-end processes.

---

## SDLC-Mapped Skill Lifecycle

[addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) organizes 20 production skills into 6 lifecycle phases:

```text
  DEFINE          PLAN           BUILD          VERIFY         REVIEW          SHIP
 ┌──────┐      ┌──────┐      ┌──────┐      ┌──────┐      ┌──────┐      ┌──────┐
 │ Idea │ ───▶ │ Spec │ ───▶ │ Code │ ───▶ │ Test │ ───▶ │  QA  │ ───▶ │  Go  │
 │Refine│      │  PRD │      │ Impl │      │Debug │      │ Gate │      │ Live │
 └──────┘      └──────┘      └──────┘      └──────┘      └──────┘      └──────┘
  /spec          /plan          /build        /test       /simplify      /ship
```

### Slash Commands as Entry Points

| Phase | Command | Key Principle |
|---|---|---|
| Define | `/spec` | Spec before code |
| Plan | `/plan` | Small, atomic tasks |
| Build | `/build` | One vertical slice at a time |
| Verify | `/test` | Tests are proof |
| Review | `/simplify` or dedicated review prompt | Improve code health |
| Ship | `/ship` | Faster is safer |

Each command activates the right skill(s) automatically. Skills also auto-trigger based on what the agent is doing.

### Skills by Phase

**Define** — `idea-refine`, `spec-driven-development`

**Plan** — `planning-and-task-breakdown`

**Build** — `incremental-implementation`, `context-engineering`, `source-driven-development`, `frontend-ui-engineering`, `api-and-interface-design`, `test-driven-development`

**Verify** — `browser-testing-with-devtools`, `debugging-and-error-recovery`

**Review** — `code-review-and-quality`, `code-simplification`, `security-and-hardening`, `performance-optimization`

**Ship** — `git-workflow-and-versioning`, `ci-cd-and-automation`, `deprecation-and-migration`, `documentation-and-adrs`, `shipping-and-launch`

---

## Agent Personas

Pre-configured specialist personas for targeted reviews:

| Persona | Role | What It Checks |
|---|---|---|
| `code-reviewer` | Senior Staff Engineer | Five-axis code review with "would a staff engineer approve?" |
| `test-engineer` | QA Specialist | Test strategy, coverage analysis, Prove-It pattern |
| `security-auditor` | Security Engineer | Vulnerability detection, threat modeling, OWASP |

Personas focus the agent's review perspective without changing the underlying skills.

---

## Context Handoff Between Skills

Each step receives and returns structured context:

```json
{
  "trace_id": "t-2026-04-10-001",
  "repo": "/workspace/project",
  "branch": "feature/ai-skills-docs",
  "artifacts": {
    "commit_sha": "abc123",
    "pr_url": null
  }
}
```

No step should rely on hidden state. Every input and output is explicit.

---

## Failure Strategy

Each step declares:

- **retry policy** — max retries + backoff
- **compensating action** — rollback if needed
- **stop/continue rule** — when to halt vs proceed

For SCM workflows:
- branch creation failure → stop entire workflow
- push transient failure → retry 2x with backoff
- PR creation failure → keep artifacts + return manual recovery instructions

---

## The Inline Planning Pattern

From the `context-engineering` skill — emit a lightweight plan before executing multi-step tasks:

```text
PLAN:
1. Add Zod schema for task creation — validates title + description
2. Wire schema into POST /api/tasks route handler
3. Add test for validation error response
→ Executing unless you redirect.
```

This catches wrong directions before building on them. 30-second investment that prevents 30-minute rework.

---

## Confusion Management

When context conflicts arise during workflow execution:

```text
CONFUSION:
Spec says: "Use REST for all endpoints"
Existing code: GraphQL for user profile query

Options:
A) Follow spec — add REST, deprecate GraphQL later
B) Follow existing patterns — use GraphQL, update spec
C) Ask — intentional decision I shouldn't override

→ Which approach?
```

The agent must surface ambiguity, not silently pick one interpretation.

---

## Execution Report

Return a summary table so users can audit:

| Step | Skill | Status | Duration |
|---|---|---|---|
| 1 | spec-driven-development | success | 2.1s |
| 2 | planning-and-task-breakdown | success | 1.8s |
| 3 | incremental-implementation | success | 5.4s |
| 4 | test-driven-development | success | 3.2s |

---

## See also
- [AI Coding Agents: Skills & Claude Code](index.md)
- [Skill Packaging](03-skill-packaging.md)
- [Evaluation & Security](05-evaluation-security.md)
