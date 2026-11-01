---
date: 2026-10-25 12:00:00
tags:
  - python
  - libraries
  - ragas
  - rag
  - llm-evaluation
  - testing
---

# Ragas — Datasets, Samples & Setup

Every Ragas score starts from the same pieces: a row of evaluation data, a judge LLM (and sometimes an embedding model), and a call that turns them into a number. This page covers the data model, the judge setup per provider, how to score a whole dataset, the legacy `evaluate()` function, and timeouts, retries and caching.

## Sample Fields

`SingleTurnSample` is one question-answer interaction. Every field is optional; each metric reads only the ones it needs.

| Field | Type | Meaning |
|-------|------|---------|
| `user_input` | `str` | The question or prompt sent to your app |
| `retrieved_contexts` | `list[str]` | Passages your retriever returned, in rank order |
| `response` | `str` | The answer your app produced |
| `reference` | `str` | The gold answer (one string, not a list) |
| `reference_contexts` | `list[str]` | Gold passages; filled by test set generation |
| `retrieved_context_ids`, `reference_context_ids` | `list[str \| int]` | Passage IDs for `IDBasedContextPrecision` / `IDBasedContextRecall` |
| `rubrics` | `dict[str, str]` | Per-sample rubric for `InstanceSpecificRubrics` |
| `multi_responses` | `list[str]` | Several responses to the same input |
| `persona_name`, `query_style`, `query_length` | `str` | Set by the test set generator |

```python
from ragas import SingleTurnSample

sample = SingleTurnSample(
    user_input="What is the refund window?",
    retrieved_contexts=["Our policy: refunds are accepted within 30 days of purchase."],
    response="Refunds are accepted within 30 days.",
    reference="Refunds are accepted within 30 days of purchase.",
)
sample.to_dict()          # fields that are None are left out
```

`MultiTurnSample` holds a conversation for agent metrics. `user_input` is a list of `HumanMessage`, `AIMessage` (with optional `tool_calls`) and `ToolMessage`; the other fields are `reference` (expected outcome), `reference_tool_calls`, `reference_topics` and `rubrics`.

```python
from ragas import MultiTurnSample
from ragas.messages import AIMessage, HumanMessage, ToolCall, ToolMessage

sample = MultiTurnSample(
    user_input=[
        HumanMessage(content="Book a table for 2 at 19:00"),
        AIMessage(content="Checking.", tool_calls=[ToolCall(name="book_table", args={"party": 2, "time": "19:00"})]),
        ToolMessage(content="confirmed #42"),
        AIMessage(content="Your table is booked, confirmation #42."),
    ],
    reference="Table for 2 booked at 19:00",
    reference_tool_calls=[ToolCall(name="book_table", args={"party": 2, "time": "19:00"})],
)
```

The sample validates message order: a `ToolMessage` must follow an `AIMessage` that has `tool_calls` (or another `ToolMessage`), otherwise Pydantic raises `ToolMessage must follow an AIMessage where tools were called`.

## EvaluationDataset

`EvaluationDataset` is a list of samples of one kind (all single-turn or all multi-turn).

```python
import pandas as pd
from ragas import EvaluationDataset

ds = EvaluationDataset.from_list([
    {"user_input": "q1", "response": "a1", "retrieved_contexts": ["c1", "c2"], "reference": "r1"},
])
ds = EvaluationDataset.from_pandas(pd.DataFrame(rows))        # same dict keys as columns
ds = EvaluationDataset.from_jsonl("golden.jsonl")
ds = EvaluationDataset.from_hf_dataset(hf_dataset)

ds.to_jsonl("out.jsonl"); ds.to_pandas(); ds.to_hf_dataset()
ds.features()                  # ['user_input', 'response', ...] taken from the first sample
ds[:20]                        # slicing returns an EvaluationDataset
ds.is_multi_turn()
```

- Store datasets as **JSONL**. `to_csv()` writes list fields as Python-repr strings (`"['c1', 'c2']"`), there is no `from_csv()`, and `from_pandas()` on such a frame fails with `retrieved_contexts: Input should be a valid list`.
- Mixing single-turn and multi-turn samples raises `ValueError: Sample at index N is of type ..., expected ...`.
- Old Hugging Face columns `question`, `answer`, `contexts`, `ground_truth` are renamed to `user_input`, `response`, `retrieved_contexts`, `reference` by `evaluate()`. Other names need `column_map={"retrieved_contexts": "ctx"}`.

## Dataset and Backends

`Dataset` is the list-like container used by experiments (see [04](./04-testsets-experiments.md)). It validates rows with an optional Pydantic model and saves them through a backend.

