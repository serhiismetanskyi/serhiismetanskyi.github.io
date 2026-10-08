---
date: 2026-10-09
tags:
  - ai-agents
  - coding-agents
  - claude-code
  - subagents
---

# Building Subagents in Claude Code

A **subagent** is a specialist that Claude Code can hand a task to. It is one Markdown file with YAML frontmatter: the frontmatter says *when* to use it and *what it may touch*, the body is its system prompt. The subagent works in its own context window, so the files it reads and the logs it produces never reach your main conversation — only its final report does.

This guide is about **building** them well: choosing what deserves to be a subagent, writing the file, scoping tools and models, wiring in skills, MCP servers, hooks and memory, invoking and testing the result, and the mistakes that make delegation unreliable. How subagents fit with agent view, teams and workflows is in [Claude Code — Parallel Agents](21-claude-code-parallel-agents.md).

## Should This Be a Subagent?

| You want… | Use | Why |
|---|---|---|
| Verbose work whose output you won't reuse (test runs, log analysis, wide code search) | **Subagent** | The noise stays in its context; you get a summary |
| A hard tool boundary (read-only reviewer, SQL-select-only agent) | **Subagent** | `tools`, `disallowedTools` and hooks apply per agent |
| A fresh, unbiased second look at a diff | **Subagent** | It has not seen the reasoning that produced the change |
| A reusable prompt or checklist that runs *in* the current conversation | **Skill** | Skills share your context; subagents do not |
| Back-and-forth, iterative refinement, or phases that share lots of context | **Main conversation** | A subagent starts fresh and returns one summary |
| A quick answer about something already in the conversation | **`/btw`** | It sees the full context and has no tool cost |
| A subagent that knows everything you've said so far | **Fork** (`/subtask`) | A fork inherits the whole conversation |
| Many parallel workers that must talk to each other | **Agent team** | Subagents only report back to their parent |
| Dozens of agents following a script | **Workflow** | The script, not Claude, holds the plan |

Rule of thumb: delegate when the task is **self-contained and can return a summary**. Keep it in the main conversation when it needs frequent steering, and avoid subagents for sequential work where step 2 needs the complete output of step 1, or for parallel edits to the same file.

## Quickstart

The fastest start is to describe the agent to Claude:

```text
Create a project subagent in .claude/agents/ called flaky-test-investigator.
It should read test code and CI logs, never edit files, use Sonnet, and report
the most likely cause of each flaky test with evidence.
```

Claude writes the file; open it and check the frontmatter matches what you asked for. A minimal agent looks like this:

```markdown
---
name: code-reviewer
description: Reviews code for quality and security. Use proactively after writing or modifying code.
tools: Read, Grep, Glob, Bash
model: sonnet
---

You are a code reviewer. Run `git diff` to see the recent changes, review only
the modified files, and report findings ordered by priority with a concrete fix.
```

Then try it: `Use the code-reviewer subagent on my last commit`. The delegation shows up in the transcript as a row such as `code-reviewer(Review last commit)`.

- Claude Code **watches** `.claude/agents/` and `~/.claude/agents/`: edits are picked up within seconds, no restart. The exception is the *first* agent file in a directory that did not exist when the session started — restart once.
- The interactive `/agents` wizard no longer exists (it was removed after v2.1.197); `/agents` now just reminds you to ask Claude or edit the files.
- A subagent file whose frontmatter has no `name`, no `description`, an invalid `name` or YAML that does not parse is **skipped silently**. Check a directory with `claude plugin validate .claude/agents`, or start with `--debug` to see why a file did not load.

## Anatomy of a Subagent File

