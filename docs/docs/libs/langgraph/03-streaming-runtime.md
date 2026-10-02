---
date: 2026-09-29
tags:
  - python
  - libraries
  - langgraph
  - ai-agents
  - llm
---

# LangGraph — Streaming & Runtime

How to watch a graph while it runs, pass per-run dependencies into nodes, and make nodes resilient: retries, caching, timeouts, error handlers and step limits.

## Stream Modes

`graph.stream(input, config, stream_mode=...)` (and `astream`) yields events while the graph runs.

| Mode | Yields | Typical use |
|------|--------|-------------|
| `values` | Full state after each super-step | Debugging, simple UIs |
| `updates` | `{node_name: update}` per node | Progress ("planning… searching…"), test assertions on the path |
| `messages` | `(message_chunk, metadata)` for LLM tokens from any node | Chat UIs, token streaming |
| `custom` | Whatever a node writes with the stream writer | Tool progress, partial results |
| `checkpoints` | A snapshot each time a checkpoint is saved | Audit, live state inspectors |
| `tasks` | Task start / finish events with results and errors | Execution timelines |
| `debug` | All of the above, verbose | Deep debugging only |

```python
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage
from langgraph.config import get_stream_writer
from langgraph.graph import START, MessagesState, StateGraph

model = GenericFakeChatModel(messages=iter([AIMessage(content="Three edge cases found")]))


def assistant(state: MessagesState) -> dict:
    writer = get_stream_writer()
    writer({"progress": "calling model"})                 # -> "custom" stream
    return {"messages": [model.invoke(state["messages"])]}


builder = StateGraph(MessagesState)
builder.add_node("assistant", assistant)
builder.add_edge(START, "assistant")
graph = builder.compile()

for mode, chunk in graph.stream(
    {"messages": [("user", "Find edge cases for the login form")]},
    stream_mode=["updates", "custom", "messages"],       # several modes -> (mode, chunk) tuples
):
    if mode == "messages":
        token, metadata = chunk
        print(f"token from {metadata['langgraph_node']}: {token.content!r}")
    elif mode == "custom":
        print("custom:", chunk)
    else:
        print("update from:", list(chunk))
# custom: {'progress': 'calling model'}
# token from assistant: 'Three'
# token from assistant: ' '
# ...
# update from: ['assistant']
```

- One mode → the chunk itself; a list of modes → `(mode, chunk)`; `subgraphs=True` adds a namespace in front: `(namespace, chunk)` or `(namespace, mode, chunk)`.
- `messages` mode works even when the node calls `model.invoke()` — LangGraph captures tokens through callbacks. Filter by `metadata["langgraph_node"]` or by model `tags` to show only the final answer.
- `get_stream_writer()` is a no-op outside a streaming run, so the node still works under `invoke()`.

### Typed Stream Parts (`version="v2"`)

Newer releases can emit uniform dicts instead of tuples — easier to route in UIs and to assert in tests:

```python
model = GenericFakeChatModel(messages=iter([AIMessage(content="ok")]))

for part in graph.stream({"messages": [("user", "hi")]},
                         stream_mode=["updates", "custom"], version="v2"):
    print(part["type"], part["ns"], part["data"])
# custom () {'progress': 'calling model'}
# updates () {'assistant': {'messages': [AIMessage(...)]}}
```

`invoke(..., version="v2")` returns a `GraphOutput` with `.value` and `.interrupts` instead of a dict with an `__interrupt__` key. The default is still `"v1"`; examples in this guide use it.

## Async

```python
import asyncio

model = GenericFakeChatModel(messages=iter([AIMessage(content="async answer")]))


async def main() -> None:
    async for update in graph.astream({"messages": [("user", "hi")]}, stream_mode="updates"):
        print(update["assistant"]["messages"][-1].content)     # async answer


asyncio.run(main())
```

- Define nodes as `async def` when they do I/O; call `await model.ainvoke(...)` inside.
- Parallel branches of an async graph run concurrently on the event loop; limit fan-out with `config={"max_concurrency": 5}`.
- Use async checkpointers (`AsyncPostgresSaver`, `AsyncSqliteSaver`) with `ainvoke` / `astream`.

## Runtime Context and Config

Per-run dependencies (user, tenant, model name, feature flags, a DB client) go into a **context** object — not into state (they are not persisted) and not into globals.

