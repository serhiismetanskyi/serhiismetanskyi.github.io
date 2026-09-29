---
date: 2026-09-29
tags:
  - python
  - libraries
  - langgraph
  - ai-agents
  - llm
---

# LangGraph — Graph Design & State

A LangGraph app is a **state schema** plus **nodes** that return partial updates plus **edges** that decide what runs next. Getting the state right is most of the design work. Basic `StateGraph` and tool-loop examples are in [LangChain — LangGraph & Production](../langchain/06-langgraph-production.md).

## State Schema Options

| Schema type | Defaults | Validation | Use when |
|-------------|----------|------------|----------|
| `TypedDict` | No (missing keys are absent) | None — type hints only | Default choice, fastest, easy to serialise |
| `dataclass` | Yes (`field(default=...)`) | None | You want defaults without Pydantic |
| Pydantic `BaseModel` | Yes | **Graph input only** — node outputs are not re-validated | Input comes from untrusted callers (API, UI) |

```python
from pydantic import BaseModel, Field
from langgraph.graph import START, StateGraph


class TicketState(BaseModel):
    ticket: str
    priority: int = Field(default=3, ge=1, le=5)


def escalate(state: TicketState) -> dict:
    return {"priority": 99}          # NOT validated: nodes can still write bad data


builder = StateGraph(TicketState)
builder.add_node("escalate", escalate)
builder.add_edge(START, "escalate")
graph = builder.compile()

graph.invoke({"ticket": "T-1"})                    # ok -> priority 99
# graph.invoke({"ticket": "T-1", "priority": 10})  # pydantic.ValidationError on input
```

Nodes receive the state as the schema type (attribute access for Pydantic and dataclasses, `state["key"]` for `TypedDict`) and return a **dict of changed keys** — never the whole state.

## Reducers

Without a reducer, a key is **overwritten** by the last update. With `Annotated[type, reducer]`, updates are merged with `reducer(current, update)`.

```python
import operator
from typing import Annotated, TypedDict

from langgraph.graph import START, StateGraph
from langgraph.types import Overwrite


def keep_max(current: int, update: int) -> int:
    return max(current, update)


class RunState(TypedDict):
    status: str                                    # last write wins
    findings: Annotated[list[str], operator.add]   # appended
    max_severity: Annotated[int, keep_max]         # custom reducer


def scan_ui(state: RunState) -> dict:
    return {"findings": ["ui: button overlaps"], "max_severity": 2}


def scan_api(state: RunState) -> dict:
    return {"findings": ["api: 500 on /cart"], "max_severity": 4}


def reset(state: RunState) -> dict:
    return {"findings": Overwrite(["summary only"]), "status": "done"}   # bypass the reducer


builder = StateGraph(RunState)
builder.add_node("scan_ui", scan_ui)
builder.add_node("scan_api", scan_api)
builder.add_node("reset", reset)
builder.add_edge(START, "scan_ui")
builder.add_edge(START, "scan_api")                # scan_ui and scan_api run in parallel
builder.add_edge(["scan_ui", "scan_api"], "reset")  # fan-in: wait for both
graph = builder.compile()

print(graph.invoke({"status": "new", "findings": [], "max_severity": 0}))
# {'status': 'done', 'findings': ['summary only'], 'max_severity': 4}
```

!!! warning "Parallel writes need a reducer"
    Two nodes in the same super-step writing the same plain key raise `InvalidUpdateError: At key '...': Can receive only one value per step`. Add a reducer or write different keys.

## Messages State

`MessagesState` is a ready-made schema with `messages: Annotated[list[AnyMessage], add_messages]`. Extend it instead of redefining it.

```python
from langchain_core.messages import AIMessage, HumanMessage, RemoveMessage
from langgraph.graph import MessagesState
from langgraph.graph.message import add_messages


class ChatState(MessagesState):
    user_tier: str


history = [HumanMessage("hi", id="1"), AIMessage("hello", id="2")]

add_messages(history, [AIMessage("hello, how can I help?", id="2")])   # same id -> replaced
add_messages(history, [RemoveMessage(id="1")])                          # delete by id
add_messages(history, [("user", "next question")])                      # tuples/dicts are coerced
```

