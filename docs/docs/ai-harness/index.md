---
date: 2026-09-25
tags:
  - ai-agents
  - llm
  - harness
  - evaluation
---

# AI Harness

A **harness** is everything around the model that turns it into a working system.
The word is used for two different things, and both matter to QA engineers:

- **Agent harness** — the runtime that lets a model act as an agent: the loop, tools, context, memory, permissions, sandbox.
- **Evaluation harness** — the infrastructure that runs evals end to end: tasks, trials, graders, metrics, reports.

> "Agent = model + harness." — LangChain

The same model can score very differently depending on its harness. Changing only the harness
(same model) moved LangChain's coding agent on Terminal Bench 2.0 from **52.8 → 66.5**.
So when you test an AI system, you are mostly testing its harness.

## Sections

| File | Topics |
|------|--------|
| [Agent Harness — Concepts & Components](01-agent-harness-concepts.md) | What a harness is, agent loop, 8 harness jobs, components, how Anthropic / OpenAI / LangChain use the term |
| [Agent Harness — Patterns & Anti-Patterns](02-agent-harness-patterns.md) | Context engineering, tool design, long-running agents, verification loops, guardrails, harness engineering case studies, failure modes |
| [Eval Harness — Concepts & Metrics](03-eval-harness-concepts.md) | Tasks, trials, graders, transcripts, pass@k vs pass^k, capability vs regression evals, building an eval suite |
| [Eval Harness — Tools, Testing & CI](04-eval-harness-tools-ci.md) | lm-evaluation-harness, Inspect AI, DeepEval, promptfoo, Ragas, LangSmith, Braintrust, Harbor; testing an agent harness; evals in CI/CD |
| [Building a Harness with Jev](05-jev-system-one-harness.md) | System One models, Jev question types (Noul / Choice / Score), LangChain integration, model routing and AutoMode guardrail middleware, testing probabilistic decisions |

## Agent Harness vs Eval Harness

|  | Agent Harness | Evaluation Harness |
|---|---|---|
| Purpose | Make the model **do** the task | **Measure** how well the system does the task |
| Runs | In production and in tests | In development, CI, before releases |
| Main parts | Loop, tools, context, memory, permissions, sandbox, hooks | Tasks, trials, graders, environment, metrics, reports |
| Output | Actions and results | Scores, transcripts, pass rates |
| Who owns it | Product / platform engineers | QA / eval engineers (often the same team) |

## Architecture Overview

```
            ┌──────────────── Evaluation Harness ────────────────┐
            │  tasks → trials → run agent → grade → aggregate    │
            │                       │                            │
            │   ┌───────────────────▼────────────────────────┐   │
            │   │              Agent Harness                 │   │
            │   │  system prompt · context · memory · hooks  │   │
            │   │      ┌──────────────────────────────┐      │   │
            │   │      │   Model (LLM)                │      │   │
            │   │      └──────────────┬───────────────┘      │   │
            │   │   gather context → act → verify → repeat   │   │
            │   │                     │                      │   │
            │   │        tools · sandbox · sub-agents        │   │
            │   └────────────────────────────────────────────┘   │
            │                       │                            │
            │        transcript + final state → graders          │
            └────────────────────────────────────────────────────┘
```

## Quick Start: Checklist for QA Engineers

1. **Name the harness** — write down model, system prompt, tools, limits and sandbox. You can't compare results without it.
2. **Unit-test the tools** — tools are plain code: test them without a model.
3. **Replay model calls** — record real responses once, replay them in CI.
4. **Collect 20–50 real tasks** — from bugs, support tickets and manual checks.
5. **Pick graders** — code-based first, LLM-as-judge where needed, humans to calibrate.
6. **Run several trials** — report pass@k and pass^k, not one lucky run.
7. **Read transcripts** — scores tell you *that* it failed, transcripts tell you *why*.
8. **Gate on regressions** — regression suite near 100% blocks the merge; capability suite is a trend.

---
## See also
- [Digital Garden: Knowledge Base](../index.md)
- [Agentic AI Architecture](../agentic-ai-architecture/index.md)
- [AI Skills for Coding Agents](../ai-skills/index.md)
- [DeepEval — LLM Testing Guide](../llm-evaluation/index.md)
- [OWASP LLM Security](../owasp-llm-security/index.md)
