---
date: 2026-06-28
updated: 2026-10-07
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
| `/clear` | Start a new conversation with empty context. Pass a name to label the old one in the `/resume` picker. Project memory (`CLAUDE.md`) stays. | `/clear` between unrelated tasks |
| `/compact [focus]` | Summarize the conversation to free context. Optional focus keeps specific info. | `/compact keep the API schema decisions` |
| `/rewind` | Roll conversation and/or code back to an earlier checkpoint, or summarize from a selected message. Aliases: `/checkpoint`, `/undo`. | `/rewind` → pick a checkpoint |
| `/resume [session]` | Reopen a previous session by ID or name. Background sessions are marked `bg`; resuming a running one opens it. | `/resume` → select from recent sessions |
| `/fork [prompt]` | Copy the conversation into a **new background session** and keep working here. With a prompt the copy starts on it at once. | `/fork try the Redis variant` |
| `/subtask <task>` | Spawn a forked **subagent**: it inherits the whole conversation, works in the background and returns its result here. | `/subtask check every caller of parse()` |
| `/rename [name]` | Rename the session; without a name it generates one. Works with `-p` too. | `/rename auth-refactor` |
| `/cd <dir>` | Move the session to another working directory, keeping the conversation and the prompt cache. | `/cd ../api` |
| `/goal [condition\|clear]` | Keep working across turns until the condition is met. No argument shows the current goal. | `/goal all unit tests pass` |
| `/exit` | Quit the CLI. Alias: `/quit`. | `/exit` |

## Information & Diagnostics

| Command | What it does | Example |
|---------|-------------|---------|
| `/help` | List all available commands. | `/help` |
| `/status` | Open the Status tab: version, model, account, connectivity, which settings sources loaded, session kind (interactive or background). | `/status` |
| `/doctor` | Setup checkup: diagnoses install, settings, extensions and `CLAUDE.md`, proposes fixes and applies them after you confirm. `/doctor prompt-audit` audits CLAUDE.md, skills and agents for prompting written for older models. | `/doctor` after connection errors |
| `/usage` | Session cost, plan limits and what drives them (skills, subagents, plugins, MCP servers, loops). `/cost` and `/stats` are aliases. | `/usage` before a long task |
| `/context` | Visualize the context window — what is loaded and where space goes; counts MCP server instructions. | `/context` when responses degrade |
| `/diff` | Review the changes in your working tree, including Claude's edits so far; a side panel in fullscreen. | `/diff` before committing |
| `/insights` | HTML report on how you use Claude Code across recent sessions. | `/insights` |
| `/recap` | One-line summary of the current session. | `/recap` |
| `/skill-doctor` | What each skill costs in context and how often it is used. | `/skill-doctor` |
| `/tasks` | Background work of this session, including finished subagents (opens the agent map in VS Code). | `/tasks` |
| `/workflows` | Progress view for running and finished workflows: watch, pause, resume, save. | `/workflows` |

## File & Project Management

| Command | What it does | Example |
|---------|-------------|---------|
| `/init` | Explore the codebase and generate a starter `CLAUDE.md`. | `/init` in a new project |
| `/memory` | Edit `CLAUDE.md` files, toggle auto memory, view memory entries. | `/memory` |
| `/add-dir` | Grant file access to another directory for this session. | `/add-dir ../shared-lib` |
| `/export [file]` | Export the conversation as plain text. | `/export session-log.md` |
| `/copy [N]` | Copy the last (or Nth-latest) response; a picker for code blocks. | `/copy 2` |

## Code Actions

| Command | What it does | Example |
|---------|-------------|---------|
| `/plan [task]` | Enter plan mode; with a description, start on that task. | `/plan refactor the auth module` |
| `/code-review [level] [pr]` | Correctness review of the diff or a PR as a background subagent. `--comment` posts to the PR, `--fix` applies findings, `--max-findings n\|all`. `/code-review ultra` runs the deep cloud review. Alias: `/review`. | `/code-review high 1234 --comment` |
| `/simplify` | Quality only: reuse, simplification, efficiency — applies the fixes. Does not hunt for bugs. | `/simplify` after a large refactor |
| `/verify` | Build and run the app, observe that the change does what it should. | `/verify` |
| `/batch` | Skill: split a large change into 5–30 worktree-isolated background subagents after you approve the plan. | `/batch add type hints to all services` |
| `/deep-research <question>` | Workflow: parallel web searches, cross-checked sources, a cited report. | `/deep-research how do others test MCP servers` |
| `/loop [interval] [prompt]` | Repeat a prompt while the session is open; without an interval Claude self-paces. | `/loop 5m check the deploy` |
| `/schedule` | Create, list and run routines that execute in the cloud. Alias: `/routines`. | `/schedule` |

