---
date: 2026-08-06
tags:
  - llm
  - evaluation
  - deepeval
---

# DeepEval Guide — Part 12: Testing Workflows

## Synthetic Data Generation (Synthesizer)

Manually creating test cases is slow. DeepEval's `Synthesizer` generates
thousands of test cases from your documents automatically.

### Generate from Documents

```python
from deepeval.synthesizer import Synthesizer

synthesizer = Synthesizer()
goldens = synthesizer.generate_goldens_from_docs(
    document_paths=["docs/faq.txt", "docs/policy.pdf"],
    chunk_size=1024,
    chunk_overlap=0,
    max_contexts_per_document=3,
)
```

Steps: load docs → chunk → group by similarity → generate goldens → evolve.

**Chunking parameters:**
- `chunk_size` — size of each chunk in tokens (default 1024)
- `chunk_overlap` — overlapping tokens between chunks (default 0)
- `max_contexts_per_document` — max contexts generated per doc (default 3)

Max goldens = `max_contexts_per_document` × `max_goldens_per_context`.

**Best practices:** align chunk_size with your retriever settings;
use small overlap (50–100 tokens) for interconnected content;
respect natural document sections (chapters, headings).

### Generate from Contexts

```python
from deepeval.synthesizer import Synthesizer

synthesizer = Synthesizer()
goldens = synthesizer.generate_goldens_from_contexts(
    contexts=[
        ["Earth revolves around the Sun.", "Planets are celestial bodies."],
        ["Water freezes at 0°C.", "Chemical formula for water is H2O."],
    ]
)
```

### Evolutions (Increase Complexity)

```python
from deepeval.synthesizer import Synthesizer, Evolution

synthesizer = Synthesizer()
goldens = synthesizer.generate_goldens_from_docs(
    document_paths=["docs/knowledge.txt"],
    num_evolutions=3,
    evolutions={
        Evolution.REASONING: 0.2,
        Evolution.MULTICONTEXT: 0.2,
        Evolution.COMPARATIVE: 0.2,
        Evolution.HYPOTHETICAL: 0.2,
        Evolution.IN_BREADTH: 0.2,
    },
)
```

| Evolution | What It Does |
|-----------|-------------|
| Reasoning | Requires multi-step logical thinking |
| Multicontext | Uses all relevant context information |
| Concretizing | Makes abstract ideas concrete |
| Constrained | Adds conditions/restrictions |
| Comparative | Requires comparison between options |
| Hypothetical | Forces hypothetical scenario reasoning |
| In-breadth | Broadens to related/adjacent topics |

### Qualifying Synthetic Goldens

Synthesizer auto-filters low-quality data at two stages:

**1. Context Filtering** — scored on clarity, depth, structure, relevance
(0–1 scale, threshold ≥ 0.5, 3 retries). Chunks grouped by cosine
similarity ≥ 0.5.

**2. Synthetic Input Filtering** — scored on self-containment and
clarity (same 0–1 scale, 3 retries).

Access quality scores: `goldens[0].additional_metadata["context_quality"]`,
`["synthetic_input_quality"]`, `["evolutions"]`.
Use `synthesizer.to_pandas()` for DataFrame view.

---

## Pytest Integration Patterns

### Shared Judge Model — conftest.py

In real test suites, create the judge LLM once per session in `conftest.py`
so it is reused across all test files:

```python
"""tests/conftest.py"""
import pytest
from deepeval.models import GPTModel
from deepeval.models.base_model import DeepEvalBaseLLM

@pytest.fixture(scope="session")
def judge_model() -> DeepEvalBaseLLM:
    """LLM judge shared across all tests."""
    return GPTModel(model="gpt-4o-mini", temperature=0.01)
```

Inject it into any test by adding `judge_model` as a parameter:

```python
def test_answer_relevancy(judge_model):
    metric = AnswerRelevancyMetric(model=judge_model, threshold=0.5, async_mode=False)
    ...
```

