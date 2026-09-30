---
date: 2026-08-03
tags:
  - llm
  - evaluation
  - deepeval
  - rag
  - metrics
---

# DeepEval Guide — Part 2: RAG Metrics

## What is RAG?

RAG = Retrieval-Augmented Generation. Your system:
1. Takes a user question
2. Searches a database for relevant documents
3. Sends those documents + question to an LLM
4. LLM generates an answer based on those documents

**RAG metrics test TWO things:**
- Did the system find the RIGHT documents? (retrieval quality)
- Did the LLM use those documents CORRECTLY? (generation quality)

---

## Metric 1: Answer Relevancy

**What it checks:** Is the answer about the same topic as the question?

**How it works:** The judge LLM reads the question and answer, then scores
how well the answer addresses what was asked. It does NOT check if the answer
is correct — only if it talks about the right topic. An answer can be relevant
but wrong ("Paris is in Germany" is relevant to "Where is Paris?" but incorrect).

**Required fields:** `input`, `actual_output`

```python
from deepeval import assert_test
from deepeval.metrics import AnswerRelevancyMetric
from deepeval.test_case import LLMTestCase

def test_answer_relevancy():
    """Answer talks about the topic from the question."""
    test_case = LLMTestCase(
        input="What is the capital of France?",
        actual_output="The capital of France is Paris."
    )
    metric = AnswerRelevancyMetric(threshold=0.7)
    assert_test(test_case, [metric])

def test_answer_relevancy_fail():
    """Answer talks about something completely different."""
    test_case = LLMTestCase(
        input="What is the capital of France?",
        actual_output="The Eiffel Tower was built in 1889 for the World's Fair."
    )
    metric = AnswerRelevancyMetric(threshold=0.7)
    assert_test(test_case, [metric])
```

---

## Metric 2: Faithfulness

**What it checks:** Does the answer only use facts from the retrieved documents?

This is your main protection against **hallucination** — when the LLM invents
information that is not in the source documents.

**How it works:** The judge LLM breaks `actual_output` into separate facts
(e.g. "employees get 20 days", "vacation is paid"), then checks whether each
fact exists in `retrieval_context`. If the answer contains made-up facts, it fails.

**Required fields:** `input`, `actual_output`, `retrieval_context`

> **Not the same as HallucinationMetric ([Part 3](03_llm_quality_metrics.md)).** Faithfulness uses
> `retrieval_context` — documents your RAG system found automatically.
> HallucinationMetric uses `context` — facts you provide manually as ground
> truth. Faithfulness uses a min threshold (high score = good, pass ≥),
> Hallucination uses a max threshold (low score = good, pass ≤).

```python
from deepeval import assert_test
from deepeval.metrics import FaithfulnessMetric
from deepeval.test_case import LLMTestCase

def test_faithfulness_pass():
    """All facts in the answer come from retrieved docs."""
    test_case = LLMTestCase(
        input="What is the company vacation policy?",
        actual_output="Employees get 20 days of paid vacation per year.",
        retrieval_context=[
            "Company policy: All full-time employees receive "
            "20 days of paid vacation annually."
        ],
    )
    metric = FaithfulnessMetric(threshold=0.7)
    assert_test(test_case, [metric])

def test_faithfulness_fail():
    """Answer contains facts NOT in the retrieved documents."""
    test_case = LLMTestCase(
        input="What is the company vacation policy?",
        actual_output="Employees get 30 days of vacation and free lunch.",
        retrieval_context=[
            "Company policy: All full-time employees receive "
            "20 days of paid vacation annually."
        ],
    )
    metric = FaithfulnessMetric(threshold=0.7)
    assert_test(test_case, [metric])
```

---

## Metric 3: Contextual Precision

**What it checks:** Are the useful documents ranked higher than useless ones?

**Why ranking matters:** The LLM reads retrieved documents from top to bottom.
If irrelevant documents come first, the LLM may get confused or ignore the
useful content that appears later. Good ranking = better answers.

**How it works:** The judge compares each document in `retrieval_context` to
`expected_output`. Documents that help answer the question should appear first.

**Required fields:** `input`, `actual_output`, `expected_output`, `retrieval_context`

```python
from deepeval import assert_test
from deepeval.metrics import ContextualPrecisionMetric
from deepeval.test_case import LLMTestCase

def test_contextual_precision():
    """Useful document is ranked first."""
    test_case = LLMTestCase(
        input="What causes rain?",
        actual_output="Rain is caused by water evaporation and condensation.",
        expected_output="Rain happens when water evaporates, rises, "
        "condenses into clouds, and falls as droplets.",
        retrieval_context=[
            "Water evaporates from the surface, rises into the "
            "atmosphere, cools, and condenses into rain droplets.",
            "The history of weather forecasting dates back to "
            "ancient civilizations who observed cloud patterns.",
        ],
    )
    metric = ContextualPrecisionMetric(threshold=0.7)
    assert_test(test_case, [metric])
```

---

