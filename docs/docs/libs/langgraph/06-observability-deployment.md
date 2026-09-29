---
date: 2026-09-29
tags:
  - python
  - libraries
  - langgraph
  - ai-agents
  - llm
  - observability
  - deployment
---

# LangGraph — Observability & Deployment

Every LangGraph run is a tree of runnables: graph → nodes → model calls → tools. Any LangChain-compatible tracer shows that tree. This page shows how to send it to the common backends, how to use traces in tests, and how to serve a graph with LangGraph Server.

## Tracing Backends

| Backend | Setup | Details |
|---------|-------|---------|
| LangSmith | Environment variables only | Native; also powers LangGraph Studio |
| Arize Phoenix | OpenInference `LangChainInstrumentor` | [Phoenix — Tracing & Instrumentation](../../tools/phoenix/02-tracing-instrumentation.md) |
| Langfuse | `CallbackHandler` in `config["callbacks"]` | [Langfuse — Tracing SDK](../../tools/langfuse/02-tracing-sdk.md) |
| MLflow | `mlflow.langchain.autolog()` (covers LangGraph) | [MLflow — GenAI Tracing](../../tools/mlflow/03-genai-tracing.md) |
| Any OTLP backend | OpenInference instrumentor + OTel exporter | [OpenTelemetry](../opentelemetry/index.md) |

### LangSmith

```bash
export LANGSMITH_TRACING=true
export LANGSMITH_API_KEY=lsv2_...
export LANGSMITH_PROJECT=support-agent-ci      # one project per app or per test suite
```

The older `LANGCHAIN_TRACING_V2` / `LANGCHAIN_API_KEY` / `LANGCHAIN_PROJECT` names used in [LangChain — LangGraph & Production](../langchain/06-langgraph-production.md) are still read.

### Phoenix (OpenInference)

```python
from openinference.instrumentation.langchain import LangChainInstrumentor
from phoenix.otel import register

tracer_provider = register(project_name="support-agent", endpoint="http://localhost:6006/v1/traces")
LangChainInstrumentor().instrument(tracer_provider=tracer_provider)
# every graph.invoke / stream from now on produces spans: graph, nodes, LLM, tools
```

### Langfuse

```python
from langfuse.langchain import CallbackHandler

handler = CallbackHandler()        # reads LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY / LANGFUSE_HOST

graph.invoke(
    {"messages": [("user", "Where is ord-42?")]},
    config={
        "callbacks": [handler],
        "metadata": {
            "langfuse_session_id": "support-session-17",   # groups traces into a session
            "langfuse_user_id": "qa-bot",
            "langfuse_tags": ["nightly", "regression"],
        },
    },
)
```

### MLflow

```python
import mlflow

mlflow.set_experiment("support-agent")
mlflow.langchain.autolog()            # there is no separate langgraph flavor
```

### What to Put on Every Run

```python
config = {
    "configurable": {"thread_id": "t-812"},
    "run_name": "support-agent",
    "tags": ["suite:regression", "env:staging"],
    "metadata": {"test_case": "TC-104", "git_sha": "3f2c1a9", "dataset": "golden-v7"},
    "recursion_limit": 25,
}
```

`tags` and `metadata` propagate to every child run (nodes, model and tool calls) — filter failing cases by `test_case` in the tracing UI instead of grepping logs. Node names become span names, so meaningful node names are part of observability.

## Traces as Test Assertions

With an in-memory OpenTelemetry exporter a test can assert on spans — useful to check that a tool really ran, or that no model call happened on a cached path. The example reuses `build_graph` and the fakes from [05 Testing](./05-testing.md).

```python
# tests/test_tracing.py
import pytest
from langchain_core.messages import AIMessage, HumanMessage
from openinference.instrumentation.langchain import LangChainInstrumentor
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from app.support_graph import build_graph
from tests.fakes import scripted, tool_call


@pytest.fixture
def spans():
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    instrumentor = LangChainInstrumentor()
    instrumentor.instrument(tracer_provider=provider)
    yield exporter
    instrumentor.uninstrument()


def test_trace_contains_nodes_and_tool(spans):
    graph = build_graph(scripted(tool_call("get_order_status", {"order_id": "ord-42"}), AIMessage("Shipped.")))
    graph.invoke({"messages": [HumanMessage("Where is ord-42?")]}, {"metadata": {"test_case": "TC-1"}})

    finished = spans.get_finished_spans()
    names = [s.name for s in finished]
    assert names.count("agent") == 2 and "tools" in names
    tool_spans = [s for s in finished if s.attributes.get("openinference.span.kind") == "TOOL"]
    assert [s.name for s in tool_spans] == ["get_order_status"]
```

## Deployment Options

