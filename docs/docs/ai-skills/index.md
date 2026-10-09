---
date: 2026-06-24
tags:
  - ai-agents
  - coding-agents
---

# AI Coding Agents: Skills & Claude Code

How to build and run AI coding agents: **skills** that turn a general-purpose agent into a domain specialist, **Claude Code** in depth (project setup, hooks, subagents, parallel agents, MCP, settings, commands), and the instruction files that make agents portable across tools.

Two layers run through the whole section:

- **Skills** — modular, reusable capabilities. A skill is **not** a prompt: it is a structured package of instructions, optional scripts, reference material and output templates. The agent discovers skills automatically, loads them on demand and follows their workflows. `SKILL.md` is an **open standard** shared by Claude Code, GitHub Copilot, Cursor, Devin Desktop (formerly Windsurf), Codex CLI and other agents.
- **Agents** — the tools that use them. For Claude Code that means custom subagents, agent view and teams, workflows, hooks, MCP servers, plugins, settings and `AGENTS.md` / `CLAUDE.md`.

Start with [What Is a Skill](01-what-is-a-skill.md) for skills, [Claude Code Best Practices](07-claude-code-best-practices.md) for Claude Code, or [Building Subagents in Claude Code](23-building-subagents-in-claude-code.md) to build your own agents.

---

## Sections

| File | Topics |
|------|--------|
| [What Is a Skill](01-what-is-a-skill.md) | Definition, SKILL.md anatomy, frontmatter, instructions, real examples |
| [How Agents Load Skills](02-how-agents-load-skills.md) | Progressive disclosure, 3-level loading, discovery, intent matching |
| [Skill Packaging](03-skill-packaging.md) | Folder layout, scripts, references, templates, versioning |
| [Orchestration & Workflows](04-orchestration-workflows.md) | Composing skills into chains, context handoff, failure handling |
| [Evaluation & Security](05-evaluation-security.md) | Eval harnesses, quality metrics, security audit, governance |
| [Cross-Agent Compatibility](06-cross-agent-compatibility.md) | Claude Code, Copilot, Cursor, Devin Desktop (formerly Windsurf), Gemini CLI, Kiro — setup and portability |
| [Claude Code Best Practices](07-claude-code-best-practices.md) | `.claude/` folder anatomy, CLAUDE.md, settings.json, commands, rules |
| [Claude Code Hooks & Agents](08-claude-code-hooks-agents.md) | Lifecycle hooks, agent personas, subagents, three-layer config system |
| [Claude Code Workflow Patterns](09-claude-code-workflow-patterns.md) | Verify work, explore-plan-code, prompting, session management, failure patterns |
| [Claude Code Advanced Config](10-claude-code-advanced-config.md) | Sandbox, plugins, MCP servers, non-interactive mode, enterprise settings |
| [Model Context Protocol (MCP)](11-mcp-protocol.md) | Protocol architecture, primitives, transport, security, popular servers, custom servers, skills integration |
| [AGENTS.md Standard](12-agents-md.md) | Universal agent instructions, anatomy, effective patterns, anti-patterns, cross-tool compatibility, monorepo scoping |
| [SKILL.md Playground](13-skill-playground.md) | Hands-on exercises: write frontmatter, workflows, anti-rationalization tables, red flags, verification, folder layout |
| [AGENTS.md Playground](14-agents-md-playground.md) | Hands-on exercises: mission statement, toolchain registry, judgment boundaries, escalation, monorepo scoping |
| [Claude Code Project Structure](15-claude-code-project-structure.md) | Reference layout, key components, best practices, getting started, development tips |
| [SKILL.md Universal Standard](16-skill-md-universal-standard.md) | Universal spec summary, anatomy, progressive disclosure, frontmatter, compatibility paths, implementation checklist |
| [Building Skills for Claude: Practical Playbook](17-building-skills-for-claude-playbook.md) | Condensed essentials from the full Claude skills guide: planning, frontmatter, testing, iteration, distribution |
| [Skills Troubleshooting & Checklists](18-skills-troubleshooting-checklists.md) | Pre-build and rollout checklists, failure diagnosis, trigger tuning, MCP debugging, proven workflow patterns |
| [Claude Code Commands Reference](19-claude-code-commands-reference.md) | All built-in slash commands, keyboard shortcuts, CLI flags, common workflows |
| [Claude Code Settings Reference](20-claude-code-settings-reference.md) | Every `settings.json` key (243) with scope, type and default; files, precedence, recipes |
| [Claude Code — Parallel Agents](21-claude-code-parallel-agents.md) | Subagents, agent view, agent map, agent teams, dynamic workflows, projects, worktrees |
| [Building Subagents in Claude Code](23-building-subagents-in-claude-code.md) | Designing custom agents: description, prompt, tools, models, skills, MCP, hooks, memory, invoking, testing, best practices |
| [Claude Code — Mods, Artifacts, Channels & Remote Sessions](22-claude-code-mods-artifacts-remote.md) | Mods, artifacts, channels, Remote Control, scheduling, deep links, self-hosted runner, Chrome |

---

## Why Skills, Not Prompts

| | Prompt | Skill |
|---|---|---|
| **Scope** | one conversation | reusable across sessions/projects |
| **Structure** | free-form text | YAML frontmatter + markdown instructions + bundled files |
| **Loading** | always in context | loaded on demand (progressive disclosure) |
| **Execution** | LLM reasoning only | LLM reasoning + deterministic scripts |
| **Testing** | manual checks | structured eval harness |
| **Portability** | copy-paste | open standard across agents |

---

## See also
- [Digital Garden: Knowledge Base](../index.md)
- [Agentic AI Architecture](../agentic-ai-architecture/index.md)
- [Tool Integration & Prompt Engineering](../agentic-ai-architecture/04-tool-integration-prompting.md)
- [Testing, Evaluation & Observability](../agentic-ai-architecture/06-testing-observability.md)
- [Agentic Search & Context Engineering](../agentic-ai-architecture/07-agentic-search-context-engineering.md)
