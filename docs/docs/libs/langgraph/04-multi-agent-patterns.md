---
date: 2026-09-29
tags:
  - python
  - libraries
  - langgraph
  - langchain
  - ai-agents
  - llm
---

# LangGraph — Multi-Agent Patterns

From a single tool-calling agent to supervisors and handoffs. Architecture-level trade-offs of multi-agent systems are covered in [Agentic AI — Multi-Agent Architecture Patterns](../../agentic-ai-architecture/02-multi-agent-patterns.md); this page is about building them with LangGraph.

## What Is Current (LangGraph 1.x / LangChain 1.x)

| API | Status |
|-----|--------|
| `langchain.agents.create_agent` | **Current** prebuilt tool-calling agent; returns a compiled LangGraph graph |
| `langchain.agents.middleware.*` | Current way to customise the agent loop (HITL, limits, retries, summarisation, PII) |
| `langgraph.prebuilt.create_react_agent` | **Deprecated since LangGraph 1.0**, planned removal in 2.0 — still works, emits a deprecation warning |
| `langgraph.prebuilt.ToolNode`, `tools_condition` | Current; use them in hand-written graphs |
| `langgraph-supervisor`, `langgraph-swarm` packages | Maintained for existing users; the maintainers now recommend the tool-based supervisor pattern below for most cases |

Migration from `create_react_agent`:

| `create_react_agent(...)` | `create_agent(...)` |
|---------------------------|---------------------|
| `prompt=` | `system_prompt=` (or `@dynamic_prompt` middleware) |
| `pre_model_hook` / `post_model_hook` | `@before_model` / `@after_model` middleware |
| `from langgraph.prebuilt.chat_agent_executor import AgentState` | `from langchain.agents import AgentState` |
| `interrupt_before=["tools"]` | `HumanInTheLoopMiddleware(interrupt_on={...})` |
| Node names `agent`, `tools` | Node names `model`, `tools` |

## Offline Model for the Examples

All examples below run without API keys using a scripted fake model. In real code pass a model instance or a `"provider:model"` string such as `"anthropic:claude-sonnet-5"`. Fake models are explained in [05 Testing](./05-testing.md).

```python
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage


class ScriptedModel(GenericFakeChatModel):
    """Returns pre-defined messages in order; ignores bound tools."""

    def bind_tools(self, tools, **kwargs):
        return self


def scripted(*messages: AIMessage) -> ScriptedModel:
    return ScriptedModel(messages=iter(messages))


def tool_call(name: str, args: dict, call_id: str) -> AIMessage:
    return AIMessage(content="", tool_calls=[{"name": name, "args": args, "id": call_id}])
```

## Single Agent with `create_agent`

```python
from langchain.agents import create_agent
from langchain_core.messages import HumanMessage
from langchain_core.tools import tool


@tool
def get_order_status(order_id: str) -> str:
    """Return the delivery status of an order."""
    return f"{order_id}: shipped"


support_agent = create_agent(
    scripted(
        tool_call("get_order_status", {"order_id": "ord-42"}, "call_1"),
        AIMessage("Order ord-42 has shipped."),
    ),
    tools=[get_order_status],
    system_prompt="You are a support agent. Use tools, never guess order data.",
    name="support",
)

result = support_agent.invoke({"messages": [HumanMessage("Where is ord-42?")]})
print([type(m).__name__ for m in result["messages"]])
# ['HumanMessage', 'AIMessage', 'ToolMessage', 'AIMessage']
print(list(support_agent.get_graph().nodes))    # ['__start__', 'model', 'tools', '__end__']
```

The result is a normal compiled graph: `stream`, checkpointers, `get_state`, subgraph usage and all tests from [05](./05-testing.md) apply. Other useful parameters: `response_format=` (structured final answer in `result["structured_response"]`), `context_schema=`, `checkpointer=`, `store=`.

### Middleware

| Middleware | Guards against |
|------------|----------------|
| `HumanInTheLoopMiddleware(interrupt_on={"tool_name": True})` | Risky tool calls without approval |
| `ModelCallLimitMiddleware(run_limit=..., thread_limit=...)` | Runaway loops and cost |
| `ToolCallLimitMiddleware(tool_name=..., run_limit=...)` | One tool hammered in a loop |
| `ModelRetryMiddleware` / `ToolRetryMiddleware` | Transient provider / tool failures |
| `ModelFallbackMiddleware(first_model, ...)` | Provider outage |
| `SummarizationMiddleware(model, trigger=..., keep=...)` | Context window overflow |
| `PIIMiddleware("email", strategy="redact")` | PII in inputs, outputs or tool results |
| `@before_model`, `@after_model`, `@wrap_model_call`, `@wrap_tool_call`, `@dynamic_prompt` | Your own hooks |

