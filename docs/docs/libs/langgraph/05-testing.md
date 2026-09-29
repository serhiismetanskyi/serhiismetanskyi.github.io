---
date: 2026-09-29
tags:
  - python
  - libraries
  - langgraph
  - ai-agents
  - llm
  - testing
  - pytest
---

# LangGraph — Testing LangGraph Apps

A LangGraph app is ordinary Python around a non-deterministic model. Test the deterministic parts (nodes, routing, state, interrupts, graph shape) **without any LLM**, and keep a small, separate layer of tests and evaluations against real models.

## Test Layers

| Layer | What is checked | Model | Speed | When |
|-------|-----------------|-------|-------|------|
| Tools and node functions | Pure logic, prompt building, parsing | None or fake | ms | Every commit |
| Routing functions | Every branch of every conditional edge | None | ms | Every commit |
| Graph flow | Path through nodes, state after each step, tool calls | Scripted fake | ms | Every commit |
| Persistence and HITL | Threads, interrupts, resume / reject, partial runs | Scripted fake + `InMemorySaver` | ms | Every commit |
| Graph structure | Nodes and edges did not change by accident | None | ms | Every commit |
| Trajectory and quality evals | Right tools, right order, good answers | Real model | seconds, costs money | Nightly / before release |

## Make the Graph Testable

The single most useful design decision: **build the graph in a factory that receives the model (and checkpointer)**. Keep routing and review logic in module-level functions.

```python
# app/support_graph.py
from typing import Literal

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage
from langchain_core.tools import tool
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode
from langgraph.types import Command, interrupt

SYSTEM_PROMPT = "You are a support agent. Use tools for order data."
RISKY_TOOLS = {"issue_refund"}


@tool
def get_order_status(order_id: str) -> str:
    """Return the delivery status of an order."""
    return f"{order_id}: shipped"


@tool
def issue_refund(order_id: str, amount: float) -> str:
    """Refund an order."""
    return f"refunded {amount} for {order_id}"


TOOLS = [get_order_status, issue_refund]


def route_after_agent(state: MessagesState) -> Literal["tools", "human_review", "__end__"]:
    last = state["messages"][-1]
    if not isinstance(last, AIMessage) or not last.tool_calls:
        return END
    if any(call["name"] in RISKY_TOOLS for call in last.tool_calls):
        return "human_review"
    return "tools"


def human_review(state: MessagesState) -> Command[Literal["tools", "__end__"]]:
    calls = state["messages"][-1].tool_calls
    decision = interrupt({"tool_calls": calls})
    if decision == "approve":
        return Command(goto="tools")
    rejection = AIMessage("Refund was not approved by a human reviewer.")
    return Command(goto=END, update={"messages": [rejection]})


def build_graph(model: BaseChatModel, checkpointer=None):
    llm = model.bind_tools(TOOLS)

    def agent(state: MessagesState) -> dict:
        return {"messages": [llm.invoke([("system", SYSTEM_PROMPT), *state["messages"]])]}

    builder = StateGraph(MessagesState)
    builder.add_node("agent", agent)
    builder.add_node("tools", ToolNode(TOOLS))
    builder.add_node("human_review", human_review)
    builder.add_edge(START, "agent")
    builder.add_conditional_edges("agent", route_after_agent)
    builder.add_edge("tools", "agent")
    return builder.compile(checkpointer=checkpointer)
```

Layout used on this page:

```text
app/__init__.py
app/support_graph.py          # build_graph(model, checkpointer)
tests/__init__.py
tests/fakes.py                # ScriptedModel, tool_call()
tests/conftest.py             # checkpointer, config fixtures
tests/test_*.py
tests/snapshots/support_graph.mmd
pyproject.toml
```

Test dependencies: `uv add --dev pytest pytest-asyncio agentevals`.

Project test settings:

```toml
# pyproject.toml
[tool.pytest.ini_options]
pythonpath = ["."]
asyncio_mode = "strict"            # pytest-asyncio; async tests use @pytest.mark.asyncio
markers = ["llm: tests that call a real LLM (need API keys)"]
```

## Fake Chat Models

`langchain_core.language_models.fake_chat_models` ships several fakes:

| Fake | Returns | Notes |
|------|---------|-------|
| `GenericFakeChatModel(messages=iter([...]))` | Next item of the iterator (`AIMessage` or `str`) | Supports `tool_calls` on `AIMessage` and token streaming; raises when the iterator is exhausted |
| `FakeListChatModel(responses=[...])` | Next string, cycles back to the start | Text only |
| `FakeMessagesListChatModel(responses=[...])` | Next `BaseMessage`, cycles | Full messages without streaming by chunks |
| `ParrotFakeChatModel()` | Echoes the last input message | Checks what reaches the model |

None of them implements `bind_tools()`, which every tool-calling graph and `create_agent` call. A tiny subclass fixes that and also records what the model received:

```python
# tests/fakes.py
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage, BaseMessage
from pydantic import Field


class ScriptedModel(GenericFakeChatModel):
    """Fake chat model: returns scripted messages in order, records its inputs, accepts bind_tools()."""

    received: list[list[BaseMessage]] = Field(default_factory=list)

    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        self.received.append(list(messages))
        return super()._generate(messages, stop=stop, run_manager=run_manager, **kwargs)


def scripted(*messages: AIMessage | str) -> ScriptedModel:
    return ScriptedModel(messages=iter(messages))


def tool_call(name: str, args: dict, call_id: str = "call_1") -> AIMessage:
    return AIMessage(content="", tool_calls=[{"name": name, "args": args, "id": call_id}])
```

```python
# tests/conftest.py
import uuid

import pytest
from langgraph.checkpoint.memory import InMemorySaver


@pytest.fixture
def checkpointer():
    return InMemorySaver()                 # fresh, isolated memory per test


@pytest.fixture
def config():
    return {"configurable": {"thread_id": f"test-{uuid.uuid4()}"}, "recursion_limit": 20}
```

!!! tip "Script exactly the calls you expect"
    An exhausted `GenericFakeChatModel` fails the run (`RuntimeError: generator raised StopIteration`). That is a feature: an unexpected extra model call — an extra loop iteration — breaks the test instead of passing silently.

## Unit Tests: Nodes, Tools, Routing

Routing functions are plain functions — parametrize every branch:

```python
# tests/test_routing.py
import pytest
from langchain_core.messages import AIMessage, HumanMessage

from app.support_graph import route_after_agent
from tests.fakes import tool_call


@pytest.mark.parametrize(
    ("last_message", "expected"),
    [
        (AIMessage("Your order has shipped."), "__end__"),
        (tool_call("get_order_status", {"order_id": "ord-1"}), "tools"),
        (tool_call("issue_refund", {"order_id": "ord-1", "amount": 10.0}), "human_review"),
        (HumanMessage("hello"), "__end__"),
    ],
    ids=["final-answer", "safe-tool", "risky-tool", "not-ai-message"],
)
def test_route_after_agent(last_message, expected):
    assert route_after_agent({"messages": [last_message]}) == expected
```

A single node can run in isolation through `graph.nodes["name"].invoke(state)` — it returns the node's update, not the new state. Tools decorated with `@tool` are tested with `.invoke({...})`. `ToolNode` itself needs the graph runtime, so exercise it through a graph run.

```python
# tests/test_nodes.py
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.support_graph import SYSTEM_PROMPT, build_graph, get_order_status, issue_refund
from tests.fakes import scripted


def test_agent_node_sends_system_prompt_first():
    model = scripted(AIMessage("Hello!"))
    graph = build_graph(model)

    update = graph.nodes["agent"].invoke({"messages": [HumanMessage("hi")]})   # one node, no graph run

    assert update["messages"][-1].content == "Hello!"
    [sent] = model.received
    assert isinstance(sent[0], SystemMessage) and sent[0].content == SYSTEM_PROMPT
    assert sent[-1].content == "hi"


def test_tools_are_plain_functions_too():
    assert get_order_status.invoke({"order_id": "ord-1"}) == "ord-1: shipped"
    assert issue_refund.invoke({"order_id": "ord-1", "amount": 5}) == "refunded 5.0 for ord-1"
```

## Graph Tests with a Scripted Model

Assert the **path** (from `stream_mode="updates"`), the **tool calls and results**, and the **final state** — not the model's wording.

