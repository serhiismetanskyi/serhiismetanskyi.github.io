---
date: 2026-10-25 12:00:00
tags:
  - python
  - libraries
  - llamaindex
  - rag
  - ai-agents
  - llm
  - evaluation
---

# LlamaIndex — Evaluation & Observability

A RAG answer can be wrong in two places: retrieval returned the wrong chunks, or generation misused the right ones. LlamaIndex ships evaluators for both, plus an instrumentation layer that emits events and spans for every retrieval, LLM call and tool call, which tracing backends consume.

| Question | Measure | Needs an LLM judge |
|----------|---------|--------------------|
| Did retrieval return the expected chunks? | `RetrieverEvaluator`: hit rate, MRR, precision, recall, NDCG | No (needs expected node ids) |
| Is the answer supported by the retrieved text? | `FaithfulnessEvaluator` | Yes |
| Do answer and sources match the question? | `RelevancyEvaluator` | Yes |
| Is the answer correct against a reference? | `CorrectnessEvaluator`, `SemanticSimilarityEvaluator` | Judge / embeddings |
| Does the answer follow house rules? | `GuidelineEvaluator` | Yes |
| What did a production request do and cost? | Instrumentation, OpenTelemetry, token counters | No |

## Built-in Evaluators

All evaluators return an `EvaluationResult` with `query`, `response`, `contexts`, `passing`, `score`, `feedback`, `invalid_result` and `invalid_reason`. Judges use the `llm` you pass (or `Settings.llm`): use a different, stronger model than the one being tested, with temperature 0.

| Evaluator | Inputs | Judge output | `passing` / `score` |
|-----------|--------|--------------|---------------------|
| `FaithfulnessEvaluator` | `query`, `response`, `contexts` (or a `Response`) | `YES` / `NO`: is the answer supported by the contexts | `True` / `False`; score 1.0 / 0.0 |
| `RelevancyEvaluator` | `query`, `response`, `contexts` | `YES` / `NO`: do answer and contexts match the query | `True` / `False`; score 1.0 / 0.0 |
| `CorrectnessEvaluator(score_threshold=4.0)` | `query`, `response`, optional `reference` | A line with a 1-5 score, then reasoning | `passing = score >= threshold`; `score` is the 1-5 value |
| `AnswerRelevancyEvaluator(score_threshold=2.0)` | `query`, `response` | Feedback then `[RESULT] n` with two 1-point criteria | `passing` is `None`; `score = n / 2` |
| `ContextRelevancyEvaluator(score_threshold=4.0)` | `query`, `contexts` | Feedback then `[RESULT] x` with two 2-point criteria | `passing` is `None`; `score = x / 4` |
| `SemanticSimilarityEvaluator(similarity_threshold=0.8)` | `response`, `reference` | None: embedding cosine similarity | `passing = score >= threshold` |
| `GuidelineEvaluator(guidelines=...)` | `query`, `response` | JSON `{"passing": bool, "feedback": str}` | `True` / `False`; score 1.0 / 0.0 |
| `PairwiseComparisonEvaluator` | `query`, `response`, `second_response` (keyword) | `[[A]]` first wins, `[[B]]` second wins, `[[C]]` tie | `True` / `False` / `None`; score 1.0 / 0.0 / 0.5 |

`AnswerRelevancyEvaluator` and `ContextRelevancyEvaluator` leave `passing` unset, so gate on `score`. When the `[RESULT]` line cannot be parsed, those two evaluators return `invalid_result=True` instead of raising (`raise_error=True` raises).

```python
from llama_index.core.evaluation import (
    CorrectnessEvaluator, FaithfulnessEvaluator, GuidelineEvaluator, RelevancyEvaluator, SemanticSimilarityEvaluator,
)

judge = OpenAI(model="gpt-4o", temperature=0)
query = "How long does express shipping take?"
response = query_engine.query(query)                                  # Response with source_nodes

faith = FaithfulnessEvaluator(llm=judge).evaluate_response(query=query, response=response)
rel = RelevancyEvaluator(llm=judge).evaluate_response(query=query, response=response)
print(faith.passing, rel.passing, faith.feedback)

corr = CorrectnessEvaluator(llm=judge).evaluate(
    query=query, response=str(response), reference="Express shipping takes 1 to 2 business days."
)
sim = SemanticSimilarityEvaluator(embed_model=embed_model).evaluate(response=str(response), reference="1-2 business days")
rule = GuidelineEvaluator(llm=judge, guidelines="Answer in one sentence and never quote prices.").evaluate(query=query, response=str(response))
assert faith.passing and corr.score >= 4 and rule.passing
```

`evaluate_response(query, response)` takes the contexts from `response.source_nodes`; `evaluate(query, response, contexts)` takes plain strings, which is the form to use for answers produced outside LlamaIndex. Async variants are `aevaluate` and `aevaluate_response`.