| `add_messages` behaviour | Why it matters |
|--------------------------|----------------|
| Appends new messages, assigns an `id` if missing | Tuples and dicts work as input |
| Message with an existing `id` **replaces** it | Edit or redact a message in place |
| `RemoveMessage(id=...)` deletes it | Trim history to control context size and cost |

## Input, Output and Private State

Hide internal keys from callers with `input_schema` / `output_schema`. A node can also declare its own input type to read keys that are not in the public schema.

```python
from typing import TypedDict

from langgraph.graph import START, StateGraph


class Input(TypedDict):
    question: str


class Output(TypedDict):
    answer: str


class Internal(Input, Output):
    search_query: str                 # never returned to the caller


def plan(state: Input) -> dict:
    return {"search_query": state["question"].lower()}


def answer(state: Internal) -> dict:
    return {"answer": f"Results for '{state['search_query']}'"}


builder = StateGraph(Internal, input_schema=Input, output_schema=Output)
builder.add_node("plan", plan)
builder.add_node("answer", answer)
builder.add_edge(START, "plan")
builder.add_edge("plan", "answer")
graph = builder.compile()

print(graph.invoke({"question": "Flaky Tests"}))   # {'answer': "Results for 'flaky tests'"}
```

## Edges and Routing

| Edge | API | Use for |
|------|-----|---------|
| Static | `add_edge("a", "b")` | Fixed order |
| Fan-out | `add_edge(START, "a")` + `add_edge(START, "b")` | Independent work in parallel |
| Fan-in | `add_edge(["a", "b"], "c")` | Wait for all branches |
| Conditional | `add_conditional_edges("a", router, path_map)` | Branch on state |
| Dynamic | node returns `Command(goto=...)` | Update state and route in one step |
| Map | router returns `[Send("node", payload), ...]` | N parallel copies with different inputs |

A routing function returns a node name, a list of names, or `END`. The optional `path_map` maps return values to nodes and lets the graph render correctly:

```python
from typing import Literal

from langgraph.graph import END


def after_review(state: dict) -> Literal["fix", "publish", "__end__"]:
    if state["review_score"] < 0.7:
        return "fix"
    return "publish" if state["approved"] else END


# builder.add_conditional_edges("review", after_review)
# or, with labels decoupled from node names:
# builder.add_conditional_edges("review", after_review, {"fix": "rewrite", "publish": "publish", END: END})
```

`add_node(..., defer=True)` delays a node until all other pending work is done — useful for a final aggregator when branches have different lengths.

## `Command`: Update and Route Together

A node can return `Command(update=..., goto=...)` instead of a dict. Annotate the return type with `Command[Literal[...]]` so the graph knows possible destinations (needed for rendering, no edges required).

```python
from typing import Literal, TypedDict

from langgraph.graph import START, StateGraph
from langgraph.types import Command


class SupportState(TypedDict):
    text: str
    route: str


def classify(state: SupportState) -> Command[Literal["bug", "billing"]]:
    route = "billing" if "invoice" in state["text"].lower() else "bug"
    return Command(update={"route": route}, goto=route)


builder = StateGraph(SupportState)
builder.add_node("classify", classify)
builder.add_node("bug", lambda state: {})
builder.add_node("billing", lambda state: {})
builder.add_edge(START, "classify")
graph = builder.compile()

print(graph.invoke({"text": "Invoice is wrong"}))   # {'text': 'Invoice is wrong', 'route': 'billing'}
```

| Prefer | When |
|--------|------|
| Conditional edge | Routing depends only on state; keep the node free of control flow |
| `Command` | The node that computes the decision also updates state (e.g. handoffs, supervisors) |
| `Command(graph=Command.PARENT, goto=...)` | A node inside a subgraph must jump to a node of the parent graph |

Nodes without outgoing edges end the run — the graph stops when no node is scheduled.

## `Send`: Map-Reduce and Dynamic Parallelism

`Send(node, payload)` schedules a node with its **own input** (not the whole state). Return a list of `Send` from a routing function to fan out over data known only at runtime.

