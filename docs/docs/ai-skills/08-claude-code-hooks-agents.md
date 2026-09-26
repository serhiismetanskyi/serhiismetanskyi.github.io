---
date: 2026-06-26
tags:
  - ai-agents
  - coding-agents
---

# Claude Code Hooks & Agent Personas

## Hooks — Deterministic Automation

Hooks run deterministically at lifecycle events, while natural-language instructions in `CLAUDE.md` remain guidance for the model.

### Lifecycle Events

```text
SessionStart → UserPromptSubmit → PreToolUse → PostToolUse → Stop
                                                    ↳ PostToolUseFailure
Async: FileChanged, CwdChanged, ConfigChange
Team:  SubagentStart, SubagentStop, TaskCreated, TaskCompleted
```

### Hook Types

| Type | When to Use |
|---|---|
| **Command** | Shell scripts (lint, format, validate) |
| **HTTP** | POST events to external services (Slack, logging) |
| **Prompt** | Single-turn LLM evaluation (yes/no gate) |
| **Agent** | Spawn subagent for complex validation |

### Configuration

Hooks are defined in `.claude/settings.json` (project) or `~/.claude/settings.json` (global):

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": { "tool": "Edit" },
      "command": "uv run ruff check --fix $FILE"
    }],
    "PreToolUse": [{
      "matcher": { "tool": "Bash" },
      "command": "scripts/check-safe-command.sh"
    }],
    "SessionStart": [{
      "command": "echo 'Git status:' && git status --short"
    }]
  }
}
```

### Exit Codes

| Code | Meaning |
|---|---|
| `0` | Success — proceed normally |
| `1` | Block — halt the action (PreToolUse) or report error |
| `2` | Silent continue — ignore hook result |

### Practical Use Cases

| Event | Use Case |
|---|---|
| **SessionStart** | Inject git status, TODO list, or environment info |
| **PreToolUse** | Block dangerous commands, validate inputs, enforce policies |
| **PostToolUse** | Auto-lint after edits, run tests, format files |
| **FileChanged** | Auto-reload config, trigger rebuilds |
| **UserPromptSubmit** | Log prompts, add context, validate requests |

### Auto-Lint Example

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": { "tool": "Edit" },
      "command": "uv run ruff check --fix $FILE && uv run mypy $FILE"
    }]
  }
}
```

Every file edit is automatically linted and type-checked.

### Secret Guard Example

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": { "tool": "Bash" },
      "command": "scripts/block-if-secrets.sh"
    }]
  }
}
```

Block any bash command that might expose secrets.

---

## Agent Personas (`.claude/agents/`)

Isolated reviewers with specific perspectives. Each `.md` file defines a persona:

### Code Reviewer

```markdown
# Code Reviewer

You are a Senior Staff Engineer performing code review.

## Review Axes
1. Correctness — does the code do what it claims?
2. Security — any input validation, auth, or injection issues?
3. Testability — is the code testable and tested?
4. Readability — would a new team member understand this?
5. Performance — any obvious inefficiencies?

## Output Format
For each finding: severity (Nit/Optional/Must-Fix), file:line, description.
```

### Security Auditor

```markdown
# Security Auditor

You are a Security Engineer auditing code for vulnerabilities.

## Focus Areas
- Input validation and sanitization
- Authentication and authorization
- Secrets management
- Dependency vulnerabilities
- SQL injection, XSS, CSRF

## Output Format
| Severity | Location | Finding | Recommendation |
```

### Test Engineer

```markdown
# Test Engineer

You are a QA Specialist reviewing test strategy.

## Check
- Coverage gaps (untested branches, edge cases)
- Test pyramid balance (unit > integration > e2e)
- Flaky test patterns
- Missing assertions
- Test isolation issues
```

Personas run as **subagents** — isolated context, focused perspective, parallel execution.

---

## Subagents — Parallel Specialist Tasks

Claude Code can spawn subagents for specialized parallel work:

| Subagent Type | Purpose |
|---|---|
| `explore` | Fast, read-only codebase exploration (quick/medium/thorough) |
| `generalPurpose` | Multi-step research and implementation |
| `shell` | Command execution specialist |
| `browser-use` | Web automation and testing |

Subagents get their own context window, preventing context pollution in the main session.

---

## Three-Layer Configuration System

| Layer | Mechanism | Reliability Profile | Use For |
|---|---|---|---|
| **CLAUDE.md** | Natural language instructions | best-effort behavioral guidance | Conventions, architecture, style |
| **Commands / Skills** | Structured workflows | stronger than free-form guidance, still model-mediated | Repeatable tasks, reviews |
| **Hooks** | Shell scripts at lifecycle events | deterministic event execution | Linting, formatting, blocking |

Use hooks for anything that **must** happen every time. Use CLAUDE.md for guidance that benefits from flexibility.

---

---

## See also
- [AI Skills for Coding Agents](index.md)
- [Claude Code Best Practices](07-claude-code-best-practices.md)
- [Model Context Protocol (MCP)](11-mcp-protocol.md)
- [Evaluation & Security](05-evaluation-security.md)