### `BatchEvalRunner`

```python
from llama_index.core.evaluation import BatchEvalRunner

runner = BatchEvalRunner(
    {"faithfulness": FaithfulnessEvaluator(llm=judge), "relevancy": RelevancyEvaluator(llm=judge)},
    workers=4,                                               # concurrent evaluations
)
results = await runner.aevaluate_queries(query_engine, queries=questions)      # runs the engine, then every evaluator
# results == {"faithfulness": [EvaluationResult, ...], "relevancy": [...]}  in query order
rate = {name: sum(r.passing for r in rs) / len(rs) for name, rs in results.items()}
```

Other entry points: `aevaluate_responses(queries=..., responses=...)` for answers you already have, `aevaluate_response_strs(queries=, response_strs=, contexts_list=)` for plain strings, and sync twins without the `a`. Extra per-query arguments go in keyword lists, for example `reference=references` for `CorrectnessEvaluator`. Calls run concurrently, so a scripted fake judge must pick its reply from the prompt, not from call order ([05](./05-testing-production.md)).

## Retrieval Metrics

```python
from llama_index.core.evaluation import RetrieverEvaluator

evaluator = RetrieverEvaluator.from_metric_names(
    ["hit_rate", "mrr", "precision", "recall", "ndcg"],
    retriever=index.as_retriever(similarity_top_k=3),
)
result = evaluator.evaluate(query="express delivery takes 1 to 2 days", expected_ids=["ship-express#0"])
result.metric_vals_dict       # {'hit_rate': 1.0, 'mrr': 1.0, 'precision': 0.333, 'recall': 1.0, 'ndcg': 1.0}
result.retrieved_ids          # ['ship-express#0', 'ship-standard#0', 'refund-physical#0']
```

| Metric name | Meaning for one query |
|-------------|-----------------------|
| `hit_rate` | 1 if any expected id is in the top k |
| `mrr` | 1 / rank of the first expected id |
| `precision`, `recall` | Expected ids found / k, expected ids found / expected |
| `ap` | Average precision |
| `ndcg` | Rank-aware gain against the ideal order |
| `cohere_rerank_relevancy` | Relevance from Cohere rerank (needs the Cohere package and key) |

Metrics are **per query**; average them yourself over a golden set (hit rate and MRR over 30-100 questions are stable enough to gate on). `expected_ids` are node ids, so use deterministic ids (`id_func`, [01](./01-data-nodes-indexing.md)) or compare `expected_texts` with `mode="text"`. `aevaluate` is the async twin.

## Generating Questions

`DatasetGenerator` asks an LLM for questions about nodes.

```python
from llama_index.core.evaluation import DatasetGenerator

golden = []
for node in nodes[:50]:
    gen = DatasetGenerator(nodes=[node], llm=judge, num_questions_per_chunk=2)
    for question in gen.generate_questions_from_nodes():
        golden.append({"query": question, "expected_ids": [node.node_id]})        # the source chunk is the answer

dataset = DatasetGenerator(nodes=nodes[:10], llm=judge, num_questions_per_chunk=2).generate_dataset_from_nodes(num=10)
dataset.qr_pairs                                                                   # [(question, answer)]
dataset.save_json("qa.json")                                                       # QueryResponseDataset
```

Generating from one node at a time gives retrieval ground truth for free. Review a sample by hand: questions copy the chunk's wording, so retrieval looks easier than real traffic, and some chunks yield bad or duplicate questions. `DatasetGenerator.from_documents(...)` also imports `spacy` (for keyword filtering), which is not a dependency of core. `DatasetGenerator` and `QueryResponseDataset` emit a `DeprecationWarning` that names `RagDatasetGenerator` and `LabelledRagDataset`, but those are not importable from `llama-index-core` 0.14.25 (`llama_index.core.llama_dataset` does not exist), so treat the generator as legacy and keep generated cases in your own JSON. The Ragas test-set generator ([Ragas](../ragas/04-testsets-experiments.md)) is an alternative that builds multi-hop questions.

## Ragas and DeepEval on LlamaIndex Output

Both libraries need four fields per case: question, answer, retrieved contexts, and (for recall and correctness metrics) a reference. A `Response` has all but the reference.

```python
from llama_index.core.base.response.schema import Response
from llama_index.core.schema import MetadataMode


def to_record(question: str, response: Response, reference: str | None = None) -> dict:
    return {
        "user_input": question,
        "response": str(response),
        "retrieved_contexts": [n.node.get_content(metadata_mode=MetadataMode.LLM) for n in response.source_nodes],
        "reference": reference,
    }
```

