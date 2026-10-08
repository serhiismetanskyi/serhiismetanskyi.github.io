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
- **Hyphenated matchers match exactly**: `code-reviewer` or `mcp__brave-search` match only that name. To match a whole MCP server write a regular expression, `mcp__brave-search__.*`.
- A hook handler can call an MCP tool with `"type": "mcp_tool"`; `PostToolUse` can replace a tool's output with `hookSpecificOutput.updatedToolOutput`; `PreModelSwitch` / `PostModelSwitch` fire around a model change.
- `{…}` on stdout that is not valid JSON is reported as a hook error, and `<system-reminder>` tags in hook output are escaped before they reach Claude.
- **Trust**: frontmatter hooks in an agent file need the folder's workspace trust, and `allowedHttpHookUrls` / `httpHookAllowedEnvVars` limit where HTTP hooks may send data.

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

Isolated reviewers with specific perspectives. Each `.md` file defines a persona. The file **must** start with YAML frontmatter containing `name` and `description` — a file without them is skipped silently. The three below are minimal read-only personas; how to design, scope and test agents is in [Building Subagents in Claude Code](23-building-subagents-in-claude-code.md).

### Code Reviewer

```markdown
---
name: code-reviewer
description: Senior-level code review for correctness, security, testability, readability and performance. Use proactively after writing or modifying code.
tools: Read, Grep, Glob, Bash
---

You are a Senior Staff Engineer performing code review. Run `git diff` first and review only what changed.

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
---
name: security-auditor
description: Audits code for injection, auth, secrets and dependency issues. Use before merging changes that touch handlers, auth or configuration.
tools: Read, Grep, Glob
---

You are a Security Engineer auditing code for vulnerabilities. Never modify files.

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
---
name: test-engineer
description: Reviews test strategy, coverage gaps and flaky patterns. Use when adding or changing tests.
tools: Read, Grep, Glob, Bash
---

You are a QA Specialist reviewing test strategy.

## Check
- Coverage gaps (untested branches, edge cases)
- Test pyramid balance (unit > integration > e2e)
- Flaky test patterns
- Missing assertions
- Test isolation issues
```

Personas run as **subagents** — isolated context, focused perspective, parallel execution. Because the reviewers above list only `Read`, `Grep`, `Glob` (and `Bash` for `git diff`), they cannot edit your code.

---

## Subagents — Parallel Specialist Tasks

Claude delegates side tasks to subagents, each with its own context window, so search results and logs do not pollute the main session.

| Subagent | Purpose |
|---|---|
| **Explore** (built-in) | Fast, read-only codebase search; Claude picks quick / medium / very thorough |
| **Plan** (built-in) | Research while you are in plan mode |
| **General-purpose** (built-in) | Multi-step research and implementation |
| **Your own** (`.claude/agents/*.md`) | The personas above: reviewer, auditor, test engineer |

Frontmatter fields worth knowing: `name`, `description` (when Claude should delegate), `tools` (allowlist; leave out `Agent` to stop nesting), `model`, `omitClaudeMd` (skip CLAUDE.md files for a cheap read-only agent), `hooks` (scoped to this agent while it runs), `mcpServers`, and `experimental.cacheTtl`. Agent names cannot contain `:` — it is reserved for plugin namespacing.

Hooks from settings, managed policy and plugins also run **inside** subagents: `PreToolUse` and `PostToolUse` fire for a subagent's tool calls with `agent_id` and `agent_type` in the input. `SubagentStart` and `SubagentStop` mark its lifetime, and a `SubagentStop` hook can return `hookSpecificOutput.additionalContext` to continue.

Background and foreground runs, nesting depth, forks, agent view, agent teams and workflows are covered in [Claude Code — Parallel Agents](21-claude-code-parallel-agents.md).

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
- [Claude Code — Parallel Agents](21-claude-code-parallel-agents.md)
- [Building Subagents in Claude Code](23-building-subagents-in-claude-code.md)
