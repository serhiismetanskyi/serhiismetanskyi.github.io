---
date: 2026-09-25
tags:
  - ai-agents
  - llm
  - harness
  - langchain
---

# Building a Harness with Jev (System One Models)

## The Problem: Every Decision Is a Model Call

A typical agent loop asks the LLM for *every* small decision: which model to use, is this tool call safe,
is this ticket urgent, did the output pass the check. Each of those is another slow, expensive generative call.

Most of these decisions are **classification**, not generation. They need a typed answer with a confidence,
not a paragraph of text.

## What Jev Is

**Jev** is the first public **System One model** from **TypeSafe AI** (September 2026).
The name comes from Kahneman's *System 1* (fast, intuitive) vs *System 2* (slow, deliberate) thinking:
LLMs play the System 2 role, System One models make fast structured decisions.

> "Unstructured state in, typed probabilistic decisions out." — TypeSafe AI

| | LLM | Jev (System One model) |
|---|---|---|
| Output | Free-form text (or JSON inside text) | Typed values with probabilities |
| Generates text | Yes | **No** |
| Several questions at once | Longer prompt / more calls | Evaluated **in parallel**; more questions barely change latency |
| Confidence | Often overconfident, not exposed | Calibrated probability with every answer |
| Good for | Open-ended reasoning, writing, planning | Routing, gating, triage, judging, "smart if-statements" |

Training: **Reinforcement Learning for Calibrated Decisions (RLCD)** — calibrated means higher confidence
should mean higher accuracy.

**Vendor claims** (not independent benchmarks): 70–500 ms latency; "up to 200x faster inference and 400x lower cost
than comparable LLMs on classification tasks"; input $0.042 per million tokens, output free.
TypeSafe itself notes its workflow evals are "expected to be on the higher end of real world gains".
At launch access is via an early-access programme.

## Core Concepts

A request has a **state** and a set of **questions** about that state.

- **State** — the context to evaluate: text, structured data or LangChain messages.
- **Questions** — named, typed questions, all answered in one request.

| Question type | Use it to | Returns |
|---|---|---|
| **Noul** | Answer yes / no | `noul` — probability that the statement is true |
| **Choice** | Pick one of several options | `choice`, `probabilities` per option, `confidence` |
| **Score** | Rate against ordered levels (low / medium / high) | `score`, `legend`, `probabilities`, `confidence` |

## Raw API

`POST https://api.typesafe.ai/v1/systemone` with `Authorization: Bearer <API_KEY>`. Default model: `jev-latest`.

```json
{
  "model": "jev-latest",
  "state": "Hi, I've been trying to connect my Stripe account for 3 days and it keeps failing. I'm losing sales. Please help ASAP.",
  "questions": {
    "is_urgent": {
      "type": "noul",
      "instructions": "The message conveys urgency or time-sensitivity"
    }
  }
}
```

Response (part):

```json
{
  "is_urgent": {
    "type": "noul",
    "noul": 0.999
  }
}
```

The Python SDK is `typesafe-sdk` (`pip install typesafe-sdk`).

## LangChain Integration

```bash
uv add langchain-typesafe
# with experimental middleware:
uv add "langchain-typesafe[experimental]" langchain-openai
```

Environment: `TYPESAFE_API_KEY` (required), `TYPESAFE_BASE_URL` (optional, defaults to `https://api.typesafe.ai`).

### Classifier

```python
from langchain_typesafe import Noul, TypeSafeClassifier

classifier = TypeSafeClassifier()

response = classifier.invoke({
    "state": (
        "The deploy failed twice and customers are seeing 500s. "
        "Can someone look now?"
    ),
    "questions": {
        "urgent": Noul(
            instructions="Does this need attention right now?"
        ),
    },
})

urgency = response.nouls["urgent"].noul
```

The response also carries `choices`, `scores`, `model`, `usage` and a `request_id` for tracing.

## Harness Patterns with Jev

Jev plugs into the harness as **middleware** — the same place LangChain puts context management,
policy enforcement and cost control.

