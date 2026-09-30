---
date: 2026-09-30 12:00:00
tags:
  - python
  - libraries
  - agno
  - ai-agents
  - fastapi
  - observability
  - opentelemetry
  - deployment
---

# Agno — AgentOS & Observability

**AgentOS** turns agents, teams and workflows into a FastAPI app: run endpoints (JSON or server-sent events), sessions, memories, evals, knowledge and traces, backed by your own `db`. Observability comes in two layers: Agno's own tracing into that database, and OpenTelemetry spans via OpenInference for Phoenix, Langfuse or any OTLP backend.

## Serving with AgentOS

```python
# main.py
from agno.agent import Agent
from agno.db.postgres import PostgresDb
from agno.os import AgentOS

db = PostgresDb(db_url="postgresql+psycopg://ai:ai@localhost:5432/ai")

support = Agent(id="support-agent", name="Support Agent", model="openai:gpt-5-mini",
                tools=[get_order_status], db=db, add_history_to_context=True)

agent_os = AgentOS(
    agents=[support],                 # teams=[...], workflows=[...]
    db=db,
    tracing=True,                     # store traces in db (see below)
)
app = agent_os.get_app()              # a FastAPI app

if __name__ == "__main__":
    agent_os.serve(app="main:app", reload=True)       # uvicorn on localhost:7777
```

- `uv add "agno[os]"` installs FastAPI, uvicorn, the OpenTelemetry SDK and the OpenInference instrumentor.
- `serve()` defaults to `localhost:7777`; `AGENT_OS_HOST` / `AGENT_OS_PORT` override it. In containers you can also run `uvicorn main:app` directly.
- The Agno web UI (`os.agno.com`) is allowed by the default CORS settings and connects to your running AgentOS; the data stays in your database.

### Main Routes

| Route | Purpose |
|-------|---------|
| `GET /health` | Liveness (no auth) |
| `GET /config`, `GET /agents`, `GET /agents/{agent_id}` | What is deployed |
| `POST /agents/{agent_id}/runs` | Run an agent: form fields `message`, `stream`, `session_id`, `user_id`, … |
| `GET /agents/{agent_id}/runs/{run_id}` | A stored run |
| `POST /teams/{team_id}/runs`, `POST /workflows/{workflow_id}/runs` | Same for teams and workflows |
| `GET/POST/DELETE /sessions`, `GET /sessions/{session_id}/runs` | Sessions and their runs |
| `GET/POST/DELETE /memories`, `/memories/{memory_id}` | User memories |
| `GET /traces`, `GET /traces/{trace_id}`, `POST /traces/search` | Stored traces |

```bash
curl -s -X POST http://localhost:7777/agents/support-agent/runs \
  -H "Authorization: Bearer $OS_SECURITY_KEY" \
  -F message="Where is ord-42?" -F stream=false -F session_id=demo-1 -F user_id=qa
# {"content": "...", "status": "COMPLETED", "session_id": "demo-1", "agent_id": "support-agent", "tools": [...], ...}
```

With `stream=true` the response is `text/event-stream` with events such as `RunStarted`, `ModelRequestStarted`, `RunContent`, `ModelRequestCompleted`, `RunContentCompleted`, `RunCompleted`.

### Authentication

| Option | How |
|--------|-----|
| Static key | Set `OS_SECURITY_KEY`; clients send `Authorization: Bearer <key>` — requests without it get `401` (`/health` stays open) |
| JWT | `AgentOS(authorization=True, ...)` with `JWT_VERIFICATION_KEY` or `JWT_JWKS_FILE`; do not combine with `OS_SECURITY_KEY` |
| None | Local development only |

### Mount on Your Own FastAPI App

```python
from fastapi import FastAPI

from agno.os import AgentOS

api = FastAPI(title="Support API")


@api.get("/ping")
def ping() -> dict:
    return {"pong": True}


app = AgentOS(agents=[support], db=db, base_app=api).get_app()   # /ping and the AgentOS routes
```

`on_route_conflict=` decides what happens when your routes and AgentOS routes share a path. For FastAPI patterns (dependencies, middleware, testing) see [FastAPI](../fastapi/index.md).

## Tracing into the Agno Database

```python
from agno.agent import Agent
from agno.db.sqlite import SqliteDb
from agno.tracing import setup_tracing

db = SqliteDb(db_file="tmp/agents.db")
setup_tracing(db=db)          # scripts, workers, tests; AgentOS(tracing=True) does this for the app

agent = Agent(model="openai:gpt-5-mini", tools=[get_order_status], db=db)
agent.run("Where is ord-42?")  # agent run, model calls and tool calls are stored as spans
```