```python
# tests/test_graph.py
import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.errors import GraphRecursionError
from langgraph.types import Command

from app.support_graph import build_graph
from tests.fakes import scripted, tool_call


def test_tool_loop_follows_expected_path(config):
    model = scripted(
        tool_call("get_order_status", {"order_id": "ord-42"}),
        AIMessage("Order ord-42 has shipped."),
    )
    graph = build_graph(model)

    path = []
    for update in graph.stream({"messages": [HumanMessage("Where is ord-42?")]}, config,
                               stream_mode="updates"):
        path.extend(update)

    assert path == ["agent", "tools", "agent"]


def test_tool_message_contains_tool_output(config):
    model = scripted(tool_call("get_order_status", {"order_id": "ord-42"}), AIMessage("Shipped."))
    result = build_graph(model).invoke({"messages": [HumanMessage("Where is ord-42?")]}, config)

    tool_messages = [m for m in result["messages"] if isinstance(m, ToolMessage)]
    assert [m.content for m in tool_messages] == ["ord-42: shipped"]
    assert result["messages"][-1].content == "Shipped."


def test_refund_pauses_for_human_review(checkpointer, config):
    model = scripted(tool_call("issue_refund", {"order_id": "ord-7", "amount": 25.0}))
    graph = build_graph(model, checkpointer=checkpointer)

    result = graph.invoke({"messages": [HumanMessage("Refund ord-7")]}, config)

    [pending] = result["__interrupt__"]
    assert pending.value["tool_calls"][0]["name"] == "issue_refund"
    assert graph.get_state(config).next == ("human_review",)
    assert not any(isinstance(m, ToolMessage) for m in result["messages"])   # nothing executed yet


def test_approved_refund_is_executed(checkpointer, config):
    model = scripted(
        tool_call("issue_refund", {"order_id": "ord-7", "amount": 25.0}),
        AIMessage("Refund done."),
    )
    graph = build_graph(model, checkpointer=checkpointer)
    graph.invoke({"messages": [HumanMessage("Refund ord-7")]}, config)

    result = graph.invoke(Command(resume="approve"), config)

    assert any(m.content == "refunded 25.0 for ord-7" for m in result["messages"])
    assert result["messages"][-1].content == "Refund done."


def test_rejected_refund_is_not_executed(checkpointer, config):
    model = scripted(tool_call("issue_refund", {"order_id": "ord-7", "amount": 25.0}))
    graph = build_graph(model, checkpointer=checkpointer)
    graph.invoke({"messages": [HumanMessage("Refund ord-7")]}, config)

    result = graph.invoke(Command(resume="reject"), config)

    assert not any(isinstance(m, ToolMessage) for m in result["messages"])
    assert "not approved" in result["messages"][-1].content
    assert graph.get_state(config).next == ()


def test_thread_keeps_history_between_turns(checkpointer, config):
    graph = build_graph(scripted(AIMessage("Hi!"), AIMessage("You asked about ord-42.")),
                        checkpointer=checkpointer)

    graph.invoke({"messages": [HumanMessage("Hello, I have a question about ord-42")]}, config)
    result = graph.invoke({"messages": [HumanMessage("What did I ask?")]}, config)

    assert [m.type for m in result["messages"]] == ["human", "ai", "human", "ai"]


def test_endless_tool_loop_is_stopped(config):
    always_tools = scripted(*[tool_call("get_order_status", {"order_id": "ord-1"}, f"c{i}") for i in range(50)])
    graph = build_graph(always_tools)

    with pytest.raises(GraphRecursionError):
        graph.invoke({"messages": [HumanMessage("loop")]}, {**config, "recursion_limit": 6})
```

- A fresh `InMemorySaver` and a unique `thread_id` per test keep tests independent and parallel-safe (`pytest-xdist`).
- `graph.get_state(config).next` is the cleanest assertion for "where did the graph stop?".
- For interrupts assert both sides: the payload shown to the human, and the effect of each possible resume value.

## Partial Execution

`update_state(..., as_node=...)` injects a node's output; `interrupt_after=[...]` (or `interrupt_before`) stops the run at a chosen point. Together they let you test one segment of a long graph without scripting everything before it.