| Option | What you run | Persistence | Good for |
|--------|--------------|-------------|----------|
| Your own API (FastAPI, worker) | `graph.invoke` / `astream` in your service | You wire `PostgresSaver` / `PostgresStore` | Full control, existing platform |
| LangGraph Server, local | `langgraph dev` | In-memory (lost on restart) | Development, Studio debugging, API contract tests |
| LangGraph Server, Docker | `langgraph build` / `langgraph up` | Postgres + Redis | Self-hosted production |
| LangSmith Deployment (formerly LangGraph Platform) | Managed by LangChain (CLI: `langgraph deploy`, beta) | Managed | Teams already on LangSmith |

LangGraph Server adds an HTTP API around your graphs: assistants, threads, runs (sync, streaming, background), cron jobs, webhooks, persistence and interrupts. The Docker server needs `LANGSMITH_API_KEY` for local use or a license key (`LANGGRAPH_CLOUD_LICENSE_KEY`) for production — check current licensing before choosing it.

### `langgraph.json`

```json
{
  "dependencies": ["."],
  "graphs": {
    "support": "./app/server.py:graph"
  },
  "env": ".env",
  "python_version": "3.12"
}
```

```python
# app/server.py
from langchain.chat_models import init_chat_model

from app.support_graph import build_graph

graph = build_graph(init_chat_model("anthropic:claude-sonnet-5", temperature=0))
# no checkpointer: the server provides persistence
```

| Key | Meaning |
|-----|---------|
| `dependencies` | Packages or local paths to install (`"."` = this project's `pyproject.toml`) |
| `graphs` | Graph ID → `path/to/module.py:variable` (a compiled graph or a factory function) |
| `env` | `.env` file path or an inline dict of variables |
| `python_version` | Python of the built image |
| `store`, `checkpointer` | Server-side store (e.g. semantic index) and checkpointer settings |
| `auth`, `http` | Custom auth handler, custom routes / CORS |
| `dockerfile_lines` | Extra lines for the generated Dockerfile |

### CLI

| Command | Use |
|---------|-----|
| `langgraph dev` | Local server with hot reload on `http://127.0.0.1:2024`; API docs at `/docs`; prints a Studio URL |
| `langgraph dev --no-browser --port 2024` | Same, for CI or headless machines |
| `langgraph validate` | Check `langgraph.json` |
| `langgraph build -t support-agent:1.4.0` | Build a Docker image |
| `langgraph up` | Run the image with Postgres and Redis via Docker Compose |
| `langgraph dockerfile Dockerfile` | Generate a Dockerfile to customise |
| `langgraph new` | Create a project from a template |

### Calling the Server: SDK

```python
import asyncio

from langgraph_sdk import get_client


async def main() -> None:
    client = get_client(url="http://127.0.0.1:2024")
    thread = await client.threads.create()

    async for chunk in client.runs.stream(
        thread["thread_id"],
        "support",                                      # graph ID from langgraph.json
        input={"messages": [{"role": "user", "content": "Refund ord-7"}]},
        stream_mode="updates",
    ):
        print(chunk.event, chunk.data)

    state = await client.threads.get_state(thread["thread_id"])
    print(state["next"])                                # ['human_review'] -> waiting for approval

    result = await client.runs.wait(thread["thread_id"], "support", command={"resume": "approve"})
    print(result["messages"][-1]["content"])


asyncio.run(main())
```

`RemoteGraph("support", url="http://127.0.0.1:2024")` from `langgraph.pregel.remote` exposes a deployed graph with the same `invoke` / `stream` / `get_state` interface as a local one — the same test code can run against a local graph and a deployed one (API contract / smoke tests after deploy).

## Production Checklist

- [ ] Tracing enabled in every environment; `tags` / `metadata` carry suite, case and release IDs
- [ ] PII masking configured in the tracing backend before production traffic
- [ ] Persistent checkpointer and store (Postgres); `setup()` / migrations in the deploy pipeline
- [ ] Explicit `recursion_limit`, model call limits and timeouts
- [ ] Smoke tests against the deployed API (`langgraph_sdk` or `RemoteGraph`) after each deploy
- [ ] Graph IDs and interrupt payloads versioned — clients depend on them
- [ ] `langgraph`, `langchain` and server versions pinned in the lockfile

---
## See also
- [LangGraph — Stateful Agent Orchestration](./index.md)
- [LangGraph — Testing LangGraph Apps](./05-testing.md)
- [Arize Phoenix](../../tools/phoenix/index.md)
- [Langfuse](../../tools/langfuse/index.md)
- [MLflow](../../tools/mlflow/index.md)
- [OpenTelemetry — Python Observability](../opentelemetry/index.md)
- [Docker](../../tools/docker/index.md)
