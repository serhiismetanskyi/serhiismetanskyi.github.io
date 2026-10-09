---
date: 2026-06-28
tags:
  - ai-agents
  - coding-agents
---

# SKILL.md Universal Standard (2026)

A practical guide to writing reusable, cross-agent `SKILL.md` files using the "Universal Standard" model.

---

## What Is SKILL.md

`SKILL.md` is an open format for packaging AI agent workflows into reusable units.

A complete skill includes:
- a skill folder
- one `SKILL.md` file
- optional scripts, references, and assets

This format is designed for:
- portability across coding tools
- progressive disclosure (load only what is needed)
- team sharing and version control

---

## Anatomy of a SKILL.md

Every skill has two main parts.

1. **YAML frontmatter**: routing metadata (`name`, `description`, and optional advanced fields)
2. **Markdown body**: task workflow, constraints, validation, and outputs

Minimal example:

```yaml
---
name: bash-command-assistant
description: >-
  Review shell commands for risks and quality.
  Use when reviewing PRs or code changes that include shell scripts.
---
```

The `description` should act as a trigger, not a summary. It must clearly say when the skill should load.

---

## Progressive Disclosure Model

Use three levels of loading to keep context small and precise:

1. **Level 1 (startup):** agent reads only `name` and `description` (~30-50 tokens per skill)
2. **Level 2 (activation):** full `SKILL.md` body loads when intent matches
3. **Level 3 (on demand):** additional docs/scripts load only when referenced

Benefits:
- many skills without context bloat
- lower token waste
- better execution focus

---

## Review Checklist

Before publishing a skill, verify:
- security vulnerabilities are checked
- no breaking API changes are introduced silently
- tests and verification steps are explicit
- hardcoded secrets are blocked
- performance risks are addressed

---

## Best Practices

- Write `description` as an activation trigger
- Keep `SKILL.md` concise (prefer less than 500 lines)
- Keep primary instructions compact (about 5,000 tokens max)
- Put heavy references in separate files
- Add explicit failure handling and fallback behavior
- Prefer concrete commands and checklists over generic prose
- Commit skills to git for team reuse

---

## Skill Directory Structure

Recommended layout:

```text
my-skill/
├── SKILL.md                  # required
├── scripts/                  # optional executable helpers
│   ├── lint.sh
│   └── scan.py
├── references/               # optional docs/checklists
│   └── security-checklist.md
└── assets/                   # optional templates/examples
    └── report-template.md
```

---

## Key Frontmatter Fields

Core:
- `name`: unique skill id (kebab-case)
- `description`: activation trigger and scope

Common advanced fields (tool-dependent):
- `version`
- `license`
- `allowed-tools`
- `disable-model-invocation`
- `mode`
- `metadata` / `metadata.version`

Use only fields that are supported by your target agent.

---

## Path Compatibility Quick Reference

The same `SKILL.md` concept is used across tools, but directory paths differ:

| Tool | Typical Skill Path |
|---|---|
| Claude Code | `.claude/skills/` |
| Cursor | `.cursor/skills/` |
| GitHub Copilot | `.github/skills/` |
| OpenAI Codex | `.agents/skills/` |
| Gemini CLI | `.gemini/skills/` |
| VS Code | `.github/skills/` |

Keep your format stable and adapt only folder placement per platform.

---

## Skills vs Configs vs MCP

Use each layer for its own job:

| Layer | Purpose |
|---|---|
| **Skill (`SKILL.md`)** | On-demand expertise and workflow execution |
| **Config (`AGENTS.md` / `CLAUDE.md`)** | Persistent project policies and context |
| **MCP servers** | External tools, APIs, and runtime data |

They are complementary, not interchangeable.

---

## Create Your First Skill

1. Create a folder: `mkdir -p .claude/skills/my-skill`
2. Add `SKILL.md` with `name` and trigger-style `description`
3. Write a short workflow with validation steps
4. Move long docs into `references/`
5. Test activation with realistic user prompts
6. Version and commit the skill

---

## See also
- [AI Coding Agents: Skills & Claude Code](index.md)
- [What Is a Skill](01-what-is-a-skill.md)
- [How Agents Load Skills](02-how-agents-load-skills.md)
- [Cross-Agent Compatibility](06-cross-agent-compatibility.md)
