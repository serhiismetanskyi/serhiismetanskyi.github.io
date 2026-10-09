---
date: 2026-06-26
updated: 2026-10-09
tags:
  - ai-agents
  - coding-agents
---

# Claude Code Workflow Patterns

## Give Claude a Way to Verify

The single highest-leverage practice. Claude performs dramatically better when it can check its own work:

| Strategy | Weak | Strong |
|---|---|---|
| **Verification criteria** | "implement email validation" | "write `validateEmail`. Tests: `user@ex.com` → true, `invalid` → false. Run tests after." |
| **UI changes** | "make dashboard look better" | "[paste screenshot] implement this design, screenshot result, list differences, fix them" |
| **Root cause** | "the build is failing" | "build fails with [error]. Fix root cause, don't suppress the error. Verify build succeeds." |

Verification can be: a test suite, a linter, a bash command that checks output, or a screenshot comparison.

---

## Explore → Plan → Code → Commit

Letting Claude jump straight to coding produces code that solves the wrong problem.

### 1. Explore (Plan Mode)

```text
read /src/auth and understand how we handle sessions.
also look at how we manage environment variables.
```

Claude reads files and answers questions without making changes.

### 2. Plan

```text
I want to add Google OAuth. What files need to change?
What's the session flow? Create a plan.
```

Press `Ctrl+G` to open the plan in your editor for direct editing.

### 3. Implement (Normal Mode)

```text
implement the OAuth flow from your plan.
write tests for the callback handler, run the suite, fix failures.
```

### 4. Commit

```text
commit with a descriptive message and open a PR
```

Skip planning when the scope is clear — "fix a typo" doesn't need a plan.

---

## Provide Specific Context

| Strategy | Before | After |
|---|---|---|
| Scope the task | "add tests for foo.py" | "write a test for foo.py covering edge case: user logged out. no mocks." |
| Point to sources | "why does ExecutionFactory have weird api?" | "look through ExecutionFactory's git history and summarize how its api evolved" |
| Reference patterns | "add a calendar widget" | "look at HotDogWidget.php for the pattern. follow it for a new calendar widget." |
| Describe symptoms | "fix the login bug" | "login fails after session timeout. check auth flow in src/auth/. write failing test, then fix." |

### Rich Content Methods

- `@filename` to reference files directly
- paste images (drag-and-drop or clipboard)
- give URLs for documentation
- pipe data: `cat error.log | claude`

---

## Let Claude Interview You

For larger features, reverse the flow — have Claude ask the questions:

```text
I want to build [brief description]. Interview me in detail.
Ask about technical implementation, UI/UX, edge cases, tradeoffs.
Don't ask obvious questions — dig into the hard parts.
Keep interviewing until we've covered everything, then write a spec to SPEC.md.
```

Then start a fresh session to implement the spec (clean context).

---

## Session Management

### Context Is Your Fundamental Constraint

Context fills fast. Performance degrades as it fills. Manage aggressively:

| Action | When |
|---|---|
| `/clear` | Between unrelated tasks |
| `/compact [focus]` | Summarize while preserving key info |
| `/btw` | Quick questions that don't need to stay in context |
| `/fork` | Copy the conversation into a new background session and keep working here |
| `/cd <dir>` | Move the session to another directory without breaking the prompt cache; that directory's settings, hooks and skills load immediately |
| `/usage` | What drives your limits: skills, subagents, plugins, MCP servers, loops (`/cost` and `/stats` are aliases) |
| `Esc` | Stop Claude mid-action (context preserved) |
| `Esc + Esc` or `/rewind` | Restore previous checkpoint |
| `"Undo that"` | Ask Claude to revert its own changes |

### Subagents for Investigation

Subagents explore in a separate context, keeping your main session clean:

```text
Use subagents to investigate how our auth system handles token refresh,
and whether we have any existing OAuth utilities to reuse.
```

They run in the background by default, so you can keep talking to Claude while they work. Use `/subtask <task>` for a forked subagent that inherits the whole conversation, and `/fork` to copy the session into a separate background one. More: [Claude Code — Parallel Agents](21-claude-code-parallel-agents.md).

### Keep Working Until Done: `/goal`

```text
/goal all tests in tests/unit pass and ruff reports no errors
```

`/goal` sets a completion condition and Claude keeps working across turns until it is met (or the goal clears for another reason). It works interactively, with `-p` and over Remote Control, and `/goal` with no argument shows the current goal. Write the condition as something Claude can check — a command's exit code, a test result — not a feeling.

### Resume Sessions

```bash
claude --continue    # resume most recent
claude --resume      # select from recent sessions
```

