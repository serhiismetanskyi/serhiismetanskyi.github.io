---
date: 2026-09-25
tags:
  - ai-agents
  - llm
  - harness
  - context-engineering
---

# Agent Harness — Patterns & Anti-Patterns

**Harness engineering** is the practice of improving an agent by changing its harness — prompts, tools,
context, limits and feedback loops — rather than the model.

## Case Studies

### LangChain: same model, better harness

LangChain kept the model fixed and changed only the system prompt, tools and middleware.
Their coding agent on **Terminal Bench 2.0** went from **52.8 to 66.5** (Top 30 → Top 5).

What they added:

| Technique | What it does |
|---|---|
| Self-verification loop | Agent checks its own result before finishing |
| Pre-completion checklist | Middleware forces a verification pass before the agent can exit |
| Local context on start | Maps the working directory and available tools at the beginning |
| Loop detection | Detects the agent editing the same thing again and again |
| "Reasoning sandwich" | More reasoning effort for planning and verification, less for routine steps |
| Trace analysis | Reads failed traces to decide what to change next |

### OpenAI: an agent-first repository

An OpenAI team built a product with Codex writing all the code: about **1M lines** and **~1,500 PRs in 5 months**.
The lessons are about the environment around the agent:

- **`AGENTS.md` as a table of contents** (~100 lines) that points into `docs/` — design docs, specs, plans.
- **The repository is the system of record.** Knowledge that lives only in chat or documents the agent can't read does not exist for the agent.
- **Make the app legible to the agent** — logs, metrics, traces and UI state are available programmatically, so the agent can check its own work.
- **Enforce architecture mechanically** — custom linters and structural tests; error messages explain how to fix the problem.
- **"Garbage collection"** — recurring agent tasks scan for drift from agreed principles and open small refactoring PRs.
- **Humans steer, agents execute** — engineers design the environment, specify intent and build feedback loops.

### Anthropic: long-running agents

Two common failures of long tasks: the agent **tries to do too much at once**, or **declares victory too early**.
Anthropic's harness for long-running coding agents:

1. An **initializer agent** creates a JSON feature list (every item marked `failing`), a progress log
   (`claude-progress.txt`), an `init.sh` script and the first git commit.
2. Each following session works on **one feature at a time**, tests it end to end in a browser,
   updates the progress file and commits.
3. A new session reads the progress file and git log instead of relying on a huge context.

A later setup split the work into **planner → generator → evaluator**, where the evaluator is a separate,
skeptical agent that tests the app with Playwright. Reason: models "reliably skew positive when grading their own work."
The full harness took much longer and cost more than a single run — but produced a working app where the single run did not.

## Pattern: Context Engineering

Give the model **the smallest set of high-signal tokens** that lets it do the job.

| Technique | When to use |
|---|---|
| Right-altitude system prompt | Clear principles, not a list of every edge case and not vague advice |
| Just-in-time retrieval | Pass references (paths, queries, IDs) and let the agent fetch details when needed |
| Compaction | Summarise old turns when the window fills up |
| Context reset | Start a fresh context from a progress file (works better than compaction for some models and long tasks) |
| Structured notes | Agent writes notes/progress to files outside the context window |
| Sub-agents | Heavy exploration happens in a separate context; only the summary comes back |
| Tool-result clearing | Drop old, large tool outputs that are no longer needed |

## Pattern: Tool Design

Tools are part of the prompt. Bad tools make a good model look bad.

| Do | Don't |
|---|---|
| Few, high-impact tools | Dozens of overlapping tools |
| Namespaced names: `asana_projects_search` | Generic names: `search`, `get` |
| Return meaningful fields (names, titles) | Return opaque IDs only |
| Paginate, filter and truncate by default | Dump thousands of rows into the context |
| Offer `response_format`: `concise` / `detailed` | One huge format for every case |
| Actionable errors: *"Date must be YYYY-MM-DD, got 05/04"* | Raw tracebacks |
| Descriptions written as for a new team member | One-word descriptions |

Improve tools with evals: run tasks, let a model read the transcripts, and fix the tools where the agent struggled.

## Pattern: Verification Loops

