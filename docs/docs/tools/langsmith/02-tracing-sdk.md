---
date: 2026-10-22 12:00:00
tags:
  - tools
  - observability
  - llm
  - langsmith
  - evaluation
---

# LangSmith — Tracing with the Python SDK

The `langsmith` package records every unit of work as a **run** (a span) and nests runs into a **trace**. Context propagates through nested calls, threads started with context copying, and `async` code. Nothing is sent unless `LANGSMITH_TRACING=true` and an API key are set — the same code runs untraced in unit tests.

| Way to instrument | Use when |
|-------------------|----------|
| `@traceable` | Your own functions — the default choice |
| `ls.trace(...)` context manager | A block of code, or you need to set inputs/outputs by hand |
| `wrap_openai` / `wrap_anthropic` / `wrap_gemini` | Provider SDK calls become `llm` runs with usage |
| LangChain / LangGraph | Set the env var; no code change |
| `RunTree` | Explicit low-level control (always sends, ignores `LANGSMITH_TRACING`) |
| OpenTelemetry | Spans from OTel instrumentors or other languages |

## `@traceable`

```python
import langsmith as ls
from langsmith import traceable


@traceable(run_type="retriever", name="search-kb", metadata={"index": "faq-v2"})
def search_kb(query: str) -> list[dict]:
    return [{"page_content": "Reset password: Settings → Security", "type": "Document", "metadata": {"source": "faq"}}]


@traceable(run_type="llm", name="classify", metadata={"ls_provider": "openai", "ls_model_name": "gpt-4o-mini"})
def classify(messages: list[dict]) -> dict:
    run = ls.get_current_run_tree()          # None when tracing is off
    if run:
        run.set(usage_metadata={"input_tokens": 27, "output_tokens": 3, "total_tokens": 30})
    return {"role": "assistant", "content": "P2"}


def hide_key(inputs: dict) -> dict:
    return {**inputs, "api_key": "[REDACTED]"}


@traceable(run_type="tool", process_inputs=hide_key)
def create_ticket(api_key: str, summary: str) -> str:
    return "T-981"


@traceable(name="triage", tags=["smoke"], metadata={"thread_id": "t-1"})
def triage(ticket: str) -> str:
    search_kb(ticket)
    create_ticket("sk-secret", ticket)
    return classify([{"role": "user", "content": ticket}])["content"]
```

Calling `triage()` records one trace: `triage` (chain) with children `search-kb` (retriever), `create_ticket` (tool, key redacted) and `classify` (llm with tokens).

| Argument | Effect |
|----------|--------|
| `run_type` | `chain` (default), `llm`, `tool`, `retriever`, `embedding`, `prompt`, `parser` |
| `name` | Run name (default: function name) |
| `tags`, `metadata` | Attached to the run; **child runs inherit** the parent's tags and metadata |
| `project_name` | Destination project for this function (overrides `LANGSMITH_PROJECT`) |
| `client` | A specific `Client` (own key, endpoint, masking, sampling) |
| `process_inputs`, `process_outputs` | Transform inputs / outputs before upload; take precedence over client-level `hide_*` |
| `reduce_fn` | Combine yielded chunks of a generator into one logged output |
| `enabled` | Enable or disable tracing for this function only |
| `exceptions_to_handle` | Exception types recorded without an error status |
| `address` | Beta: `ls.agent_address(id, environment)` instead of a project |

- Works on sync, `async` functions and generators. Exceptions are recorded on the run and re-raised.
- `run_type="llm"` runs need OpenAI/Anthropic/LangChain-style messages, `ls_provider` + `ls_model_name` metadata and `usage_metadata` for token counts and cost. `retriever` runs must return a list of `{"page_content", "type": "Document", "metadata"}` dicts.
- A `process_inputs` function that raises drops the payload (the run shows `Processing failed; inputs dropped`) instead of uploading it raw. `LANGSMITH_ALLOW_UNPROCESSED_PAYLOADS` disables this fail-closed behavior; keep it off.
- Per-call overrides without touching the function: `triage("...", langsmith_extra={"tags": ["retry"], "metadata": {"attempt": 2}, "run_id": rid, "project_name": "other", "on_end": callback})`.

## `trace` Context Manager

```python
import langsmith as ls

with ls.trace("checkout-flow", "chain", inputs={"cart": "c-42"}, tags=["e2e"], metadata={"tenant": "acme"}) as rt:
    total = compute_total("c-42")             # traceable calls inside become child runs
    rt.end(outputs={"total": total})
```

Signature highlights: `trace(name, run_type="chain", *, inputs, tags, metadata, project_name, client, parent, run_id, reference_example_id, exceptions_to_handle, attachments)`.

## `tracing_context`

Scoped overrides for everything traced inside the block; it creates no run itself.

| Argument | Effect |
|----------|--------|
| `enabled` | `True` / `False` / `"local"`; beats `ls.configure(enabled=...)`, which beats `LANGSMITH_TRACING` |
| `project_name`, `tags`, `metadata` | Applied to every run inside, including children |
| `client` | Route to another workspace / endpoint |
| `parent` | Continue a trace from request headers (distributed tracing) |
| `replicas` | Send to several projects or workspaces; per-replica `updates` can blank `inputs` / `outputs` |

