---
date: 2026-09-29
tags:
  - python
  - libraries
  - langgraph
  - ai-agents
  - llm
---

# LangGraph — Persistence, Memory & Interrupts

A checkpointer turns a graph into a **durable, resumable process**: state is saved after every super-step per `thread_id`. That one feature powers conversation memory, human-in-the-loop, fault recovery and time-travel debugging. The checkpointer basics (`MemorySaver`, `thread_id`, `interrupt_before`, backend packages) are in [LangChain — LangGraph & Production](../langchain/06-langgraph-production.md); this page covers what is built on top.

## Checkpointers

| Class | Package | Use |
|-------|---------|-----|
| `InMemorySaver` (alias `MemorySaver`) | `langgraph` | Unit tests, notebooks — lost on restart |
| `SqliteSaver` / `AsyncSqliteSaver` | `langgraph-checkpoint-sqlite` | Local apps, single process, CI integration tests |
| `PostgresSaver` / `AsyncPostgresSaver` | `langgraph-checkpoint-postgres` | Production, many workers |

```python
from langgraph.checkpoint.sqlite import SqliteSaver

with SqliteSaver.from_conn_string(":memory:") as checkpointer:   # or "checkpoints.db"
    ...  # graph = builder.compile(checkpointer=checkpointer)
```

```python
from langgraph.checkpoint.postgres import PostgresSaver

DB_URI = "postgresql://app:secret@localhost:5432/agents"

with PostgresSaver.from_conn_string(DB_URI) as checkpointer:
    checkpointer.setup()          # creates tables / runs migrations — call once (deploy step)
    graph = builder.compile(checkpointer=checkpointer)
```

Use the async variant (`AsyncPostgresSaver`, `AsyncSqliteSaver`) with `ainvoke` / `astream`.

### Durability Modes

`invoke` / `stream` accept `durability=`:

| Mode | Checkpoint written | Trade-off |
|------|--------------------|-----------|
| `"async"` (default) | In the background while the next step runs | Fast; a crash can lose the last step |
| `"sync"` | Before the next step starts | Safest, slower |
| `"exit"` | Only when the run finishes or interrupts | Fastest; no mid-run recovery |

## Threads and State Snapshots

```python
import operator
from typing import Annotated, TypedDict

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import START, StateGraph


class PipelineState(TypedDict):
    steps: Annotated[list[str], operator.add]


builder = StateGraph(PipelineState)
builder.add_node("plan", lambda s: {"steps": ["plan"]})
builder.add_node("act", lambda s: {"steps": ["act"]})
builder.add_edge(START, "plan")
builder.add_edge("plan", "act")
graph = builder.compile(checkpointer=InMemorySaver())

config = {"configurable": {"thread_id": "run-42"}}
graph.invoke({"steps": []}, config)

snapshot = graph.get_state(config)
print(snapshot.values)      # {'steps': ['plan', 'act']}
print(snapshot.next)        # () -> nothing left to run

for state in graph.get_state_history(config):          # newest first
    print(state.metadata["step"], state.next, state.values)
# 2 () {'steps': ['plan', 'act']}
# 1 ('act',) {'steps': ['plan']}
# 0 ('plan',) {'steps': []}
# -1 ('__start__',) {'steps': []}
```

| `StateSnapshot` field | Meaning |
|-----------------------|---------|
| `values` | State at this checkpoint |
| `next` | Nodes that will run next (`()` = finished) |
| `config` | Contains `thread_id` and `checkpoint_id` — pass it back to resume from here |
| `metadata` | `step`, `source` (`input`, `loop`, `update`), writes |
| `tasks` | Pending tasks, including errors and interrupts |
| `interrupts` | Pending `Interrupt` objects |
| `parent_config`, `created_at` | Lineage and timestamp |

## Time-Travel: Replay and Fork

```python
before_act = next(s for s in graph.get_state_history(config) if s.next == ("act",))

# Replay: re-run from that checkpoint (nodes after it execute again)
print(graph.invoke(None, before_act.config))         # {'steps': ['plan', 'act']}

# Fork: change state at that point, then continue on a new branch of the same thread
fork_config = graph.update_state(before_act.config, {"steps": ["edited"]})
print(graph.invoke(None, fork_config))                # {'steps': ['plan', 'edited', 'act']}
```

