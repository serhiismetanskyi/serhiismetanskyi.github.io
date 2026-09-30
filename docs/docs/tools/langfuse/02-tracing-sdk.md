---
date: 2026-09-27
tags:
  - tools
  - observability
  - llm
  - langfuse
---

# Langfuse — Tracing with the Python SDK

The current Python SDK (`langfuse` **v4**) is built on OpenTelemetry: every Langfuse observation is an OTel span, exported over OTLP/HTTP to Langfuse. Context propagates automatically through nested calls, threads with context copying, and `async` code.

## SDK Generations

| SDK | API style | Status |
|-----|-----------|--------|
| v2 | `langfuse.trace()`, `trace.span()`, `trace.generation()` — manual object tree | Legacy; ignore old tutorials |
| v3 | OTel-based, `start_as_current_span()`, `update_current_trace()` | Superseded |
| **v4** | OTel-based, `start_as_current_observation(as_type=...)`, `propagate_attributes()` | Current |

v3 → v4 changes worth knowing: `start_span`/`start_generation` became `start_observation(as_type=...)`; `update_current_trace()` was split into `propagate_attributes()` (user, session, tags, metadata), `set_current_trace_io()` (deprecated) and `set_current_trace_as_public()`; only LLM-related OTel spans are exported by default.

## Client

```python
from langfuse import get_client

langfuse = get_client()          # singleton configured from LANGFUSE_* env vars
langfuse.auth_check()            # True if keys + base URL are valid (network call — not per request)
```

- `get_client()` returns the same instance everywhere — no need to pass it around.
- Create `Langfuse(...)` explicitly only for non-default settings (masking, sampling, custom exporter); `get_client()` returns it afterwards.

## `@observe` Decorator

```python
from langfuse import observe, get_client

langfuse = get_client()


@observe(as_type="retriever")
def search_kb(query: str) -> list[str]:
    return ["Reset password: Settings → Security", "SSO users: contact IT"]


@observe(as_type="generation", name="answer-llm")
def answer(query: str, docs: list[str]) -> str:
    text = call_model(query, docs)                     # your LLM client
    langfuse.update_current_generation(
        model="gpt-4o-mini",
        usage_details={"input": 412, "output": 58},
        metadata={"docs": len(docs)},
    )
    return text


@observe()                                             # root span → becomes the trace
def rag_pipeline(query: str) -> str:
    docs = search_kb(query)
    return answer(query, docs)
```

| Argument | Effect |
|----------|--------|
| `name` | Observation name (default: function name) |
| `as_type` | `span` (default), `generation`, `embedding`, `agent`, `tool`, `chain`, `retriever`, `evaluator`, `guardrail` |
| `capture_input` / `capture_output` | Turn off automatic argument/return capture (large or sensitive payloads) |
| `transform_to_string` | Join streamed generator chunks into one output string |

- Works on sync and `async` functions and generators.
- Exceptions are recorded with level `ERROR` and re-raised.
- Global switch for I/O capture: `LANGFUSE_OBSERVE_DECORATOR_IO_CAPTURE_ENABLED=false`.

## Context Managers

Use them when the unit of work is not a function, or when you need the span object.

```python
from langfuse import get_client

langfuse = get_client()

with langfuse.start_as_current_observation(as_type="span", name="triage-ticket", input={"ticket_id": "T-981"}) as root:
    with langfuse.start_as_current_observation(
        as_type="generation",
        name="classify-priority",
        model="gpt-4o-mini",
        model_parameters={"temperature": 0},
        input=[{"role": "user", "content": "Checkout is down for all EU users"}],
    ) as gen:
        label = "P1"
        gen.update(output=label, usage_details={"input": 35, "output": 2})

    langfuse.create_event(name="routing-rule-applied", metadata={"queue": "oncall"})
    root.update(output={"priority": label, "queue": "oncall"})
```

| Method | Behavior |
|--------|----------|
| `start_as_current_observation(...)` | Context manager; becomes the active parent; ends on exit |
| `start_observation(...)` | Manual object; not set as current; **call `.end()` yourself** |
| `span.start_as_current_observation(...)` | Child of a specific span |
| `obs.update(...)` | Set `output`, `metadata`, `level`, `status_message`, `model`, `usage_details`, `cost_details`, `prompt` |
| `update_current_span()` / `update_current_generation()` | Update the active observation without holding a reference |
| `create_event(name=...)` | Zero-duration observation |
| `get_current_trace_id()` / `get_trace_url()` | IDs and deep links for logs and test reports |

## Trace Attributes: `propagate_attributes`

User, session, tags and metadata are **propagated** to every span created inside the context — so filters and aggregations work on all observations.

```python
from langfuse import get_client, observe, propagate_attributes

langfuse = get_client()


@observe()
def handle_chat_turn(user_id: str, thread_id: str, message: str) -> str:
    with propagate_attributes(
        user_id=user_id,
        session_id=thread_id,
        tags=["support-bot", "eu"],
        metadata={"tenant": "acme", "flow": "refund"},   # dict[str, str], values ≤ 200 chars
        version="bot-2.3.1",
        trace_name="support-chat-turn",
    ):
        return rag_pipeline(message)
```

