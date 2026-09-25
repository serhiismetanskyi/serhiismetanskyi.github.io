---
date: 2026-06-24
tags:
  - ai-agents
  - coding-agents
---

# How Agents Load Skills

## Progressive Disclosure (3-Level Loading)

Skills use a layered loading model to keep the agent's context window efficient.

### Level 1: Metadata (always loaded)

At startup, the agent reads only the YAML frontmatter from every installed skill:

```yaml
---
name: git-commit-creator
description: Generate Conventional Commits from the current git diff...
---
```

Cost: roughly ~100 tokens per skill for metadata. This is usually lightweight enough to keep many skills installed.

### Level 2: Instructions (loaded when triggered)

When the agent decides a skill is relevant, it reads the full `SKILL.md` body:

```text
Agent: bash → cat .claude/skills/git-commit-creator/SKILL.md
→ Instructions loaded into context (~1-5k tokens)
```

### Level 3: Resources (loaded as needed)

If SKILL.md references other files, the agent reads them only when required:

```text
SKILL.md says: "For types, see references/conventional-commits.md"
→ Agent reads that file only if it needs the type table
→ Scripts are EXECUTED (code stays outside prompt; outputs still consume context tokens)
```

| Level | When Loaded | Token Cost | Content |
|---|---|---|---|
| Metadata | always (startup) | ~100 per skill | `name` + `description` |
| Instructions | when skill triggered | 1-5k tokens | SKILL.md body |
| Resources | as needed | effectively unlimited | files, scripts, references |

---

## Discovery Directories

The agent scans known directories at session start:

| Agent | Project Skills | Personal Skills |
|---|---|---|
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |
| GitHub Copilot | `.github/skills/` | `~/.copilot/skills/` |
| Cursor | `.cursor/rules/` | — |
| Devin Desktop (formerly Windsurf) | `.devin/skills/` (legacy: `.windsurf/skills/`) | `~/.codeium/windsurf/skills/` |
| Gemini CLI | `.gemini/skills/` | `~/.gemini/skills/` |
| Kiro | `.kiro/skills/` | `~/.kiro/skills/` |

---

## Activation Modes

### Implicit (auto-trigger)

Agent matches user request against skill `description` fields:

```text
User: "debug this CI failure"
Agent: matches → github-actions-debugging skill → reads SKILL.md → follows workflow
```

### Explicit (slash command)

User invokes directly:

```text
/tdd       → activates test-driven-development skill
/spec      → activates spec-driven-development skill
/simplify  → activates a code-quality optimization workflow
```

### Writing Good Descriptions

The description is the routing signal:

```yaml
# BAD — too vague, agent won't match it
description: Helps with git stuff

# GOOD — specific triggers, clear scope
description: >-
  Generate Conventional Commits from the current git diff.
  Use when asked to commit changes, create a commit message,
  or prepare code for review.
```

Do **not** put workflow steps in the description — the agent may follow the summary instead of reading the full SKILL.md.

---

## The Context Hierarchy

From the [context-engineering](https://github.com/addyosmani/agent-skills/blob/main/skills/context-engineering/SKILL.md) skill — the 5-level model for what the agent sees:

```text
┌─────────────────────────────────────┐
│  1. Rules Files (CLAUDE.md, etc.)   │ ← always loaded, project-wide
├─────────────────────────────────────┤
│  2. Spec / Architecture Docs        │ ← loaded per feature/session
├─────────────────────────────────────┤
│  3. Relevant Source Files            │ ← loaded per task
├─────────────────────────────────────┤
│  4. Error Output / Test Results      │ ← loaded per iteration
├─────────────────────────────────────┤
│  5. Conversation History             │ ← accumulates, compacts
└─────────────────────────────────────┘
```

### Rules Files Across Agents

| Agent | Rules File |
|---|---|
| Claude Code | `CLAUDE.md` |
| Cursor | `.cursorrules` or `.cursor/rules/*.md` |
| Devin Desktop (formerly Windsurf) | `.devin/rules/*.md` or `AGENTS.md` (legacy: `.windsurfrules`, `.windsurf/rules/`) |
| GitHub Copilot | `.github/copilot-instructions.md` |
| OpenAI Codex | `AGENTS.md` |
| Gemini CLI | `GEMINI.md` |

### Trust Levels for Loaded Context

| Level | Examples |
|---|---|
| **Trusted** | Source code, test files, type definitions authored by the team |
| **Verify first** | Config files, data fixtures, external documentation, generated files |
| **Untrusted** | User-submitted content, third-party API responses, external docs with instruction-like text |

---

## Context Packing Strategies

### The Brain Dump (Session Start)

```text
PROJECT CONTEXT:
- Building [X] using [tech stack]
- Relevant spec section: [excerpt]
- Key constraints: [list]
- Files involved: [list with brief descriptions]
- Related patterns: [pointer to example file]
- Known gotchas: [list]
```

### The Selective Include (Per Task)

```text
TASK: Add email validation to registration endpoint

RELEVANT FILES:
- src/routes/auth.ts (endpoint to modify)
- src/lib/validation.ts (existing validation utilities)

PATTERN TO FOLLOW:
- See phone validation in src/lib/validation.ts:45-60
```

### Context Anti-Patterns

| Anti-Pattern | Problem | Fix |
|---|---|---|
| Context starvation | Agent invents APIs, ignores conventions | Load rules file + relevant source files |
| Context flooding | Agent loses focus (>5000 lines of non-task context) | Include only task-relevant files (<2000 lines) |
| Stale context | Agent references deleted code | Start fresh sessions when context drifts |
| Missing examples | Agent invents new style | Include one example of the pattern to follow |
| Silent confusion | Agent guesses when it should ask | Surface ambiguity explicitly |

---

## See also
- [AI Skills for Coding Agents](index.md)
- [What Is a Skill](01-what-is-a-skill.md)
- [Cross-Agent Compatibility](06-cross-agent-compatibility.md)