```python
# Ragas (see the Ragas guide for llm_factory and metric setup)
score = await Faithfulness(llm=ragas_llm).ascore(
    user_input=rec["user_input"], response=rec["response"], retrieved_contexts=rec["retrieved_contexts"]
)

# DeepEval
from deepeval import assert_test
from deepeval.metrics import FaithfulnessMetric
from deepeval.test_case import LLMTestCase

case = LLMTestCase(input=rec["user_input"], actual_output=rec["response"], retrieval_context=rec["retrieved_contexts"])
assert_test(case, [FaithfulnessMetric(threshold=0.8)])
```

`MetadataMode.LLM` evaluates the text the model actually saw, metadata included; use `NONE` for body text only. Setup, metric semantics and CI gates are in [Ragas](../ragas/index.md) and [DeepEval RAG metrics](../../llm-evaluation/01_metrics/02_rag_metrics.md). Scores from different libraries or judges are not comparable: pick one per metric family and keep the judge fixed.

## Instrumentation

`llama_index.core.instrumentation` is the current observability layer. Components publish **events** (point-in-time facts) and run inside **spans** (timed scopes); you attach handlers to a dispatcher.

| Event family | Events |
|--------------|--------|
| Query and retrieval | `QueryStartEvent` / `QueryEndEvent`, `RetrievalStartEvent` / `RetrievalEndEvent` (`.nodes`), `ReRankStartEvent` / `ReRankEndEvent` |
| Synthesis | `SynthesizeStartEvent` / `SynthesizeEndEvent`, `GetResponseStartEvent` / `GetResponseEndEvent` |
| LLM | `LLMChatStartEvent` / `LLMChatEndEvent` (`.messages`, `.response`), `LLMCompletion*`, `LLMPredict*`, `LLMStructuredPredict*` |
| Embeddings | `EmbeddingStartEvent` / `EmbeddingEndEvent` |
| Agents and chat | `AgentRunStep*`, `AgentToolCallEvent`, `StreamChat*`, `GetMessageResponse*` |
| Errors | `ExceptionEvent` |

```python
import llama_index.core.instrumentation as instrument
from llama_index.core.instrumentation.event_handlers import BaseEventHandler
from llama_index.core.instrumentation.events.llm import LLMChatEndEvent
from llama_index.core.instrumentation.events.retrieval import RetrievalEndEvent
from llama_index.core.instrumentation.span_handlers import SimpleSpanHandler


class UsageHandler(BaseEventHandler):
    """Collects retrieved ids and token usage for each request."""

    retrieved: list = []
    tokens: int = 0

    @classmethod
    def class_name(cls) -> str:
        return "UsageHandler"

    def handle(self, event, **kwargs) -> None:
        if isinstance(event, RetrievalEndEvent):
            self.retrieved.append([n.node.node_id for n in event.nodes])
        elif isinstance(event, LLMChatEndEvent):
            usage = getattr(event.response.raw, "usage", None)           # OpenAI responses carry usage
            self.tokens += usage.total_tokens if usage else 0


handler, spans = UsageHandler(), SimpleSpanHandler()
dispatcher = instrument.get_dispatcher()                               # root dispatcher: sees everything
dispatcher.add_event_handler(handler)
dispatcher.add_span_handler(spans)

query_engine.query("express shipping time")
handler.retrieved, handler.tokens
spans.completed_spans            # SimpleSpan(id_, parent_id, start_time, end_time, duration)
spans.print_trace_trees()        # ASCII tree of the run (needs `treelib`)
```

Handlers are global to the process: register them once at startup. `BaseEventHandler.handle` runs synchronously on the request path, so hand heavy work to a queue. Span ids look like `VectorIndexRetriever.retrieve-<uuid>`, and events carry `span_id`, so you can tie an event to its span.

### Callbacks (legacy)

`CallbackManager`, `LlamaDebugHandler`, `TokenCountingHandler` and `set_global_handler("simple")` are the older API. Many integrations still use it. `Settings.callback_manager = CallbackManager([handler])` activates it. Prefer instrumentation for new code; use `TokenCountingHandler` when you want ready-made counters:

```python
import tiktoken
from llama_index.core import Settings
from llama_index.core.callbacks import CallbackManager, TokenCountingHandler

counter = TokenCountingHandler(tokenizer=tiktoken.encoding_for_model("gpt-4o-mini").encode)
Settings.callback_manager = CallbackManager([counter])
query_engine.query("express shipping time")
counter.prompt_llm_token_count, counter.completion_llm_token_count, counter.total_embedding_token_count
counter.reset_counts()
```

## OpenTelemetry, OpenInference and Backends

| Route | Install | Start |
|-------|---------|-------|
| LlamaIndex's own OTel bridge | `llama-index-observability-otel` | `LlamaIndexOpenTelemetry(span_exporter=..., span_processor="batch").start_registering()` |
| OpenInference instrumentor | `openinference-instrumentation-llama-index` | `LlamaIndexInstrumentor().instrument(tracer_provider=provider)` |