## Configuration

| Command | What it does | Example |
|---------|-------------|---------|
| `/model` | Pick the model and save it as default for new sessions; `s` on a row switches for this session only. | `/model` |
| `/effort [level]` | Reasoning effort, saved per model: `low`, `medium`, `high`, `xhigh`; `ultracode` is a separate toggle (`/effort ultracode on\|off`). | `/effort xhigh` |
| `/advisor [model\|off]` | Pair the main model with a stronger advisor Claude consults at key moments. | `/advisor opus` |
| `/fast` | Toggle fast mode (Opus models). | `/fast` |
| `/config [key=value]` | Settings UI; `key=value` sets a setting directly, `/config --help` lists keys. Alias: `/settings`. | `/config editorMode=vim` |
| `/permissions` | Allow / ask / deny rules, working directories, recent auto mode denials. | `/permissions` |
| `/sandbox` | Toggle sandbox mode on supported platforms. | `/sandbox` |
| `/theme`, `/output-style [name]`, `/statusline`, `/keybindings` | Appearance and key bindings; `/output-style concise` switches style. | `/output-style concise` |
| `/tui fullscreen` | Switch to the fullscreen renderer (mouse support, side panels). | `/tui fullscreen` |
| `/focus` | Toggle focus view: last prompt, one-line tool summary, final answer. | `/focus` |
| `/login` / `/logout` | Authenticate, switch accounts, or sign out. | `/login` |

## Tools & Extensions

| Command | What it does | Example |
|---------|-------------|---------|
| `/mcp` | Manage MCP servers and authentication; `/mcp reconnect all` retries failed ones. | `/mcp` |
| `/agents` | Prints a reminder: ask Claude to create or manage subagents, or edit `.claude/agents/` directly. | `/agents` |
| `/hooks` | View hook configuration, grouped by event. | `/hooks` |
| `/skills` | List skills; type to filter, `t` sorts by token cost. | `/skills` |
| `/plugin` | Manage plugins: `list`, `install plugin@marketplace`, `enable`, `disable`. | `/plugin install fmt@acme-tools` |
| `/reload-plugins`, `/reload-skills` | Apply plugin or skill changes without restarting. | `/reload-skills` |
| `/artifacts` | List your artifacts and those shared with you; attach, open or copy a link. | `/artifacts` |
| `/remote-control` | Make this session available from claude.ai and the Claude app. | `/remote-control` |
| `/teleport` | Pull a cloud session into this terminal. Alias: `/tp`. | `/teleport` |
| `/ide`, `/chrome`, `/mobile` | IDE integration, Claude in Chrome settings, mobile app QR code. | `/mobile` |
| `/btw` | Side question that does not enter the conversation; bare `/btw` reopens the last answer. | `/btw what's the node version?` |
| `/feedback` | Report an issue to Anthropic with session context. Alias: `/bug`. | `/feedback` |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **Shift + Tab** | Cycle permission mode: `default (Manual) → acceptEdits → plan → auto` |
| **Esc** | Interrupt Claude mid-response |
| **Esc, Esc** | Open rewind/checkpoint menu |
| **Ctrl + C** | Cancel input, or exit on empty prompt |
| **Ctrl + R** | Reverse search through prompt history |
| **Ctrl + O** | Expand to verbose full transcript view |
| **Ctrl + Enter** | Send now: interrupt the current turn and send queued messages (in a subagent view it moves the running command to the background) |
| **←** (empty prompt) | Send this session to the background and open agent view |
| **Ctrl + G** | Edit the prompt (or plan) in your `$EDITOR` |
| **↑ / ↓** | Scroll through prompt history |
| **`@` + path** | Reference a file or directory in prompt |
| **`/`** | Open command menu |
| **`?`** | Show shortcuts for current terminal/IDE |

---

## CLI Commands & Flags (Terminal)

Commands you run **before** entering interactive mode:

| Command | What it does | Example |
|---------|-------------|---------|
| `claude` / `claude "query"` | Start an interactive session, optionally with a first prompt. | `claude "explain this repo"` |
| `claude -p "query"` | Run once without a session (scripts, CI), then exit. | `claude -p "list endpoints" --output-format json` |
| `claude -c` / `claude -r "name"` | Continue the latest conversation / resume one by ID or name. | `claude -r auth-refactor` |
| `claude update` | Update to the latest version. | `claude update` |
| `claude auth login\|logout\|status` | Sign in, sign out, show auth state as JSON. | `claude auth status` |
| `claude doctor` | Print installation and settings diagnostics without a session. | `claude doctor` |
| `claude mcp add\|list\|login <name>` | Manage MCP servers; `login` runs the OAuth flow from the shell (`--no-browser` over SSH). | `claude mcp login sentry` |
| `claude plugin install\|validate\|test\|eval` | Manage and test plugins; `install … --marketplace <source>` adds the marketplace first. | `claude plugin eval` |
| `claude agents` | Agent view: monitor and dispatch background sessions; `--json`, `--cwd <path>`. | `claude agents --json` |
| `claude attach\|logs\|stop\|respawn\|rm <id\|name>` | Work with one background session; a part of the name is enough. | `claude attach auth-fix` |
| `claude remote-control` | Start a Remote Control server. | `claude remote-control` |
| `claude ultrareview [target]` | Deep cloud review non-interactively (`--json`). | `claude ultrareview 1234` |
| `claude auto-mode defaults\|reset` | Print or restore the auto-mode classifier rules. | `claude auto-mode reset` |
| `claude purge [path]` | Delete all local Claude Code state for a project (`--dry-run`). | `claude purge --dry-run` |
| `claude self-hosted-runner` | Run cloud sessions on your own infrastructure. | `claude self-hosted-runner` |
| `claude setup-token` | Long-lived OAuth token for CI. | `claude setup-token` |

| Flag | What it does |
|------|-------------|
| `--model name` / `--effort level` | Model and effort for this session (`low` … `max`, or `ultracode`). |
| `--fallback-model a,b,c` | Models to try, in order, when the primary is overloaded or retired. |
| `--advisor model` | Advisor model for this session. |
| `--permission-mode mode` | Start in `default` (alias `manual`), `acceptEdits`, `plan`, `auto`, `dontAsk` or `bypassPermissions`. `--enable-auto-mode` was removed in v2.1.111. |
| `--permission-prompts none` | Print mode: deny anything that would prompt, so unattended runs never hang. |
| `--allowedTools` / `--disallowedTools` / `--tools` | Pre-approve, block, or restrict the built-in tools. |
| `--settings file-or-json` / `--setting-sources` | Extra settings for this session / which sources to load. |
| `--restricted` | No shell or code tools, settings files ignored — for evaluation harnesses on shared machines. |
| `--safe-mode` | Start with every customization disabled, to troubleshoot a broken configuration. |
| `--bare` | Skip hooks, skills, plugins, MCP servers, auto memory and CLAUDE.md for fast scripted calls. |
| `--bg` / `--exec` | Start a session (or, with `--exec`, a shell command) as a background job. |
| `--agent name` / `--agents json` | Run the session as a named agent / define subagents inline. |
| `--worktree [name]` (`--tmux`) | Start in an isolated git worktree. |
| `--add-dir path` | Give Claude access to another directory. |
| `--mcp-config` / `--strict-mcp-config` | Load MCP servers from JSON / use only those. |
| `--plugin-dir path` / `--plugin-url url` | Load a plugin (folder, `.zip`) for this session. |
| `--cloud "task"` / `--teleport id` | Start a cloud session / resume a cloud session locally. |
| `--remote-control` / `--chrome` / `--channels` | Enable Remote Control, Chrome integration, channel plugins. |
| `--desktop` | Open the Claude desktop app on the current directory. |
| `--max-turns n` / `--max-budget-usd n` | Limits for print mode. |
| `--output-format text\|json\|stream-json` / `--json-schema` | Output shape for print mode. |
| `--from-pr n\|url` | Pick a session linked to a PR (GitHub, GitLab, Bitbucket). |
| `--ax-screen-reader` | Screen-reader friendly output. |

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
/code-review  ← find correctness bugs
/simplify     ← clean up code
```

### Switch model mid-task

```
/model        ← pick faster model for simple tasks, stronger for complex ones
/effort xhigh ← more reasoning for a hard problem
```

---

## See also

- [Claude Code Best Practices](07-claude-code-best-practices.md)
- [Claude Code Workflow Patterns](09-claude-code-workflow-patterns.md)
- [Claude Code Advanced Config](10-claude-code-advanced-config.md)
- [Claude Code Hooks & Agents](08-claude-code-hooks-agents.md)
- [Claude Code cheatsheet (official)](https://support.claude.com/en/articles/14553413-claude-code-cheatsheet)
- [Claude Code Settings Reference](20-claude-code-settings-reference.md)
- [Claude Code — Parallel Agents](21-claude-code-parallel-agents.md)