```python
from dataclasses import dataclass
from typing import TypedDict

from langchain_core.runnables import RunnableConfig
from langgraph.graph import START, StateGraph
from langgraph.runtime import Runtime


@dataclass
class Context:
    tenant: str
    model_name: str = "claude-sonnet-5"


class AnswerState(TypedDict):
    question: str
    answer: str


def answer(state: AnswerState, runtime: Runtime[Context], config: RunnableConfig) -> dict:
    thread = config["configurable"].get("thread_id", "-")
    return {"answer": f"[{runtime.context.tenant}/{runtime.context.model_name}/{thread}] {state['question']}"}


builder = StateGraph(AnswerState, context_schema=Context)
builder.add_node("answer", answer)
builder.add_edge(START, "answer")
graph = builder.compile()

result = graph.invoke(
    {"question": "status?"},
    config={"configurable": {"thread_id": "t-1"}, "tags": ["qa"], "metadata": {"suite": "smoke"}},
    context=Context(tenant="acme"),
)
print(result["answer"])        # [acme/claude-sonnet-5/t-1] status?
```

| Node parameter | Gives access to |
|----------------|-----------------|
| `state` | Current state (always first) |
| `runtime: Runtime[Context]` | `context`, `store`, `stream_writer`, `previous` (Functional API), `heartbeat` |
| `config: RunnableConfig` | `configurable` (`thread_id`, `checkpoint_id`), `tags`, `metadata`, `callbacks`, `recursion_limit` |

`tags` and `metadata` from `config` show up in LangSmith / Phoenix / Langfuse traces — put `test_run_id`, suite and case IDs there.

## Retries

```python
from typing import TypedDict

from langgraph.graph import START, StateGraph
from langgraph.types import RetryPolicy

attempts = {"count": 0}


class FetchState(TypedDict):
    payload: str


def fetch_ticket(state: FetchState) -> dict:
    attempts["count"] += 1
    if attempts["count"] < 3:
        raise ConnectionError("tracker unavailable")
    return {"payload": "T-812"}


builder = StateGraph(FetchState)
builder.add_node(
    "fetch_ticket",
    fetch_ticket,
    retry_policy=RetryPolicy(max_attempts=3, initial_interval=0.1, retry_on=ConnectionError),
)
builder.add_edge(START, "fetch_ticket")
print(builder.compile().invoke({"payload": ""}), attempts)   # {'payload': 'T-812'} {'count': 3}
```

| `RetryPolicy` field | Default |
|---------------------|---------|
| `max_attempts` | `3` |
| `initial_interval` / `backoff_factor` / `max_interval` | `0.5` s / `2.0` / `128` s |
| `jitter` | `True` |
| `retry_on` | Exception class(es) or a predicate; the default retries connection errors and HTTP 5xx, not `ValueError`, `TypeError`, etc. |

Retries re-run the **whole node**. Keep nodes that call external systems small so a retry does not repeat expensive LLM calls.

## Node Caching

```python
from langgraph.cache.memory import InMemoryCache
from langgraph.types import CachePolicy

calls = {"count": 0}


class DocState(TypedDict):
    text: str


def expensive_summary(state: DocState) -> dict:
    calls["count"] += 1
    return {"text": state["text"].upper()}


builder = StateGraph(DocState)
builder.add_node("summary", expensive_summary, cache_policy=CachePolicy(ttl=300))
builder.add_edge(START, "summary")
graph = builder.compile(cache=InMemoryCache())

graph.invoke({"text": "same input"})
print(list(graph.stream({"text": "same input"}, stream_mode="updates")))
# [{'summary': {'text': 'SAME INPUT'}, '__metadata__': {'cached': True}}]
print(calls["count"])      # 1
```

The cache key is the node input by default (`CachePolicy(key_func=...)` to customise). Useful for deterministic, expensive steps in eval runs; do not cache nodes with side effects.

## Timeouts and Error Handlers

Recent releases add per-node **timeouts** and **error handlers** to `add_node` (and graph-wide defaults via `builder.set_node_defaults(...)`).