```python
from openinference.instrumentation.llama_index import LlamaIndexInstrumentor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter    # opentelemetry-exporter-otlp-proto-http
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

provider = TracerProvider()
provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint="http://localhost:6006/v1/traces")))
LlamaIndexInstrumentor().instrument(tracer_provider=provider)             # once, before any LlamaIndex call
```

```python
from llama_index.observability.otel import LlamaIndexOpenTelemetry
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

LlamaIndexOpenTelemetry(
    service_name_or_resource="kb-bot",
    span_exporter=OTLPSpanExporter(endpoint="http://localhost:4318/v1/traces"),
    span_processor="batch",              # "simple" exports each span immediately (tests)
).start_registering()
```

OpenInference spans carry `openinference.span.kind` (`RETRIEVER`, `LLM`, `EMBEDDING`, `CHAIN`, ...), prompts and `llm.token_count.*`, which Phoenix, Langfuse and other OpenInference-aware backends render as retrieval and LLM views. The default span processor of `LlamaIndexOpenTelemetry` is batch, and the default exporter prints to the console. Pick one of the two routes, not both, to avoid duplicate spans.

| Backend | How |
|---------|-----|
| [Phoenix](../../tools/phoenix/index.md) | `register(project_name=..., endpoint="http://localhost:6006/v1/traces")` from `phoenix.otel`, then `LlamaIndexInstrumentor().instrument(tracer_provider=tracer_provider)` |
| [Langfuse](../../tools/langfuse/index.md) | `from langfuse import get_client; get_client()` with `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`, then `LlamaIndexInstrumentor().instrument()`. The `llama-index-callbacks-langfuse` package is the deprecated route |
| [LangSmith](../../tools/langsmith/index.md) | Accepts OTLP: point an OTLP exporter at LangSmith with `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS` (see the LangSmith guide) and instrument as above. There is no LlamaIndex-specific LangSmith package |
| Any OTLP collector | Export to a [Collector](../opentelemetry/index.md), which forwards to Jaeger, Tempo and others |

`set_global_handler("arize_phoenix")` and `set_global_handler("langfuse")` are the callback-style integrations and need their `llama-index-callbacks-*` packages. Redact before exporting: prompts and retrieved chunks are span attributes, so personal data in documents ends up in the trace backend. Configure masking in the backend SDK or the Collector ([OpenTelemetry](../opentelemetry/index.md)).

## Cost and Token Counting

| Source | What you get |
|--------|--------------|
| `LLMChatEndEvent.response.raw.usage` | Prompt, completion and total tokens as reported by the provider (OpenAI-compatible APIs) |
| `llm.token_count.*` span attributes (OpenInference) | The same, per LLM span, in your trace backend |
| `TokenCountingHandler` | Running totals for LLM and embedding tokens |
| Embedding tokens | Counted at ingest and per query; re-ingesting a corpus costs again unless cached ([01](./01-data-nodes-indexing.md)) |

LlamaIndex does not price tokens: multiply by your provider's current price table in your own code, per model, and track prompt and completion separately. Agents multiply cost by the number of loop iterations, so record iterations and tool calls next to tokens.

## Common Mistakes

| Mistake | Effect | Fix |
|---------|--------|-----|
| Judge model equals the model under test | Optimistic scores | Different, stronger judge; temperature 0 |
| Gating on `AnswerRelevancyEvaluator.passing` | Always `None` | Gate on `score` |
| Retrieval expected ids with random node ids | Cannot compare runs | `id_func` or compare texts |
| Questions generated and used unreviewed | Easy, duplicated or wrong cases | Review a sample; keep a frozen golden file |
| Averaging scores from two judges or libraries | Meaningless numbers | One judge, one library, one version per metric |
| Instrumenting twice (OTel bridge plus OpenInference) | Duplicate spans | Choose one |
| Exporting traces of private documents unredacted | Data in the backend | Mask at SDK or Collector |
| Handler doing network I/O in `handle()` | Slower requests | Queue and export in the background |

---
## See also
- [LlamaIndex — RAG and Agents over Your Data](./index.md)
- [LlamaIndex — Testing & Production](./05-testing-production.md)
- [Ragas — Evaluation for LLM, RAG and Agent Applications](../ragas/index.md)
- [DeepEval — RAG Metrics](../../llm-evaluation/01_metrics/02_rag_metrics.md)
- [Arize Phoenix](../../tools/phoenix/index.md)
- [Langfuse](../../tools/langfuse/index.md)
- [LangSmith](../../tools/langsmith/index.md)
- [OpenTelemetry — Python Observability](../opentelemetry/index.md)
- [DeepEval — LLM Testing Guide](../../llm-evaluation/index.md)