- `setup_tracing(db, batch_processing=False, ...)` registers an OpenTelemetry `TracerProvider` that exports into the db's traces and spans tables. It does nothing if a real `TracerProvider` is already configured.
- Needs `opentelemetry-sdk` and `openinference-instrumentation-agno` (both in `agno[os]`).
- Traces are listed at `GET /traces` (`trace_id`, `name`, `status`, `duration`, `total_spans`, `error_count`, ...) and in the Agno UI.

## OpenInference → Phoenix, Langfuse, any OTLP Backend

`openinference-instrumentation-agno` provides `AgnoInstrumentor`, which creates spans for agent / team / workflow runs (`AGENT` kind), tool calls (`TOOL`) and model calls (`LLM`) of Agno's built-in model classes.

| Backend | Setup | Details |
|---------|-------|---------|
| Arize Phoenix | `phoenix.otel.register(..., auto_instrument=True)` | [Phoenix — Tracing & Instrumentation](../../tools/phoenix/02-tracing-instrumentation.md) |
| Langfuse | OTLP/HTTP exporter to `<LANGFUSE_BASE_URL>/api/public/otel` + `AgnoInstrumentor` | [Langfuse — Tracing SDK](../../tools/langfuse/02-tracing-sdk.md) |
| Jaeger, Tempo, Collector, … | Any OTLP exporter + `AgnoInstrumentor` | [OpenTelemetry](../opentelemetry/index.md) |

```python
# Phoenix
from phoenix.otel import register

register(project_name="support-agent", endpoint="http://localhost:6006/v1/traces", auto_instrument=True)
```

```python
# Generic OTLP (Collector, Jaeger, Langfuse): endpoint and headers from OTEL_EXPORTER_OTLP_* env vars
from openinference.instrumentation.agno import AgnoInstrumentor
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

provider = TracerProvider(resource=Resource.create({"service.name": "support-agent"}))
provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
trace.set_tracer_provider(provider)
AgnoInstrumentor().instrument()
```

For Langfuse, set `OTEL_EXPORTER_OTLP_ENDPOINT` and the Basic-auth `OTEL_EXPORTER_OTLP_HEADERS` exactly as shown on the [Langfuse tracing page](../../tools/langfuse/02-tracing-sdk.md) (HTTP only, no gRPC).

!!! note "Span names and custom models"
    The agent span is named `<agent name>.run` with spaces replaced by `_` (`Support_Agent.run`). LLM spans are created only for model classes from `agno.models` — a custom `Model` subclass (like the offline test model) produces agent and tool spans but no LLM span.

## What to Record on Every Run

```python
run = support.run(
    "Where is ord-42?",
    user_id="qa-bot",
    session_id="nightly-2026-09-30-case-17",
    metadata={"suite": "nightly", "case_id": "case-17", "git_sha": "abc123"},
)
run.metrics.total_tokens, run.metrics.duration, run.metrics.time_to_first_token
support.get_session_metrics(session_id="nightly-2026-09-30-case-17")   # aggregated per session (needs db)
```

- `metadata` is stored with the run — use it to find test runs in traces and in the db.
- `run.metrics` has tokens, `cost` (where the provider reports it), `duration` and `time_to_first_token`; every `ToolExecution` has its own `metrics`.
- Keep `user_id` / `session_id` stable per test case so traces, sessions and memories line up.

## Debugging and Telemetry

| Setting | Effect |
|---------|--------|
| `debug_mode=True` or `AGNO_DEBUG=true` | Logs system message, tool calls, model responses and metrics |
| `debug_level=2` or `AGNO_DEBUG_LEVEL=2` | More detail |
| `telemetry=False` or `AGNO_TELEMETRY=false` | Disables anonymous usage telemetry — **on by default** for agents, teams, workflows and AgentOS |

Set `AGNO_TELEMETRY=false` in CI and in air-gapped environments: tests should not make network calls you did not ask for.

## Production Checklist

- [ ] Postgres (or another server DB) instead of SQLite; migrations and backups planned
- [ ] `OS_SECURITY_KEY` or JWT enabled; `/health` used for probes
- [ ] Explicit `id` for every agent, team and workflow — they are part of the URLs
- [ ] `tracing=True` or an OTLP pipeline in every environment; runs tagged with `metadata`
- [ ] `AGNO_TELEMETRY=false` where outbound calls are not allowed
- [ ] Rate limits, timeouts and `tool_call_limit` set; cost per run monitored
- [ ] API smoke tests against the app with an offline model in CI ([06](./06-evals-ci.md#api-tests-for-agentos))

---
## See also
- [Agno — Agents, Teams & Workflows in Python](./index.md)
- [Agno — API Tests, Evals & CI](./06-evals-ci.md)
- [Arize Phoenix — LLM Tracing & Evaluation](../../tools/phoenix/index.md)
- [Langfuse — LLM Tracing, Prompts & Evals](../../tools/langfuse/index.md)
- [OpenTelemetry](../opentelemetry/index.md)
- [FastAPI](../fastapi/index.md)