```python
# tests/test_partial.py
from langchain_core.messages import AIMessage, HumanMessage

from app.support_graph import build_graph
from tests.fakes import scripted, tool_call


def test_resume_from_tools_node_without_calling_the_model_first(checkpointer, config):
    model = scripted(AIMessage("Order ord-9 has shipped."))        # only the final answer is scripted
    graph = build_graph(model, checkpointer=checkpointer)

    # Pretend "agent" already produced a tool call, then run only what follows
    graph.update_state(
        config,
        {"messages": [HumanMessage("Where is ord-9?"), tool_call("get_order_status", {"order_id": "ord-9"})]},
        as_node="agent",
    )
    assert graph.get_state(config).next == ("tools",)

    result = graph.invoke(None, config, interrupt_after=["tools"])   # stop right after the tool
    assert result["messages"][-1].content == "ord-9: shipped"
    assert graph.get_state(config).next == ("agent",)

    result = graph.invoke(None, config)                               # continue to the end
    assert result["messages"][-1].content == "Order ord-9 has shipped."
```

## Graph Structure Snapshot

Refactors can silently drop an edge. Pin the structure with a set of edges and a Mermaid snapshot reviewed in the PR diff:

```python
# tests/test_structure.py
from pathlib import Path

from app.support_graph import build_graph
from tests.fakes import scripted

SNAPSHOT = Path(__file__).parent / "snapshots" / "support_graph.mmd"


def test_graph_edges():
    graph = build_graph(scripted()).get_graph()
    edges = {(e.source, e.target, e.conditional) for e in graph.edges}

    assert set(graph.nodes) == {"__start__", "agent", "tools", "human_review", "__end__"}
    assert ("tools", "agent", False) in edges
    assert ("agent", "human_review", True) in edges
    assert ("human_review", "tools", True) in edges


def test_graph_matches_mermaid_snapshot():
    mermaid = build_graph(scripted()).get_graph().draw_mermaid()
    if not SNAPSHOT.exists():                       # first run: record, then review in the PR diff
        SNAPSHOT.parent.mkdir(exist_ok=True)
        SNAPSHOT.write_text(mermaid)
    assert mermaid == SNAPSHOT.read_text()
```

`draw_mermaid()` is deterministic and needs no extra packages (`draw_mermaid_png()` calls a remote renderer by default — avoid it in CI).

## Streaming and Async

With `pytest-asyncio`, test async graphs and the token stream the UI depends on:

```python
# tests/test_async.py
import pytest
from langchain_core.messages import AIMessage, HumanMessage

from app.support_graph import build_graph
from tests.fakes import scripted


@pytest.mark.asyncio
async def test_streams_tokens_from_agent_node(config):
    graph = build_graph(scripted(AIMessage("All good here")))

    tokens = []
    async for token, metadata in graph.astream({"messages": [HumanMessage("status?")]}, config,
                                               stream_mode="messages"):
        if metadata["langgraph_node"] == "agent":
            tokens.append(token.content)

    assert "".join(tokens) == "All good here"
```

## Trajectory Evaluation

A trajectory is the sequence of messages — especially tool calls — the agent produced. Assert it directly, or use `agentevals` for configurable matching.

```python
# tests/test_trajectory.py
from agentevals.trajectory.match import create_trajectory_match_evaluator
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from app.support_graph import build_graph
from tests.fakes import scripted, tool_call


def tool_names(messages) -> list[str]:
    return [call["name"] for m in messages if isinstance(m, AIMessage) for call in m.tool_calls]


def run_agent(question: str, *script):
    return build_graph(scripted(*script)).invoke({"messages": [HumanMessage(question)]})


def test_tool_sequence():
    result = run_agent(
        "Where is ord-42?",
        tool_call("get_order_status", {"order_id": "ord-42"}),
        AIMessage("Shipped."),
    )
    assert tool_names(result["messages"]) == ["get_order_status"]


def test_trajectory_matches_reference():
    result = run_agent(
        "Where is ord-42?",
        tool_call("get_order_status", {"order_id": "ord-42"}),
        AIMessage("Shipped."),
    )
    reference = [
        HumanMessage("Where is ord-42?"),
        tool_call("get_order_status", {"order_id": "ord-42"}),
        ToolMessage("ord-42: shipped", tool_call_id="call_1"),
        AIMessage("Your order has shipped."),       # final wording is not compared
    ]
    evaluator = create_trajectory_match_evaluator(trajectory_match_mode="strict")

    evaluation = evaluator(outputs=result["messages"], reference_outputs=reference)
    assert evaluation["score"] is True
```

