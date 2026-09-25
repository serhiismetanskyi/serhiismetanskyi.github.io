---
date: 2026-06-25
tags:
  - ai-agents
  - coding-agents
---

# Cross-Agent Compatibility

## The Open Standard

`SKILL.md` is an open format. A single skill file works across multiple AI coding agents:

| Agent | Skill Location | Format |
|---|---|---|
| **Claude Code** | `.claude/skills/` or `~/.claude/skills/` | `SKILL.md` native |
| **GitHub Copilot** | `.github/skills/` or `~/.copilot/skills/` | `SKILL.md` native |
| **Cursor** | `.cursor/rules/` | SKILL.md adapted as rule files |
| **Devin Desktop** (formerly Windsurf) | `.devin/skills/` (legacy: `.windsurf/skills/`) or `.devin/rules/` | `SKILL.md` in skills folder, or adapted as rule files |
| **Gemini CLI** | `.gemini/skills/` or install from repo | `SKILL.md` native |
| **Kiro IDE** | `.kiro/skills/` (project or global) | `SKILL.md` native + `AGENTS.md` |
| **OpenCode** | via `AGENTS.md` + `skill` tool | agent-driven execution |
| **Codex CLI** | `AGENTS.md` + repository instructions | SKILL-like workflows expressed as instructions |

---

## Setup Per Agent

### Claude Code

```bash
mkdir -p .claude/skills/tdd
cp SKILL.md .claude/skills/tdd/
```

Auto-discovers skills in `.claude/skills/`. Personal skills in `~/.claude/skills/`.

**Key capabilities**: full host-level access — scripts, network, filesystem.

**Plugin install** (from marketplace):

```bash
/plugin marketplace add addyosmani/agent-skills
/plugin install agent-skills@addy-agent-skills
```

### GitHub Copilot

```bash
mkdir -p .github/skills/tdd
cp SKILL.md .github/skills/tdd/
```

Project: `.github/skills/`. Personal: `~/.copilot/skills/`.

### Cursor

Uses `.cursor/rules/` with `.mdc` (Markdown Cursor) files:

```bash
mkdir -p .cursor/rules
```

Each `.mdc` file has YAML frontmatter controlling activation:

```yaml
---
description: "TDD workflow for test-first development"
globs: ["src/**/*.ts", "tests/**/*.ts"]
alwaysApply: false
---
# Instructions here (paste SKILL.md body)
```

| Activation Mode | When Loaded |
|---|---|
| **Always** (`alwaysApply: true`) | Every session |
| **Auto** (agent decides) | Agent matches by description |
| **Globs** | File pattern match (e.g. `*.tsx`) |
| **Manual** | Only when @-mentioned |

Priority: Team Rules > Project (`.cursor/rules/`) > User (Settings) > `.cursorrules` (legacy).

### Devin Desktop (formerly Windsurf)

Windsurf was renamed to **Devin Desktop** by Cognition on June 2, 2026. The legacy Windsurf paths still work,
but the new `.devin/` folders are preferred and take precedence.

```bash
mkdir -p .devin/rules
cp SKILL.md .devin/rules/tdd.md
```

| What | Preferred | Legacy (still read) |
|---|---|---|
| Rules | `.devin/rules/` | `.windsurf/rules/`, `.windsurfrules` |
| Workspace skills | `.devin/skills/` | `.windsurf/skills/` |
| Global skills | `~/.codeium/windsurf/skills/` | — |

`AGENTS.md` is read as well.

Source: [Devin Desktop FAQ](https://docs.devin.ai/desktop/devin-desktop-faq)

### Gemini CLI

Native skills installation:

```bash
gemini skills install https://github.com/addyosmani/agent-skills.git --path skills
```

Or from local clone:

```bash
gemini skills install ./agent-skills/skills/
```

Also supports persistent context via `GEMINI.md`.

### Kiro IDE

```bash
mkdir -p .kiro/skills/tdd
cp SKILL.md .kiro/skills/tdd/
```

Supports both project-level and global skills. Also reads `AGENTS.md`.

### OpenCode

Uses `AGENTS.md` at repo root + agent-driven `skill` tool for execution.

### Install via npx (Community Skills)

```bash
npx skills@latest add mattpocock/skills/tdd
npx skills@latest add mattpocock/skills/write-a-prd
```

---

## Rules Files Across Agents

Beyond skills, each agent reads a project-wide rules file:

| Agent | Rules File |
|---|---|
| Claude Code | `CLAUDE.md` |
| Cursor | `AGENTS.md` + `.cursor/rules/*.md` (may require explicit context include in some setups) |
| Devin Desktop (formerly Windsurf) | `.devin/rules/*.md` or `AGENTS.md` (legacy: `.windsurfrules`) |
| GitHub Copilot | `.github/copilot-instructions.md` |
| OpenAI Codex | `AGENTS.md` |
| Gemini CLI | `GEMINI.md` |

---

## Runtime Differences

| Capability | Claude Code | Claude API | Copilot | Cursor | Gemini CLI |
|---|---|---|---|---|---|
| Network access | full | none | host-dep | host-dep | full |
| Script execution | full | pre-installed | host-dep | host-dep | full |
| Package install | local only | none | host-dep | host-dep | local only |
| Sharing scope | personal/project | workspace/org | repo/user | repo/user | personal/project |

Design skills for the most constrained runtime first, then add capabilities.

---

## Portable Skill Design

Two-layer architecture for cross-agent portability:

```text
skills/
  my-skill/
    core/
      SKILL.md          ← platform-agnostic
      references/
      schema/
    adapters/
      claude-code/      ← Claude-specific wrappers
      copilot/          ← Copilot-specific wrappers
      cursor/           ← Cursor-specific rules format
```

The `core/` layer works everywhere. The `adapters/` layer handles platform differences.

---

## Skill Registries and Collections

| Registry | Description | Size |
|---|---|---|
| [skills.sh](https://skills.sh/) | Community registry | thousands of indexed skills |
| [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | Production engineering workflows | 20 skills, 12k+ stars |
| [mattpocock/skills](https://github.com/mattpocock/skills) | Planning, dev, tooling, writing | 19 skills, 14k+ stars |
| [hoodini/ai-agents-skills](https://github.com/hoodini/ai-agents-skills) | Curated for Copilot/Claude/Cursor/Windsurf | 25+ skills |
| [Anthropic pre-built](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) | PowerPoint, Excel, Word, PDF | 4 official skills |

---

## References

- [Anthropic — Agent Skills Overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
- [Claude Code — Skills](https://code.claude.com/docs/en/skills)
- [Agent Skills Specification](https://agentskills.io/specification)
- [OpenAI Codex: AGENTS.md](https://developers.openai.com/codex/guides/agents-md/)

---

## See also
- [AI Skills for Coding Agents](index.md)
- [AGENTS.md Standard](12-agents-md.md)
- [Model Context Protocol (MCP)](11-mcp-protocol.md)
- [Evaluation & Security](05-evaluation-security.md)