```python
with ls.tracing_context(enabled=False):
    triage("contains customer data")           # not traced

with ls.tracing_context(project_name="tenant-acme", tags=["eu"], metadata={"thread_id": thread_id}):
    triage("traced to another project")
```

`enabled="local"` builds the run tree in memory and uploads nothing — useful for asserting on trace structure in tests ([05](./05-testing-ci-production.md#asserting-on-traces)).

Inside a traced function:

| Call | Returns |
|------|---------|
| `ls.get_current_run_tree()` | Active `RunTree` (`id`, `trace_id`, `metadata`, `tags`, `child_runs`, `set(...)`, `to_headers()`) or `None` |
| `ls.set_run_metadata(release="2026.10.22")` | Adds metadata to the current run |
| `ls.uuid7()` | Time-ordered UUID for custom run or thread IDs |

## Provider Wrappers

```python
import anthropic
import openai
from langsmith.wrappers import wrap_anthropic, wrap_openai

oai = wrap_openai(openai.OpenAI(), tracing_extra={"tags": ["wrapped"], "metadata": {"suite": "smoke"}})
resp = oai.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Classify: login fails"}],
    langsmith_extra={"metadata": {"call": "classify"}},      # per-call overrides
)

claude = wrap_anthropic(anthropic.Anthropic())
```

Each call becomes an `llm` run (`ChatOpenAI` / `ChatAnthropic`) with `ls_provider`, `ls_model_name` and `usage_metadata`, nested under the active `@traceable` run. `wrap_gemini` covers Google's SDK; OpenAI-compatible providers are traced with `wrap_openai` and a custom `base_url`.

## LangChain and LangGraph

With `LANGSMITH_TRACING=true` every runnable, chat model, tool and graph node is traced; nothing to import.

```python
chain.invoke(
    {"ticket": "Typo on About page"},
    config={"run_name": "triage-chain", "tags": ["lc"], "metadata": {"thread_id": thread_id}},
)

with ls.tracing_context(enabled=True, project_name="adhoc"):       # trace one call when the env var is unset
    graph.invoke({"ticket": "..."})
```

- Config `tags` / `metadata` are inherited by child runnables; `run_name` renames only the invoked runnable, not the model run inside it.
- `metadata={"ls_model_name": "...", "ls_provider": "..."}` on a model sets the displayed name and drives cost lookup for custom or self-hosted models.
- Wrap non-LangChain code with `@traceable` inside the graph to get custom nesting.

## Threads

A **thread** groups the traces of one conversation. Add a `thread_id` (or `session_id`) metadata key with the same value to every turn; UUID v7 is recommended.

```python
THREAD_ID = str(ls.uuid7())


def handle_turn(message: str) -> str:
    with ls.tracing_context(metadata={"thread_id": THREAD_ID}):    # applied to the root and all child runs
        return chat_pipeline(message)
```

- Runs without the key are excluded from thread filters, token counts and cost totals — set it on child runs too (`tracing_context` does).
- Thread-level online evaluators and rules act after the thread has been idle (default 10 minutes, minimum 2).

## Feedback

```python
from langsmith import Client, traceable, uuid7

client = Client()
run_id = uuid7()


@traceable(name="answer")
def answer(question: str) -> str:
    return "Use Settings → Security."


answer("How do I reset my password?", langsmith_extra={"run_id": run_id})        # root run: trace_id == run_id
project_id = client.read_project(project_name="support-bot-ci").id

client.create_feedback(
    run_id=run_id, trace_id=run_id, session_id=project_id,
    key="user_score", score=1, comment="helpful",
)
```

| Argument | Notes |
|----------|-------|
| `key`, `score` / `value` | Numeric metric (`score`) or categorical (`value`) |
| `session_id` | Project UUID of the run; required for run-level feedback (omitting it is deprecated) |
| `trace_id` | Enables batched, background submission — avoids blocking the request |
| `extend_trace_retention` | Default `True`: upgrades a base-retention trace; pass `False` to keep its tier |
| `feedback_config`, `correction`, `source_info`, `comment` | Score typing, ground-truth correction, provenance, justification |

Return the run ID to the client with the answer so the UI can send feedback later. For browsers use `client.create_presigned_feedback_token(run_id, "user_score")` and let the page POST to the returned URL — no API key in the frontend.

## Distributed Tracing

```python
# client service
from langsmith.run_helpers import get_current_run_tree

@traceable
async def call_backend(http, payload):
    headers = {}
    if run := get_current_run_tree():
        headers.update(run.to_headers())          # langsmith-trace + baggage
    return await http.post("/triage", json=payload, headers=headers)


# server service (FastAPI / Starlette)
from fastapi import FastAPI, Request
from langsmith.middleware import TracingMiddleware

app = FastAPI()
app.add_middleware(TracingMiddleware)              # or: with ls.tracing_context(parent=request.headers): ...
```

!!! warning "Trusted callers only"
    `langsmith-trace` and `baggage` headers are trusted tracing context. Do not accept them on endpoints exposed to the public internet.

## OpenTelemetry

```python
from langsmith.integrations.otel import configure        # pip install "langsmith[otel]"
from opentelemetry import trace

configure(project_name="otel-demo")                        # LangSmith becomes the only TracerProvider
with trace.get_tracer("qa").start_as_current_span("triage") as span:
    span.set_attribute("langsmith.span.kind", "chain")
    span.set_attribute("langsmith.metadata.user_id", "u-1")
```

| Mode (`LANGSMITH_TRACING_MODE`) | Behavior |
|---------------------------------|----------|
| `langsmith` (default) | Normal ingestion API |
| `hybrid` (`LANGSMITH_OTEL_ENABLED=true`) | Normal ingestion plus OTLP export to the endpoint |
| `otel` (`LANGSMITH_OTEL_ONLY=true`) | OTLP export only |

`configure()` must run before any other `TracerProvider` is set. To fan out to another backend, set a global provider with your own exporter or use a Collector. Attribute mapping and endpoints: [01](./01-setup-architecture.md#relation-to-opentelemetry).

## Flushing

Runs are batched in background threads; a short-lived process can exit first.

| Situation | Call |
|-----------|------|
| Script, CLI, pytest session end | `Client().flush()` |
| Serverless handler | `client.flush()` before returning |
| LangChain code | `from langchain_core.tracers.langchain import wait_for_all_tracers; wait_for_all_tracers()` |
| Custom client in `@traceable(client=c)` | `c.flush()` (each client has its own queue) |

`Client(tracing_error_callback=fn)` calls `fn(exception)` when background tracing fails, so ingestion problems can be logged or alerted on.

## Sampling and Conditional Tracing

```bash
export LANGSMITH_TRACING_SAMPLING_RATE=0.25        # send ~25% of traces
```

```python
quiet = Client(tracing_sampling_rate=0.0)
with ls.tracing_context(client=quiet):             # per-client rates; 0.0 = nothing sent
    agent.invoke(...)
```

- Sampling is probabilistic and per trace. Use `tracing_context(enabled=...)` for deterministic rules (zero-retention tenants, sensitive flows).
- Keep `1.0` in CI; sample only high-volume production traffic.

## Masking and Redaction

| Mechanism | Scope | Notes |
|-----------|-------|-------|
| `LANGSMITH_HIDE_INPUTS` / `LANGSMITH_HIDE_OUTPUTS` / `LANGSMITH_HIDE_METADATA` | All runs | Drops the payload (`{}`) |
| `Client(hide_inputs=fn, hide_outputs=fn, hide_metadata=fn)` | Runs of that client | Function returns the replacement dict |
| `Client(anonymizer=create_anonymizer([...]))` | Inputs, outputs | Regex rules or a `str -> str` function; takes precedence over `hide_*` |
| `Client(anonymizer=create_secret_anonymizer())` | Inputs, outputs, errors, metadata | Built-in rules for API keys, tokens, JWTs, URL credentials, replaced by `[SECRET_DETECTED]`; `extra_rules=[...]` adds yours |
| `@traceable(process_inputs=..., process_outputs=...)` | One function | Takes precedence over client-level processors |
| `tracing_context(replicas=[{"project_name": ..., "updates": {"inputs": {}, "outputs": {}}}])` | Per request | Keep structure and timing, blank payloads for selected tenants |

```python
from langsmith import Client, traceable
from langsmith.anonymizer import create_anonymizer, create_secret_anonymizer

pii = create_anonymizer([
    {"pattern": r"[\w.+-]+@[\w-]+\.[\w.]+", "replace": "<email>"},
    {"pattern": r"\b(?:\d[ -]?){13,16}\b", "replace": "<card>"},
])
client = Client(anonymizer=pii)


@traceable(client=client, name="triage")
def triage(ticket: str) -> str:                     # trace shows: "mail me at <email> about order 42"
    return "P2"
```

- Child runs created inside a traced function reuse the parent's client, so the anonymizer applies to the wrapped LLM call too.
- The secret preset is precision-first: unknown key formats pass through, and run names, tags and attachments are not redacted. Add `extra_rules` for internal formats.
- Redaction is not access control: restrict who can read the project, and unit-test the masking function with sample PII.
- Environment variables named `LANGSMITH_*` (except secret-like names) are copied into run metadata; use `Client(omit_traced_runtime_info=True)` to drop the runtime block.

---
## See also
- [LangSmith — LLM Tracing, Prompts & Evals](./index.md)
- [LangSmith — Prompt Management](./03-prompt-management.md)
- [LangSmith — Datasets & Evaluations](./04-datasets-evaluations.md)
- [LangChain — LLM Application Framework](../../libs/langchain/index.md)
- [LangGraph — Observability & Deployment](../../libs/langgraph/06-observability-deployment.md)
- [OpenTelemetry — Python Observability](../../libs/opentelemetry/index.md)
- [LiteLLM — One API for 100+ LLM Providers](../../libs/litellm/index.md)
- [Langfuse — Tracing with the Python SDK](../langfuse/02-tracing-sdk.md)
