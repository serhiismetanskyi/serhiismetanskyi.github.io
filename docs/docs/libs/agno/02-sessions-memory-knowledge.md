---
date: 2026-09-30 12:00:00
tags:
  - python
  - libraries
  - agno
  - ai-agents
  - llm
  - rag
---

# Agno — Sessions, Memory & Knowledge

Without a `db`, an Agno agent keeps nothing between runs. With one, it stores **sessions** (every run with its messages), **session state**, **user memories** and **session summaries**, and can add each of them to the next prompt. **Knowledge** is separate: a vector DB with an embedder that the agent searches for RAG.

| Feature | Scope | Key parameters |
|---------|-------|----------------|
| Chat history | One `session_id` | `db`, `add_history_to_context`, `num_history_runs` / `num_history_messages` |
| Session state | One `session_id` | `session_state`, `add_session_state_to_context`, `enable_agentic_state` |
| Session summary | One `session_id` | `enable_session_summaries`, `add_session_summary_to_context` |
| User memories | One `user_id`, across sessions | `update_memory_on_run`, `enable_agentic_memory`, `add_memories_to_context`, `memory_manager` |
| Past sessions | One `user_id` | `search_past_sessions`, `num_past_sessions_to_search` |
| Knowledge (RAG) | Everyone (or filtered) | `knowledge`, `search_knowledge`, `add_knowledge_to_context`, `knowledge_filters` |

## Storage Backends

One `db` object stores sessions, memories, metrics, eval results, traces and knowledge contents in separate tables.

```python
from agno.db.in_memory import InMemoryDb
from agno.db.postgres import PostgresDb
from agno.db.sqlite import SqliteDb

db = SqliteDb(db_file="tmp/agents.db")                                         # local dev, tests
db = PostgresDb(db_url="postgresql+psycopg://ai:ai@localhost:5432/ai")         # production
db = InMemoryDb()                                                              # process lifetime only
```

| Backend | Import | Extra |
|---------|--------|-------|
| `SqliteDb`, `AsyncSqliteDb` | `agno.db.sqlite` | `agno[sqlite]` + `sqlalchemy[asyncio]` |
| `PostgresDb` | `agno.db.postgres` | `agno[postgres]` |
| `AsyncPostgresDb` | `agno.db.async_postgres` | `agno[async-postgres]` |
| `MySQLDb`, `MongoDb`, `RedisDb`, `DynamoDb`, `FirestoreDb`, `JsonDb`, `GcsJsonDb`, … | `agno.db.<name>` | matching extra |
| `InMemoryDb` | `agno.db.in_memory` | none |

Table names can be overridden (`session_table=`, `memory_table=`, …) — useful to separate test data.

## Sessions and Chat History

```python
from agno.agent import Agent
from agno.db.sqlite import SqliteDb

agent = Agent(
    id="support-agent",
    model="openai:gpt-5-mini",
    db=SqliteDb(db_file="tmp/agents.db"),
    add_history_to_context=True,          # off by default, even with a db
    num_history_runs=3,                   # last 3 runs of this session
)

agent.run("My name is Ann", user_id="u-1", session_id="s-1")
run = agent.run("What is my name?", user_id="u-1", session_id="s-1")
# messages sent to the model: [user "My name is Ann", assistant "...", user "What is my name?"]

session = agent.get_session(session_id="s-1")                 # AgentSession: user_id, runs, session_data, summary
history = agent.get_chat_history(session_id="s-1")            # list[Message]
```

- History is loaded from the database, so a new `Agent` instance — another process, another pod — continues the same session.
- Without `session_id`, each `run()` gets a new random session; pass the ID explicitly in every multi-turn flow.
- `read_chat_history=True` gives the model a `get_chat_history` tool instead of (or in addition to) injecting history.
- `num_history_messages` limits by messages, `max_tool_calls_from_history` trims old tool calls.

## Session State

State is a dict per session, saved with the session and available to tools via `RunContext`:

```python
from agno.agent import Agent
from agno.db.sqlite import SqliteDb
from agno.run import RunContext


def add_item(run_context: RunContext, item: str) -> str:
    """Add an item to the shopping list."""
    run_context.session_state.setdefault("items", []).append(item)
    return f"added {item}"


agent = Agent(
    model="openai:gpt-5-mini",
    db=SqliteDb(db_file="tmp/agents.db"),
    tools=[add_item],
    session_state={"items": []},              # initial state for new sessions
    add_session_state_to_context=True,        # adds <session_state>...</session_state> to the system message
)

agent.run("Add milk", session_id="cart-1")
agent.get_session_state(session_id="cart-1")   # {'items': ['milk'], 'current_session_id': 'cart-1', ...}
```

- Agno adds `current_session_id` and `current_run_id` keys to the state — compare specific keys in tests, not the whole dict.
- `enable_agentic_state=True` gives the model an `update_session_state` tool.
- `run(..., session_state={...})` passes state for one run; `get_session_state()` needs a `db`.

## User Memories

Memories are short facts about a user ("Prefers email", "QA lead at ACME"), stored per `user_id` and shared across sessions. A `MemoryManager` uses a model to decide what to add, update or delete.

```python
from agno.agent import Agent
from agno.db.sqlite import SqliteDb
from agno.memory import MemoryManager

db = SqliteDb(db_file="tmp/agents.db")

agent = Agent(
    model="openai:gpt-5-mini",
    db=db,
    memory_manager=MemoryManager(model="openai:gpt-5-mini", db=db),  # optional: defaults to the agent model
    update_memory_on_run=True,             # extract memories after every run
    add_memories_to_context=True,          # add known memories to the system message
)

agent.run("I'm Ann, I lead the QA team", user_id="u-9")
[m.memory for m in agent.get_user_memories(user_id="u-9")]     # e.g. ['User is Ann, QA team lead']
```

| Mode | Parameter | Behaviour |
|------|-----------|-----------|
| Automatic | `update_memory_on_run=True` | After each run the memory manager's model calls `add_memory` / `update_memory` / `delete_memory` tools |
| Agentic | `enable_agentic_memory=True` | The agent itself gets an `update_user_memory` tool and decides when to use it |
| Read only | `add_memories_to_context=True` | Memories are injected in a `<memories_from_previous_interactions>` block |

- Automatic mode costs an extra model call per run. Use a small model for the memory manager.
- Memories are personal data: plan deletion (`MemoryManager.delete_user_memory`, `clear_user_memories`, AgentOS `/memories` API) and test that user A never sees user B's memories.

## Session Summaries

```python
from agno.session.summary import SessionSummaryManager

agent = Agent(
    model="openai:gpt-5-mini",
    db=db,
    enable_session_summaries=True,                                   # summarise after runs
    session_summary_manager=SessionSummaryManager(model="openai:gpt-5-mini"),   # optional
    add_session_summary_to_context=True,
)
agent.get_session_summary(session_id="s-1")      # SessionSummary(summary=..., topics=[...])
```

Summaries keep long sessions within the context window: combine a summary with a small `num_history_runs`.

## Knowledge and RAG

A `Knowledge` object ties together a **vector DB**, an **embedder** (configured on the vector DB), readers for files and URLs, and an optional `contents_db` that tracks what was loaded.

```python
from agno.agent import Agent
from agno.knowledge.embedder.openai import OpenAIEmbedder
from agno.knowledge.knowledge import Knowledge
from agno.vectordb.lancedb import LanceDb

knowledge = Knowledge(
    vector_db=LanceDb(uri="tmp/lancedb", table_name="support_docs",
                      embedder=OpenAIEmbedder(id="text-embedding-3-small")),
    max_results=3,
)

knowledge.insert(path="docs/refunds.txt", metadata={"topic": "refunds"})
knowledge.insert(path="docs/shipping.md", metadata={"topic": "shipping"})
knowledge.insert(name="faq-1", text_content="Refunds are processed within 5 business days.")

knowledge.search("how long do refunds take", max_results=1)           # list[Document]
knowledge.search("delivery time", filters={"topic": "shipping"})

agent = Agent(model="openai:gpt-5-mini", knowledge=knowledge)          # search_knowledge=True by default
run = agent.run("How long do refunds take?")
run.references                                                          # what the search returned
```