### async_mode=False for Synchronous Tests

Always pass `async_mode=False` when running metrics inside `pytest`. Without
it, metrics try to run async event-loops that conflict with pytest's sync runner:

```python
metric = FaithfulnessMetric(model=judge_model, threshold=0.5, async_mode=False)
metric.measure(test_case)
assert metric.success, f"score={metric.score}: {metric.reason}"
```

### measure() vs assert_test()

Two equivalent approaches — choose based on what you need:

```python
# Option A: assert_test — concise, recommended for simple cases
from deepeval import assert_test
assert_test(test_case, [metric])

# Option B: measure() — gives access to score and reason
metric.measure(test_case)
assert metric.success, f"{metric.__class__.__name__} score={metric.score}: {metric.reason}"
```

Use `measure()` when you need to: collect all failures before asserting
(see Failure Aggregation Pattern in [Part 20](../03_practical/20_e2e_complex_tests.md)), log scores, or check
`assert not metric.success` in negative/adversarial tests.

### Negative Tests — assert not metric.success

For tests that verify a metric DETECTS a problem:

```python
def test_hallucination_detected(judge_model):
    """Metric must fail on hallucinated output."""
    test_case = LLMTestCase(
        input="Tell me about the Nile.",
        actual_output="The Nile is in South America and is 10000 km long.",
        context=["The Nile is the longest river in Africa at 6650 km."],
    )
    metric = HallucinationMetric(model=judge_model, threshold=0.5, async_mode=False)
    metric.measure(test_case)
    assert not metric.success, f"Expected failure but score={metric.score}"
```

### Rate Limit Protection — inter-test delay

To avoid hitting OpenAI rate limits in large test suites, add an
`autouse` fixture that pauses between tests:

```python
import time
import pytest

@pytest.fixture(autouse=True)
def _inter_test_delay():
    yield
    time.sleep(1)  # 1 second pause between every test
```

---

## Regression Testing in CI/CD

### Test File

```python
"""test_rag.py"""
import pytest
from deepeval import assert_test
from deepeval.metrics import AnswerRelevancyMetric, FaithfulnessMetric
from deepeval.test_case import LLMTestCase
from deepeval.dataset import EvaluationDataset

dataset = EvaluationDataset(test_cases=[
    LLMTestCase(input="...", actual_output="..."),
])

@pytest.mark.parametrize("test_case", dataset.test_cases)
def test_rag(test_case: LLMTestCase):
    assert_test(test_case, [
        AnswerRelevancyMetric(threshold=0.7),
        FaithfulnessMetric(threshold=0.7),
    ])
```

Run: `deepeval test run test_rag.py`

### GitHub Actions Workflow


```yaml
name: LLM Regression Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install deepeval
      - run: deepeval test run test_rag.py
        env: { OPENAI_API_KEY: "${{ secrets.OPENAI_API_KEY }}" }
```


---

## Optimizing Hyperparameters

Pass `hyperparameters` to `evaluate()` to track configs across runs:

```python
from deepeval import evaluate
from deepeval.metrics import AnswerRelevancyMetric

for model in ["gpt-4o", "gpt-3.5-turbo"]:
    test_cases = build_test_cases(model)
    evaluate(
        test_cases=test_cases,
        metrics=[AnswerRelevancyMetric()],
        hyperparameters={"model": model, "prompt": "v2"},
    )
```

For CI/CD: `@deepeval.log_hyperparameters(model="gpt-4o", prompt="v2")`.

---

## LLM Tracing and Observability

### @observe Decorator

Types: `tool`, `llm`, `agent`, or custom span.

```python
from deepeval.tracing import observe

@observe(type="tool")
def search_flights(origin, dest, date):
    return [{"id": "FL123", "price": 450}]

@observe(type="agent")
def travel_agent(user_input):
    flights = search_flights("NYC", "Paris", "2026-03-15")
    return f"Found flights: {flights}"
```

### evals_iterator — end-to-end agent evals

