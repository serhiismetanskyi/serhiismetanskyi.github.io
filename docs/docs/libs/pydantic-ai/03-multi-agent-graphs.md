---
date: 2026-10-19 12:00:00
tags:
  - python
  - libraries
  - pydantic-ai
  - ai-agents
  - llm
---

# Pydantic AI — Multi-Agent & Graphs

Pydantic AI has no separate "team" class. Multi-agent systems are ordinary Python: one agent calls another from a tool, or your code runs agents one after another. When the control flow itself becomes complicated, `pydantic_graph` models it explicitly. Examples were run on pydantic-ai-slim 2.57.0 and `pydantic-graph` 2.57.0.

## Choosing a Level

| Level | What it is | Use when |
|-------|-----------|----------|
| 1. Single agent | One agent with tools | The task fits one prompt and a few tools |
| 2. Delegation | A tool that runs another agent and returns its output | One agent stays in charge, specialists do sub-tasks |
| 3. Programmatic hand-off | Your code runs agent A, then decides what to run next | The order is known, or you need a human or a database step in between |
| 4. Graph | `pydantic_graph` steps and edges | Loops, branches or parallel fan-out that deserve to be explicit, typed and drawable |

Start at level 1 and move up only when a concrete problem demands it. Each extra agent multiplies cost, latency and the surface you must test.

## Delegation: an Agent as a Tool

The parent calls the child inside one of its tools. Pass `usage=ctx.usage` so the child's tokens and requests are counted against the **parent's** `UsageLimits`:

```python
from pydantic_ai import Agent, RunContext
from pydantic_ai.usage import UsageLimits

researcher = Agent(
    "openai:gpt-5-mini",
    name="researcher",
    instructions="Find facts about the topic. Reply with at most five bullet points.",
)

lead = Agent(
    "anthropic:claude-sonnet-5-5",
    name="lead",
    instructions="Write a short briefing. Use the research tool for facts.",
)


@lead.tool
async def research(ctx: RunContext[None], topic: str) -> str:
    """Research a topic and return bullet points."""
    result = await researcher.run(topic, usage=ctx.usage)
    return result.output


result = lead.run_sync(
    "Brief me on the CAP theorem",
    usage_limits=UsageLimits(request_limit=10),
)
print(result.usage)    # requests, tokens and tool_calls of parent AND child together
```

With scripted models, a run in which the lead calls `research` once reports `requests=3, tool_calls=1` — two lead requests plus one researcher request in one `RunUsage`.

Points to design deliberately:

| Question | Recommendation |
|----------|----------------|
| Which model for which agent? | A cheap model for narrow sub-tasks, a stronger one for the lead. Models are independent per agent |
| Shared dependencies? | Pass `deps=ctx.deps` to the child when it needs the same database or client; give the child its own `deps_type` otherwise |
| What does the child return? | A typed `output_type` (a model, not prose) when the lead consumes it programmatically |
| How is the child limited? | Pass `usage=ctx.usage` and set `UsageLimits` on the parent run; set `retries` on the child |
| Does the child see the parent's chat? | No. It starts fresh. Put what it needs in the tool arguments |

## Programmatic Hand-Off

Your code is the orchestrator. Agents stay small and each one has a typed result:

```python
from pydantic import BaseModel
from pydantic_ai import Agent


class Route(BaseModel):
    team: str          # "billing" | "tech"
    summary: str


triage = Agent("openai:gpt-5-mini", output_type=Route, instructions="Classify the ticket.")
billing = Agent("openai:gpt-5-mini", instructions="You are a billing specialist.")
tech = Agent("openai:gpt-5-mini", instructions="You are a technical specialist.")


async def handle(ticket: str) -> str:
    route = (await triage.run(ticket)).output
    specialist = billing if route.team == "billing" else tech
    reply = await specialist.run(route.summary)
    return reply.output
```