Human approval of a tool call with `HumanInTheLoopMiddleware`:

```python
from langchain.agents.middleware import HumanInTheLoopMiddleware
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

guarded_agent = create_agent(
    scripted(
        tool_call("get_order_status", {"order_id": "ord-42"}, "call_1"),
        AIMessage("Order ord-42 has shipped."),
    ),
    tools=[get_order_status],
    middleware=[HumanInTheLoopMiddleware(interrupt_on={"get_order_status": True})],
    checkpointer=InMemorySaver(),               # required for interrupts
)

config = {"configurable": {"thread_id": "support-1"}}
paused = guarded_agent.invoke({"messages": [HumanMessage("Where is ord-42?")]}, config)
request = paused["__interrupt__"][0].value
print(request["action_requests"][0]["name"], request["review_configs"][0]["allowed_decisions"])
# get_order_status ['approve', 'edit', 'reject', 'respond']

done = guarded_agent.invoke(Command(resume={"decisions": [{"type": "approve"}]}), config)
print(done["messages"][-1].content)          # Order ord-42 has shipped.
```

## Choosing a Multi-Agent Pattern

| Pattern | Control flow | Good for | Watch out for |
|---------|--------------|----------|---------------|
| **Supervisor with subagents as tools** | Supervisor LLM calls subagents like tools; they return results to it | Most cases; clear ownership, easy context control | Supervisor is a bottleneck and pays tokens for every hop |
| **Router graph** (custom supervisor node) | A router node picks the next worker via `Command` | Deterministic or classifier-based routing, compliance flows | You own the routing logic and its tests |
| **Handoffs / swarm** | The active agent transfers control with a handoff tool | Conversational flows where a specialist should talk to the user directly | Harder to trace "who is in charge"; needs loop limits |
| **Hierarchical** | Supervisors of supervisors (subgraphs) | Large systems with teams of agents | Latency, cost, debugging depth |

Start with one agent and good tools. Add agents only when a single prompt clearly cannot handle the tool set or the instructions.

## Supervisor with Subagents as Tools

```python
from langchain_core.tools import tool

research_agent = create_agent(
    scripted(AIMessage("Top flaky test: test_checkout_timeout (12% failure rate).")),
    tools=[],
    system_prompt="You analyse CI history.",
    name="research",
)


@tool
def ask_research(question: str) -> str:
    """Ask the research agent about CI history and flaky tests."""
    result = research_agent.invoke({"messages": [HumanMessage(question)]})
    return result["messages"][-1].content          # only the final answer goes back


supervisor = create_agent(
    scripted(
        tool_call("ask_research", {"question": "Which test is the flakiest?"}, "call_r1"),
        AIMessage("The flakiest test is test_checkout_timeout — quarantine it and open a ticket."),
    ),
    tools=[ask_research],
    system_prompt="You coordinate specialists. Delegate, then summarise.",
    name="supervisor",
)

answer = supervisor.invoke({"messages": [HumanMessage("What should we fix first in CI?")]})
print(answer["messages"][-1].content)
```

- The tool wrapper is where you **engineer context**: send the subagent only what it needs, return only the final answer (not its whole transcript).
- Each subagent is testable on its own; the supervisor is testable with the subagent tool stubbed.
- Give tools precise docstrings — they are the supervisor's routing instructions.

## Router Graph with `Command`

A router node returns `Command(goto=...)`. Inject the decision function so production uses an LLM with structured output and tests use a stub.