```markdown
---
name: <unique-id>              # required; unique; no ":", no leading "-"; max 256 chars
description: <when to use it>  # required; this is what Claude reads to decide to delegate
tools: Read, Grep, Glob        # optional allowlist; omit = inherit everything
disallowedTools: Write, Edit   # optional denylist, applied before `tools`
model: sonnet                  # sonnet | opus | haiku | fable | full model ID | inherit
effort: medium                 # low | medium | high | xhigh | max
permissionMode: default        # default (Manual) | acceptEdits | auto | dontAsk | plan | bypassPermissions
maxTurns: 20                   # stop after N agentic turns; output is marked partial
skills: [api-conventions]      # preload full skill content into the agent's context
mcpServers: [...]              # MCP servers scoped to this agent
hooks: {...}                   # lifecycle hooks that run only while this agent is active
memory: project                # persistent memory: user | project | local
isolation: worktree            # run in a temporary git worktree
background: true               # always run in the background
omitClaudeMd: true             # launch without CLAUDE.md files
color: green                   # colour in the task list
---

System prompt in Markdown: the agent's role, workflow and output format.
```

Field names are **camelCase and exact**: a misspelled field (`maxturns`, `disallowed_tools`) is ignored without an error. `experimental.cacheTtl: 1h` sets a per-agent prompt-cache lifetime. `initialPrompt` auto-submits a first turn when the agent runs as the main session (`--agent`).

### Where to Store It

| Location | Scope | Priority |
|---|---|---|
| Managed settings (`.claude/agents/` in the managed directory) | Whole organization | 1 (highest) |
| `--agents '{…}'` flag (or a JSON file with `-p`) | Current session only, not saved | 2 |
| `.claude/agents/` | This project — commit it | 3 |
| `~/.claude/agents/` | All your projects | 4 |
| A plugin's `agents/` directory | Wherever the plugin is enabled | 5 (lowest) |

- When two agents share a name, the higher-priority one wins; among nested project directories the one closest to the working directory wins. **Keep names unique across the whole tree**: two files with the same name in one directory tree load only one, chosen by filesystem order.
- Subfolders (`agents/review/`, `agents/research/`) are fine for organizing project and user agents; identity comes only from `name`. In a **plugin**, the subfolder becomes part of the identifier (`my-plugin:review:security`).
- **Plugin agents cannot use `hooks`, `mcpServers` or `permissionMode`** — Claude Code ignores them for security reasons. Copy the agent into `.claude/agents/` if you need them, or ship the hooks and MCP servers in the plugin's own `hooks/hooks.json` and `.mcp.json`.
- Project agents are for your team: check them in, review changes to their prompts like code.

## Designing a Good Subagent

### 1. One Job, One Agent

Each agent should do one thing well: *review a diff*, *investigate flaky tests*, *run the suite and report failures*, *write API tests in house style*. A generalist "senior engineer" agent adds nothing over the main conversation. Most teams settle on a handful of well-scoped agents rather than a sprawling roster: with dozens of agents Claude has too many options and delegation becomes unreliable.

### 2. Write the Description as a Trigger

`description` is the only thing Claude sees when it decides whether to delegate. Say **when** to use the agent, not only what it is.

| Weak | Strong |
|---|---|
| `Security expert` | `Reviews code changes for injection, auth and secrets issues. Use proactively before every commit that touches API handlers or auth.` |
| `Helps with tests` | `Runs the pytest suite and reports only failing tests with error messages and the likely cause. Use after any code change.` |
| `Database agent` | `Runs read-only SQL queries against the analytics replica to answer data questions. Use when a question needs numbers from the database.` |

- Phrases like **"use proactively"** and **"use immediately after …"** raise the chance of automatic delegation.
- Make each description **single out one agent**: two agents with overlapping triggers compete.
- Keep descriptions short. Combined descriptions over **15,000 tokens** trigger a startup warning (agents still load).
- Delegation is a decision of the model, so for anything that *must* run, don't rely on it: invoke explicitly (below) or enforce it with a [hook](08-claude-code-hooks-agents.md).

### 3. Write the System Prompt Like a Runbook

The body replaces the Claude Code system prompt for this agent: the subagent gets **only** this prompt plus basic environment details (working directory, platform) and your CLAUDE.md files — not your conversation. A reliable structure:

```markdown
You are <role> for <what>.

When invoked:
1. <first concrete step — e.g. run `git diff --stat` to find what changed>
2. <how to gather what it needs>
3. <the work itself>

Rules:
- <hard constraint, e.g. never modify files; report only>
- <what to ignore, e.g. generated code in `vendor/`>

Output format:
- <exactly what to return: sections, severity levels, file:line, a verdict>
```

