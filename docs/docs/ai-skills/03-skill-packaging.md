---
date: 2026-06-24
tags:
  - ai-agents
  - coding-agents
---

# Skill Packaging

## Standard Folder Layout

```text
skills/
  git-commit-creator/
    SKILL.md              ← required: identity + instructions
    README.md             ← optional: human documentation
    scripts/
      create_commit.py    ← deterministic helper (runs outside LLM)
    references/
      conventional-commits.md  ← loaded on demand by agent
    templates/
      commit_message.j2   ← output shape with placeholders
    schema/
      input.json          ← optional: formal input contract
      output.json         ← optional: formal output contract
```

Only `SKILL.md` is required. Everything else is optional and loaded progressively.

---

## Naming Conventions

From [skill-anatomy.md](https://github.com/addyosmani/agent-skills/blob/main/docs/skill-anatomy.md):

| Element | Convention | Example |
|---|---|---|
| Skill directory | `lowercase-hyphen-separated` | `git-commit-creator/` |
| Core file | always `SKILL.md` (uppercase) | `SKILL.md` |
| Supporting files | `lowercase-hyphen-separated.md` | `conventional-commits.md` |
| Shared references | `references/` at project root | `references/testing-patterns.md` |

The directory name **must** match the `name` field in frontmatter.

---

## Scripts — Deterministic Execution

Scripts handle work that does not require LLM reasoning:

- scanning project structure
- running `git diff` and parsing output
- validating schemas
- collecting metadata

### Why Scripts Matter

A 200-line script:
- keeps code outside prompt context; mainly script output consumes tokens
- runs faster and more reliably than LLM-generated code
- produces deterministic results every time

### Script Rules

- scripts must be idempotent where possible
- always set explicit timeouts
- never install global packages from a script
- return structured output (JSON preferred)

---

## References — Knowledge on Demand

`references/` contains domain knowledge the agent reads only when needed.

### Shared Reference Checklists

From [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills):

| Reference | Covers |
|---|---|
| `testing-patterns.md` | Test structure, naming, mocking, React/API/E2E examples |
| `security-checklist.md` | Pre-commit checks, auth, input validation, OWASP Top 10 |
| `performance-checklist.md` | Core Web Vitals, frontend/backend checklists |
| `accessibility-checklist.md` | Keyboard nav, screen readers, ARIA, testing tools |

### When to Create Supporting Files

- reference material exceeds ~100 lines → separate file
- code tools or scripts needed → `scripts/` directory
- checklists long enough to justify extraction → separate file
- keep patterns **inline** when under ~50 lines

---

## Templates — Consistent Output

`templates/` defines output structure, not logic:

```json
{
  "license": "![License](https://img.shields.io/badge/license-{{LICENSE}}-blue)",
  "ci": "![CI](https://img.shields.io/github/actions/workflow/status/{{REPO}}/ci.yml)"
}
```

The agent fills placeholders instead of inventing structure.

---

## Cross-Skill References

Reference other skills by name — do not duplicate content:

```markdown
Follow the `test-driven-development` skill for writing tests.
If the build breaks, use the `debugging-and-error-recovery` skill.
```

---

## Versioning

Version skill packages with semantic versioning:

| Change Type | Version Bump | Example |
|---|---|---|
| Breaking change to input/output contract | **MAJOR** | v1.0.0 → v2.0.0 |
| New behavior, backward-compatible | **MINOR** | v1.0.0 → v1.1.0 |
| Bug fixes, wording improvements | **PATCH** | v1.0.0 → v1.0.1 |

Tag each release and keep a changelog.

---

## See also
- [AI Coding Agents: Skills & Claude Code](index.md)
- [What Is a Skill](01-what-is-a-skill.md)
- [Orchestration & Workflows](04-orchestration-workflows.md)