```python
import asyncio
from typing import TypedDict

from langgraph.errors import NodeError, NodeTimeoutError
from langgraph.graph import START, StateGraph


class JobState(TypedDict):
    status: str


async def slow_tool(state: JobState) -> dict:
    await asyncio.sleep(5)
    return {"status": "done"}


def broken_step(state: JobState) -> dict:
    raise ValueError("unexpected payload")


def recover(state: JobState, error: NodeError) -> dict:
    return {"status": f"fallback after {error.node}: {error.error}"}


timeout_builder = StateGraph(JobState)
timeout_builder.add_node("slow_tool", slow_tool, timeout=0.2)        # seconds; async nodes only
timeout_builder.add_edge(START, "slow_tool")


async def run_with_timeout() -> None:
    try:
        await timeout_builder.compile().ainvoke({"status": "new"})
    except NodeTimeoutError as exc:
        print(exc)          # Node 'slow_tool' exceeded its run timeout of 0.200s ...


asyncio.run(run_with_timeout())

handler_builder = StateGraph(JobState)
handler_builder.add_node("broken_step", broken_step, error_handler=recover)
handler_builder.add_edge(START, "broken_step")
print(handler_builder.compile().invoke({"status": "new"}))
# {'status': 'fallback after broken_step: unexpected payload'}
```

- Timeouts rely on asyncio cancellation: a sync node with `timeout=` is rejected with a `ValueError`. `NodeTimeoutError` is retryable by the default `RetryPolicy`.
- The error handler runs after retries are exhausted and can return an update or a `Command` (e.g. route to a "notify human" node).
- These APIs are new — pin your `langgraph` version and check the changelog before relying on them.

## Recursion Limit

Each super-step counts as one step. When the limit is reached, the run fails with `GraphRecursionError`.

```python
from typing import TypedDict

from langgraph.errors import GraphRecursionError
from langgraph.graph import START, StateGraph
from langgraph.managed import RemainingSteps


class LoopState(TypedDict):
    attempts: int
    remaining_steps: RemainingSteps        # managed value, filled by LangGraph


def try_fix(state: LoopState) -> dict:
    return {"attempts": state["attempts"] + 1}


def should_stop(state: LoopState) -> str:
    return "__end__" if state["remaining_steps"] <= 2 else "try_fix"


builder = StateGraph(LoopState)
builder.add_node("try_fix", try_fix)
builder.add_edge(START, "try_fix")
builder.add_conditional_edges("try_fix", should_stop)
graph = builder.compile()

print(graph.invoke({"attempts": 0}, {"recursion_limit": 10}))   # {'attempts': 8}: stopped gracefully

endless = StateGraph(LoopState)
endless.add_node("try_fix", try_fix)
endless.add_edge(START, "try_fix")
endless.add_edge("try_fix", "try_fix")
try:
    endless.compile().invoke({"attempts": 0}, {"recursion_limit": 5})
except GraphRecursionError as exc:
    print("limit hit:", str(exc)[:40])
```

!!! warning "The default limit is high"
    Older LangGraph versions defaulted to 25 steps; `langgraph` 1.2 defaults to 10,007 (env `LANGGRAPH_DEFAULT_RECURSION_LIMIT`), and `create_agent` graphs use 9,999. A looping agent will burn tokens for a long time before failing — always pass an explicit `recursion_limit` and an iteration counter or `RemainingSteps` check.

## Runtime Checklist

- [ ] UI and tests consume `updates` (path) and `messages` (tokens), not repeated `invoke` calls
- [ ] Per-run dependencies passed via `context`, not globals or state
- [ ] `tags` / `metadata` in config carry run, suite and case IDs
- [ ] Nodes calling external systems have a `RetryPolicy` with an explicit `retry_on`
- [ ] Async I/O nodes have timeouts; long fan-outs use `max_concurrency`
- [ ] Explicit `recursion_limit` on every invocation; loops also check a counter or `RemainingSteps`

---
## See also
- [LangGraph — Stateful Agent Orchestration](./index.md)
- [LangGraph — Persistence, Memory & Interrupts](./02-persistence-memory-interrupts.md)
- [LangGraph — Multi-Agent Patterns](./04-multi-agent-patterns.md)
- [LangChain — Models, Prompts & Parsers](../langchain/01-models-prompts-parsers.md)
- [HTTPX](../httpx/index.md)
- [Resilience — Retries, Fallbacks, Semaphores & Race Conditions](../resilience/index.md)
