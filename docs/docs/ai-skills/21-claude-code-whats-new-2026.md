---
date: 2026-10-07
tags:
  - ai-agents
  - coding-agents
  - claude-code
---

# Claude Code — What's New in 2026 (v2.1.117 → v2.1.293)

Between April 21 and October 7, 2026 Claude Code went from v2.1.116 to v2.1.293 — about 180 releases. The biggest shift is **parallel work**: subagents now run in the background by default, there is a screen for all your background sessions (agent view), a live tree of agents in VS Code (agent map), coordinated agent teams, script-driven workflows with dozens of agents, and cloud projects. Around that came new models (Sonnet 5 / 5.5, Opus 5 / 5.5, Fable 5.1, Haiku 5.5), auto mode as the default permission mode, mods, artifacts and a long list of smaller commands.

This page summarizes what matters for daily work. Sources: the official [CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md) and [documentation](https://code.claude.com/docs/en/overview), checked against the 2.1.293 binary.

!!! tip "Still on a spring build?"
    Run `claude --version`. If it prints anything below 2.1.200, most of this page is not in your CLI yet — run `claude update`. Several changes on this page also change defaults you may rely on; read [Breaking and Behaviour Changes](#breaking-and-behaviour-changes) before updating a CI image.

## Five Ways to Run Agents in Parallel

| Approach | What it is | Use it when | Status |
|---|---|---|---|
| **Subagents** | Workers inside one session; each does a side task in its own context and returns a summary | A side task would flood the conversation with logs, search results or file contents | Stable; background by default since 2.1.198 |
| **Agent view** (`claude agents`) | One terminal screen to dispatch and watch background sessions on your machine | Several independent tasks you hand off and check later | Research preview, since 2.1.139 |
| **Agent teams** | A lead session plus teammates with a shared task list and direct messages | Claude should split a project, assign the pieces and keep workers in sync | Experimental, off by default |
| **Dynamic workflows** | A JavaScript script Claude writes that runs dozens–hundreds of subagents and cross-checks results | Codebase-wide audits, 500-file migrations, cross-checked research | Since 2.1.154 |
| **Projects** | One ongoing conversation at claude.ai/code or in the desktop app that starts cloud threads per task | Work spanning many tasks over days or weeks | Public beta, Pro and Max |

Supporting tools: **worktrees** (each session edits its own checkout), **cross-session messaging** (`SendMessage` / `ListAgents` between your sessions on any machine, since 2.1.224) and **`/batch`** (splits one large change into 5–30 worktree-isolated subagents).

How to check on running work:

| Command | Shows |
|---|---|
| `claude agents` | Every background session: running, needs input, done |
| `/tasks` | Background items of the current session: subagents, shells, monitors |
| `/workflows` | Running and finished workflow runs, phase, agents done |
| Agent map (VS Code) | Tree of the session's subagents plus background tasks |

## Agent Map (VS Code)

The agent map is the VS Code extension's live view of a session's subagents (since **2.1.269**).

- When a conversation has subagents, a pill such as **2 agents** appears at the bottom of the prompt box. Its dot shows whether any subagent is working or waiting for your permission; it turns red after a failure.
- Click the pill to open the map: subagents drawn as a **tree under the main agent**, each with status, elapsed time and token count. Nested subagents sit under the agent that started them.
- Click an agent to see its **prompt and tool calls**, open its **read-only transcript**, or **stop** it while it runs.
- Below the agents the map lists **background tasks** — background shell commands and monitors — with the command's latest output on its card, refreshed while it runs (2.1.277–2.1.287).
- Type **`/tasks`** in the prompt box to open the map when no pill is showing, for example when Claude only left a dev server running.
- **Run in background** under a running command or subagent moves it to the background; Claude continues the turn and the item keeps its place in the map (2.1.287).
- **Stop / Esc** end only the current turn; background agents keep running and are stopped one by one from the map (2.1.286).

Other VS Code additions in the same period: Focus view (`Ctrl+Alt+F`, per-turn summaries), Hooks and Permission rules dialogs, MCP servers dialog with Add / Remove, session groups and filters, Bookmarks panel, prompt cache countdown clock, per-change Accept / Reject in diffs, `/status`, `/sandbox`, `/chrome`, `/export`, `/skills`, `/plan` dialogs.

## Agent View (`claude agents`)

```bash
claude agents                                  # open agent view (full terminal)
claude --bg "investigate the flaky SettingsChangeDetector test"
claude --agent code-reviewer --bg "address review comments on PR 1234"
claude --bg --exec "npm run dev"               # a shell command as a background session
claude agents --json                           # live sessions for scripts (--all adds finished ones)
claude attach auth-fix                         # attach by (part of) the name
claude logs auth-fix                           # read its output
```

- Rows are grouped into **Needs input / Working / Completed**; pinned sessions and those waiting on you go first. Each row shows a coloured state, a headline, its age and a linked PR / MR when the session pushed one.
- `Space` peeks at a session and lets you reply; `Enter` or `→` attaches to the full conversation; `←` from a normal session sends it to the background and opens agent view.
- Useful keys: `Ctrl+T` pin (pinned sessions stay alive and survive updates), `Ctrl+R` rename, `Ctrl+F` find by name, `Ctrl+S` group by state or directory, `Ctrl+X` stop (twice: delete), `?` all shortcuts.
- Sessions you dispatch move into their **own git worktree** before editing files; when the code work is done they commit and push, and open a draft PR if the task calls for it.
- `/fork` copies the current conversation into a new background session with its own worktree while you keep working (since 2.1.212; the old in-session fork is now `/subtask`).
- `defaultToAgentsView` in `~/.claude.json` (via `/config`) makes plain `claude` open agent view.

## Subagents: Background, Forks, Nesting

| Change | Version |
|---|---|
| Subagents can spawn subagents (nesting); current default depth limit is set by `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` | 2.1.172, defaults changed in 2.1.217–2.1.219 |
| Subagents run in the background by default; up to 20 at once (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`) | 2.1.198 |
| Forked subagents (`subagent_type: "fork"`) inherit the full conversation and prompt cache, on by default | 2.1.232 |
| Background subagents show their permission prompts in the main session instead of being auto-denied | 2.1.186 |
| `omitClaudeMd` in agent frontmatter runs a subagent without CLAUDE.md | 2.1.271 |
| Subagent results arrive under a "subagent output" header so they can't pose as instructions | 2.1.278 |
| The Agent tool takes an `effort` parameter per spawn | 2.1.292 |
| `Agent(model:opus)`-style permission rules match tool input parameters | 2.1.178 |
| The `/agents` creation wizard was removed — ask Claude or edit `.claude/agents/*.md` | 2.1.198 |

## Agent Teams

One session is the **lead**; teammates are full Claude Code sessions with their own context that share a task list and message each other — and you can talk to any teammate directly.

```json
{
  "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" }
}
```

- Since 2.1.178 there is no `TeamCreate`: each session has one implicit team, and a subagent Claude **names** launches as a teammate.
- Display: `teammateMode` — `"in-process"` (default), `"tmux"`, `"iterm2"` or `"auto"`.
- Teammates use the leader's model (the separate teammate-model setting was removed in 2.1.234).
- Works only in interactive sessions; in `-p` and the SDK named subagents stay ordinary subagents.
- Best for research and review from several angles, competing debugging hypotheses, and features split across layers. Costs noticeably more tokens than one session; partition files so teammates don't edit the same ones (teams are not worktree-isolated).

## Dynamic Workflows and Ultracode

A **workflow** is a script Claude writes for a task; a runtime executes it in the background, fanning out to many subagents and cross-checking their results. Unlike a skill or an agent team, *the script* holds the plan, so a run is repeatable and resumable.

| | Subagents | Agent teams | Workflows |
|---|---|---|---|
| Who decides what runs next | Claude, turn by turn | The lead, turn by turn | The script |
| Scale | A few per turn | A handful of long-running peers | Dozens to hundreds per run |
| Intermediate results | Claude's context | Shared task list | Script variables |
| After an interruption | Turn restarts | Teammates keep running | Resumable |

- Ask for one in plain words ("use a workflow to audit every endpoint for missing auth"), approve the plan, watch it with `/workflows`.
- **`/deep-research <question>`** is the bundled workflow: parallel web searches, cross-checked sources, a cited report.
- Save a run as a command; distribute it in a plugin.
- **Ultracode**: `/effort ultracode` (or `claude --effort ultracode`) makes Claude plan a workflow for every substantial task on its own. Since 2.1.284 it is a separate toggle that works at any effort level.
- Size guideline in `/config` (`workflowSizeGuideline`): `small`, `medium` (default, ~10 agents), `large`, `unrestricted`. Runs pause at a usage limit and resume when it resets.

## Projects (Cloud)

A project is one long conversation at claude.ai/code or in the desktop app. Paste bugs, stack traces or a task list into it; Claude starts a **thread** (usually a cloud session) per task or routes it to the thread already working in that area. Project instructions and memory reach every thread; the **Overview** pane shows finished threads, PRs ready for review and threads waiting on you. A thread can also run on your own computer through Remote Control. Public beta on Pro and Max.

## Code Review

| Command | What it does |
|---|---|
| `/code-review` | Correctness review of the current diff, PR, branch or path as a background subagent. Levels `low` … `max`; with no level it reuses your last one |
| `/code-review high 1234 --comment` | Multi-agent review of PR 1234, findings posted as inline PR comments (GitHub and GitLab) |
| `/code-review --fix` | Apply the findings to the working tree |
| `/code-review --max-findings all` | Report more (or fewer) findings; the choice persists |
| `/code-review ultra` | **Ultrareview**: a fleet of reviewer agents in a cloud sandbox; every finding is reproduced and verified. Needs a claude.ai login; not on Bedrock / Vertex / Foundry |
| `claude ultrareview [target] --json` | Ultrareview for CI |
| `/simplify` | Cleanup only: reuse, simplification, efficiency (bugs are `/code-review`'s job) |
| `/review` | Alias of `/code-review` |

## Permissions and Safety

- **Auto mode is the default starting mode** for interactive terminal and VS Code sessions from **2.1.283**, and for `claude -p` and the Python SDK on third-party providers from 2.1.285. A background classifier checks every action that isn't a read or an edit inside the working directory. `--enable-auto-mode` is gone (2.1.111); set another default with `permissions.defaultMode`.
- The classifier runs **server-side** by default on API, Enterprise, Bedrock, Vertex, Foundry and gateways (2.1.278), without billing classifier overhead; `CLAUDE_CODE_AUTO_MODE_SERVER=0` opts out where allowed.
- Auto mode refuses destructive git (`reset --hard`, `clean -fd`, `stash drop`, amending commits it didn't make) and `terraform` / `pulumi` / `cdk destroy` unless you asked for them (2.1.183); cloud metadata credential fetches and egress evasion are a separate "Containment Escape" rule (2.1.257).
- `"default"` mode is now labelled **Manual**; `--permission-mode manual` works (2.1.200).
- `--restricted` — no shell or code-running tools, no WebFetch, file tools only inside the working directory, user/project settings ignored; for evaluation harnesses on shared machines (2.1.248).
- `--permission-prompts none` — anything that would prompt is denied, so unattended hosts never hang (2.1.259).
- `--safe-mode` — start with all customizations (hooks, plugins, skills, MCP) disabled for troubleshooting (2.1.169).
- `sandbox.credentials` masks credential files and secret env vars from sandboxed commands (2.1.187+); `sandbox.network.strictAllowlist` denies unknown hosts without asking (2.1.219).
- `permissions.blockReadsOutsideWorkingDirectories` (2.1.257); `defaultMode: "bypassPermissions"` in a **project** file is ignored (2.1.257).

## Models and Effort

| Model | ID | Default since | Context | Price in / out per Mtok |
|---|---|---|---|---|
| Sonnet 5.5 | `claude-sonnet-5-5` | 2.1.284 | 1M | $2 / $10 |
| Opus 5.5 | `claude-opus-5-5` | 2.1.280 | 1M | $4 / $20 |
| Haiku 5.5 | `claude-haiku-5-5` | 2.1.293 | 1M | $0.10 / $0.50 |
| Fable 5.1 | `claude-fable-5-1` | 2.1.257 | 1M | $10 / $50 |

- Effort levels `low`, `medium`, `high`, `xhigh` (plus `max` as a cap); `/effort` saves a level **per model** (2.1.251), `s` changes it for this session only.
- **Advisor tool**: Claude consults a stronger model at key moments (before committing to an approach, when stuck, before declaring done). `/advisor opus`, `advisorModel` setting or `--advisor`.
- `fallbackModel` takes a chain of up to three models; `--fallback-model` works interactively (2.1.166).
- `promptCacheTtl` / `subagentPromptCacheTtl` choose 5-minute or 1-hour caching; `/cost` shows prompt cache hit ratio and the likely cause of misses (2.1.251).
- Fast mode (`/fast`) on Opus models, about 2.5× faster at a higher price.
- `TodoWrite` / task tools are not offered on the newest models; `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` brings them back.

## Mods, Artifacts, Channels and More

| Feature | What it gives you | Start with |
|---|---|---|
| **Mods** (2.1.287) | Plugins of JS/TS event handlers that run *inside* Claude Code: panes, bands above the prompt, custom commands with no Claude turn, guards on tool calls, redrawing built-in UI. `/diff` is itself a mod | `/plugin enable cc-plugin-you-should-know@builtin` |
| **Artifacts** | Claude publishes live, private web pages on claude.ai from the session — PR walkthroughs, dashboards, option comparisons — and updates them in place; share, collect comments, pull live data through MCP connectors | Ask "publish this as an artifact"; `/artifacts` lists them |
| **Channels** | An MCP server pushes events (Telegram, Discord, iMessage, CI webhooks) into your running session; Claude can reply through it | `--channels`, plugin `fakechat` for a demo |
| **Cross-session messaging** | Sessions list and message each other across your machines; `@name` mentions; `notify_when_idle` | Ask Claude to message another session |
| **Remote Control** | Continue a local session from the phone or claude.ai; fork it from the Claude app | `claude remote-control`, `/remote-control` |
| **Scheduling** | `/loop` repeats a prompt in the session; routines run in the cloud on a cron; desktop tasks run locally | `/loop 10m check the deploy`, `/schedule` |
| **Deep links** | `claude-cli://` URLs open a session in the right repo with a pre-filled prompt — for runbooks and alerts | See official docs |
| **Self-hosted runner** | Run web, mobile and desktop sessions on your own machines (Team / Enterprise) | `claude self-hosted-runner` |
| **Claude in Chrome** | Browser automation with your own logins; generally available since 2.1.198 | `/chrome` |
| **Plugin evals** | `claude plugin eval` runs a plugin's eval suite with JSON and HTML reports | `claude plugin init`, `claude plugin eval` |

## New Commands and Flags Worth Knowing

| Command / flag | What it does | Since |
|---|---|---|
| `/goal <condition>` | Claude keeps working across turns until the condition is met (works with `-p` too) | 2.1.139 |
| `/config key=value` | Set any setting from the prompt; `/config --help` lists keys | 2.1.181 |
| `/cd <dir>` | Move the session to another directory without breaking the prompt cache; loads that directory's settings, hooks and skills | 2.1.169 |
| `/diff` | Side panel with uncommitted changes, updated as Claude edits (fullscreen) | 2.1.260 |
| `/fork`, `/subtask` | Copy the conversation into a background session / fork a subagent in place | 2.1.212 |
| `/usage` | What drives your limits: skills, subagents, plugins, MCP servers, loops (`/cost` and `/stats` merged into it) | 2.1.118+ |
| `/skill-doctor` | Loaded skills that go unused, and their context cost | 2.1.261 |
| `/doctor prompt-audit` | Audit CLAUDE.md, skills, agents and commands for prompting written for older models | 2.1.283 |
| `/tui fullscreen` | Fullscreen renderer with mouse support | research preview |
| `/reload-skills`, `/reload-plugins` | Rescan without a restart | 2.1.152, 2.1.260 |
| `claude --desktop` | Open the desktop app on the current directory (with `--continue` / `--resume`) | 2.1.285 |
| `claude --bare` | Only MCP servers named on the command line, no reminders, no background tasks | 2.1.286 |
| `claude purge [path]` | Delete all Claude Code state for a project (`--dry-run`) | 2.1.126 / 2.1.288 |
| `claude mcp login <name>` | Authenticate a remote MCP server from the shell (`--no-browser` over SSH) | 2.1.186 |
| `claude plugin install … --marketplace <source>` | Add the marketplace and install in one step | 2.1.292 |
| AGENTS.md | Read when there is no CLAUDE.md; switch under "Project instructions" in `/config` | 2.1.277 |

## Breaking and Behaviour Changes

Check these before updating a pinned CLI in CI or a team image:

| Change | Version | What to do |
|---|---|---|
| `--enable-auto-mode` removed | 2.1.111 | Use `--permission-mode auto` |
| Auto mode is the default starting mode | 2.1.283–2.1.285 | Set `permissions.defaultMode` if you need `default` / `plan` / `dontAsk` |
| `default` mode labelled **Manual** | 2.1.200 | Config value is still `"default"`; `"manual"` is an alias |
| `!` shell commands now make Claude respond to the output | 2.1.186 | `"respondToBashCommands": false` for the old behaviour |
| `/simplify` became `/code-review` (and later returned as cleanup-only) | 2.1.147, 2.1.154 | Update scripts and docs that call `/simplify` for bug finding |
| Subagents run in the background by default | 2.1.198 | Expect results as notifications; `run_in_background: false` per spawn |
| `/agents` wizard removed | 2.1.198 | Create agents by asking Claude or by editing `.claude/agents/` |
| Ultraplan removed | 2.1.222 | Use plan mode or a workflow |
| `TaskOutput` tool and `taskOutputMaxChars` removed | 2.1.278 | Claude reads background output files with `Read` |
| Todo / task tools hidden on new models | 2.1.233, 2.1.268 | `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` |
| `defaultMode: "bypassPermissions"` ignored in project settings | 2.1.257 | Set it in user / managed settings or pass `--permission-mode` |
| `autoMode` no longer read from `.claude/settings.local.json` | 2.1.207 | Move it to `~/.claude/settings.json` |
| Project `env` can't set `CLAUDE_CONFIG_DIR`, `TMPDIR`, OTel exporters | 2.1.251, 2.1.282 | Set them in the shell or user settings |
| `y` / `n` no longer confirm dialogs | 2.1.280 | Use `Enter` / `Esc` (rebindable as `confirm:yes` / `confirm:no`) |
| npm-sourced plugins install without running install scripts | 2.1.275 | Ship built files in the package |
| `"attribution": false` hides all commit and PR attribution | 2.1.281 | Older CLIs skip a settings file that contains it |

## Timeline

| Version | Released | Milestone |
|---|---|---|
| 2.1.139 | May 2026 | Agent view (`claude agents`), `/goal` |
| 2.1.147–2.1.154 | May 2026 | `/code-review`, dynamic workflows, Opus 4.8 with `xhigh` effort |
| 2.1.169–2.1.186 | June 2026 | `--safe-mode`, nested subagents, Fable 5, `/config key=value` |
| 2.1.197–2.1.219 | late June – July 2026 | Sonnet 5 and Opus 5 (1M context), background subagents by default, Claude in Chrome GA, `/fork`, ultracode |
| 2.1.224–2.1.243 | August 2026 | Cross-session messaging, self-hosted runner, forked subagents by default, `modelPicker` / `promptCacheTtl` |
| 2.1.248–2.1.278 | late August – September 2026 | `--restricted`, Fable 5.1, VS Code agent map, AGENTS.md, server-side auto mode classifier |
| 2.1.280–2.1.293 | September–October 2026 | Opus 5.5, Sonnet 5.5, Haiku 5.5, auto mode by default, mods, `claude --desktop`, Agent tool `effort` |

---
## See also
- [Claude Code — Settings Reference](20-claude-code-settings-reference.md)
- [Claude Code — Commands Reference](19-claude-code-commands-reference.md)
- [Claude Code Hooks & Agent Personas](08-claude-code-hooks-agents.md)
- [Claude Code Workflow Patterns](09-claude-code-workflow-patterns.md)
- [Claude Code Advanced Configuration](10-claude-code-advanced-config.md)
- [Official: Run agents in parallel](https://code.claude.com/docs/en/agents)