- `invoke(None, config)` means "continue from the checkpoint in `config`" — no new input.
- `update_state(config, values, as_node="...")` applies `values` **through the reducers**, as if node `as_node` had returned them; routing then continues from that node. This is also how you inject a fake node result in tests.
- The original history is kept — forks add checkpoints, they do not rewrite them.

## Short-Term Memory (Per Thread)

Conversation history lives in thread state (`messages` with `add_messages`). Keep it bounded:

```python
from langchain_core.messages import RemoveMessage
from langgraph.graph import MessagesState


def trim_history(state: MessagesState) -> dict:
    """Keep the last 6 messages in the checkpoint."""
    old = state["messages"][:-6]
    return {"messages": [RemoveMessage(id=m.id) for m in old]}
```

Deleting changes the stored state. To keep full history but send less to the model, trim only the model input with `langchain_core.messages.trim_messages(...)` inside the model node. A tool-calling history must stay valid: never drop a `ToolMessage` without the `AIMessage` that requested it (providers reject it).

## Long-Term Memory with `Store`

Checkpoints are per thread. A **store** keeps data **across threads** — user preferences, learned facts, test-environment notes — organised by namespace tuples.

```python
import uuid
from dataclasses import dataclass
from typing import TypedDict

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import START, StateGraph
from langgraph.runtime import Runtime
from langgraph.store.memory import InMemoryStore


@dataclass
class Context:
    user_id: str


class NoteState(TypedDict):
    note: str
    known: list[str]


def remember(state: NoteState, runtime: Runtime[Context]) -> dict:
    namespace = ("memories", runtime.context.user_id)
    if state["note"]:
        runtime.store.put(namespace, str(uuid.uuid4()), {"text": state["note"]})
    return {"known": [item.value["text"] for item in runtime.store.search(namespace)]}


builder = StateGraph(NoteState, context_schema=Context)
builder.add_node("remember", remember)
builder.add_edge(START, "remember")

store = InMemoryStore()
graph = builder.compile(checkpointer=InMemorySaver(), store=store)

graph.invoke({"note": "prefers pytest", "known": []},
             {"configurable": {"thread_id": "chat-1"}}, context=Context(user_id="u1"))
result = graph.invoke({"note": "", "known": []},
                      {"configurable": {"thread_id": "chat-2"}}, context=Context(user_id="u1"))
print(result["known"])       # ['prefers pytest'] — visible from another thread
```

| Store API | Purpose |
|-----------|---------|
| `put(namespace, key, value)` | Create or replace a JSON document |
| `get(namespace, key)` | One `Item` (`.value`, `.created_at`, `.updated_at`) or `None` |
| `search(namespace_prefix, query=..., filter=..., limit=...)` | List / filter; semantic search when an index is configured |
| `delete(namespace, key)` | Remove |
| `list_namespaces(prefix=...)` | Discover namespaces |

Semantic search needs an embedding index:

```python
from langchain.embeddings import init_embeddings
from langgraph.store.memory import InMemoryStore

store = InMemoryStore(index={
    "embed": init_embeddings("openai:text-embedding-3-small"),
    "dims": 1536,
    "fields": ["text"],                     # which JSON fields to embed
})
hits = store.search(("memories", "u1"), query="which test runner?", limit=3)
```

For production use `PostgresStore` (`langgraph.store.postgres`, from `langgraph-checkpoint-postgres`, needs `pgvector` for semantic search). Namespace by tenant and user so one user's memories never reach another — and test that isolation.

## Interrupts: Human-in-the-Loop

`interrupt(payload)` pauses the graph inside a node and returns `payload` to the caller. The caller resumes with `Command(resume=value)`; `interrupt()` then returns `value`. Resuming requires a checkpointer and the same `thread_id`.