```python
for golden in dataset.evals_iterator(metrics=[TaskCompletionMetric()]):
    travel_agent(golden.input)
```

| End-to-end | `evals_iterator(metrics=[...])` |
|---|---|
| Component | `@observe(metrics=[...])` |

---

## Datasets: Cloud Push/Pull

Store goldens in the cloud and reuse them across test runs:

```python
from deepeval.dataset import EvaluationDataset, Golden

goldens = [Golden(input="What is RAG?", expected_output="...")]
dataset = EvaluationDataset(goldens=goldens)
dataset.push(alias="RAG QA Dataset")  # upload to Confident AI

# Later, anywhere:
dataset = EvaluationDataset()
dataset.pull(alias="RAG QA Dataset")  # download from cloud
```

Create test cases on-the-fly from goldens by calling your LLM:

```python
from deepeval.test_case import LLMTestCase

test_cases = []
for golden in dataset.goldens:
    answer, docs = my_agent.answer(golden.input)
    test_cases.append(LLMTestCase(
        input=golden.input,
        actual_output=str(answer),
        expected_output=golden.expected_output,
        retrieval_context=docs,
    ))
```

---

## assert_test with Golden + observed_callback

Combine golden input → LLM call → evaluation in one step for CI/CD:

```python
"""test_agent.py"""
import pytest
from deepeval import assert_test
from deepeval.dataset import EvaluationDataset

dataset = EvaluationDataset()
dataset.pull(alias="RAG QA Dataset")

@pytest.mark.parametrize("golden", dataset.goldens)
def test_agent(golden):
    assert_test(golden=golden, observed_callback=my_agent.answer)
```

`observed_callback` receives `golden.input`, calls your LLM,
and evaluates the output with metrics from `@observe` decorators.

---

## Production Tracing Patterns

### update_current_span — attach data to spans

```python
from deepeval.tracing import observe, update_current_span

@observe(metrics=[ContextualRelevancyMetric()], name="Retriever")
def retrieve(query):
    context = [d.page_content for d in store.similarity_search(query, k=3)]
    update_current_span(input=query, retrieval_context=context)
    return context
```

### update_current_trace — group turns into conversations

```python
from deepeval.tracing import observe, update_current_trace

@observe(type="agent")
def chat(session_id, user_input):
    resp = agent.invoke({"input": user_input})
    update_current_trace(thread_id=session_id, input=user_input, output=resp["output"])
    return resp["output"]
```

### evaluate_thread — online eval by thread ID

```python
from deepeval.tracing import evaluate_thread
evaluate_thread(thread_id="session-abc", metric_collection="Prod Metrics")
```

---

## Confident AI Platform Setup

Optional cloud platform for centralizing evaluation results:

```bash
deepeval login --save=dotenv:.env
```

This adds `CONFIDENT_API_KEY` and `API_KEY` to `.env`. DeepEval auto-reads
`.env` — no code changes needed. Results appear in the Confident AI dashboard
(test runs, per-case drilldowns, issue highlighting).

**Free tier:** one default project, limited test runs (can be deleted).
To stop pushing results, remove or comment out the API keys from `.env`.

### Sources

- [Synthesizer Guide](https://deepeval.com/guides/guides-using-synthesizer)
- [CI/CD Guide](https://deepeval.com/guides/guides-regression-testing-in-cicd)
- [Hyperparameters Guide](https://deepeval.com/guides/guides-optimizing-hyperparameters)
- [Observability Guide](https://deepeval.com/guides/guides-llm-observability)
- [LLM Tracing Docs](https://deepeval.com/docs/evaluation-llm-tracing)
- [Summarizer Tutorial](https://deepeval.com/tutorials/summarization-agent/introduction)
- [RAG QA Tutorial](https://deepeval.com/tutorials/rag-qa-agent/introduction)
- [Medical Chatbot Tutorial](https://deepeval.com/tutorials/medical-chatbot/introduction)