```
User request
    │
    ▼
┌────────────────────────┐   Jev: which model?          ┌──────────────┐
│ ModelRouterMiddleware  │─────────────────────────────►│ fast / power │
└──────────┬─────────────┘                              └──────────────┘
           ▼
   LLM plans & calls tools
           │ tool call
           ▼
┌────────────────────────┐   Jev: is this call risky?
│ AutoModeMiddleware     │───────── yes ──► block before the tool runs
└──────────┬─────────────┘
           │ no
           ▼
      Tool executes
```

### 1. Model Routing (cost control)

Send simple requests to a cheap, fast model and hard ones to a powerful model.
Jev chooses using the criteria you write.

```python
from langchain.agents import create_agent
from langchain_typesafe.experimental.middleware import (
    ModelChoice,
    ModelRouterMiddleware,
)

router = ModelRouterMiddleware(
    choices={
        "fast": ModelChoice(
            model="openai:luna",
            criteria="Direct lookups, extraction, and localized changes.",
        ),
        "powerful": ModelChoice(
            model="openai:sol",
            criteria="Architecture and high-stakes decisions.",
        ),
    },
    instructions="Choose the least costly model that can complete the task.",
)

agent = create_agent("openai:gpt-5.6-luna", middleware=[router])
```

### 2. AutoMode Guardrails (policy enforcement)

Check tool calls for risky actions and block them **before** the tool executes.

```python
from langchain.agents import create_agent
from langchain_typesafe.experimental.middleware import (
    AutoModeMiddleware,
)

guardrail = AutoModeMiddleware(tools=["bash"])

agent = create_agent("openai:gpt-5.6-luna", middleware=[guardrail])
```

Custom risk criteria can be passed with `NoulCriteria` (`true=...`, `false=...`).

### 3. Other decisions to move out of the LLM

| Decision in the loop | Question type |
|---|---|
| Does this message need a human now? | Noul |
| Which queue / team / tool handles this? | Choice |
| How severe is this bug report? | Score |
| Did the agent's answer follow the policy? | Noul (as a fast judge) |
| Is this retrieved document relevant? | Score |

> "Use an LLM for open-ended reasoning and generation, and Jev for fast, structured decisions along the way."

## When Not to Use It

- Anything that needs **generated text** — answers, code, summaries. Jev doesn't generate strings.
- Decisions that need long multi-step reasoning or tool use — keep those in the LLM.
- As a drop-in replacement for an LLM — it is a component *inside* the harness, not the agent itself.

## Testing Jev-Based Decisions (QA Notes)

The decisions are probabilistic, so test them like classifiers:

- **Thresholds are part of the harness.** Decide and document the cut-off (e.g. block when `noul > 0.8`) and test both sides of it.
- **Labelled dataset.** Collect real states with human labels; measure accuracy, false positives and false negatives per question.
- **Guardrail misses cost more than false alarms.** For `AutoModeMiddleware`, track how many risky calls got through, not just overall accuracy.
- **Check calibration.** Group answers by confidence (0.9–1.0, 0.8–0.9, …) and check that accuracy matches — that is the vendor's main claim.
- **Log `request_id`** with every decision so failed runs can be traced.
- **Pin versions.** The middleware is **experimental** and "may change without notice"; pin `langchain-typesafe` and record the model (`jev-latest` moves).
- **Mock in unit tests.** Replace `TypeSafeClassifier` with a stub returning fixed probabilities; test your routing and blocking logic without API calls.

```python
class FakeClassifier:
    def __init__(self, noul: float):
        self.noul = noul

    def invoke(self, request):
        return FakeResponse(nouls={"urgent": FakeNoul(noul=self.noul)})

def test_ticket_escalated_when_urgent():
    assert route_ticket(text="Prod is down!", classifier=FakeClassifier(0.97)) == "on-call"

def test_ticket_queued_when_not_urgent():
    assert route_ticket(text="Typo on pricing page", classifier=FakeClassifier(0.10)) == "backlog"
```

---
## See also
- [AI Harness](index.md)
- [Agent Harness — Concepts & Components](01-agent-harness-concepts.md)
- [Agent Harness — Patterns & Anti-Patterns](02-agent-harness-patterns.md)
- [LangChain — LLM Application Framework](../libs/langchain/index.md)
