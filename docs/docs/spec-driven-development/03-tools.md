---
date: 2026-09-25
tags:
  - spec-driven-development
  - coding-agents
  - tools
---

# SDD — Tools

## Overview

| Tool | Type | Workflow | Best for | License |
|---|---|---|---|---|
| **GitHub Spec Kit** | CLI + agent commands for 50+ agents | constitution → specify → plan → tasks → implement → converge | Greenfield features, teams that want a full, explicit process | MIT |
| **AWS Kiro** | Agentic IDE + CLI | requirements (EARS) → design → tasks | Teams that want specs built into the IDE, with steering and hooks | Proprietary (AWS) |
| **OpenSpec** | CLI + agent commands | explore → propose → apply → archive | Brownfield: changes to existing systems via delta specs | MIT |
| **Tessl** | Framework + spec registry | Specs with linked tests as long-term memory | Spec-anchored / spec-as-source; library specs against API hallucinations | Framework in beta |
| **BMAD Method** | Agent skills / plugins | Process sized to the work, specialised agent roles | Larger projects with product, architecture, UX, dev and test roles | MIT |
| **Plain markdown** | `SPEC.md` / `PLAN.md` + plan mode | explore → plan → implement → verify | Any agent, no new tooling | — |

## GitHub Spec Kit

Open-source toolkit from GitHub (v1.x since August 2026). Requires Python 3.11+ and `uv`.

```bash
uv tool install specify-cli
specify init my-project --integration copilot
cd my-project
```

Integrations exist for `claude`, `cursor-agent`, `codex`, `gemini`, `copilot` and many more.

```text
/speckit-constitution Create principles focused on code quality, testing, and maintainability.
/speckit-specify Build a photo organizer with albums grouped by date and a tile preview of each album.
/speckit-plan Use Vite with vanilla JavaScript. Keep images local and store metadata in SQLite.
/speckit-tasks
/speckit-implement
/speckit-converge
```

!!! note "Command names depend on the agent"
    The docs use the dotted form (`/speckit.specify`), the README's default mode uses `/speckit-specify`,
    and some agents use other prefixes (e.g. `$speckit-specify` in Codex).
    Use the form your agent shows after `specify init`.

| Command | What it does |
|---|---|
| `constitution` | Project principles every feature must follow |
| `specify` | Writes `spec.md` — what & why |
| `clarify` *(optional)* | Resolves ambiguities before planning |
| `plan` | Writes `plan.md`, research, data model, contracts |
| `checklist` *(optional)* | Requirements-quality checklists ("unit tests for requirements") |
| `tasks` | Writes `tasks.md` — ordered tasks tagged with stories (`[US1]`) and IDs (`T010`) |
| `analyze` *(optional)* | Read-only consistency check across spec, plan and tasks |
| `implement` | Executes the tasks |
| `converge` | Checks the code against spec, plan and tasks; appends tasks for gaps — repeat until it reports **Converged** |
| `taskstoissues` | Turns tasks into issues |

Bundled extensions add separate processes for **bug fixing** (`specify extension add bug`) and
**idea assessment** (`specify extension add assess`).

Tip from the docs: run each command **one at a time and review the result** before continuing.

## AWS Kiro

An agentic IDE (plus CLI) with specs as a first-class feature.

- **Feature specs** — *requirements-first* or *design-first*; produce `requirements.md`, `design.md`, `tasks.md`
- **Bugfix specs** — `bugfix.md` instead of requirements
- **Quick Spec** — generates all three files without approval gates, for well-understood features
- **Analyze Requirements** — asks Kiro to find inconsistencies and gaps before design
- **Correctness** — extracts properties from EARS requirements and generates **property-based tests**, keeping a traceable link between requirements and tests
- **Sync Files** — updates `tasks.md` after requirements or design change

**Steering** — always-on guidance in `.kiro/steering/` (workspace) or `~/.kiro/steering/` (global).
Default files: `product.md`, `tech.md`, `structure.md`. Inclusion modes: always, file match, manual (`#steering-file-name`), auto.
`AGENTS.md` is recognised too.

**Hooks** — run shell commands or agent prompts on events: prompt submit, agent stop, pre/post tool use,
file create / save / delete. Example use: run tests when a file is saved, update docs when an API changes.

## OpenSpec

Lightweight, "built for brownfield". Requires Node.js 20.19+.

```bash
npm install -g @fission-ai/openspec@latest
cd your-project
openspec init
```