Use `/rename` to label sessions: `"oauth-migration"`, `"debugging-memory-leak"`. Sessions that run in the background (`claude --bg`, agent view) appear in `/resume` marked `bg`; `claude --resume <id> --bg` continues one under its own ID.

---

## Effort, Thinking and a Second Opinion

Reasoning depth is set with **effort**, not with trigger words:

| Setting | How | When to use |
|---|---|---|
| `/effort low` / `medium` | Slider or command; saved per model | Short, well-scoped, latency-sensitive tasks |
| `/effort high` | Default for most work | Balanced cost and quality |
| `/effort xhigh` | Deeper reasoning at higher token spend | Architecture decisions, hard debugging |
| `/effort ultracode` | Separate toggle: Claude plans a [workflow](21-claude-code-parallel-agents.md#dynamic-workflows) for every substantial task | Large audits and migrations |
| `claude --effort xhigh` | One session only | CI or a single hard task |

`s` in the `/effort` picker changes the level for the current session only. Extended thinking is on by default; on models that always think, turning it off has no effect, and `showThinkingSummaries` shows summaries instead of a collapsed stub.

For a hard decision in the middle of a long task, ask a stronger model without switching: the **advisor tool** (`/advisor opus`, `advisorModel` setting or `--advisor`) lets Claude consult it before committing to an approach, when it is stuck on a recurring error, and before declaring a task done. It adds tokens, so it fits long, multi-step work, not quick edits.

---

## Review Before You Merge

| Command | What it does |
|---|---|
| `/code-review` | Correctness review of the current diff, a PR number, branch or path, run as a background subagent. Levels `low` … `max`: low and medium give fewer, high-confidence findings; high and above go broader. With no level it reuses the one you used last |
| `/code-review high 1234 --comment` | Multi-agent review of PR 1234; findings posted as inline comments on GitHub or GitLab |
| `/code-review --fix` | Apply the findings to the working tree after the review |
| `/code-review ultra` | **Ultrareview**: a fleet of reviewer agents in a cloud sandbox; every finding is reproduced and verified. Needs a claude.ai login; not available on Bedrock, Vertex or Foundry |
| `claude ultrareview [target] --json` | The same, non-interactively, for CI |
| `/simplify` | Quality only: reuse, simplification, efficiency — it applies the fixes and does not look for bugs |
| `/review <pr>` | Alias of `/code-review` |

Run `/code-review` before opening a PR and `/simplify` after a large refactor. Claude will not start `/code-review`, `/deep-research` or `/verify` on its own: they run only when you invoke them. If a project or user skill named `verify` exists, Claude runs it right before committing (except for docs-only and tests-only commits).

---

## Parallel Development with `/batch`

The `/batch` command orchestrates large-scale changes across the codebase:

```text
/batch "Add type hints to all service functions"
```

### How It Works

1. **Research** — orchestrator scans affected files and decomposes work into independent units
2. **Execute** — background agents launch in parallel, each in an isolated **git worktree**
3. **Deliver** — each agent commits, runs tests, and opens a PR

Each worktree is a separate working directory on its own branch — no file collisions, no merge conflicts during execution.

### Manual Worktrees

For custom parallel workflows outside `/batch`:

```bash
git worktree add ../feature-auth feature/auth
cd ../feature-auth && claude
```

Parallel agents run with independent context and dependencies (exact concurrency depends on plan/runtime limits). For background sessions you manage yourself, agent teams and script-driven workflows with dozens of agents, see [Claude Code — Parallel Agents](21-claude-code-parallel-agents.md).

---

## Common Failure Patterns

| Pattern | Problem | Fix |
|---|---|---|
| **Kitchen sink session** | One task → unrelated question → back to first task. Context cluttered. | `/clear` between unrelated tasks |
| **Correcting over and over** | Wrong → correct → still wrong → correct again | After 2 failed corrections: `/clear` + better initial prompt |
| **Over-specified CLAUDE.md** | Too long → Claude ignores half of it | Prune ruthlessly. If Claude does it correctly without the rule, delete it |
| **Trust-then-verify gap** | Plausible code that doesn't handle edge cases | Always provide verification (tests, scripts, screenshots) |
| **Infinite exploration** | "investigate X" without scope → reads 100s of files | Scope narrowly or use subagents |

---

---

## See also
- [Claude Code Best Practices](07-claude-code-best-practices.md)
- [Claude Code Hooks & Agents](08-claude-code-hooks-agents.md)
- [Model Context Protocol (MCP)](11-mcp-protocol.md)
- [AI Coding Agents: Skills & Claude Code](index.md)
- [Claude Code — Parallel Agents](21-claude-code-parallel-agents.md)