Never let the agent's own "done" be the final word.

- **Deterministic checks** — tests, linters, type checks, schema validation
- **Pre-completion checklist** — middleware that runs checks before the agent can finish
- **Separate evaluator** — another agent (or sub-agent) verifies each claim; avoids self-preference bias
- **Visual checks** — screenshots or browser automation for UI work

## Pattern: Guardrails and Human-in-the-Loop

```
Tool call ──► PreToolUse hook ──► allowed? ──► execute ──► PostToolUse hook
                    │ no
                    ▼
            blocked + reason back to the model
```

- **Permission rules** — allow / ask / deny per tool or command
- **Hooks** — in Claude Code, a `PreToolUse` hook that exits with code `2` blocks the call and sends its stderr back to the model
- **Input / output guardrails** — OpenAI Agents SDK runs them in parallel with the agent and stops the run when they trip
- **Human approval** — pause before risky actions (deploy, delete, payment); the run resumes after approval

Example hook that blocks dangerous shell commands (Claude Code `settings.json`):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "python3 .claude/hooks/block_dangerous.py" }]
      }
    ]
  }
}
```

```python
# .claude/hooks/block_dangerous.py
import json
import re
import sys

event = json.load(sys.stdin)
command = event.get("tool_input", {}).get("command", "")

if re.search(r"rm\s+-rf\s+/|git\s+push\s+--force", command):
    print("Blocked: destructive command. Ask the user first.", file=sys.stderr)
    sys.exit(2)  # 2 = block the tool call and show the reason to the model

sys.exit(0)
```

## Keep the Harness Up to Date

> "Every component in a harness encodes an assumption about what the model can't do on its own." — Anthropic

When models improve, some harness parts become dead weight:
- Anthropic found that context resets and sprint planning were no longer needed with newer models.
- Re-test the harness after each model upgrade: remove one component at a time and measure.

## Anti-Patterns

| Anti-pattern | Symptom | Fix |
|---|---|---|
| Doing too much at once | Half-finished features, broken builds | One feature per session, progress file |
| Premature "done" | Agent reports success, tests fail | Verification loop, pre-completion checklist |
| Self-grading | Agent always rates its own work highly | Separate evaluator agent or deterministic checks |
| Context rot | Quality drops in long sessions | Compaction, resets, sub-agents, just-in-time retrieval |
| Doom loops | Same file edited over and over | Loop detection, turn limits |
| Giant instruction file | Agent ignores important rules | Short `AGENTS.md` as a map, details in `docs/` |
| Knowledge outside the repo | Agent repeats solved mistakes | Put decisions and specs into the repository |
| Tool sprawl | Wrong tool chosen, huge outputs | Fewer tools, better names, truncation |
| Stale harness | Extra cost and latency, no quality gain | Re-evaluate components after model upgrades |
| Undisclosed harness | Benchmark results can't be reproduced | Always record model + harness configuration |

---
## Sources
- LangChain — [Improving Deep Agents with harness engineering](https://www.langchain.com/blog/improving-deep-agents-with-harness-engineering) (Feb 2026)
- OpenAI — [Harness engineering: leveraging Codex in an agent-first world](https://openai.com/index/harness-engineering/) (Feb 2026); [InfoQ summary](https://www.infoq.com/news/2026/02/openai-harness-engineering-codex/)
- Anthropic — [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) (Nov 2025)
- Anthropic — [Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps) (Mar 2026)
- Anthropic — [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) (Sep 2025)
- Anthropic — [Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents) (Sep 2025)
- Claude Code — [Hooks reference](https://code.claude.com/docs/en/hooks)
- OpenAI Agents SDK — [Guardrails](https://openai.github.io/openai-agents-python/guardrails/)

## See also
- [AI Harness](index.md)
- [Agent Harness — Concepts & Components](01-agent-harness-concepts.md)
- [Eval Harness — Tools, Testing & CI](04-eval-harness-tools-ci.md)
- [Agentic Search & Context Engineering](../agentic-ai-architecture/07-agentic-search-context-engineering.md)
- [OWASP LLM Security](../owasp-llm-security/index.md)
