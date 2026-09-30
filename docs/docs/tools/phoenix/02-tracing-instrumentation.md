---
date: 2026-09-27
tags:
  - tools
  - observability
  - llm
  - phoenix
---

# Phoenix — Tracing & Instrumentation

Three layers, usually combined: `register()` configures OpenTelemetry, OpenInference **instrumentors** trace SDK calls automatically, **manual spans** wrap your own chains, tools and retrievers.

## `register()`

```python
from phoenix.otel import register

tracer_provider = register(
    project_name="ticket-triage-dev",            # or PHOENIX_PROJECT_NAME
    endpoint="http://localhost:6006/v1/traces",  # or PHOENIX_COLLECTOR_ENDPOINT
    batch=True,                                  # BatchSpanProcessor (default: Simple)
    auto_instrument=True,                        # enable all installed openinference instrumentors
)
tracer = tracer_provider.get_tracer(__name__)
```

| Parameter | Default | Notes |
|-----------|---------|-------|
| `endpoint` | env / `localhost` | `.../v1/traces` → HTTP; `host:4317` → gRPC |
| `protocol` | inferred | `"http/protobuf"` or `"grpc"`; set it when the endpoint is only a base URL |
| `project_name` | `PHOENIX_PROJECT_NAME` or `default` | Stored as `openinference.project.name` resource attribute |
| `batch` | `False` | `True` for services; `False` flushes each span immediately (tests, scripts) |
| `set_global_tracer_provider` | `True` | `False` when the app already owns a global provider |
| `headers`, `api_key` | env | Auth for a secured Phoenix |
| `auto_instrument` | `False` | Calls `.instrument()` on every installed `openinference-instrumentation-*` |

`register()` returns a regular OTel `TracerProvider` subclass: add extra span processors (e.g. a second exporter) with `tracer_provider.add_span_processor(...)`, and call `tracer_provider.shutdown()` at the end of short-lived jobs.

## OpenInference Instrumentors

| Library | Package | Instrumentor |
|---------|---------|--------------|
| OpenAI SDK | `openinference-instrumentation-openai` | `openinference.instrumentation.openai.OpenAIInstrumentor` |
| Anthropic SDK | `openinference-instrumentation-anthropic` | `openinference.instrumentation.anthropic.AnthropicInstrumentor` |
| LiteLLM | `openinference-instrumentation-litellm` | `openinference.instrumentation.litellm.LiteLLMInstrumentor` |
| LangChain / LangGraph | `openinference-instrumentation-langchain` | `openinference.instrumentation.langchain.LangChainInstrumentor` |
| LlamaIndex | `openinference-instrumentation-llama-index` | `openinference.instrumentation.llama_index.LlamaIndexInstrumentor` |

Other instrumentors exist for Bedrock, Google GenAI, DSPy, CrewAI, OpenAI Agents SDK, MCP and more — same pattern.

```python
from openinference.instrumentation.anthropic import AnthropicInstrumentor
from openinference.instrumentation.litellm import LiteLLMInstrumentor

# Explicit instead of auto_instrument=True — predictable in tests
AnthropicInstrumentor().instrument(tracer_provider=tracer_provider)
LiteLLMInstrumentor().instrument(tracer_provider=tracer_provider)

import litellm
litellm.completion(
    model="anthropic/claude-sonnet-5",
    messages=[{"role": "user", "content": "Summarise ticket T-812 in one line"}],
)
# -> LLM span: llm.model_name, llm.input_messages.*, llm.output_messages.*, llm.token_count.*
```

!!! warning "Instrument once"
    Instrument each library once per process. Double instrumentation (e.g. LiteLLM + the OpenAI SDK it calls) produces nested duplicate LLM spans — pick the outermost layer.

## Span Kinds

| Kind | Represents | Key attributes |
|------|------------|----------------|
| `LLM` | One model call | `llm.model_name`, `llm.provider`, `llm.input_messages`, `llm.token_count.total` |
| `CHAIN` | Glue logic, a request handler, a pipeline step | `input.value`, `output.value` |
| `TOOL` | A function the model called | `tool.name`, `tool.parameters` |
| `RETRIEVER` | Vector / keyword search | `retrieval.documents.N.document.content`, `.document.score` |
| `AGENT` | An agent loop (reasoning + tools) | `input.value`, `output.value` |
| `EMBEDDING` | Embedding call | `embedding.model_name`, `embedding.embeddings` |
| `RERANKER`, `GUARDRAIL`, `EVALUATOR`, `PROMPT` | Reranking, safety checks, eval runs, prompt rendering | kind-specific |

## Manual Spans: Decorators

```python
from phoenix.otel import register

tracer = register(project_name="ticket-triage-dev").get_tracer("triage")


@tracer.tool
def lookup_customer(email: str) -> dict:
    """Fetch the customer plan from CRM."""
    return {"email": email, "plan": "pro", "open_tickets": 2}


@tracer.chain
def classify(ticket: str) -> str:
    customer = lookup_customer("ann@example.com")
    return "billing" if "charged" in ticket.lower() else "bugs"


@tracer.agent
def triage_agent(ticket: str) -> dict:
    queue = classify(ticket)
    return {"queue": queue, "priority": "high"}
```

Decorators record arguments as `input.value`, return values as `output.value`, exceptions as span status `ERROR`, and tool signatures as `tool.parameters` (JSON schema). `@tracer.llm` and `@tracer.retriever` exist for wrapping custom model and search clients.

## Manual Spans: Context Managers

