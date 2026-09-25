---
date: 2026-06-28
tags:
  - ai-agents
  - coding-agents
---

# Claude Code — Commands Reference

Complete reference for all built-in slash commands, keyboard shortcuts, and CLI flags.

Type `/` on an empty prompt to see every available command (including custom and MCP-provided).

---

## Session Management

| Command | What it does | Example |
|---------|-------------|---------|
| `/clear` | Wipe conversation history, start fresh. Project memory (`CLAUDE.md`) stays. | `/clear` between unrelated tasks |
| `/compact [focus]` | Summarize conversation to free context. Optional focus keeps specific info. | `/compact keep the API schema decisions` |
| `/rewind` | Roll conversation and code back to an earlier checkpoint. | `/rewind` → pick checkpoint from list |
| `/resume [session]` | Reopen a previous session and continue. Alias: `/continue`. | `/resume` → select from recent sessions |
| `/fork [name]` | Branch current conversation into a new session. | `/fork experiment-with-redis` |
| `/rename [name]` | Rename the current session. | `/rename auth-refactor` |
| `/exit` | Quit the CLI. Alias: `/quit`. | `/exit` |

## Information & Diagnostics

| Command | What it does | Example |
|---------|-------------|---------|
| `/help` | List all available commands. | `/help` |
| `/status` | Show account, model, working directory, version. | `/status` |
| `/doctor` | Diagnose install and environment issues. | `/doctor` after connection errors |
| `/cost` | Show token usage and spend for current session. | `/cost` to check before long task |
| `/usage` | Show plan usage limits and rate-limit status. | `/usage` when hitting rate limits |
| `/context` | Visualize context window — what is loaded and where space goes. | `/context` when responses degrade |
| `/stats` | Dashboard: daily usage, session history, model preferences. | `/stats` |
| `/diff` | Interactive viewer of uncommitted changes and per-turn diffs. | `/diff` before committing |

## File & Project Management

| Command | What it does | Example |
|---------|-------------|---------|
| `/init` | Explore codebase, generate a starter `CLAUDE.md`. | `/init` in a new project |
| `/memory` | View or edit `CLAUDE.md` files in scope. | `/memory` to add project rules |
| `/add-dir` | Grant Claude file access to an additional directory for this session. | `/add-dir ../shared-lib` |
| `/undo` | Revert the last file edit Claude made. | `/undo` if edit was wrong |

## Code Actions

| Command | What it does | Example |
|---------|-------------|---------|
| `/plan` | Enter Plan Mode — Claude explains approach before executing. | `/plan refactor the auth module` |
| `/simplify` | Review recent changes for reuse, quality, efficiency — then apply fixes. | `/simplify` after large refactor |
| `/copy` | Copy last response or selected code block to clipboard. | `/copy` |
| `/export [file]` | Save conversation to a file or clipboard. | `/export session-log.md` |

## Configuration

| Command | What it does | Example |
|---------|-------------|---------|
| `/model` | View or switch the active model mid-session. | `/model` → select opus/sonnet |
| `/config` | Open interactive settings UI. Alias: `/settings`. | `/config` |
| `/permissions` | View or change which tools require approval. | `/permissions` |
| `/login` / `/logout` | Authenticate, switch accounts, or sign out. | `/login` |

## Tools & Extensions

| Command | What it does | Example |
|---------|-------------|---------|
| `/mcp` | Manage MCP server connections and authentication. | `/mcp` |
| `/agents` | List, create, or edit subagents. | `/agents` |
| `/hooks` | View hook configuration for tool events. | `/hooks` |
| `/skills` | List skills available in this session. | `/skills` |
| `/btw` | Quick side question — doesn't add to main context. | `/btw what's the node version?` |
| `/feedback` | Report an issue to Anthropic with session context. Alias: `/bug`. | `/feedback` |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **Shift + Tab** | Cycle permission mode: `default → acceptEdits → plan` |
| **Esc** | Interrupt Claude mid-response |
| **Esc, Esc** | Open rewind/checkpoint menu |
| **Ctrl + C** | Cancel input, or exit on empty prompt |
| **Ctrl + R** | Reverse search through prompt history |
| **Ctrl + O** | Expand to verbose full transcript view |
| **↑ / ↓** | Scroll through prompt history |
| **`@` + path** | Reference a file or directory in prompt |
| **`/`** | Open command menu |
| **`?`** | Show shortcuts for current terminal/IDE |

---

## CLI Flags (Terminal)

Commands you run **before** entering interactive mode:

| Command | What it does | Example |
|---------|-------------|---------|
| `claude` | Start interactive session. | `claude` |
| `claude "query"` | Start with initial prompt. | `claude "explain this repo"` |
| `claude -c` | Continue most recent conversation. | `claude -c` |
| `claude -r "name"` | Resume session by ID or name. | `claude -r auth-refactor` |
| `claude --model name` | Start with specific model. | `claude --model opus` |
| `claude --enable-auto-mode` | Enable auto-approve mode (no confirmations). | For trusted automation |
| `claude auth login` | Authenticate from terminal. | `claude auth login` |
| `claude mcp` | Configure MCP servers. | `claude mcp add github` |
| `claude agents` | List configured subagents. | `claude agents` |

---

## Common Workflows

### Start a new task cleanly

```
/clear
/plan refactor payment processing to use Stripe SDK
```

### Check context before a long session

```
/context      ← see how much space is left
/compact      ← free up if needed
```

### Debug installation issues

```
/doctor       ← check environment
/status       ← verify model and account
```

### Review and commit work

```
/diff         ← review all changes
/simplify     ← clean up code
```

### Switch model mid-task

```
/model        ← pick faster model for simple tasks, stronger for complex ones
```

---

## See also

- [Claude Code Best Practices](07-claude-code-best-practices.md)
- [Claude Code Workflow Patterns](09-claude-code-workflow-patterns.md)
- [Claude Code Advanced Config](10-claude-code-advanced-config.md)
- [Claude Code Hooks & Agents](08-claude-code-hooks-agents.md)
- [Claude Code cheatsheet (official)](https://support.claude.com/en/articles/14553413-claude-code-cheatsheet)