## Metric 4: Contextual Recall

**What it checks:** Did the retriever find ALL the information needed?

**How it works:** The judge checks if every sentence in `expected_output`
can be supported by at least one document in `retrieval_context`.

**Required fields:** `input`, `actual_output`, `expected_output`, `retrieval_context`

```python
from deepeval import assert_test
from deepeval.metrics import ContextualRecallMetric
from deepeval.test_case import LLMTestCase

def test_contextual_recall():
    """Retrieved docs cover all facts from expected answer."""
    test_case = LLMTestCase(
        input="What are symptoms of flu?",
        actual_output="Flu symptoms include fever, cough, and body aches.",
        expected_output="Flu symptoms: fever, cough, body aches, fatigue.",
        retrieval_context=[
            "Influenza symptoms include high fever, persistent "
            "cough, muscle and body aches, and extreme fatigue.",
        ],
    )
    metric = ContextualRecallMetric(threshold=0.7)
    assert_test(test_case, [metric])
```

---

## Metric 5: Contextual Relevancy

**What it checks:** Are ALL retrieved documents relevant to the question?

**How it works:** The judge reads each document in `retrieval_context` and
checks if it is relevant to the `input`. If you retrieved 3 documents but
only 1 is useful, the score will be low.

**Required fields:** `input`, `actual_output`, `retrieval_context`

```python
from deepeval import assert_test
from deepeval.metrics import ContextualRelevancyMetric
from deepeval.test_case import LLMTestCase

def test_contextual_relevancy():
    """All retrieved documents are relevant to the question."""
    test_case = LLMTestCase(
        input="How does photosynthesis work?",
        actual_output="Plants convert sunlight into energy using chlorophyll.",
        retrieval_context=[
            "Photosynthesis is the process where plants use sunlight, "
            "water, and CO2 to produce glucose and oxygen.",
            "Chlorophyll in plant leaves absorbs light energy "
            "to drive the photosynthesis reaction.",
        ],
    )
    metric = ContextualRelevancyMetric(threshold=0.7)
    assert_test(test_case, [metric])
```

---

## The RAG Triad (Referenceless Evaluation)

If you do NOT have `expected_output` (no ground truth), you can still
evaluate RAG using three metrics that need only `input`, `actual_output`,
and `retrieval_context`:

1. **Answer Relevancy** — is the answer relevant to the question?
2. **Faithfulness** — does the answer use only facts from the documents?
3. **Contextual Relevancy** — are the retrieved documents relevant?

```python
from deepeval import evaluate
from deepeval.metrics import (
    AnswerRelevancyMetric, FaithfulnessMetric, ContextualRelevancyMetric,
)
from deepeval.test_case import LLMTestCase

test_case = LLMTestCase(
    input="How long can I stay after graduation on F-1 visa?",
    actual_output="You can stay up to 60 days after completing your degree.",
    retrieval_context=[
        "F-1 visa holders may stay for 60 days after degree completion."
    ],
)
evaluate(
    test_cases=[test_case],
    metrics=[
        AnswerRelevancyMetric(),
        FaithfulnessMetric(),
        ContextualRelevancyMetric(),
    ],
)
```

The `evaluate()` function runs all metrics on all test cases in bulk.
Use it instead of `assert_test` when evaluating datasets (not pytest).

---

## RAG Metrics Summary Table

| Metric | Question It Answers | Required Fields |
|--------|-------------------|-----------------|
| Answer Relevancy | Is the answer relevant to the question? | input, actual_output |
| Faithfulness | Does the answer only use facts from docs? | input, actual_output, retrieval_context |
| Contextual Precision | Are relevant docs ranked higher? | input, actual_output, expected_output, retrieval_context |
| Contextual Recall | Did we find ALL needed info? | input, actual_output, expected_output, retrieval_context |
| Contextual Relevancy | Are ALL retrieved docs useful? | input, actual_output, retrieval_context |

### RAGAS Metric (ragas library wrapper)

DeepEval also includes `RagasMetric` — a wrapper that averages all four
RAG metrics from the `ragas` library. Install with `pip install ragas`.
DeepEval's native RAG metrics above are recommended instead (debuggable,
JSON-confineable, better ecosystem integration). See [Part 18](../03_practical/18_configs_flags_reference.md) for details.

### Sources

- [DeepEval RAG Guide](https://deepeval.com/guides/guides-rag-evaluation)
- [RAG Evaluation with DeepEval](https://atamel.dev/posts/2025/01-14_rag_evaluation_deepeval/)
- [Retrieval Quality Part 1-3](https://testerstories.com/2026/02/ai-and-testing-improving-retrieval-quality-part-1/)
- [Contextual Precision](https://testerstories.com/2026/02/ai-and-testing-contextual-precision/)
- [Faithfulness](https://testerstories.com/2026/02/ai-and-testing-faithfulness/)
- [Answer Relevancy](https://testerstories.com/2026/02/ai-and-testing-answer-relevancy/)