| Command | What it does |
|---|---|
| `/opsx:explore` | Investigate the codebase and the idea |
| `/opsx:propose` | Create a change: proposal, delta specs, design, tasks |
| `/opsx:apply` | Implement the tasks |
| `/opsx:archive` | Merge delta specs into the living `openspec/specs/` |
| `/opsx:verify` *(expanded profile)* | Check the implementation against the change |

Command spelling varies by tool (e.g. `/opsx-propose` in Cursor and Copilot, `$openspec-propose` in Codex).
Thoughtworks Radar (April 2026) lists OpenSpec in *Assess* and highlights its **spec deltas**.

## Tessl

- **Spec Registry** — thousands of specs for open-source libraries, so agents use real APIs instead of hallucinating them
- **Tessl Framework** — specs live in the codebase as long-term memory; each capability links to its tests; generated code can be marked "DO NOT EDIT" (spec-as-source)
- Workflow tile: `tessl install tessl-labs/spec-driven-development`

## BMAD Method

"Agile AI-Driven Development": a set of specialised agent roles (product, architecture, UX, developer, test architect)
and workflows. The process "sizes itself to the work: small changes go straight to build."

```bash
npx skills add bmad-code-org/BMAD-METHOD
```

In Claude Code: `/plugin marketplace add bmad-code-org/bmad-plugins`.

## Plain Markdown With Any Agent

| Agent | How to do SDD |
|---|---|
| **Claude Code** | Plan mode (`Shift+Tab` or `claude --permission-mode plan`), `Ctrl+G` to edit the plan; interview prompt → `SPEC.md`; implement in a fresh session; reviewer sub-agent checks the diff against the plan; persistent rules in a short `CLAUDE.md` |
| **Cursor** | Plan Mode (`Shift+Tab`) researches, asks clarifying questions and writes an editable Markdown plan you can save to the workspace |
| **Codex** | `AGENTS.md` for rules plus the `PLANS.md` / "ExecPlan" pattern — "a self-contained, living specification" for multi-hour tasks |
| **Any agent** | `AGENTS.md` — an open "README for agents" supported by 20+ tools |

Review prompt from Claude Code's docs, useful as a verification step:

```text
Review the rate limiter diff against PLAN.md. Check that every requirement is implemented,
the listed edge cases have tests, and nothing outside the task's scope changed.
```

## How to Choose

- **Small change, one sentence** → no spec, just do it
- **Feature in a new project, team wants a full process** → Spec Kit
- **Change in a large existing codebase** → OpenSpec (delta specs) or plain `SPEC.md`
- **IDE with specs, steering and hooks built in** → Kiro
- **Specs as permanent source of truth, library specs** → Tessl
- **Big project with many roles** → BMAD
- **Don't want another tool** → plan mode + `SPEC.md` + `AGENTS.md`

---
## Sources
- [GitHub Spec Kit](https://github.com/github/spec-kit) — [quickstart](https://github.github.io/spec-kit/quickstart.html), [commands](https://github.github.io/spec-kit/reference/agentic-sdd.html), [integrations](https://github.github.io/spec-kit/reference/integrations.html)
- Kiro — [Specs](https://kiro.dev/docs/specs/), [Feature specs](https://kiro.dev/docs/specs/feature-specs/), [Correctness](https://kiro.dev/docs/specs/correctness/), [Steering](https://kiro.dev/docs/steering/), [Hooks](https://kiro.dev/docs/hooks/), [GA announcement](https://kiro.dev/blog/general-availability/)
- [OpenSpec](https://github.com/Fission-AI/OpenSpec); Thoughtworks Radar — [OpenSpec](https://www.thoughtworks.com/en-us/radar/tools/openspec)
- Tessl — [launch post](https://tessl.io/blog/tessl-launches-spec-driven-framework-and-registry), [docs](https://docs.tessl.io/use/spec-driven-development-with-tessl)
- [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD)
- Claude Code — [Best practices](https://code.claude.com/docs/en/best-practices); Cursor — [Plan mode](https://cursor.com/docs/agent/plan-mode); OpenAI Cookbook — [Using PLANS.md](https://developers.openai.com/cookbook/articles/codex_exec_plans); [AGENTS.md](https://agents.md/)

## See also
- [Spec-Driven Development](index.md)
- [SDD — Concepts & Workflow](01-concepts-workflow.md)
- [SDD — Writing Good Specs](02-writing-specs.md)
- [AI Skills for Coding Agents](../ai-skills/index.md)
