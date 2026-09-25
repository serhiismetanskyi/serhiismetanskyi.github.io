---
date: 2026-09-16
tags:
  - python
  - libraries
  - langchain
  - llm
---

# LangChain — LangGraph & Production

## LangGraph Overview

LangGraph models agent logic as a **directed graph with cycles**. Unlike linear LCEL chains, LangGraph supports loops, conditional branching, human-in-the-loop, and persistent state — essential for production agents.

```bash
uv add langgraph
```

---

## Core Concepts

| Concept | Description |
|---------|-------------|
| **State** | `TypedDict` holding all data flowing through the graph |
| **Nodes** | Python functions that read state and return updates |
| **Edges** | Connections between nodes (static or conditional) |
| **Checkpointer** | Persists state at each step for recovery and debugging |

---

## Basic StateGraph

```python
from typing import Annotated, TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    messages: Annotated[list, add_messages]
    next_step: str


def chatbot(state: AgentState) -> dict:
    response = model.invoke(state["messages"])
    return {"messages": [response]}


graph = StateGraph(AgentState)
graph.add_node("chatbot", chatbot)
graph.add_edge(START, "chatbot")
graph.add_edge("chatbot", END)

app = graph.compile()
result = app.invoke({"messages": [("human", "Hello!")]})
```

`Annotated[list, add_messages]` merges new messages into the list instead of overwriting.

---

## Conditional Edges

```python
from langgraph.graph import END


def should_use_tool(state: AgentState) -> str:
    last_message = state["messages"][-1]
    if last_message.tool_calls:
        return "tools"
    return END


graph.add_conditional_edges("agent", should_use_tool, {"tools": "tools", END: END})
```

Conditional edges route to different nodes based on state — enables decision loops and tool retry patterns.

---

## Agent with Tools

```python
from typing import Annotated, TypedDict

from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode


class State(TypedDict):
    messages: Annotated[list, add_messages]


tools = [search_database, get_weather]
model = ChatOpenAI(model="gpt-4o-mini").bind_tools(tools)


def agent(state: State) -> dict:
    return {"messages": [model.invoke(state["messages"])]}


def should_continue(state: State) -> str:
    if state["messages"][-1].tool_calls:
        return "tools"
    return END


graph = StateGraph(State)
graph.add_node("agent", agent)
graph.add_node("tools", ToolNode(tools))

graph.add_edge(START, "agent")
graph.add_conditional_edges("agent", should_continue)
graph.add_edge("tools", "agent")

app = graph.compile()
```

The agent calls the LLM, which decides on tool calls. `ToolNode` executes them. The loop continues until the LLM responds without tool calls.

---

## Checkpointing (State Persistence)

```python
from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.sqlite import SqliteSaver

memory = MemorySaver()
app = graph.compile(checkpointer=memory)

result = app.invoke(
    {"messages": [("human", "What's the weather?")]},
    config={"configurable": {"thread_id": "session_001"}},
)
```

| Checkpointer | Use case |
|--------------|----------|
| `MemorySaver` | Development, testing |
| `SqliteSaver` | Local persistence |
| `PostgresSaver` | Production multi-instance |
| `RedisSaver` | Fast, shared state |

Each `thread_id` maintains independent conversation state.

---

## Human-in-the-Loop

```python
app = graph.compile(
    checkpointer=memory,
    interrupt_before=["tools"],
)

result = app.invoke(
    {"messages": [("human", "Delete all users")]},
    config={"configurable": {"thread_id": "admin_001"}},
)

# Review pending tool calls, then resume or modify
app.invoke(None, config={"configurable": {"thread_id": "admin_001"}})
```

`interrupt_before` pauses execution before a node runs — useful for approval gates on dangerous operations.

---

## LangSmith Observability

```bash
export LANGCHAIN_TRACING_V2=true
export LANGCHAIN_API_KEY=your-key
export LANGCHAIN_PROJECT=my-project
```

```python
from langsmith import Client

client = Client()
```

| Feature | Purpose |
|---------|---------|
| Tracing | Visualize full chain/agent execution flow |
| Evaluation | Run test datasets against chains |
| Monitoring | Track latency, cost, error rates |
| Datasets | Manage test cases for regression testing |
| Annotation | Human feedback on outputs |