| Style | Setting | What happens |
|-------|---------|--------------|
| Agentic RAG (default) | `search_knowledge=True` | The model gets a `search_knowledge_base(query)` tool and decides when and what to search |
| Classic RAG | `search_knowledge=False, add_knowledge_to_context=True` | Agno searches with the user message and appends results to it, before the model call |
| Filtered | `knowledge_filters={"topic": "refunds"}` (agent or `run()`) | Search limited by document metadata; `enable_agentic_knowledge_filters=True` lets the model choose filters |

Building blocks:

| Part | Options (import from `agno.vectordb.*`, `agno.knowledge.embedder.*`) |
|------|---------------------------------------------------------------------|
| Vector DB | `LanceDb`, `PgVector`, `Qdrant`, `ChromaDb`, `Milvus`, `Weaviate`, `PineconeDb`, `MongoDb`, `RedisDb`, … |
| Search type | `SearchType.vector`, `keyword`, `hybrid` (where the DB supports it) |
| Embedder | `OpenAIEmbedder`, `OllamaEmbedder`, `SentenceTransformerEmbedder`, `FastEmbedEmbedder`, `CohereEmbedder`, `GeminiEmbedder`, … |
| Readers | PDF, DOCX, PPTX, CSV, Excel, JSON, Markdown, text, website, YouTube, arXiv, … (chosen by file type) |
| Chunking | fixed, recursive, document, markdown, semantic, agentic (`agno.knowledge.chunking`) |
| Reranker | `agno.knowledge.reranker` (Cohere, Infinity, SentenceTransformer, …) |

!!! note "Defaults that surprise"
    `LanceDb` (and most vector DBs) fall back to `OpenAIEmbedder()` when no embedder is given — ingestion then needs an OpenAI key even if your chat model is local. `OpenAIEmbedder` defaults to `text-embedding-3-small` (1536 dimensions). Changing the embedder or its dimensions requires re-indexing into a new table.

For offline tests, give the vector DB a deterministic fake embedder — see [05 Testing](./05-testing.md#knowledge-with-a-fake-embedder). For RAG evaluation metrics (context precision, faithfulness) see [DeepEval — RAG Metrics](../../llm-evaluation/01_metrics/02_rag_metrics.md).

## Reasoning

| Option | How | When |
|--------|-----|------|
| `ReasoningTools` | `tools=[ReasoningTools()]` — adds `think` and `analyze` tools | Any tool-calling model; reasoning steps become visible tool calls |
| Native reasoning model | Use a reasoning model as `model`; read `run.reasoning_content` where the provider returns it | Provider-side reasoning |
| `reasoning_model=` | A separate native reasoning model plans first; its output is added for the main model | Cheap main model, strong planner |
| `reasoning_agent=` | A full `Agent` used for the reasoning step | Custom reasoning prompts or tools |

```python
from agno.agent import Agent
from agno.tools.reasoning import ReasoningTools

agent = Agent(model="openai:gpt-5-mini", tools=[ReasoningTools(add_instructions=True), get_order_status])
run = agent.run("Which of ord-1, ord-2 is late?")
[t.tool_name for t in run.tools]      # e.g. ['think', 'get_order_status', 'get_order_status', 'analyze']
```

Reasoning adds tokens and latency; measure both ([06](./06-evals-ci.md#agno-evals)) before enabling it everywhere.

## Checklist

- [ ] Every multi-turn call passes `user_id` and `session_id`
- [ ] `add_history_to_context=True` is set explicitly where history is needed
- [ ] History is bounded (`num_history_runs`, summaries) for long sessions
- [ ] Memory extraction uses a small model; deletion of user data is implemented and tested
- [ ] Knowledge embedder is pinned; re-index plan exists for embedder changes
- [ ] Metadata filters isolate tenants or products in a shared knowledge base
- [ ] Tests use a temporary SQLite file and a fake embedder

---
## See also
- [Agno — Agents, Teams & Workflows in Python](./index.md)
- [Agno — Agents, Tools & Structured Output](./01-agents-tools.md)
- [Agno — Testing Agno Apps](./05-testing.md)
- [Agentic AI — Memory & RAG](../../agentic-ai-architecture/03-memory-rag.md)
- [SQLAlchemy](../sqlalchemy/index.md)
- [DeepEval — LLM Testing Guide](../../llm-evaluation/index.md)