```python
from typing import Literal, TypedDict

from pydantic import BaseModel
from langchain_core.runnables import RunnableLambda
from langgraph.graph import START, StateGraph
from langgraph.types import Command


class Route(BaseModel):
    next: Literal["ui_tester", "api_tester", "done"]


class QAState(TypedDict):
    request: str
    done: list[str]


def build_graph(router):
    """router: Runnable[QAState -> Route], e.g. model.with_structured_output(Route)."""

    def supervisor(state: QAState) -> Command[Literal["ui_tester", "api_tester", "__end__"]]:
        decision: Route = router.invoke(state)
        return Command(goto="__end__" if decision.next == "done" else decision.next)

    def ui_tester(state: QAState) -> Command[Literal["supervisor"]]:
        return Command(update={"done": state["done"] + ["ui"]}, goto="supervisor")

    def api_tester(state: QAState) -> Command[Literal["supervisor"]]:
        return Command(update={"done": state["done"] + ["api"]}, goto="supervisor")

    builder = StateGraph(QAState)
    builder.add_node("supervisor", supervisor)
    builder.add_node("ui_tester", ui_tester)
    builder.add_node("api_tester", api_tester)
    builder.add_edge(START, "supervisor")
    return builder.compile()


def stub_router(state: QAState) -> Route:        # deterministic stand-in for the LLM
    if "api" not in state["done"]:
        return Route(next="api_tester")
    if "ui" not in state["done"]:
        return Route(next="ui_tester")
    return Route(next="done")


graph = build_graph(RunnableLambda(stub_router))
print(graph.invoke({"request": "Regression for release 1.4", "done": []}, {"recursion_limit": 20}))
# {'request': 'Regression for release 1.4', 'done': ['api', 'ui']}
```

In production: `build_graph(ChatAnthropic(model=...).with_structured_output(Route))`. The routing contract (`Route`) is the thing to test hardest — see [05](./05-testing.md).

## Handoffs Between Agents

A handoff tool returns `Command(goto=<agent>, graph=Command.PARENT)`: it exits the current agent's graph and jumps to a sibling node in the parent graph.

```python
from langchain.tools import ToolRuntime
from langchain_core.messages import ToolMessage
from langgraph.graph import START, MessagesState, StateGraph
from langgraph.types import Command


@tool
def transfer_to_billing(runtime: ToolRuntime) -> Command:
    """Hand the conversation to the billing agent."""
    note = ToolMessage("Transferred to billing", tool_call_id=runtime.tool_call_id)
    return Command(
        goto="billing",
        graph=Command.PARENT,
        update={"messages": runtime.state["messages"] + [note]},   # pass the history along
    )


triage = create_agent(scripted(tool_call("transfer_to_billing", {}, "h1")),
                      tools=[transfer_to_billing], name="triage")
billing = create_agent(scripted(AIMessage("Refund issued for invoice INV-9.")),
                       tools=[], name="billing")

builder = StateGraph(MessagesState)
builder.add_node("triage", triage, destinations=("billing",))   # destinations: for rendering
builder.add_node("billing", billing)
builder.add_edge(START, "triage")
desk = builder.compile()

result = desk.invoke({"messages": [HumanMessage("I was charged twice")]})
print([f"{type(m).__name__}: {m.content}" for m in result["messages"]])
# ['HumanMessage: I was charged twice', 'AIMessage: ', 'ToolMessage: Transferred to billing',
#  'AIMessage: Refund issued for invoice INV-9.']
```

- `ToolRuntime` injects `state`, `tool_call_id`, `context`, `store` into a tool without exposing them to the model.
- Include the `AIMessage` with the tool call **and** a matching `ToolMessage` in the handed-over history — otherwise the next model call fails on an invalid tool-call sequence.
- `langgraph-swarm` (`create_swarm`, `create_handoff_tool`) packages this pattern and remembers the active agent between turns.

## Multi-Agent Checklist

- [ ] A single agent was tried first; each extra agent has a clear, testable responsibility
- [ ] Subagent inputs and outputs are minimal (context engineering), not full transcripts
- [ ] Routing decisions use structured output (`Route` schema), not free text parsing
- [ ] Loop limits: `recursion_limit`, `ModelCallLimitMiddleware`, delegation depth
- [ ] Risky tools behind `HumanInTheLoopMiddleware` or `interrupt()`
- [ ] Traces tag the acting agent (`name=` on each agent) for per-agent metrics
- [ ] No imports from deprecated `langgraph.prebuilt.create_react_agent` in new code

---
## See also
- [LangGraph — Stateful Agent Orchestration](./index.md)
- [LangGraph — Testing LangGraph Apps](./05-testing.md)
- [LangChain — Agents & Tools](../langchain/04-agents-tools.md)
- [Agentic AI — Multi-Agent Architecture Patterns](../../agentic-ai-architecture/02-multi-agent-patterns.md)
- [Agentic AI — Tool Integration & Prompting](../../agentic-ai-architecture/04-tool-integration-prompting.md)