```python
import operator
from typing import Annotated, TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.types import Send


class SuiteState(TypedDict):
    endpoints: list[str]
    results: Annotated[list[str], operator.add]    # reducer collects parallel results


class CheckInput(TypedDict):
    endpoint: str


def fan_out(state: SuiteState) -> list[Send]:
    return [Send("check", {"endpoint": e}) for e in state["endpoints"]]


def check(state: CheckInput) -> dict:
    return {"results": [f"{state['endpoint']}: ok"]}


builder = StateGraph(SuiteState)
builder.add_node("check", check)
builder.add_conditional_edges(START, fan_out, ["check"])
builder.add_edge("check", END)
graph = builder.compile()

print(graph.invoke({"endpoints": ["/login", "/cart", "/pay"], "results": []}))
# {'endpoints': [...], 'results': ['/login: ok', '/cart: ok', '/pay: ok']}
```

The third argument (`["check"]`) lists possible destinations for rendering. Each `Send` becomes a separate task in the same super-step; results merge through the reducer.

## Subgraphs

| Pattern | How | State |
|---------|-----|-------|
| Subgraph as a node | `builder.add_node("research", compiled_subgraph)` | Shares keys with the parent |
| Subgraph called in a node | `research.invoke({...})` inside a function | Different schema; you map inputs and outputs |

```python
from typing import TypedDict

from langgraph.graph import START, StateGraph


class ResearchState(TypedDict):
    query: str
    result: str


research_builder = StateGraph(ResearchState)
research_builder.add_node("search", lambda s: {"result": f"3 docs about {s['query']}"})
research_builder.add_edge(START, "search")
research = research_builder.compile()


class MainState(TypedDict):
    question: str
    answer: str


def call_research(state: MainState) -> dict:
    out = research.invoke({"query": state["question"]})   # explicit mapping in and out
    return {"answer": out["result"]}


main_builder = StateGraph(MainState)
main_builder.add_node("research", call_research)
main_builder.add_edge(START, "research")
print(main_builder.compile().invoke({"question": "flaky tests"}))
# {'question': 'flaky tests', 'answer': '3 docs about flaky tests'}
```

- Compile only the **parent** with a checkpointer — it is propagated to subgraphs, so interrupts inside a subgraph work.
- A subgraph added as a node returns its **whole output state** to the parent. If a shared key has an `operator.add` reducer, values the subgraph received from the parent are appended **again**. Give the subgraph an `output_schema` with only the keys it produces, or use separate keys.
- Stream subgraph events with `stream(..., subgraphs=True)`; inspect them with `get_state(config, subgraphs=True)`.

## Functional API (Alternative Syntax)

`@entrypoint` and `@task` give the same runtime (checkpointing, interrupts, streaming) with ordinary Python control flow instead of explicit edges.

```python
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.func import entrypoint, task


@task
def run_check(endpoint: str) -> str:
    return f"{endpoint}: ok"


@entrypoint(checkpointer=InMemorySaver())
def smoke_suite(endpoints: list[str]) -> list[str]:
    futures = [run_check(e) for e in endpoints]     # tasks run in parallel
    return [f.result() for f in futures]


print(smoke_suite.invoke(["/login", "/cart"], {"configurable": {"thread_id": "run-1"}}))
```

Use the Graph API when you want a visible, inspectable structure (diagrams, per-node tests, per-node policies); use the Functional API to add durability to existing procedural code.

## Design Checklist

- [ ] Every key has a clear owner node; keys written in parallel have reducers
- [ ] Public input/output schemas hide internal scratch keys
- [ ] Routing lives in named functions with `Literal` return types
- [ ] Every loop has an explicit exit condition (score, counter, `END`)
- [ ] Message history has a trimming strategy (`RemoveMessage`, summarisation)
- [ ] Subgraphs expose only the keys they produce
- [ ] Nodes return partial updates, never the full state

---
## See also
- [LangGraph — Stateful Agent Orchestration](./index.md)
- [LangGraph — Persistence, Memory & Interrupts](./02-persistence-memory-interrupts.md)
- [LangChain — LangGraph & Production](../langchain/06-langgraph-production.md)
- [Pydantic](../pydantic/index.md)
- [Agentic AI — Multi-Agent Architecture Patterns](../../agentic-ai-architecture/02-multi-agent-patterns.md)
