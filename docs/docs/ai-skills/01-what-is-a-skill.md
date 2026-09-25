---
date: 2026-06-24
tags:
  - ai-agents
  - coding-agents
---

# What Is a Skill

## Definition

A skill is a **reusable, structured capability** for an AI coding agent. It packages:

- **identity** — name + description (when to activate)
- **instructions** — step-by-step workflow with checkpoints
- **constraints** — what the agent must not do
- **verification** — evidence requirements (tests pass, build output, etc.)
- optional: scripts, references, templates

A skill gives the agent a reliable workflow instead of guessing. Skills are **not** prompts — they are versioned, portable, and testable.

---

## SKILL.md — The Core File

Every skill requires one file: `SKILL.md`. It has two parts.

### Part 1: YAML Frontmatter (Identity)

```yaml
---
name: git-commit-creator
description: >-
  Generate Conventional Commits from the current git diff.
  Use when asked to commit changes, create a commit message,
  or prepare code for review.
---
```

**`name`**: lowercase, hyphens only, max 64 characters. Must match the directory name.

**`description`**: explains both **what** the skill does AND **when** the agent should activate it. This is the most important field — a weak description makes the skill invisible to routing.

### Advanced Frontmatter Fields (Claude Code)

```yaml
---
name: readonly-analyzer
description: Analyze code quality without modifying files.
allowed-tools:
  - Read
  - Grep
  - Glob
disable-model-invocation: false
mode: plan
version: 1.2.0
---
```

| Field | Purpose |
|---|---|
| `allowed-tools` | Restrict which tools the skill can use (security / read-only workflows) |
| `disable-model-invocation` | If `true`, skill only activates via explicit `/slash-command` |
| `mode` | Force skill to run in a specific mode (`plan`, `agent`) |
| `version` | Semantic version for tracking changes |

### Part 2: Markdown Body (Instructions)

The body tells the agent exactly how to execute the task:

```markdown
# Git Commit Creator

## Workflow
1. Check git status — if nothing staged, ask user
2. Collect diff summary for staged files
3. Generate commit message in Conventional Commits format
4. Show proposed message, ask OK / Not OK
5. If OK → commit. If Not OK → accept user's message verbatim

## Constraints
- NEVER commit files matching: .env, credentials.*, *secret*
- NEVER amend or force-push unless explicitly requested
- Subject line: imperative mood, under 72 characters

## Output Format
- Commit SHA on success
- Warning message if blocked (secrets detected)
```

---

## Anatomy of a Production Skill

Based on [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) (12k+ stars, 20 skills):

```text
SKILL.md
├── Overview            → what this skill does (1-2 sentences)
├── When to Use         → triggering conditions + exclusions
├── Process / Workflow  → step-by-step with checkpoints
├── Rationalizations    → excuses agents use to skip steps + rebuttals
├── Red Flags           → signs something went wrong
└── Verification        → exit criteria with evidence requirements
```

### The Anti-Rationalization Table

The most distinctive feature of well-crafted skills. It prevents the agent from cutting corners:

| Excuse | Rebuttal |
|---|---|
| "I'll add tests later" | Tests are written before implementation (TDD) |
| "This change is too small to need a spec" | Every change needs acceptance criteria |
| "The existing code doesn't have tests" | New code always gets tests; fix gaps incrementally |
| "More context is always better" | Performance degrades with too many instructions. Be selective. |
| "The agent should figure out the conventions" | If it's not written in a rules file, it doesn't exist |

### Red Flags Section

Observable signs that the skill is being violated:

- Agent output doesn't match project conventions
- Agent invents APIs or imports that don't exist
- Agent re-implements utilities that already exist in the codebase
- Agent skips verification steps or says "seems right"

---

## Writing Principles

From [skill-anatomy.md](https://github.com/addyosmani/agent-skills/blob/main/docs/skill-anatomy.md):

1. **Process over knowledge** — skills are workflows agents follow, not docs they read
2. **Specific over general** — "Run `npm test`" beats "verify the tests"
3. **Evidence over assumption** — every verification checkbox requires proof
4. **Anti-rationalization** — every skip-worthy step needs a counter-argument
5. **Progressive disclosure** — SKILL.md is the entry point; heavy material in separate files
6. **Token-conscious** — if removing a section wouldn't change agent behavior, remove it

### Supporting Files

Create supporting files only when:
- reference material exceeds ~100 lines
- scripts or tools are needed
- checklists are long enough to justify separate files

Keep patterns inline when under ~50 lines.

---

## Real Skill Examples

| Skill | Source | Stars | What It Does |
|---|---|---|---|
| `tdd` | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | 12k+ | Red-Green-Refactor with test pyramid (80/15/5) |
| `context-engineering` | addyosmani/agent-skills | 12k+ | 5-level context hierarchy, MCP integrations, confusion management |
| `spec-driven-development` | addyosmani/agent-skills | 12k+ | Write PRD before any code |
| `tdd` | [mattpocock/skills](https://github.com/mattpocock/skills) | 14k+ | TDD with red-green-refactor loop per vertical slice |
| `write-a-prd` | mattpocock/skills | 14k+ | Create PRD through interactive interview |
| `vercel-deployment` | [hoodini/ai-agents-skills](https://github.com/hoodini/ai-agents-skills) | — | Deploy apps to Vercel with best practices |
| `pdf-processing` | [Anthropic pre-built](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) | — | Extract text, fill forms, merge PDFs |

---

## See also
- [AI Skills for Coding Agents](index.md)
- [How Agents Load Skills](02-how-agents-load-skills.md)
- [Skill Packaging](03-skill-packaging.md)