---

## Error Handling Patterns

```python
from langchain_openai import ChatOpenAI

model = ChatOpenAI(model="gpt-4o").with_retry(
    stop_after_attempt=3,
    wait_exponential_jitter=True,
)

resilient = ChatOpenAI(model="gpt-4o").with_fallbacks([
    ChatOpenAI(model="gpt-4o-mini"),
])
```

### Agent Iteration Limits

```python
app = graph.compile(checkpointer=memory)
result = app.invoke(
    {"messages": messages},
    config={
        "configurable": {"thread_id": "t1"},
        "recursion_limit": 25,
    },
)
```

---

## Production Checklist

| Area | Practice |
|------|----------|
| **Retry** | `.with_retry()` on all LLM and tool calls |
| **Fallbacks** | `.with_fallbacks()` with alternate models |
| **Timeouts** | Set `timeout` on model init |
| **Limits** | `recursion_limit` and `max_iterations` |
| **Persistence** | PostgresSaver / RedisSaver for checkpointing |
| **Tracing** | LangSmith enabled in all environments |
| **Streaming** | Use `.astream()` for responsive UIs |
| **Testing** | LangSmith datasets for regression tests |
| **Secrets** | API keys via env vars, never hardcoded |
| **Cost** | Track token usage via LangSmith monitoring |

---

## When to Use What

| Scenario | Solution |
|----------|----------|
| Simple prompt → response | LCEL chain |
| RAG Q&A | LCEL retrieval chain |
| Multi-step tool use | LangGraph agent |
| Approval workflows | LangGraph + `interrupt_before` |
| Long-running tasks | LangGraph + checkpointing |
| Parallel tool execution | LangGraph with parallel nodes |
| Monitoring & debugging | LangSmith tracing |

---

## Checkpointer Packages by Backend

```bash
uv add langgraph-checkpoint-sqlite
uv add langgraph-checkpoint-postgres
uv add langgraph-checkpoint-redis
```

Choose the backend based on operational needs and failover requirements.

## Resume and Time-Travel

Use `thread_id` for normal resume, and `checkpoint_id` for replay/debug from a specific point.

```python
debug_config = {
    "configurable": {
        "thread_id": "session_001",
        "checkpoint_id": "checkpoint-abc123",
    }
}
```

## Recursion Limit Notes

Set `recursion_limit` intentionally for deep graphs and monitor for accidental loops:

```python
result = app.invoke(input_data, config={"recursion_limit": 100})
```

If limits are reached frequently, inspect conditional edges for non-terminating branches.

---

## Multi-Agent Supervisor Pattern

Use a supervisor when one agent should delegate tasks to specialized subagents.

### Typical flow

1. Supervisor receives user goal.
2. Supervisor routes tasks to specialist subagents.
3. Subagents return structured outputs.
4. Supervisor merges results and produces final answer.

### Practical rules

- Keep supervisor deterministic (`temperature=0`).
- Force subagent outputs into strict schemas.
- Limit delegation depth to avoid recursive loops.
- Tag traces per role (`agent=supervisor`, `agent=researcher`, etc.).

This pattern fits complex tasks where one prompt cannot reliably decide all steps.

---

## Plain-Language Summary

LangGraph is a workflow engine for agent logic:

- **state** stores current data;
- **nodes** perform work;
- **edges** decide where to go next;
- **checkpointer** lets you pause/resume safely.

Use it when business flow is not strictly linear.

## Minimum Production Baseline

Before real users, ensure all of the following:

1. Persistent checkpointer (`PostgresSaver` or `RedisSaver`).
2. Stable `thread_id` strategy per conversation/session.
3. `recursion_limit` and iteration limits configured.
4. Human approval gates for risky tool actions.
5. Full tracing in LangSmith with tags and metadata.

## Common Failure Modes

| Problem | Typical cause | Fix |
|--------|----------------|-----|
| Graph loops forever | Missing/incorrect stop edge | Add explicit terminal condition |
| Resume does not work | New `thread_id` each call | Reuse same `thread_id` for session |
| State is lost after restart | In-memory checkpointer in prod | Use persistent backend |
| Expensive runs | Unlimited loops/tool calls | Set limits and tighter routing logic |
