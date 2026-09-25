---
date: 2026-06-26
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
| `Esc` | Stop Claude mid-action (context preserved) |
| `Esc + Esc` or `/rewind` | Restore previous checkpoint |
| `"Undo that"` | Revert Claude's changes |

### Subagents for Investigation

Subagents explore in a separate context, keeping your main session clean:

```text
Use subagents to investigate how our auth system handles token refresh,
and whether we have any existing OAuth utilities to reuse.
```

### Resume Sessions

```bash
claude --continue    # resume most recent
claude --resume      # select from recent sessions
```

Use `/rename` to label sessions: `"oauth-migration"`, `"debugging-memory-leak"`.

---

## Extended Thinking

Trigger deeper reasoning when a task requires analysis, architecture decisions, or debugging:

| Command | Depth | When to Use |
|---|---|---|
| `/think` | Standard | Multi-step planning, moderate complexity |
| `/think hard` | Deep | Architecture decisions, debugging complex state |
| `/think harder` | Intensive | Cross-system analysis, security review |
| `/ultrathink` | Maximum | Novel algorithms, multi-file refactors with edge cases |

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
claude --project ../feature-auth
```

Parallel agents run with independent context and dependencies (exact concurrency depends on plan/runtime limits).

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

## References

- [Best Practices for Claude Code](https://code.claude.com/docs/en/best-practices)
- [Common Workflows](https://code.claude.com/en/common-workflows)

---

## See also
- [Claude Code Best Practices](07-claude-code-best-practices.md)
- [Claude Code Hooks & Agents](08-claude-code-hooks-agents.md)
- [Model Context Protocol (MCP)](11-mcp-protocol.md)
- [AI Skills for Coding Agents](index.md)