| `trajectory_match_mode` | Passes when the actual tool calls… |
|-------------------------|------------------------------------|
| `strict` | Match the reference messages and tool calls in the same order |
| `unordered` | Contain the same tool calls in any order |
| `subset` | Are all contained in the reference (no extra tools used) |
| `superset` | Contain at least the reference tool calls (extras allowed) |

`tool_args_match_mode` (`exact`, `ignore`, `subset`, `superset`) controls how arguments are compared. For open-ended quality ("was this a sensible plan?") use an LLM-as-judge — `agentevals.trajectory.llm.create_trajectory_llm_as_judge`, [DeepEval](../../llm-evaluation/index.md), or the evaluators in Phoenix, Langfuse and MLflow ([06](./06-observability-deployment.md)).

## Tests Against a Real Model

Keep them few, marked, and focused on **behaviour**: which tool was chosen, with which arguments, whether the graph finished.

```python
# tests/test_real_llm.py
import os

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from app.support_graph import build_graph

pytestmark = [
    pytest.mark.llm,                                              # run with: pytest -m llm
    pytest.mark.skipif(not os.getenv("ANTHROPIC_API_KEY"), reason="no API key"),
]


def test_real_model_calls_order_tool(config):
    from langchain_anthropic import ChatAnthropic

    graph = build_graph(ChatAnthropic(model="claude-sonnet-5", temperature=0))
    result = graph.invoke({"messages": [HumanMessage("Where is order ord-42?")]}, config)

    calls = [c for m in result["messages"] if isinstance(m, AIMessage) for c in m.tool_calls]
    assert [c["name"] for c in calls] == ["get_order_status"]       # behaviour, not wording
    assert calls[0]["args"]["order_id"] == "ord-42"
```

- Run with `pytest -m llm` nightly or before release, not on every commit; `pytest -m "not llm"` in the PR pipeline.
- Use `temperature=0`, an explicit `recursion_limit` and a small model where possible; repeat flaky-prone cases 3–5 times and assert a pass rate.
- Trace these runs with `tags` / `metadata` (suite, case ID, git SHA) to debug failures from the trace, not from logs.

## What to Test in Every LangGraph App

| Risk | Test |
|------|------|
| Endless loop | Scripted model that always calls a tool + small `recursion_limit` → expect `GraphRecursionError` or a graceful stop |
| Risky tool without approval | Scripted risky tool call → assert interrupt, assert nothing executed |
| Wrong branch | Parametrized routing tests for every `Literal` value |
| Lost memory | Two turns on one `thread_id` → history present; new `thread_id` → empty |
| Tool failure | Tool raises → the agent returns an error `ToolMessage` (e.g. `ToolErrorMiddleware`) or the run fails loudly — whichever is specified |
| Broken tool-call history | After trimming / handoffs, every `ToolMessage` still follows its `AIMessage` |
| Cross-user leakage | Two users in one `Store` → each sees only their namespace |
| Graph drift | Structure snapshot |

## Testing Checklist

- [ ] Graph is built by a factory that receives the model and checkpointer
- [ ] Every routing function has a parametrized test per branch
- [ ] Fake model scripts exactly the expected calls; no network in unit tests
- [ ] Each test uses its own checkpointer and `thread_id`
- [ ] Interrupts are tested for payload, approve and reject paths
- [ ] Graph structure is pinned with an edges test or a Mermaid snapshot
- [ ] Real-model tests are marked, cheap, behaviour-based and traced
- [ ] Trajectory evals run on a golden set before each release

---
## See also
- [LangGraph — Stateful Agent Orchestration](./index.md)
- [LangGraph — Observability & Deployment](./06-observability-deployment.md)
- [Pytest](../pytest/index.md)
- [DeepEval — LLM Testing Guide](../../llm-evaluation/index.md)
- [Agentic AI — Testing, Evaluation & Observability](../../agentic-ai-architecture/06-testing-observability.md)
- [LiteLLM — Observability & Testing](../litellm/05-observability-testing.md)