- Enter it **as early as possible** — spans created before the context don't get the attributes.
- `user_id` / `session_id` longer than 200 chars are dropped with a warning.
- `environment=` can be set per request; process-wide use `LANGFUSE_TRACING_ENVIRONMENT`.
- `as_baggage=True` also puts attributes into OTel baggage so they cross service boundaries — they then travel in HTTP headers, so never use it for sensitive values.

## Integrations

| Integration | How | Result |
|-------------|-----|--------|
| OpenAI SDK | `from langfuse.openai import openai` | Each call = generation with model, usage, cost; streaming supported |
| LangChain / LangGraph | `from langfuse.langchain import CallbackHandler` | Chain/agent/tool/LLM tree |
| LiteLLM | `litellm.callbacks = ["langfuse_otel"]` | Generations for every provider behind LiteLLM |
| Any OTel instrumentation | OTLP/HTTP to `/api/public/otel` | Spans with `gen_ai.*` attributes mapped to generations |

```python
# OpenAI drop-in: extra kwargs name/metadata/langfuse_prompt are consumed by Langfuse
from langfuse.openai import openai

resp = openai.chat.completions.create(
    name="summarize-bug-report",
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Summarize: login fails after password reset"}],
    metadata={"suite": "smoke"},
)
```

```python
# LangChain: pass the handler in config
from langchain_openai import ChatOpenAI
from langfuse.langchain import CallbackHandler

handler = CallbackHandler()
llm = ChatOpenAI(model="gpt-4o-mini")
llm.invoke("Write 3 negative test cases for a login form", config={"callbacks": [handler]})
```

```python
# LiteLLM: route to any provider, trace in Langfuse via OTel callback
import litellm

litellm.callbacks = ["langfuse_otel"]
litellm.completion(
    model="anthropic/claude-sonnet-5",
    messages=[{"role": "user", "content": "Is this stack trace a flaky test or a real bug?"}],
    metadata={"generation_name": "flaky-classifier", "session_id": "run-2026-09-27", "tags": ["ci"]},
)
```

```bash
# Raw OTel exporters (other languages, collectors): OTLP over HTTP only, no gRPC
AUTH=$(echo -n "$LANGFUSE_PUBLIC_KEY:$LANGFUSE_SECRET_KEY" | base64 -w 0)
export OTEL_EXPORTER_OTLP_ENDPOINT="$LANGFUSE_BASE_URL/api/public/otel"
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Basic $AUTH,x-langfuse-ingestion-version=4"
```

!!! warning "v4 exports only LLM spans by default"
    Spans from HTTP/DB auto-instrumentation are filtered out unless they come from the Langfuse SDK, carry `gen_ai.*` attributes, or come from a known LLM instrumentor. Restore "export everything" with `Langfuse(should_export_span=lambda span: True)` — or compose with `langfuse.span_filter.is_default_export_span`.

## Flushing in Short-Lived Processes

Spans are batched in a background thread. A script, pytest session, Celery task or Lambda can exit before the batch is sent.

| Situation | Call |
|-----------|------|
| End of a script / CLI command | `langfuse.flush()` |
| Serverless handler | `langfuse.flush()` before returning |
| Process shutdown (long-running service) | `langfuse.shutdown()` — flushes and stops threads (also registered `atexit`) |
| pytest | `flush()` in a session-scoped fixture teardown |

## Sampling

```python
Langfuse(sample_rate=0.2)   # or LANGFUSE_SAMPLE_RATE=0.2
```

- Sampling is per **trace**: a trace is kept or dropped with all its observations.
- Keep `1.0` in tests and CI; sample only high-volume production traffic.
- Scores for dropped traces have nothing to attach to — sample *after* deciding what you evaluate online.

## Masking

```python
import re
from typing import Any
from langfuse import Langfuse

EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
CARD = re.compile(r"\b(?:\d[ -]?){13,19}\b")


def mask_pii(*, data: Any, **kwargs: Any) -> Any:
    if isinstance(data, str):
        return CARD.sub("[CARD]", EMAIL.sub("[EMAIL]", data))
    if isinstance(data, dict):
        return {k: mask_pii(data=v) for k, v in data.items()}
    if isinstance(data, list):
        return [mask_pii(data=v) for v in data]
    return data


langfuse = Langfuse(mask=mask_pii)
```

- `mask` runs on inputs, outputs and metadata set through the Langfuse SDK and its integrations.
- It does **not** see raw attributes of third-party OTel instrumentations — for those, use `mask_otel_spans`, which patches spans at export time (`MaskOtelSpansParams` → `MaskOtelSpansResult` with `OtelSpanPatch`).
- Unit-test the mask function itself: it is a data-leak control, not a nice-to-have.

---
## See also
- [Langfuse — LLM Tracing, Prompts & Evals](./index.md)
- [Langfuse — Prompt Management](./03-prompt-management.md)
- [OpenTelemetry — Tracing](../../libs/opentelemetry/02-tracing.md)
- [LiteLLM — One API for 100+ LLM Providers](../../libs/litellm/index.md)
- [LangChain — LLM Application Framework](../../libs/langchain/index.md)
- [Arize Phoenix](../phoenix/index.md)
- [LangGraph — Observability & Deployment](../../libs/langgraph/06-observability-deployment.md)
- [Agno — AgentOS & Observability](../../libs/agno/04-agentos-observability.md)