- **Define the output**. The report is all your main conversation will ever see; ask for exactly the fields you need (verdict first, evidence with `file:line`, next step).
- **Make it self-sufficient**: the agent does not see what you discussed. Anything essential must be in its prompt or in the delegation message Claude writes.
- **Tell it how to stop** ("if you find nothing, say so; do not invent findings"), and prefer concrete checks over adjectives ("run `uv run ruff check` and `uv run mypy`" beats "ensure high quality").

### 4. Give It Only the Tools It Needs

Omitting `tools` means **inherit everything**, MCP tools included. Scope tools to the job:

| Agent type | Typical tools |
|---|---|
| Read-only researcher / reviewer | `Read, Grep, Glob` (add `Bash` only if it must run `git diff` or tests) |
| Test runner | `Read, Grep, Glob, Bash` |
| Bug fixer / implementer | `Read, Edit, Write, Bash, Grep, Glob` |
| Web researcher | `Read, WebSearch, WebFetch` |

- `tools` is an allowlist; `disallowedTools` is a denylist from the inherited pool (applied first). A tool in both is removed. Both accept MCP patterns: `mcp__github` or `mcp__github__*` for a whole server, `mcp__*` to drop every MCP tool.
- A `disallowedTools` entry with a specifier, such as `Bash(git push *)`, **removes all of Bash**, not just that command. To keep Bash but block commands, use a `permissions.deny` rule — it applies to the main conversation and every subagent — or a [PreToolUse hook](#9-conditional-rules-with-hooks).
- If nothing in `tools` resolves (every entry misspelled), the agent usually fails to launch with an error naming the entries.
- Every subagent loses a few tools regardless: `AskUserQuestion`, `EnterPlanMode`, `ExitPlanMode` (unless in plan mode), `ScheduleWakeup`, `Workflow`. **Background** agents — the default — also get a reduced built-in tool set (file tools, `Bash`, `WebFetch`, `WebSearch`, `Skill`, and a few more) but keep all MCP tools.

To restrict which subagents an agent may spawn, list them in `tools` as `Agent(worker, researcher)`. That allowlist works only for an agent run as the *main session* with `claude --agent`; inside a subagent definition it is ignored, and `Agent` without parentheses simply allows nesting. Leave `Agent` out to forbid spawning.

### 5. Pick the Model and Effort on Purpose

Models are chosen in this order: the per-invocation `model` parameter Claude passes, then the agent's `model` field (`inherit` = the main model), then `CLAUDE_CODE_SUBAGENT_MODEL`, then the main conversation's model.

| Job | Model | Effort |
|---|---|---|
| Search, listing, summarizing logs, formatting | `haiku` | `low` |
| Review, test running, most implementation | `sonnet` | `medium` |
| Architecture review, security audit, hard debugging | `opus` (or `inherit`) | `high` / `xhigh` |

- Aliases (`opus`, `sonnet`, `haiku`, `fable`) resolve to the current default of that family, so the file keeps working across releases. A family alias equal to the main model's family resolves to the main model's exact version.
- `effort` overrides the session effort for that agent (the `CLAUDE_CODE_EFFORT_LEVEL` variable still wins). Subagents inherit the session's extended-thinking setting; there is no per-agent thinking switch.
- `CLAUDE_CODE_SUBAGENT_MODEL` is only a default. To force one model on **every** subagent, teammate and workflow agent, also set `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` (then `model` fields are ignored). Check the result with `/tasks`, which shows each subagent's model and effort.
- A subagent's context window is sized by *its own* model: delegating to a model with a smaller window gives it the smaller window.

### 6. Permissions: Inherit Unless You Have a Reason

`permissionMode` is applied only when the main session is in `default`, `dontAsk` or `plan`. If the main session is in `acceptEdits`, `auto` or `bypassPermissions`, the subagent runs in that mode and the field is ignored; a subagent can never *raise* itself to `bypassPermissions`. Under auto mode the classifier evaluates the subagent's tool calls with the main conversation's rules. Background subagents surface their permission prompts in your main session, naming the agent that asks.

### 7. Preload Skills

```yaml
skills:
  - api-conventions
  - error-handling-patterns
```

The **full content** of each listed skill is injected at startup, so the agent follows your conventions without discovering them. The field controls what is *preloaded*, not what is *allowed*: without it the agent can still call project, user and plugin skills through the `Skill` tool. Skills with `disable-model-invocation: true` (including the bundled `/verify`) cannot be preloaded. A missing or disabled skill is skipped with a debug-log warning. This is the inverse of a skill with `context: fork`, which runs the *skill* in a subagent.

### 8. Scope MCP Servers

```yaml
mcpServers:
  - playwright:            # inline: connected when the agent starts, disconnected when it ends
      type: stdio
      command: npx
      args: ["-y", "@playwright/mcp@latest"]
  - github                 # reference: reuses a server already configured in the session
```

Define a heavy server **inline** rather than in `.mcp.json` and its tool descriptions never consume context in the main conversation — only this agent gets the tools. Managed MCP policies (`allowedMcpServers`, `deniedMcpServers`, managed `.mcp.json`) and `--strict-mcp-config` / `--bare` still apply, and inline servers in a project agent file need the folder's workspace trust.

### 9. Conditional Rules with Hooks

When "allow some uses of a tool, block others" is needed, put a `PreToolUse` hook in the agent's frontmatter. It runs only while this agent is active:

```markdown
---
name: db-reader
description: Runs read-only SQL queries to answer data questions. Use when the answer needs numbers from the database.
tools: Bash
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/validate-readonly-query.sh"
---

You answer data questions by running SELECT queries with `psql`. Show the query you ran and summarize the rows.
```

```bash
#!/bin/bash
# scripts/validate-readonly-query.sh — exit 2 blocks the tool call
COMMAND=$(jq -r '.tool_input.command // empty')
if echo "$COMMAND" | grep -iE '\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)\b' >/dev/null; then
  echo "Blocked: only SELECT queries are allowed" >&2
  exit 2
fi
exit 0
```

`chmod +x` the script or the hook fails instead of blocking anything. A `Stop` hook in frontmatter becomes `SubagentStop`. Frontmatter hooks of a **project** agent run only after you accept the workspace-trust dialog for that folder (a `-p` session does not count as trusted); user-level agents and `--agents` JSON need no step. Hooks in `settings.json` also run inside every subagent, and `SubagentStart` / `SubagentStop` take the agent name as matcher.

### 10. Persistent Memory

```yaml
memory: project
```

gives the agent a directory that survives across conversations: `project` → `.claude/agent-memory/<name>/` (shareable via git, the recommended default), `user` → `~/.claude/agent-memory/<name>/`, `local` → `.claude/agent-memory-local/<name>/`. The first 200 lines or 25 KB of its `MEMORY.md` load into the prompt, and `Read`, `Write` and `Edit` are enabled automatically so it can curate its notes. Put an explicit instruction in the prompt ("update your memory with codepaths, patterns and recurring issues you discover; keep notes concise"). `memory` has no effect if auto memory is off.

### 11. Isolation, Limits and Background Runs

- `isolation: worktree` runs the agent in a temporary git worktree branched from your default branch; it is cleaned up if the agent changes nothing. Use it for agents that edit files while you or other agents work on the same repo.
- `maxTurns` is a safety net: at the limit the output returns marked **partial** and Claude can resume the agent to continue.
- `background: true` keeps the agent in the background even when Claude would wait for it. Interactive sessions run subagents in the background by default.

## Invoking Subagents

| Way | How | Guarantees the agent runs? |
|---|---|---|
| **Automatic** | Claude matches the task to a `description` | No — it is a model decision |
| **Natural language** | `Use the test-runner subagent to fix the failing tests` | Usually |
| **@-mention** | `@"code-reviewer (agent)" look at the auth changes` (or `@agent-code-reviewer`) | **Yes** — Claude's task prompt is still written from your message |
| **Whole session** | `claude --agent code-reviewer`, or `"agent": "code-reviewer"` in `.claude/settings.json` | Yes — the main thread *becomes* that agent (its prompt replaces the default system prompt; CLAUDE.md still loads) |
| **Session-only definitions** | `claude --agents '{"reviewer": {"description": "…", "prompt": "…", "tools": ["Read","Grep"]}}'` | Available this session; not saved. With `-p`, a path to a JSON file also works |
| **Background session** | `claude --agent code-reviewer --bg "review PR 1234"` | Yes — runs in [agent view](21-claude-code-parallel-agents.md#agent-view) |

Plugin agents appear under a scoped name (`my-plugin:code-reviewer`); pass the scoped name when two plugins use the same agent name. Several patterns chain naturally: *"Use the code-reviewer subagent to find performance issues, then use the optimizer subagent to fix them"* — Claude passes the first result to the second. To **resume** a finished subagent with its full history, ask Claude to continue the earlier work (it uses `SendMessage` with the agent's ID or name); the built-in Explore and Plan agents are one-shot and cannot be resumed.

## What a Subagent Sees (and Doesn't)

| Loaded at startup | Not available |
|---|---|
| The agent's own system prompt + environment details | Your conversation history and the files Claude already read |
| The task message Claude writes for the delegation | Skills you already invoked (unless preloaded with `skills`) |
| Every CLAUDE.md level (user, project, local, managed) and `AGENTS.md` | Your output style (except in a fork) |
| A git status snapshot (not for Explore and Plan) | The main conversation's auto memory (use the `memory` field) |
| Preloaded skills; a roster of sibling agents (when it can use `SendMessage`) | |

- **Rules the agent must follow** — "ignore `vendor/`", "tests live in `tests/unit`" — belong in its prompt or in the delegation message; do not assume the agent knows what you said earlier.
- `omitClaudeMd: true` launches an agent without the user, project and local CLAUDE.md files (managed policy files still load). Use it for cheap read-only agents that get everything from the delegation prompt; Explore and Plan already skip them.
- Subagents **auto-compact** like the main conversation, and their transcripts live in `~/.claude/projects/<project>/<session>/subagents/agent-<id>.jsonl` until `cleanupPeriodDays` (30 by default) expires them.

## Example Agents

### Read-Only Reviewer With a Fresh Context

```markdown
---
name: diff-reviewer
description: Independent reviewer for a finished change. Use proactively after implementing a feature or fix, before committing.
tools: Read, Grep, Glob, Bash
model: inherit
color: blue
---

You review a change you did not write. You see only the diff and the criteria.

When invoked:
1. Run `git diff --stat`, then `git diff` for the files that changed.
2. Read the surrounding code for each hunk before judging it.
3. Run the project's linter and the tests that cover the changed files.

Rules:
- Never modify files. Report only.
- Report only problems you can point to with `file:line` and evidence. If you find none, say "No issues found" and list what you checked.

Output, in this order:
- Verdict: ship / fix first
- Must fix (bugs, security, data loss), each with file:line and a concrete fix
- Should fix (maintainability, missing tests)
- Questions for the author
```

### Test Runner That Protects Your Context

```markdown
---
name: test-runner
description: Runs the test suite and reports only failures with their cause. Use after any code change, and whenever tests fail in CI.
tools: Read, Grep, Glob, Bash
model: haiku
effort: low
omitClaudeMd: true
---

Run `uv run pytest -x -q --tb=short` (or the command the caller names).

If everything passes, answer in one line with the counts.
If something fails, for each failing test give:
- test id and the assertion or exception message
- the line in the code under test that most likely causes it
- whether it looks flaky (passes on a rerun with `--lf`) or deterministic

Do not paste full logs or tracebacks. Do not modify any file.
```

### Flaky-Test Investigator With Memory

```markdown
---
name: flaky-test-investigator
description: Investigates intermittently failing tests by reading test code, fixtures and CI logs, then ranks the likely causes. Use when a test passes and fails without code changes.
tools: Read, Grep, Glob, Bash
model: sonnet
memory: project
maxTurns: 25
---

You find the root cause of flaky tests.

Look for, in this order: shared mutable state between tests, time and ordering
assumptions, un-awaited async work, network or port collisions under parallel runs,
fixtures with the wrong scope, and unseeded randomness.

Reproduce when you can: run the test 20 times, then in random order and in parallel.
Report the evidence for each hypothesis and the single smallest change to test it.

Before starting, read your memory for patterns already seen in this repo.
When done, update it with the cause you found and how you confirmed it. Keep notes short.
```

### Implementer in an Isolated Worktree

```markdown
---
name: migration-worker
description: Applies one mechanical change (rename, type hints, API migration) to a named set of files, runs the tests and reports the result. Use for bulk edits that should not touch the main working tree.
tools: Read, Edit, Write, Bash, Grep, Glob
model: sonnet
isolation: worktree
permissionMode: acceptEdits
---

You receive a precise change description and a list of files. Apply exactly that change,
nothing else. Run the tests for the touched modules. Report: files changed, test result,
anything you could not convert and why.
```

### Coordinator for a Whole Session

```markdown
---
name: lead
description: Coordinates a review by dispatching reviewers in parallel and merging their findings.
tools: Agent(diff-reviewer, test-runner), Read, Bash
model: opus
---

Split the review into correctness (diff-reviewer) and test health (test-runner).
Run both, then merge their reports into one prioritized list. Do not review code yourself.
```

Start it with `claude --agent lead` — the `Agent(…)` allowlist works only for an agent run as the main session.

## Testing and Debugging Your Agents

1. **Does it load?** `claude plugin validate .claude/agents` finds files whose frontmatter does not parse (it does not flag a missing `name`); `claude --debug` logs why a file was skipped. Remember: no `name`, no `description`, an opening `---` that is not the first line, or a bad name all mean *silently skipped*.
2. **Is it chosen?** Ask a realistic request *without* naming the agent. If Claude does the work itself, sharpen the `description` (trigger conditions, "use proactively") or reduce overlap with other agents. Then test an explicit `@`-mention to separate "not chosen" from "not working".
3. **Does it behave?** Check the report format, the tools it used (`/tasks` shows model and effort; open its transcript), and try to make it break its own rules (ask the read-only reviewer to fix a bug).
4. **Is it worth it?** Compare cost and quality against doing the task in the main conversation. A subagent spends tokens of its own, and many subagents returning long reports fill the main context again.
5. **Measure delegation at scale.** For agents shipped in a plugin, `claude plugin eval` runs a set of prompts with and without the plugin and scores whether the agent was used and how well.

| Symptom | Likely cause | Fix |
|---|---|---|
| New agent not found | `agents/` directory did not exist when the session started | Restart once; later edits need no restart |
| Agent ignored, Claude does the task itself | Vague or overlapping `description` | State the trigger; add "use proactively"; remove overlap |
| Agent fails to start with "zero tools" | Every `tools` entry is misspelled or unavailable | Fix tool names (`Read`, `Grep`, `Glob`, `Bash`, `Edit`, `Write`) |
| Setting has no effect | Field name misspelled (`maxturns`, `disallowed_tools`) | Use exact camelCase names |
| Agent silently skipped although `name` and `description` exist | YAML does not parse, often a `: ` (colon + space) inside an unquoted `description` | Rephrase, or wrap the value in quotes; run `claude plugin validate .claude/agents` |
| `hooks` / `mcpServers` / `permissionMode` ignored | Agent comes from a **plugin** | Move the file to `.claude/agents/`, or ship them in the plugin's own hooks / `.mcp.json` |
| Frontmatter hook never runs | Project folder not trusted, or script not executable | Accept workspace trust; `chmod +x` |
| Agent edits when it should only read | `tools` omitted (inherits all) | Add an allowlist or `disallowedTools: Write, Edit` |
| `permissionMode` seems ignored | Main session is in `auto`, `acceptEdits` or `bypassPermissions` | By design — those modes override it |
| Agent doesn't know your convention | It has a fresh context | Put it in the prompt, preload a skill, or restate it when delegating |
| Wrong model | `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` is on, or the alias resolves to the main model's version | Check `/tasks`; unset the variable |
| Partial result | `maxTurns` reached | Ask Claude to resume the agent, or raise the limit |

## Best Practices

**Design**
1. **One focused job per agent.** If you cannot say in one sentence when to use it, split or drop it.
2. **Few agents, clear boundaries.** A handful of well-scoped agents delegate better than a large roster with overlapping triggers.
3. **The description is a trigger, not a title.** Say when to use it; add "use proactively" for automatic delegation.
4. **Specify the output.** Verdict first, evidence with `file:line`, nothing else — the report is all the main conversation sees.
5. **Put the workflow in the prompt as numbered steps** and name the concrete commands to run.

**Safety and cost**
6. **Least privilege.** Allowlist tools; read-only agents get `Read, Grep, Glob`. Treat an omitted `tools` field as "everything".
7. **Enforce with tools and hooks, not prose.** "Never edit files" in a prompt is a request; omitting `Edit` and `Write` is a guarantee. Use a `PreToolUse` hook for finer rules.
8. **Match the model to the job.** Haiku for search and log reading, Sonnet for most work, Opus for hard judgement; set `effort` per agent.
9. **Bound the work** with `maxTurns`, and use `isolation: worktree` for agents that edit while others work.
10. **Don't over-delegate.** Skip subagents for quick fixes, tightly sequential steps, same-file parallel edits and work that needs constant steering.

**Team and maintenance**
11. **Commit project agents** and review prompt changes like code; keep personal agents in `~/.claude/agents/`.
12. **Use fresh-context agents for verification.** The agent that wrote the code should not be the one grading it; a reviewer subagent sees only the diff and the criteria.
13. **Iterate from real runs.** Read the transcript of a bad delegation, fix the description or prompt, rerun. Ask Claude to improve an agent file based on what went wrong.
14. **Treat output as data.** A subagent's report is scanned and framed as subagent output, but a tool call it leads Claude to make still goes through your permission checks. For agents that read untrusted content (web pages, issue text), keep their tools minimal.
15. **Organization controls.** Deploy managed agents for policy-critical roles (they take priority over project and user agents), and block specific ones with `permissions.deny: ["Agent(my-agent)"]` or `--disallowedTools "Agent(Explore)"`.

## Common Mistakes

| Mistake | Why it hurts | Instead |
|---|---|---|
| A "senior engineer" agent for everything | No better than the main conversation, and it competes with specialists | One narrow job per agent |
| `description: Code reviewer` | Claude cannot tell when to use it | `Reviews diffs for … Use proactively after …` |
| No `tools` on a "read-only" agent | It can edit and run anything | `tools: Read, Grep, Glob` |
| `Bash(git push *)` in `disallowedTools` | Removes the whole Bash tool | A `permissions.deny` rule or a hook |
| Long prose prompt without steps or output format | Rambling, inconsistent reports | Numbered steps and an explicit output template |
| Subagents for work that needs your steering | Each hand-off loses context | Stay in the main conversation, or use a fork |
| Many agents returning full logs | Main context fills up again | Ask for summaries only |
| Putting secrets or absolute paths into prompts | The file is committed and shared | Use environment variables and project-relative paths |
| Relying on automatic delegation for must-run steps | It is probabilistic | `@`-mention, `--agent`, or a hook |
| Never reading the transcript | You tune blind | Open it from `/tasks` and fix the prompt from what you see |

---
## See also
- [Claude Code — Parallel Agents](21-claude-code-parallel-agents.md)
- [Claude Code Hooks & Agent Personas](08-claude-code-hooks-agents.md)
- [Claude Code — Settings Reference](20-claude-code-settings-reference.md)
- [Claude Code Project Structure](15-claude-code-project-structure.md)
- [Building Skills for Claude — Playbook](17-building-skills-for-claude-playbook.md)
- [Model Context Protocol (MCP)](11-mcp-protocol.md)
- [Official: Create custom subagents](https://code.claude.com/docs/en/sub-agents)