The routing decision is a plain `if`, so it is deterministic and easy to unit test. To carry one conversation across several agents, pass `message_history=` from one run to the next (see [02](./02-runs-history-capabilities.md): remember that a `system_prompt` travels with the history while `instructions` do not).

Independent sub-tasks can run concurrently:

```python
import asyncio

summaries, risks = await asyncio.gather(
    summariser.run(document, usage=usage),
    risk_checker.run(document, usage=usage),
)
```

Sharing one `RunUsage` object (`usage=usage`) accumulates the totals in one place.

## Graphs with `pydantic_graph`

`pydantic-graph` is a standalone async graph library (installed with Pydantic AI, usable without it). A graph is built from **steps** (async functions) and **edges**; state and inputs are typed.

```python
import asyncio
from dataclasses import dataclass

from pydantic_graph import GraphBuilder, StepContext


@dataclass
class State:
    log: list[str]


g = GraphBuilder(state_type=State, input_type=int, output_type=str)


@g.step
async def double(ctx: StepContext[State, None, int]) -> int:
    ctx.state.log.append("double")
    return ctx.inputs * 2


@g.step
async def render(ctx: StepContext[State, None, int]) -> str:
    ctx.state.log.append("render")
    return f"result={ctx.inputs}"


g.add(
    g.edge_from(g.start_node).to(double),
    g.edge_from(double).to(render),
    g.edge_from(render).to(g.end_node),
)
graph = g.build()

state = State(log=[])
output = asyncio.run(graph.run(state=state, inputs=21))
print(output, state.log)          # result=42 ['double', 'render']
```

- `StepContext[StateT, DepsT, InputT]` gives `ctx.state`, `ctx.deps` and `ctx.inputs` (the value from the previous step).
- A step may call an `Agent`; the graph decides *when*, the agent decides *what to say*.
- The builder also provides decisions (branching on a value), forks and joins (parallel fan-out and reduction with `reduce_list_append`, `reduce_sum`, ...), and Mermaid output for documentation.

!!! note "Graph API of 0.x / 1.x"
    Older posts define graphs as `BaseNode` dataclasses returning the next node and build them with `Graph(nodes=[...])`. In 2.57.0 the `Graph` constructor takes internal arguments (edges, parent forks, ...) and is meant to be produced by `GraphBuilder.build()`. `BaseNode` and `End` are still exported, but use the builder for new code.

### Graph or plain Python?

| Situation | Choose |
|-----------|--------|
| Linear chain of 2-3 agents | Plain `await` calls |
| Retry loop with a counter | A `while` loop |
| Several branches, loops and fan-out that change over time, need a diagram, must be resumable | `pydantic_graph` |
| Persistent checkpoints, time-travel, rich streaming | LangGraph (see [LangGraph](../langgraph/index.md)) |

## Common Mistakes

| Mistake | Effect | Fix |
|---------|--------|-----|
| Child run without `usage=ctx.usage` | Child cost is invisible to the parent's limits | Always pass it |
| Parent and child share a long `system_prompt` through `message_history` | Child inherits the wrong role | Use `instructions` and pass only what is needed |
| An agent per tiny function | Slow, expensive, flaky | Use a plain tool |
| Free-text hand-off between agents | Parsing errors downstream | Give the first agent a typed `output_type` |
| Untested routing | A wrong `team` string silently picks the wrong agent | Use `Literal["billing", "tech"]` in the model and unit test the router |

---
## See also
- [Pydantic AI — Type-Safe Agents](./index.md)
- [Pydantic AI — Runs, History, Approval & Capabilities](./02-runs-history-capabilities.md)
- [Pydantic AI — Testing, Evals & Observability](./04-testing-evals.md)
- [Multi-Agent Architecture Patterns](../../agentic-ai-architecture/02-multi-agent-patterns.md)
- [LangGraph — Multi-Agent Patterns](../langgraph/04-multi-agent-patterns.md)