```python
from typing import TypedDict

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt


class ReleaseState(TypedDict):
    version: str
    approved: bool
    comment: str


def approval_gate(state: ReleaseState) -> dict:
    decision = interrupt({"question": "Deploy to production?", "version": state["version"]})
    return {"approved": decision["approved"], "comment": decision.get("comment", "")}


def deploy(state: ReleaseState) -> dict:
    return {"comment": f"deployed {state['version']}"}


def route(state: ReleaseState) -> str:
    return "deploy" if state["approved"] else END


builder = StateGraph(ReleaseState)
builder.add_node("approval_gate", approval_gate)
builder.add_node("deploy", deploy)
builder.add_edge(START, "approval_gate")
builder.add_conditional_edges("approval_gate", route, ["deploy", END])
graph = builder.compile(checkpointer=InMemorySaver())

config = {"configurable": {"thread_id": "release-1.4.0"}}
result = graph.invoke({"version": "1.4.0", "approved": False, "comment": ""}, config)
print(result["__interrupt__"][0].value)     # {'question': 'Deploy to production?', 'version': '1.4.0'}
print(graph.get_state(config).next)          # ('approval_gate',)

result = graph.invoke(Command(resume={"approved": True}), config)
print(result["comment"])                     # deployed 1.4.0
```

### Rules That Bite

| Rule | Consequence |
|------|-------------|
| On resume the **node restarts from its first line** | Code before `interrupt()` runs again — make it idempotent or move side effects to another node |
| Several `interrupt()` calls in one node are matched **by order** | Do not call `interrupt()` conditionally in a way that changes the order between runs |
| Parallel nodes can interrupt at the same time | Resume all at once: `Command(resume={i.id: value for i in interrupts})` |
| `interrupt()` works by raising a special exception | A bare `try/except Exception` around it swallows the pause — catch specific exceptions only |
| Payload and resume value must be JSON-serialisable | Needed for persistent checkpointers and the server API |

```python
import operator
from typing import Annotated, TypedDict

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import START, StateGraph
from langgraph.types import Command, interrupt


class ReviewState(TypedDict):
    answers: Annotated[list[str], operator.add]


def legal_review(state: ReviewState) -> dict:
    return {"answers": [f"legal: {interrupt('Legal OK?')}"]}


def security_review(state: ReviewState) -> dict:
    return {"answers": [f"security: {interrupt('Security OK?')}"]}


builder = StateGraph(ReviewState)
builder.add_node("legal", legal_review)
builder.add_node("security", security_review)
builder.add_edge(START, "legal")
builder.add_edge(START, "security")
graph = builder.compile(checkpointer=InMemorySaver())

config = {"configurable": {"thread_id": "review-7"}}
pending = graph.invoke({"answers": []}, config)["__interrupt__"]
answers = {i.id: "yes" for i in pending}
print(graph.invoke(Command(resume=answers), config))
# {'answers': ['legal: yes', 'security: yes']}
```

### Common HITL Patterns

| Pattern | Resume value | Node logic |
|---------|--------------|------------|
| Approve / reject | `{"approved": bool}` | Route to action or `END` |
| Edit before continue | Edited payload | Return the edited values as the update |
| Validate human input | Raw text | Loop: `while not valid: value = interrupt(error_message)` |
| Review a tool call | Decision per call | Use `HumanInTheLoopMiddleware` in `create_agent` ([04](./04-multi-agent-patterns.md)) |

Static breakpoints — `compile(interrupt_before=[...])` / `interrupt_after=[...]` — pause around whole nodes without code changes. Good for debugging and step-through tests; for product approval flows prefer `interrupt()`, which carries a payload and a typed answer.

## Checklist

- [ ] Persistent checkpointer (`PostgresSaver`) in every non-test environment, `setup()` run at deploy time
- [ ] `thread_id` strategy documented (per conversation, per ticket, per test)
- [ ] Code before each `interrupt()` is idempotent
- [ ] Interrupt payloads and resume values are JSON-serialisable and versioned
- [ ] Message history is trimmed or summarised; tool-call pairs are kept intact
- [ ] Store namespaces include tenant and user; isolation is covered by a test
- [ ] Old threads and checkpoints have a retention policy

---
## See also
- [LangGraph — Stateful Agent Orchestration](./index.md)
- [LangGraph — Graph Design & State](./01-graph-design-state.md)
- [LangGraph — Streaming & Runtime](./03-streaming-runtime.md)
- [LangChain — Memory & State](../langchain/05-memory-state.md)
- [Agentic AI — Memory & RAG](../../agentic-ai-architecture/03-memory-rag.md)