```python
from pydantic import BaseModel
from ragas import Dataset


class Row(BaseModel):
    user_input: str
    retrieved_contexts: list[str]
    reference: str


ds = Dataset(name="qa", backend="local/jsonl", root_dir="evals", data_model=Row)
ds.append({"user_input": "q", "retrieved_contexts": ["c"], "reference": "r"})   # dicts are validated
ds.save()                                                                       # evals/datasets/qa.jsonl
ds = Dataset.load("qa", "local/jsonl", root_dir="evals", data_model=Row)
```

| Backend | Storage | Notes |
|---------|---------|-------|
| `local/jsonl` | `<root_dir>/datasets/<name>.jsonl`, `<root_dir>/experiments/<name>.jsonl` | Keeps nested lists and objects |
| `local/csv` | `.csv` files in the same layout | Flattens lists to strings on load |
| `inmemory` | process memory | Tests and throwaway runs |
| `gdrive` | Google Sheets | Needs the `gdrive` extra and Google credentials |

## Judge LLM

LLM-based metrics call `llm_factory(model, client=...)`. The factory wraps your provider SDK client with [Instructor](https://python.useinstructor.com/) so every judge call returns a Pydantic object: the metric sends the prompt plus the output JSON schema, and Instructor re-asks the model when the reply does not validate.

```python
from openai import AsyncOpenAI
from ragas.llms import llm_factory

llm = llm_factory(
    "gpt-4o-mini",
    client=AsyncOpenAI(timeout=60, max_retries=2),     # SDK retries 429 / 5xx
    temperature=0,                                      # default is 0.01
)
```

| Provider | Setup |
|----------|-------|
| OpenAI | `llm_factory("gpt-4o-mini", client=AsyncOpenAI())` |
| OpenAI-compatible server (Ollama, vLLM, LM Studio, a LiteLLM proxy) | `AsyncOpenAI(base_url="http://localhost:11434/v1", api_key="ollama")` and `llm_factory("llama3.1", client=client)` — see [Ollama](../../tools/ollama/index.md) |
| Azure OpenAI | `llm_factory("<deployment name>", provider="openai", client=AsyncAzureOpenAI(azure_endpoint=..., api_version=..., api_key=...))`. `provider="azure"` fails with `Failed to patch azure client with Instructor` |
| Anthropic | `llm_factory("claude-sonnet-4-5", provider="anthropic", client=AsyncAnthropic())` plus the fix below |
| Bedrock, Vertex AI and other LiteLLM providers | `llm_factory("bedrock/<model id>", provider="litellm", client=litellm.acompletion)`. Use `acompletion`: the sync `litellm.completion` shown in some guides fails in `ascore` |

!!! warning "Anthropic: drop the sampling parameters the SDK no longer accepts"
    ragas always sends `temperature`, `top_p` and `max_tokens`. Recent `anthropic` SDKs (1.0 and later) have no `temperature` or `top_p` in `messages.create`, so the first judge call raises `TypeError: AsyncMessages.create() got an unexpected keyword argument 'temperature'`. Remove the keys from the LLM object:

    ```python
    llm = llm_factory("claude-sonnet-4-5", provider="anthropic", client=AsyncAnthropic())
    llm.model_args.pop("temperature", None)
    llm.model_args.pop("top_p", None)
    ```

Behaviour that matters in practice:

| Item | Behaviour |
|------|-----------|
| Async client | `ascore` needs an async client. A sync `OpenAI()` raises `TypeError: Cannot use agenerate() with a synchronous client` |
| Event loop | Create the client inside the coroutine you pass to `asyncio.run()`. One `AsyncOpenAI` client reused across several `asyncio.run()` calls fails intermittently with `Connection error` because pooled connections belong to a closed loop |
| Defaults | `temperature=0.01`, `top_p=0.1`, `max_tokens=1024`; override with keyword arguments; `system_prompt="..."` adds a system message |
| Reasoning models | For `gpt-5*` and `o1`–`o9` models ragas sets `temperature=1.0`, drops `top_p` and sends `max_completion_tokens`; raise `max_tokens` (for example 4096) so structured output is not truncated |
| Invalid JSON | Instructor retries up to 3 times (4 calls in total); `llm_factory(..., max_retries=1)` allows 2 calls. Every retry is billed. After the last failure `InstructorRetryException` is raised |
| Cache | `llm_factory(..., cache=DiskCacheBackend(...))`, see Caching below |
| Adapter | `adapter="auto"` picks LiteLLM when the client comes from `litellm`, otherwise Instructor |

## Embeddings

`AnswerRelevancy`, `SemanticSimilarity` and (optionally) `AnswerCorrectness` need embeddings.

```python
from ragas.embeddings.base import embedding_factory

emb = embedding_factory("openai", model="text-embedding-3-small", client=AsyncOpenAI())
```

| Provider | Call |
|----------|------|
| OpenAI, Azure (deployment name as `model`), any OpenAI-compatible server | `embedding_factory("openai", model=..., client=<async client>)` |
| LiteLLM | `embedding_factory("litellm", model="bedrock/amazon.titan-embed-text-v2:0")` |
| Local Hugging Face | `embedding_factory("huggingface", model="sentence-transformers/all-MiniLM-L6-v2")` (needs `sentence-transformers`) |

Calling `embedding_factory("text-embedding-3-small")` without a client returns the legacy LangChain-based wrapper and emits a `DeprecationWarning`. The legacy `evaluate()` path with embedding metrics (`ResponseRelevancy`, `SemanticSimilarity`) needs such a legacy object: a modern embedding object fails there with `AttributeError: 'OpenAIEmbeddings' object has no attribute 'embed_query'`.

## Scoring a Dataset

A collections metric exposes `ascore(**fields)`, `abatch_score(list_of_dicts)` and the synchronous `score(**fields)` / `batch_score(...)`. The synchronous variants call `asyncio.run` and raise `RuntimeError: Cannot call sync score() from an async context` inside a running loop. `abatch_score` starts every item at once, so wrap calls in a semaphore for real datasets:

```python
import asyncio
import inspect
import math

import pandas as pd
from ragas import EvaluationDataset


async def ascore_dataset(dataset: EvaluationDataset, metrics, concurrency: int = 8) -> pd.DataFrame:
    sem = asyncio.Semaphore(concurrency)
    rows = [s.model_dump() for s in dataset]

    async def one(metric, row):
        params = inspect.signature(metric.ascore).parameters       # pass only the fields this metric takes
        kwargs = {k: row[k] for k in params if k in row}
        async with sem:
            try:
                return (await metric.ascore(**kwargs)).value
            except Exception as exc:                                # failed judge call -> NaN, not a crash
                print(f"{metric.name}: {type(exc).__name__}: {str(exc)[:80]}")
                return math.nan

    flat = await asyncio.gather(*[one(m, r) for r in rows for m in metrics])
    n = len(metrics)
    scores = [{m.name: flat[i * n + j] for j, m in enumerate(metrics)} for i in range(len(rows))]
    return pd.concat([dataset.to_pandas(), pd.DataFrame(scores)], axis=1)
```

Save the helper as `evals/harness.py`; the other pages import it from there. The returned frame has the dataset columns plus one column per metric name (`faithfulness`, `context_recall`, ...). Missing or empty required fields raise `ValueError` inside the metric (for example `response is missing`), which the helper turns into NaN.

`MetricResult` carries `.value`, `.reason` (filled by rubric, discrete and numeric metrics) and `.traces`. Collections RAG metrics return only `.value`. To see what the judge is asked, render the metric's prompt object (`metric.prompt`; `statement_generator_prompt` and `nli_statement_prompt` on `Faithfulness`) with `.to_string(input_model)`, or read the traces of a legacy run (below).

## Legacy `evaluate()`

`evaluate(dataset, metrics, llm, embeddings, ...)` runs legacy metric objects over a dataset with a progress bar and returns an `EvaluationResult`. It emits `DeprecationWarning`, but it is the only runner for `AspectCritic`, `SimpleCriteriaScore`, `NonLLMContextRecall` and the other legacy-only metrics, and it works with an `llm_factory` LLM.

```python
import warnings
warnings.filterwarnings("ignore", category=DeprecationWarning)

from ragas import EvaluationDataset, RunConfig, evaluate
from ragas.metrics import AspectCritic, Faithfulness, LLMContextRecall, NonLLMContextRecall

result = evaluate(
    dataset,                                                   # EvaluationDataset or Hugging Face Dataset
    metrics=[Faithfulness(), LLMContextRecall(), AspectCritic(name="harmless", definition="Is the response harmless?"),
             NonLLMContextRecall()],
    llm=llm,                                                   # llm_factory(...) object
    run_config=RunConfig(timeout=60, max_retries=3, max_workers=8),
    raise_exceptions=False,
    show_progress=False,
)
print(result)                                                  # {'faithfulness': 0.9, 'context_recall': 1.0, ...} means, NaN skipped
df = result.to_pandas()                                        # dataset columns + one column per metric
```

| Parameter | Meaning |
|-----------|---------|
| `metrics` | List of legacy metric objects. A collections metric raises `TypeError: All metrics must be initialised metric objects`. `None` runs answer relevancy, context precision, faithfulness and context recall |
| `llm`, `embeddings` | Applied to every metric that has none of its own; with `llm=None` ragas builds an OpenAI client from the environment |
| `run_config` | `RunConfig`, see below |
| `raise_exceptions` | `False` (default): a failed metric becomes NaN and the error is logged (`Exception raised in Job[3]: ...`). `True`: the first error is raised (`TimeoutError`, validation errors) |
| `batch_size` | Process jobs in chunks of this size (default: all at once) |
| `column_map` | Rename dataset columns, `{"retrieved_contexts": "ctx"}` |
| `token_usage_parser` | Enables `result.total_tokens()` and `result.total_cost(...)`; only counts calls made through a LangChain-wrapped LLM. With an `llm_factory` LLM nothing is recorded and `total_tokens()` raises `IndexError` |
| `callbacks`, `experiment_name` | LangChain callbacks and the trace name |
| `return_executor` | Return the `Executor`; call `executor.cancel()` to stop |
| `allow_nest_asyncio` | `True` (default) patches the running event loop for notebooks; use `False` in async services, or call `aevaluate` |

Reading results:

| Access | Returns |
|--------|---------|
| `result["faithfulness"]` | List of per-row scores (NaN for failures) |
| `result.scores` | List of dicts, one per row |
| `result.to_pandas()` | Dataset columns plus scores |
| `result.traces` | One dict per row: metric, then prompt name, then `input` / `output` strings of every judge call |
| `result.total_tokens()`, `result.total_cost(cost_per_input_token=..., cost_per_output_token=...)` | Token and cost totals (needs `token_usage_parser`, LangChain LLM) |

## RunConfig

`RunConfig` governs the executor behind `evaluate()` and `TestsetGenerator`. The collections `ascore` path does not read it: set `timeout` and `max_retries` on the provider client and `max_retries` on `llm_factory` instead.

| Field | Default | Meaning |
|-------|---------|---------|
| `timeout` | 180 | Seconds per metric call; a timeout becomes NaN, or `TimeoutError` with `raise_exceptions=True` |
| `max_retries` | 10 | Retry attempts per call (tenacity, exponential backoff with jitter) |
| `max_wait` | 60 | Longest backoff in seconds |
| `max_workers` | 16 | Concurrent jobs |
| `exception_types` | `(Exception,)` | Exceptions that trigger a retry |
| `log_tenacity` | `False` | Log retry attempts |
| `seed` | 42 | Seed of the internal random generator |

## Caching

`DiskCacheBackend` stores judge replies on disk, keyed by the call (class and method name) and its arguments: the rendered prompt and the response model. A rerun with identical inputs makes no judge calls; a changed response, context or prompt is a miss. **The key does not contain the judge model name or its parameters** (`temperature`, `max_tokens`): switching `gpt-4o-mini` to another model, or changing `temperature`, while keeping the same cache directory returns the old model's answers. Use one cache directory per judge configuration. The embedding cache covers single-text calls (`embed_text` / `aembed_text`); batch calls (`embed_texts`) are not cached.

```python
from ragas.cache import DiskCacheBackend
from ragas.embeddings.base import embedding_factory
from ragas.llms import llm_factory

cache = DiskCacheBackend(cache_dir=".ragas_cache/gpt-4o-mini")   # one directory per judge model; default is ".cache"
llm = llm_factory("gpt-4o-mini", client=client, cache=cache)
emb = embedding_factory("openai", model="text-embedding-3-small", client=client, cache=DiskCacheBackend(".ragas_cache/embeddings"))
```

Add the directory to `.gitignore` and persist it between CI runs (see [05](./05-testing-ci.md)). A custom backend subclasses `CacheInterface` with `get`, `set` and `has_key`.

## Common Mistakes

| Mistake | Effect | Fix |
|---------|--------|-----|
| Sync client with `ascore` | `TypeError: Cannot use agenerate() with a synchronous client` | `AsyncOpenAI`, `litellm.acompletion` |
| `provider="azure"` | `Failed to patch azure client with Instructor` | `provider="openai"` with `AsyncAzureOpenAI` |
| Anthropic with default arguments | `unexpected keyword argument 'temperature'` | Pop `temperature` and `top_p` from `llm.model_args` |
| Collections metric in `evaluate()` | `TypeError: All metrics must be initialised metric objects` | Loop with `ascore`, or use the legacy class |
| Embedding metric in `evaluate()` with a modern embedding object | `no attribute 'embed_query'` | Legacy embeddings object, or score with `ascore` |
| CSV for datasets with lists | Lists become strings | JSONL |
| Averaging scores without checking NaN | A failed judge hides in the mean | Count NaN rows first ([05](./05-testing-ci.md)) |

---
## See also
- [Ragas — Evaluation for LLM, RAG and Agent Applications](./index.md)
- [Ragas — RAG Metrics](./02-rag-metrics.md)
- [Ragas — Testing & CI](./05-testing-ci.md)
- [LiteLLM — One API for 100+ LLM Providers](../litellm/index.md)
- [Ollama — Local LLM Runtime](../../tools/ollama/index.md)
- [Pydantic — Data Validation & Settings](../pydantic/index.md)
- [DeepEval — LLM Testing Guide](../../llm-evaluation/index.md)
