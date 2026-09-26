---
date: 2026-06-27
tags:
  - ai-agents
  - coding-agents
---

# AGENTS.md — The Universal Agent Instructions Standard

## What Is AGENTS.md

`AGENTS.md` is an open Markdown format — a "README for AI coding agents." It provides a dedicated location for project-specific instructions that agents need: build commands, test workflows, code conventions, and architectural decisions. Adopted by **60,000+ repositories** on GitHub and governed by the **Agentic AI Foundation** under the Linux Foundation (Dec 2025), with backing from OpenAI, Anthropic, Google, Microsoft, and AWS.

ThoughtWorks Technology Radar (Nov 2025): **Trial** level.

---

## Core Philosophy

### 1. Minimal by Design

Research (Gloaguen et al., 2026, ETH Zurich) on 138 repositories found that LLM-generated context files **reduce** agent task success rates and increase inference cost by 20%. Developer-written minimal files show only +4% improvement. Conclusion: unnecessary requirements actively harm performance because agents follow them faithfully, broadening exploration without improving outcomes.

### 2. Toolchain First

If a constraint is enforced by a linter, formatter, type checker, or CI gate — **do not restate it** in AGENTS.md. The tool is the constraint. Restating creates maintenance debt and dilutes signal. Correct pattern:

```text
Lint: `pnpm lint` (Biome — see biome.json)
```

### 3. The Pink Elephant Problem

Telling an agent what **not** to do activates that concept in its attention window. "Do not use tRPC" makes the token `tRPC` highly active. Fix the underlying ambiguity (delete legacy code, add a linter rule) instead of adding negative instructions.

### 4. Persistent Judgment

AGENTS.md carries the project's institutional knowledge — how to resolve ambiguity, what to ask before acting, which architectural values to uphold. This is stable, rarely-changing content. If your file changes often, it carries content that belongs elsewhere.

---

## Anatomy

Keep under **150 lines** with 6–10 core rules. Front-load commands. Each section exists only if its content cannot live elsewhere.

### Mission (2–4 sentences)

```markdown
> **Project:** ZenTask — minimalist productivity app.
> **Core constraint:** Local-first data; offline support is non-negotiable.
```

### Toolchain Registry

| Action | Command | Authority |
|---|---|---|
| Build | `make build` | Outputs to `./bin` |
| Test | `make test` | Runs with `-race` |
| Lint | `golangci-lint run` | See `.golangci.yml` |

### Judgment Boundaries (Three-Tier System)

**NEVER** (hard limits):
- Commit secrets, tokens, or `.env` files
- Add external dependencies without discussion
- Guess on ambiguous specs — stop and ask

**ASK** (human-in-the-loop):
- Before running database migrations
- Before deleting files

**ALWAYS** (proactive):
- Explain plan before writing code
- Handle all errors explicitly

### Personas (Registry Only)

Full definitions live in skill/workflow files, not inline. List only names and invocation: `@Lead, @Dev, @Critic → .claude/skills/`.

### Context Map (Complex Projects Only)

High-level structural index. Only list directories that would surprise someone who knows the framework. Research confirms maps do **not** accelerate file discovery — agents navigate repos effectively without them.

---

## Patterns That Work

### Command-First Instructions

Every instruction answers: "What command proves this was done correctly?"

```markdown
- Lint: `ruff check . --fix`
- Test: `pytest -v --tb=short`
- Full verify: `ruff check . && pytest -v && mypy app/ --strict`
```

### Closure Definitions

```markdown
## Definition of Done
1. `ruff check .` exits 0  2. `pytest -v` exits 0  3. `mypy --strict` exits 0
4. Commit follows: `type(scope): description`
```

### Task-Organized Sections

Use `When…` prefix so agents select relevant instructions per task type:
- `When Writing Code` — lint after every change, test the affected module
- `When Reviewing Code` — run `bandit -r app/`, verify coverage ≥80%
- `When Releasing` — bump version, full suite, git tag

### Escalation Rules

Without escalation rules, blocked agents improvise destructively:
- Tests fail 3× → stop, report failing test with full output
- Missing dependency → check `requirements.txt`, then ask
- Merge conflicts → stop, show conflicting files
- **Never**: delete files to fix errors, force push, skip tests

---

## Anti-Patterns (Reliably Ignored)

| Pattern | Why It Fails |
|---|---|
| Prose paragraphs | No actionable instruction extractable |
| "Be careful with migrations" | "Careful" is not a constraint |
| "Optimize where possible" | No trigger condition or threshold |
| Contradictory priorities | Agent skips verification, rushes to code |
| Style guides without enforcement | No verification mechanism |

Fix: replace prose with commands, number priorities explicitly.

---

## Cross-Tool Compatibility

| Tool | Native File | Reads AGENTS.md? |
|---|---|---|
| **OpenAI Codex** | `AGENTS.md` | Yes (native, hierarchy + override) |
| **GitHub Copilot** | `.github/copilot-instructions.md` | Yes (native) |
| **Cursor** | `.cursor/rules/` | Yes (auto-discovered) |
| **Devin Desktop** (formerly Windsurf) | `.devin/rules/` (legacy: `.windsurfrules`) | Yes (auto-discovered) |
| **Amp** | `AGENTS.md` | Yes (co-created the standard) |
| **Gemini CLI** | `GEMINI.md` | Configurable via settings.json |
| **Zed** | `.rules` | Yes (priority 7 of 9) |
| **Claude Code** | `CLAUDE.md` | No (use symlink: `ln -s AGENTS.md CLAUDE.md`) |
| **Aider** | `CONVENTIONS.md` | Manual (`--read AGENTS.md`) |

**Strategy**: write `AGENTS.md` as the canonical source. Mirror to tool-specific files; never maintain parallel copies that drift.

---

## Directory Scoping (Monorepos)

Files closer to the working directory take precedence. Tools concatenate every AGENTS.md found along the path from root to current directory:

```text
/repo/AGENTS.md                       ← Project-wide rules
└─ /repo/services/AGENTS.md           ← Service defaults
    ├─ /repo/services/api/AGENTS.md   ← API-specific
    └─ /repo/services/web/AGENTS.md   ← Frontend-specific
```

OpenAI's Codex repository uses **88 separate AGENTS.md files**. Codex also supports `AGENTS.override.md` to replace (not extend) parent instructions.

---

## AGENTS.md vs CLAUDE.md vs .cursorrules

| | AGENTS.md | CLAUDE.md | .cursorrules |
|---|---|---|---|
| **Scope** | Universal (15+ tools) | Claude Code only | Cursor only (legacy) |
| **Governance** | Linux Foundation AAIF | Anthropic | Anysphere |
| **Hierarchy** | Root + nested + override | Root + global + dir | `.cursor/rules/*.mdc` |
| **Optimal size** | ≤150 lines | ≤500 lines (150 optimal) | Per-rule files |

All three coexist — each tool reads only its designated file.

---

## Validating Your AGENTS.md

```bash
codex --ask-for-approval never "Summarize your current instructions"
claude --print "What instructions are you following?"
```

If the agent can't reproduce your build commands verbatim — the file is too verbose or not being discovered.

---

---

## See also
- [AI Skills for Coding Agents](index.md)
- [Cross-Agent Compatibility](06-cross-agent-compatibility.md)
- [Claude Code Best Practices](07-claude-code-best-practices.md)
- [Evaluation & Security](05-evaluation-security.md)
- [Agentic Search & Context Engineering](../agentic-ai-architecture/07-agentic-search-context-engineering.md)
