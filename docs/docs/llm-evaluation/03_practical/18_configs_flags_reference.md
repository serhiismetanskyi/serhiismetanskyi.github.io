---
date: 2026-08-08
tags:
  - llm
  - evaluation
  - deepeval
  - rag
---

# DeepEval Guide — Part 18: Evaluation Configs, Flags & Reference

## Configs for `evaluate()`

All configs are optional parameters passed to `evaluate()` or
`PromptOptimizer`. They control concurrency, display, error handling,
and caching.

### AsyncConfig

```python
from deepeval.evaluate import AsyncConfig
from deepeval import evaluate

evaluate(
    test_cases=[...], metrics=[...],
    async_config=AsyncConfig(
        run_async=True,       # concurrent evaluation (default True)
        max_concurrent=20,    # max parallel test cases (default 20)
        throttle_value=0,     # seconds between test cases (default 0)
    ),
)
```

Lower `max_concurrent` and increase `throttle_value` to avoid rate limits.

### DisplayConfig

```python
from deepeval.evaluate import DisplayConfig

evaluate(..., display_config=DisplayConfig(
    verbose_mode=None,     # override per-metric verbose_mode
    display="all",         # "all" | "failing" | "passing"
    show_indicator=True,   # progress indicator
    print_results=True,    # print results to console
))
```

### ErrorConfig

```python
from deepeval.evaluate import ErrorConfig

evaluate(..., error_config=ErrorConfig(
    skip_on_missing_params=False,  # skip metrics with missing params
    ignore_errors=False,           # ignore metric execution errors
))
```

### CacheConfig

```python
from deepeval.evaluate import CacheConfig

evaluate(..., cache_config=CacheConfig(
    use_cache=False,    # read from cached results
    write_cache=True,   # write results to disk
))
```

---

## CLI Flags for `deepeval test run`

| Flag | Description |
|------|-------------|
| `-n 4` | Parallel processes (evaluate test cases in parallel) |
| `-c` | Use cached results (skip previously evaluated cases) |
| `-i` | Ignore errors during metric execution |
| `-v` | Enable verbose mode for all metrics |
| `-s` | Skip metrics with missing test case params |
| `-id "name"` | Name the test run (identifier for Confident AI) |
| `-d "failing"` | Display mode: "all", "passing", or "failing" |
| `-r 2` | Repeat each test case N times |

**Combine flags:**

```bash
deepeval test run test_rag.py -n 4 -c -i -v
```

### Hooks

Run custom code after each test run:

```python
import deepeval

@deepeval.on_test_run_end
def after_test_run():
    print("Test run completed!")
```

---

## End-to-End vs Component-Level Evaluation

DeepEval supports two evaluation approaches:

### End-to-End (E2E)

Treats your LLM app as a black box. Evaluates overall input/output.

```python
from deepeval import evaluate

evaluate(
    test_cases=test_cases,      # LLMTestCase or ConversationalTestCase
    metrics=[metric],
    hyperparameters={"model": "gpt-4o"},
)
```

**Best for:** Simple architectures (RAG QA, summarization, PDF extraction).

### Component-Level

Evaluates individual components using `@observe` + `update_current_span`.
Different metrics apply to different components.

```python
from deepeval.tracing import observe, update_current_span
from deepeval.metrics import AnswerRelevancyMetric

@observe(metrics=[AnswerRelevancyMetric()])
def generator(query, chunks):
    res = llm.invoke(query + "\n".join(chunks))
    update_current_span(test_case=LLMTestCase(input=query, actual_output=res))
    return res
```

Then use `evals_iterator()` to run:

```python
for golden in dataset.evals_iterator():
    your_llm_app(golden.input)
```

**Best for:** Complex architectures (agents, multi-step pipelines).

---

## RAGAS Metric

DeepEval includes a wrapper for the `ragas` library — a combined metric
averaging AnswerRelevancy, Faithfulness, ContextualPrecision, and
ContextualRecall from the `ragas` package.

```python
from deepeval.metrics.ragas import RagasMetric
from deepeval.test_case import LLMTestCase

metric = RagasMetric(threshold=0.5, model="gpt-4o-mini")
test_case = LLMTestCase(
    input="What is the return policy?",
    actual_output="30-day full refund.",
    expected_output="30 day full refund at no extra cost.",
    retrieval_context=["All customers eligible for 30 day full refund."],
)
metric.measure(test_case)
```

**Note:** DeepEval's native RAG metrics ([Part 2](../01_metrics/02_rag_metrics.md)) are recommended over RAGAS.

---

## Key Environment Variables

| Variable | Effect |
|----------|--------|
| `OPENAI_API_KEY` | OpenAI API key for default judge |
| `CONFIDENT_API_KEY` | Confident AI login for cloud features |
| `DEEPEVAL_TELEMETRY_OPT_OUT=1` | Disable telemetry |
| `DEEPEVAL_RESULTS_FOLDER` | Export test run JSON to directory |
| `DEEPEVAL_VERBOSE_MODE=1` | Global verbose mode |
| `DEEPEVAL_DISABLE_TIMEOUTS=1` | Disable enforced timeouts |
| `DEEPEVAL_RETRY_MAX_ATTEMPTS` | Total retry attempts (default 2) |
| `DEEPEVAL_FILE_SYSTEM=READ_ONLY` | Restrict file writes |

### Provider selection via CLI (recommended)

```bash
deepeval set-openai --model=gpt-4o
deepeval set-anthropic -m claude-3-7-sonnet-latest
deepeval set-ollama --model=llama3
deepeval set-gemini --model=gemini-2.0-flash
deepeval set-local-model --model=my-model --base-url=http://localhost:8000/v1/
```

Full reference: [deepeval.com/docs/environment-variables](https://deepeval.com/docs/environment-variables)

### Sources

- [Flags & Configs Docs](https://deepeval.com/docs/evaluation-flags-and-configs)
- [E2E Evals Docs](https://deepeval.com/docs/evaluation-end-to-end-llm-evals)
- [Component-Level Docs](https://deepeval.com/docs/evaluation-component-level-llm-evals)
- [RAGAS Docs](https://deepeval.com/docs/metrics-ragas)
- [Environment Variables](https://deepeval.com/docs/environment-variables)
- [CLI Settings](https://deepeval.com/docs/cli)
