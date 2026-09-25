---
date: 2026-06-25
tags:
  - ai-agents
  - coding-agents
---

# Claude Code Best Practices

## Anatomy of the `.claude/` Folder

Everything Claude Code needs to know about your project lives in one place:

```text
your-project/
├── CLAUDE.md                ← project memory (team-shared, committed)
├── CLAUDE.local.md          ← personal overrides (git-ignored)
├── .claude/
│   ├── settings.json        ← shared permissions & config (committed)
│   ├── settings.local.json  ← personal permissions (git-ignored)
│   ├── commands/            ← custom slash commands
│   │   ├── review.md
│   │   ├── fix-issue.md
│   │   └── deploy.md
│   ├── rules/               ← modular instruction files
│   │   ├── code-style.md
│   │   ├── testing.md
│   │   └── api-conventions.md
│   ├── skills/              ← auto-invoked workflows
│   │   ├── security-review/
│   │   │   └── SKILL.md
│   │   └── deploy/
│   │       └── SKILL.md
│   └── agents/              ← subagent personas
│       ├── code-reviewer.md
│       └── security-auditor.md
└── .claudeignore            ← files to exclude from context
```

---

## CLAUDE.md — Project Memory

Claude reads `CLAUDE.md` at the start of every session. It is the single highest-impact setup step.

### Location Hierarchy

| Location | Scope | Shared? |
|---|---|---|
| Enterprise policy path | Org-wide (managed via MDM) | managed |
| `~/.claude/CLAUDE.md` | Global (all projects) | personal |
| `./CLAUDE.md` | Project (root) | committed to git |
| `./src/CLAUDE.md` | Directory-specific (monorepos) | committed to git |
| `CLAUDE.local.md` | Project (personal overrides) | git-ignored |

### Structure: Five Sections

```markdown
# Project: MyApp

## Tech Stack
- Python 3.13, FastAPI, PostgreSQL, SQLAlchemy
- pytest, Playwright, Ruff, mypy

## Commands
- Build: `uv run python -m build`
- Test: `uv run pytest --cov`
- Lint: `uv run ruff check . && uv run mypy .`
- Dev: `uv run uvicorn app.main:app --reload`

## Architecture
- src/app/ — FastAPI application
- src/app/routes/ — API endpoints
- src/app/models/ — SQLAlchemy models
- tests/ — mirrors src/ structure

## Code Conventions
- Type hints on all public functions
- Named exports, no star imports
- Tests colocated: models/user.py → tests/models/test_user.py

## Hard Rules
- NEVER commit .env or secrets
- NEVER add deps without checking license
- Always run tests before committing
- Ask before modifying database schema
```

### Writing Rules

- keep under **500 lines** (150 lines is optimal for best adherence)
- **Respect the attention budget**: Claude already has ~50 system instructions. Each line you add makes every other line less likely to be followed
- order by importance: commands first, then constraints, then style
- include **runnable commands** — the single most impactful addition
- only include rules that **change behavior** — if Claude would do it correctly from reading your code, skip the rule
- use precise negative rules: "Don't use `Any` type" not "write good code"
- pair **NEVER** with what to do instead: `"NEVER use console.log (use logger utility)"`
- run `/init` to generate a starter, then refine

Emphasis keywords (use sparingly — if everything is critical, nothing stands out): `IMPORTANT:`, `YOU MUST:`, `NEVER:`, `CRITICAL:`.

---

## settings.json — Permissions & Config

### Priority Order (highest → lowest)

1. Command line arguments
2. `.claude/settings.local.json` (personal, git-ignored)
3. `.claude/settings.json` (team-shared, committed)
4. `~/.claude/settings.local.json` (personal global)
5. `~/.claude/settings.json` (global default)

### Permissions

```json
{
  "permissions": {
    "allow": [
      "Bash(uv run pytest *)",
      "Bash(uv run ruff check *)",
      "Read"
    ],
    "deny": [
      "Bash(curl *)",
      "Bash(rm -rf *)",
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./secrets/**)"
    ]
  }
}
```

Evaluation order: **deny → ask → allow**. First matching rule wins.

### Permission Modes

| Mode | Behavior |
|---|---|
| `default` | Prompts on first use of each tool |
| `acceptEdits` | Auto-accepts file edits; still asks for bash commands |
| `plan` | Read-only analysis, no modifications |
| `auto` | Background classifier auto-approves safe actions (Team+ plan) |
| `dontAsk` | Only pre-approved tools run; everything else denied (CI/CD) |
| `bypassPermissions` | All checks disabled (isolated containers only) |

Switch during session: press **Shift+Tab** in CLI.

---

## Custom Commands (`.claude/commands/`)

Each `.md` file becomes a reusable slash command:

```markdown
---
description: Run full code review on changed files
allowed-tools:
  - Read
  - Grep
  - Glob
---

Review all files changed since the last commit.
Focus on: correctness, security, test coverage.
Output a markdown summary with severity labels.
```

Invoke with `/review` (custom command from `review.md`, filename minus `.md`).

### Key Features

- **Arguments**: `$ARGUMENTS`, `$0`, `$1` for dynamic values
- **Namespacing**: subdirectories for organization
- **Bash execution**: backtick syntax for shell commands
- **Priority**: project commands override personal commands with same name

---

## Rules (`.claude/rules/`)

Modular instructions: `code-style.md`, `testing.md`, `api-conventions.md`, `security.md`. Claude loads rules **based on context** — API code triggers `api-conventions.md`, test files trigger `testing.md`.

---

## References

- [Claude Code Best Practices](https://code.claude.com/docs/en/best-practices)
- [Configure Permissions](https://code.claude.com/docs/en/permissions)
- [CLAUDE.md Guide](https://www.claudedirectory.org/blog/claude-md-guide)

---

## See also
- [AI Skills for Coding Agents](index.md)
- [AGENTS.md Standard](12-agents-md.md)
- [Claude Code Hooks & Agents](08-claude-code-hooks-agents.md)
- [Model Context Protocol (MCP)](11-mcp-protocol.md)
- [Cross-Agent Compatibility](06-cross-agent-compatibility.md)