```python
from opentelemetry.trace import Status, StatusCode
from openinference.semconv.trace import DocumentAttributes, SpanAttributes


def retrieve(query: str, k: int = 3) -> list[dict]:
    with tracer.start_as_current_span("search_kb", openinference_span_kind="retriever") as span:
        span.set_input(query)
        docs = kb.search(query, k=k)                     # your vector store
        for i, doc in enumerate(docs):
            prefix = f"{SpanAttributes.RETRIEVAL_DOCUMENTS}.{i}"
            span.set_attribute(f"{prefix}.{DocumentAttributes.DOCUMENT_ID}", doc["id"])
            span.set_attribute(f"{prefix}.{DocumentAttributes.DOCUMENT_CONTENT}", doc["text"])
            span.set_attribute(f"{prefix}.{DocumentAttributes.DOCUMENT_SCORE}", doc["score"])
        span.set_status(Status(StatusCode.OK))
        return docs


def answer(question: str) -> str:
    with tracer.start_as_current_span("rag_answer", openinference_span_kind="chain") as span:
        span.set_input(question)
        docs = retrieve(question)
        reply = llm_answer(question, docs)                # instrumented SDK call -> LLM child span
        span.set_output(reply)
        return reply
```

Documents on `RETRIEVER` spans appear in the UI as a ranked list and can be scored with document-level evals (retrieval relevance).

## Sessions, Users, Metadata, Tags

```python
from openinference.instrumentation import using_attributes, using_session, using_user


def handle_chat_turn(conversation_id: str, user_id: str, message: str) -> str:
    with using_attributes(
        session_id=conversation_id,              # groups turns into a session (chat view in UI)
        user_id=user_id,
        metadata={"app_version": "2.3.1", "channel": "web"},
        tags=["triage", "beta"],
    ):
        return triage_agent(message)
```

| Context manager | Sets on every span inside | Use |
|-----------------|---------------------------|-----|
| `using_session(session_id)` | `session.id` | Multi-turn conversations, one pytest test = one session |
| `using_user(user_id)` | `user.id` | Per-user debugging, feedback |
| `using_metadata(dict)` | `metadata` (JSON) | App version, experiment arm, test id |
| `using_tags(list)` | `tag.tags` | Coarse filters: `smoke`, `nightly`, `canary` |
| `using_prompt_template(template=, version=, variables=)` | `llm.prompt_template.*` | Link LLM spans to a prompt version |
| `using_attributes(...)` | All of the above | One call |
| `suppress_tracing()` | Nothing is recorded | Health checks, warm-up calls, judge calls you do not want in the app project |

All of them are also importable from `phoenix.otel`. They work through OTel context, so they cross `async` boundaries but not threads started without context propagation.

## Sending via an Existing OTel Collector

Phoenix is a plain OTLP backend — route LLM spans through the Collector you already run:

```yaml
# otel-collector.yaml
exporters:
  otlphttp/phoenix:
    endpoint: http://phoenix:6006          # the exporter appends /v1/traces
    headers:
      authorization: "Bearer ${env:PHOENIX_API_KEY}"
processors:
  filter/llm-only:                          # keep only OpenInference spans
    traces:
      span:
        - 'attributes["openinference.span.kind"] == nil'
service:
  pipelines:
    traces/phoenix:
      receivers: [otlp]
      processors: [filter/llm-only, batch]
      exporters: [otlphttp/phoenix]
```

- The app keeps its standard OTLP exporter pointed at the Collector; add OpenInference instrumentors to the same provider.
- Set the project via resource attribute: `OTEL_RESOURCE_ATTRIBUTES=openinference.project.name=triage-prod`.
- Non-OpenInference spans (HTTP, DB) are accepted too, shown as `UNKNOWN` kind — filter them if they add noise.

## Annotations and Feedback

Annotations are labels/scores attached to spans, traces or sessions — from humans (UI or thumbs up/down), code checks, or LLM judges.

```python
from opentelemetry import trace
from phoenix.client import Client

px = Client()


def triage_endpoint(ticket: str) -> dict:
    result = triage_agent(ticket)
    span_id = format(trace.get_current_span().get_span_context().span_id, "016x")
    return {**result, "span_id": span_id}          # return it to the frontend


def on_user_feedback(span_id: str, helpful: bool, comment: str | None) -> None:
    px.spans.add_span_annotation(
        span_id=span_id,
        annotation_name="user_feedback",
        annotator_kind="HUMAN",                    # HUMAN | LLM | CODE
        label="helpful" if helpful else "not_helpful",
        score=1.0 if helpful else 0.0,
        explanation=comment,
    )
```

Also available: `px.traces.add_trace_annotation(...)`, `px.sessions.add_session_annotation(...)`, `px.spans.add_span_note(span_id=..., note=...)`, and bulk `log_span_annotations_dataframe(...)` for eval results ([04 Evaluations](./04-evaluations.md)).

---
## See also
- [Arize Phoenix — LLM Tracing & Evaluation](./index.md)
- [Phoenix — Setup & Architecture](./01-setup-architecture.md)
- [OpenTelemetry — Tracing](../../libs/opentelemetry/02-tracing.md)
- [OpenTelemetry — Collector & Backends](../../libs/opentelemetry/05-collector-backends.md)
- [LiteLLM — One API for 100+ LLM Providers](../../libs/litellm/index.md)
- [Langfuse — LLM Tracing, Prompts & Evals](../langfuse/index.md)
- [LangGraph — Observability & Deployment](../../libs/langgraph/06-observability-deployment.md)
- [Agno — AgentOS & Observability](../../libs/agno/04-agentos-observability.md)
