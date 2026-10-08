---
date: 2026-10-08
tags:
  - ai-agents
  - coding-agents
  - claude-code
---

# Claude Code — Parallel Agents

Claude Code has five ways to work on several tasks at once. They differ in who coordinates the work and where the workers run: **subagents** inside one session, **agent view** for background sessions on your machine, **agent teams** with a lead and peers, **dynamic workflows** driven by a script, and cloud **projects**. This page explains each one, how to see what is running (including the **agent map** in VS Code), and how to keep parallel workers from colliding on files.

## Choosing an Approach

| Approach | What it is | Use it when | Status |
|---|---|---|---|
| **Subagents** | Workers inside one session; each does a side task in its own context and returns a summary | A side task would flood the conversation with logs, search results or file contents | Stable |
| **Agent view** (`claude agents`) | One terminal screen to dispatch and watch background sessions on your machine | Several independent tasks you hand off and check later | Research preview |
| **Agent teams** | A lead session plus teammates with a shared task list and direct messages | Claude should split a project, assign the pieces and keep workers in sync | Experimental, off by default |
| **Dynamic workflows** | A JavaScript script Claude writes that runs dozens to hundreds of subagents and cross-checks results | Codebase-wide audits, 500-file migrations, cross-checked research | Stable |
| **Projects** | One ongoing conversation at claude.ai/code or in the desktop app that starts cloud threads per task | Work that spans many tasks over days or weeks | Public beta, Pro and Max |

Three tools support all of them without being a way to run agents themselves:

- **Worktrees** give each session its own git checkout, so parallel sessions edit separate copies of the files.
- **Cross-session messaging** lets Claude list and message your other sessions on this machine, on another machine or in the cloud.
- **`/batch`** is a skill that splits one large change into 5–30 worktree-isolated subagents (see [Workflow Patterns](09-claude-code-workflow-patterns.md#parallel-development-with-batch)).

## Subagents

A subagent runs in its own context window and returns a summary, so exploration noise stays out of your main conversation.

**Built-in subagents.** *Explore* is a fast read-only agent for searching and analysing a codebase (Claude picks a thoroughness level: quick, medium, very thorough). *Plan* gathers context while you are in plan mode. Both skip your CLAUDE.md and the git status snapshot to stay cheap; every other subagent loads them unless its definition sets `omitClaudeMd`. Custom subagents are `.md` files in `.claude/agents/` (full guide: [Building Subagents in Claude Code](23-building-subagents-in-claude-code.md)); to create one, ask Claude or edit the file directly — the interactive `/agents` wizard no longer exists.

**Foreground and background.** Interactive sessions run non-teammate subagents in the background by default; Claude keeps working and the result arrives as a notification. A permission prompt from a background subagent appears in the main session and names the agent that asked. Press **Run in background** (VS Code) or `ctrl+enter` / send-now to move a running command or subagent out of the way.

**Nesting.** A subagent can spawn its own subagents, up to three layers below the main conversation by default. At the depth limit the `Agent` tool is withheld, so the subagent does the work itself. Change the limit with `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` (`1` turns nesting off). To keep one subagent from spawning, leave `Agent` out of its `tools` list.

**Concurrency.** With 20 subagents running, spawning another fails with `Concurrent subagent limit reached`; raise it with `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`. Workflow agents and agent-team teammates have their own limits.

**Forks.** A forked subagent inherits your full conversation and prompt cache instead of starting fresh. Start one with `/subtask <task>`; Claude also spawns forks itself where fork mode is on (`subagent_type: "fork"`).

**Per-spawn options.** The `Agent` tool takes a `model` and an `effort` parameter, so a cheap read-only search and a hard design question need not run at the same level. Permission rules can match these parameters, for example `Agent(model:opus)` to block Opus subagents. `CLAUDE_CODE_SUBAGENT_MODEL` sets a default model for subagents; an agent's own `model:` wins unless you force it with `CLAUDE_CODE_SUBAGENT_MODEL_FORCE`.

**Output is data, not instructions.** Subagent results reach the main agent under a "subagent output" header, and in auto mode a subagent reports back through a call the safety classifier reviews, so text a subagent read from a file or web page cannot pass as an instruction from you.

## Agent View

Agent view is one screen for every background session: what is running, what needs your input, what is done. Each background session is a full Claude Code conversation that keeps running without a terminal attached.

```bash
claude agents                                   # open agent view (takes over the terminal)
claude --bg "investigate the flaky SettingsChangeDetector test"
claude --agent code-reviewer --bg "address review comments on PR 1234"
claude --bg --exec "npm run dev"                # a shell command as a background session
claude agents --json                            # live sessions for scripts (--all adds finished ones)
claude attach auth-fix                          # attach by name or part of it
claude logs auth-fix                            # read a session's output
```

- Rows are grouped by state — **Needs input**, **Working**, **Completed** — with pinned sessions and those waiting for you first. A row shows its state, a headline, its age and a linked PR or MR when the session pushed one.
- `Space` peeks at a session and lets you reply; `Enter` or `→` attaches to the full conversation; `←` in a normal session sends it to the background and opens agent view; the prompt footer shows how many background agents wait for you (`← 2 agents`).
- Keys worth knowing: `Ctrl+T` pin (pinned sessions stay alive across updates), `Ctrl+R` rename, `Ctrl+F` find by name (`n:` filter), `Ctrl+S` group by state or directory, `Ctrl+X` stop (press again to delete), `?` all shortcuts.
- A session you dispatch moves into **its own git worktree** before it edits files. When the code work is done it commits and pushes, and opens a draft PR if the task calls for it.
- `/fork [prompt]` copies the current conversation into a new background session and lets you keep working here. (`/subtask` is the in-session forked subagent.)
- `/resume` inside agent view reopens an older session as a background one.
- `defaultToAgentsView` (`/config`) makes plain `claude` open agent view; `claude "prompt"` still starts a normal session.

Background Bash and PowerShell commands in unattended sessions (`-p`, SDK, CI, cloud) stop after a time limit, 30 minutes by default and at most 2 hours.

## Agent Map (VS Code)

The VS Code extension draws the session's subagents as a live tree: the **agent map**.

- When a conversation has subagents, a pill such as **2 agents** appears at the bottom of the prompt box. Its dot shows whether any subagent is working or waiting for permission and turns red after a failure.
- Click the pill to open the map: subagents as a **tree under the main agent**, each with status, elapsed time and token count; nested subagents sit under the agent that started them.
- Click an agent to read its **prompt and tool calls**, open its **read-only transcript**, or **stop** it while it runs.
- Below the agents the map lists **background tasks** — background shell commands and monitors — with the command's latest output on its card, refreshed while it runs. Type **`/tasks`** to open the map when no pill is showing, for example when Claude only left a dev server running.
- **Stop** and `Esc` end only the current turn; background agents keep running and are stopped one by one from the map.

In the terminal the equivalents are `/tasks` (background work of the current session, including finished subagents), the subagent panel under the prompt, and `claude agents`.

## Agent Teams

One session is the **lead**; teammates are full Claude Code sessions with their own context that share a task list and message each other. You can talk to any teammate directly.

```json
{
  "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" }
}
```

- Each session has one implicit team; a subagent Claude **names** launches as a teammate, so teams can form even when you did not ask for one.
- `teammateMode` sets how teammates are shown: `"in-process"` (default), `"tmux"`, `"iterm2"` or `"auto"`.
- Teammates use the leader's model.
- Teammates need an interactive session: with `-p` and in the Agent SDK a named subagent stays an ordinary subagent.
- Best for research and review from several angles, debugging with competing hypotheses, and features split across layers. Teams use noticeably more tokens than one session, and teammates are **not** isolated in worktrees, so give each one its own files.
- Quality gates: `TeammateIdle`, `TaskCreated` and `TaskCompleted` [hooks](08-claude-code-hooks-agents.md#lifecycle-events) can block or send feedback.

## Dynamic Workflows

A **workflow** is a JavaScript script Claude writes for a task; a runtime executes it in the background while your session stays responsive. The script, not Claude's turn-by-turn judgement, holds the plan, so a run is repeatable and resumable.

| | Subagents | Agent teams | Workflows |
|---|---|---|---|
| Who decides what runs next | Claude, turn by turn | The lead, turn by turn | The script |
| Where intermediate results live | Claude's context | A shared task list | Script variables |
| Scale | A few per turn | A handful of long-running peers | Dozens to hundreds per run |
| After an interruption | The turn restarts | Teammates keep running | Resumable in the same session |

- Ask for one in plain words ("use a workflow to audit every endpoint for missing auth"), approve the plan, watch it with `/workflows`.
- **`/deep-research <question>`** is the bundled workflow: parallel web searches from several angles, cross-checked sources, a cited report with unsupported claims filtered out. It runs only when you invoke it.
- Save a workflow and it becomes a slash command; plugins can ship workflows.
- **Ultracode**: `/effort ultracode` (or `claude --effort ultracode`) makes Claude plan a workflow for every substantial task without being asked. It is its own toggle in the `/effort` slider and works at any effort level.
- `workflowSizeGuideline` (`/config` → *Dynamic workflow size*): `small`, `medium` (default, about 10 agents), `large`, `unrestricted`. `CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS` raises the per-run concurrency.
- Runs pause at a usage limit and resume when it resets.

## Projects (Cloud)

A project is one long conversation at claude.ai/code or in the desktop app. Paste bugs, stack traces or a task list into it; Claude starts a **thread** (usually a cloud session) for each task or routes it to the thread already working in that area. Project instructions and memory reach every thread, and the **Overview** pane shows finished threads, PRs ready for review and threads waiting on you. A thread can also run on your own computer through Remote Control. Use it when the goal outlasts one session — "bring every service up to the new lint config" across many repositories — not for a single task.

## Keeping Parallel Work from Colliding

| Question | Answer |
|---|---|
| Do the workers edit the same files? | Isolate with **worktrees**. Subagents and sessions you run yourself can each use one; sessions dispatched from agent view get one automatically |
| Do the workers need to talk? | Subagents report only to the session that spawned them; agent-view sessions report only to you; teammates message each other; separate sessions can use cross-session messaging |
| How much does it cost? | Every extra session or subagent multiplies token use — start with 2–3 workers and check `/usage` |

Cross-session messaging (`SendMessage` / `ListAgents`) lets Claude message another of your sessions, including ones on other machines and Remote Control sessions: mention a session with `@name`, ask for a `notify_when_idle` notice. Incoming content is checked by the auto-mode classifier first, and a `crossSessionInbound` setting (`accept`, `hold`, `refuse`) controls what a session accepts.

## Worktrees

```bash
claude --worktree feature-auth          # new session in an isolated checkout
```

- `worktree.baseRef` (`fresh` | `head`) chooses where a new worktree branches from: `fresh` is `origin/<default branch>`.
- `worktree.bgIsolation: "none"` lets a background session edit the working copy instead of a worktree.
- `worktree.symlinkDirectories` and `worktree.sparsePaths` control what the worktree shares or checks out; `.worktreeinclude` lists untracked files to copy in.
- Cleanup never destroys unpushed commits.

## Checking on Running Work

| Command | Shows |
|---|---|
| `claude agents` | Every background session: running, needs input, done |
| `/tasks` | Background items of the current session: subagents, shells, monitors |
| `/workflows` | Running and finished workflow runs, current phase, agents done |
| Agent map (VS Code) | Tree of the session's subagents plus background tasks |
| `/status` | Session kind: `interactive`, or a background job that is `attached` or `unattended` |

---
## See also
- [Claude Code Hooks & Agent Personas](08-claude-code-hooks-agents.md)
- [Claude Code Workflow Patterns](09-claude-code-workflow-patterns.md)
- [Claude Code — Settings Reference](20-claude-code-settings-reference.md)
- [Claude Code — Commands Reference](19-claude-code-commands-reference.md)
- [Claude Code — Mods, Artifacts, Channels & Remote Sessions](22-claude-code-mods-artifacts-remote.md)
- [Official: Run agents in parallel](https://code.claude.com/docs/en/agents)
- [Building Subagents in Claude Code](23-building-subagents-in-claude-code.md)
