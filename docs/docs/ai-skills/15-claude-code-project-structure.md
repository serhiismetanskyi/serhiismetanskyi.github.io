---
date: 2026-06-27
tags:
  - ai-agents
  - coding-agents
---

# Claude Code Project Structure

A modular repository structure designed for building Claude Code projects with structured AI context, reusable skills, and automated development workflows.

---

## Reference Layout

```text
claude_code_project/
├── CLAUDE.md
├── README.md
├── docs/
│   ├── architecture.md
│   ├── decisions/
│   └── runbooks/
├── .claude/
│   ├── settings.json
│   ├── hooks/
│   └── skills/
│       ├── code-review/
│       │   └── SKILL.md
│       ├── refactor/
│       │   └── SKILL.md
│       └── release/
│           └── SKILL.md
├── tools/
│   ├── scripts/
│   └── prompts/
└── src/
    ├── api/
    │   └── CLAUDE.md
    └── persistence/
        └── CLAUDE.md
```

---

## Key Components

| Component | Purpose |
|---|---|
| `CLAUDE.md` | Project memory and instructions for Claude |
| `.claude/skills/` | Reusable AI workflows for coding tasks |
| `.claude/hooks/` | Guardrails and automation checks |
| `docs/` | Architecture decisions and documentation |
| `src/` | Core application modules |

- **`CLAUDE.md`** at the root defines the project-wide context: tech stack, commands, conventions, hard rules.
- **Nested `CLAUDE.md`** files inside `src/api/` and `src/persistence/` scope instructions to specific modules — Claude loads them only when working in those directories.
- **`.claude/skills/`** contain self-contained `SKILL.md` workflows (code review, refactoring, release) that Claude invokes on demand.
- **`.claude/hooks/`** run deterministic scripts on lifecycle events (pre-commit checks, post-tool validation).
- **`docs/`** holds architecture docs, ADRs (`decisions/`), and operational runbooks.
- **`tools/`** bundles helper scripts and prompt templates used by skills and hooks.

---

## Best Practices

- Keep `CLAUDE.md` focused and structured (under 150 lines for best adherence)
- Use skills for reusable AI workflows instead of repeating instructions
- Use hooks for automation and guardrail checks
- Document architecture decisions in `docs/decisions/`
- Maintain modular repository design — each directory has a single responsibility

---

## Getting Started

1. Clone the repository
2. Configure Claude settings in `.claude/settings.json`
3. Define project context in `CLAUDE.md`
4. Add reusable skills to `.claude/skills/`
5. Start building modules in `src/`

---

## Development Tips

- Keep prompts modular — one skill per workflow
- Maintain clean repository structure with clear boundaries
- Use skills for repeated workflows to avoid copy-pasting instructions
- Document architecture decisions so both humans and Claude understand the "why"
- Keep AI context minimal and precise — less context means better adherence

---

## See also
- [AI Skills for Coding Agents](index.md)
- [Claude Code Best Practices](07-claude-code-best-practices.md)
- [Claude Code Hooks & Agents](08-claude-code-hooks-agents.md)
- [Claude Code Workflow Patterns](09-claude-code-workflow-patterns.md)
- [AGENTS.md Standard](12-agents-md.md)
