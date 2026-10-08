---
date: 2026-06-26
updated: 2026-10-07
tags:
  - ai-agents
  - coding-agents
---

# Claude Code Hooks & Agent Personas

## Hooks — Deterministic Automation

Hooks run deterministically at lifecycle events, while natural-language instructions in `CLAUDE.md` remain guidance for the model.

### Lifecycle Events

```text
Session:  SessionStart → Setup → InstructionsLoaded … SessionEnd
Turn:     UserPromptSubmit → UserPromptExpansion → PreToolUse → PermissionRequest
          → PostToolUse / PostToolUseFailure → PostToolBatch → Stop / StopFailure
Tools:    PermissionDenied, Notification, MessageDisplay, Elicitation, ElicitationResult
Agents:   SubagentStart, SubagentStop, TaskCreated, TaskCompleted, TeammateIdle
Context:  PreCompact, PostCompact, PreModelSwitch, PostModelSwitch
Files:    FileChanged, CwdChanged, DirectoryAdded, ConfigChange, WorktreeCreate, WorktreeRemove
```

`PreToolUse`, `PermissionRequest`, `UserPromptSubmit` and `Stop` can block or change what happens next; most of the others only observe.

### Hook Types

| Type | When to Use |
|---|---|
| **`command`** | Shell scripts (lint, format, validate); the event arrives as JSON on stdin |
| **`http`** | POST the event JSON to a URL (Slack, audit log, policy service) |
| **`mcp_tool`** | Call a tool on a configured MCP server |
| **`prompt`** | Single-turn LLM evaluation that returns a decision (yes/no gate) |
| **`agent`** | Spawn a subagent with Read / Grep / Glob to verify a condition (experimental) |

### Configuration

Hooks live in `~/.claude/settings.json` (all projects), `.claude/settings.json` (team, committed), `.claude/settings.local.json` (personal), managed settings, a plugin's `hooks/hooks.json`, or skill / subagent frontmatter. Hooks from all levels merge.

Three levels of nesting: **event** → **matcher group** → **handlers**:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "jq -r '.tool_input.file_path' | xargs uv run ruff check --fix" }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/scripts/check-safe-command.sh" }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "echo 'Git status:' && git status --short" }
        ]
      }
    ]
  }
}
```

- **`matcher`** — `"Bash"` exact name; `"Edit|Write"` or `"Edit, Write"` a list; anything with other characters is a regular expression (`"mcp__github__.*"`, `"^Notebook"`). Omitted, `""` or `"*"` matches everything.
- **`if`** — one permission rule that narrows a handler further: `"if": "Bash(git push *)"`.
- **`timeout`** — seconds; defaults 600 for `command` / `http` / `mcp_tool`, 30 for `prompt`, 60 for `agent`.
- **`async: true`** — run a command hook in the background without blocking the turn.
- There is no `$FILE` variable: read the tool input from stdin (`jq -r '.tool_input.file_path'`). `$CLAUDE_PROJECT_DIR` points to the project root.
- `/hooks` shows every configured hook and where it came from; `"disableAllHooks": true` turns off non-managed hooks.

### Exit Codes

| Code | Meaning |
|---|---|
| `0` | Success. Stdout is parsed as JSON if it is a JSON object; for `UserPromptSubmit`, `SessionStart` and a few others, plain stdout is added to Claude's context |
| `2` | Blocking error. On events that can block, the action is stopped (`PreToolUse` cancels the tool call, `UserPromptSubmit` rejects the prompt) and stderr is shown to Claude |
| Other | Non-blocking error. The action proceeds; the transcript shows a hook error notice |

For finer control, exit `0` and print JSON — for example `{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": "..."}}`.

### Practical Use Cases

| Event | Use Case |
|---|---|
| **SessionStart** | Inject git status, TODO list, or environment info |
| **PreToolUse** | Block dangerous commands, validate inputs, enforce policies |
| **PostToolUse** | Auto-lint after edits, run tests, format files |
| **Stop** | Refuse to finish until tests pass |
| **FileChanged** | Auto-reload config, trigger rebuilds |
| **UserPromptSubmit** | Log prompts, add context, validate requests |
| **Notification** | Desktop or chat notification when Claude waits for input |

### Auto-Lint Example

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "f=$(jq -r '.tool_input.file_path'); case \"$f\" in *.py) uv run ruff check --fix \"$f\" && uv run mypy \"$f\";; esac"
          }
        ]
      }
    ]
  }
}
```

Every edited Python file is linted and type-checked.

### Secret Guard Example

```bash
#!/bin/bash
# scripts/block-if-secrets.sh — PreToolUse hook for Bash
command=$(jq -r '.tool_input.command')
if grep -qE '(\.env|id_rsa|credentials|AWS_SECRET)' <<<"$command"; then
  echo "Blocked: command touches secrets" >&2
  exit 2          # block; stderr goes to Claude
fi
exit 0
```

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/scripts/block-if-secrets.sh" }] }
    ]
  }
}
```

Blocks any bash command that might expose secrets.

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
- [Claude Code Settings Reference](20-claude-code-settings-reference.md)
