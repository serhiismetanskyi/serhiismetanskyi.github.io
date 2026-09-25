---
date: 2026-08-05
tags:
  - llm
  - evaluation
  - deepeval
  - metrics
---

# DeepEval Guide — Part 11: Building Custom Metrics

## Why Build Custom Metrics?

- GEval is not flexible enough for your use case
- You want a metric that does NOT use an LLM (deterministic)
- You want to combine several DeepEval metrics into one

Custom metrics integrate with DeepEval ecosystem: CI/CD, caching,
multi-processing, Confident AI reporting.

---

## Rules for Custom Metrics

### 1. Inherit `BaseMetric`

```python
from deepeval.metrics import BaseMetric

class CustomMetric(BaseMetric):
    pass
```

### 2. Implement `__init__()`

```python
from deepeval.metrics import BaseMetric

class CustomMetric(BaseMetric):
    def __init__(self, threshold: float = 0.5):
        self.threshold = threshold
```

Optional properties: `evaluation_model`, `include_reason`, `strict_mode`,
`async_mode`.

### 3. Implement `measure()` and `a_measure()`

Both MUST: accept `LLMTestCase`, set `self.score`, set `self.success`.

```python
from deepeval.metrics import BaseMetric
from deepeval.test_case import LLMTestCase

class CustomMetric(BaseMetric):
    def __init__(self, threshold: float = 0.5):
        self.threshold = threshold

    def measure(self, test_case: LLMTestCase) -> float:
        self.score = compute_score(test_case)
        self.success = self.score >= self.threshold
        return self.score

    async def a_measure(self, test_case: LLMTestCase) -> float:
        return self.measure(test_case)
```

### 4. Implement `is_successful()`

```python
    def is_successful(self) -> bool:
        if self.error is not None:
            self.success = False
        return self.success
```

### 5. Name Your Metric

```python
    @property
    def __name__(self):
        return "My Custom Metric"
```

---

## Example: Non-LLM Metric (ROUGE Score)

```python
from deepeval.scorer import Scorer
from deepeval.metrics import BaseMetric
from deepeval.test_case import LLMTestCase

class RougeMetric(BaseMetric):
    def __init__(self, threshold: float = 0.5):
        self.threshold = threshold
        self.scorer = Scorer()

    def measure(self, test_case: LLMTestCase) -> float:
        self.score = self.scorer.rouge_score(
            prediction=test_case.actual_output,
            target=test_case.expected_output,
            score_type="rouge1",
        )
        self.success = self.score >= self.threshold
        return self.score

    async def a_measure(self, test_case: LLMTestCase) -> float:
        return self.measure(test_case)

    def is_successful(self) -> bool:
        if self.error is not None:
            self.success = False
        return self.success

    @property
    def __name__(self):
        return "Rouge Metric"
```

Usage: `pip install rouge-score` first.

---

## Example: Composite Metric (Relevancy + Faithfulness)

```python
from deepeval.metrics import BaseMetric, AnswerRelevancyMetric, FaithfulnessMetric
from deepeval.test_case import LLMTestCase

class RAGCompositeMetric(BaseMetric):
    def __init__(self, threshold: float = 0.5):
        self.threshold = threshold

    def measure(self, test_case: LLMTestCase) -> float:
        relevancy = AnswerRelevancyMetric(threshold=self.threshold)
        faithfulness = FaithfulnessMetric(threshold=self.threshold)
        relevancy.measure(test_case)
        faithfulness.measure(test_case)
        self.score = min(relevancy.score, faithfulness.score)
        self.reason = f"Relevancy: {relevancy.reason}\n"
        self.reason += f"Faithfulness: {faithfulness.reason}"
        self.success = self.score >= self.threshold
        return self.score

    async def a_measure(self, test_case: LLMTestCase) -> float:
        return self.measure(test_case)

    def is_successful(self) -> bool:
        if self.error is not None:
            self.success = False
        return self.success

    @property
    def __name__(self):
        return "RAG Composite Metric"
```

---

## Answer Correctness Metric (Custom GEval)

The most common custom metric. Uses GEval with `evaluation_steps`
for fine-grained control over what "correct" means.

```python
from deepeval.metrics import GEval
from deepeval.test_case import LLMTestCaseParams

correctness = GEval(
    name="Correctness",
    model="gpt-4o",
    evaluation_params=[
        LLMTestCaseParams.EXPECTED_OUTPUT,
        LLMTestCaseParams.ACTUAL_OUTPUT,
    ],
    evaluation_steps=[
        "Compare actual output with expected output for factual accuracy.",
        "Check if all key elements from expected output are present.",
        "Assess discrepancies in details, values, or information.",
    ],
    threshold=0.7,
)
```

**Key points:**
- Always include `ACTUAL_OUTPUT` in `evaluation_params`
- Use `EXPECTED_OUTPUT` as ground truth (or `CONTEXT` if unavailable)
- Provide custom `evaluation_steps` for your domain
- Iterate on `evaluation_steps` until scores match your expectations

### Finding the Right Threshold

```python
from deepeval import evaluate

# 1. Run evaluation on your dataset
results = evaluate(test_cases=my_test_cases, metrics=[correctness])

# 2. Extract scores from test_results
scores = [
    m.score for r in results.test_results for m in r.metrics_data
]

# 3. Calculate threshold for desired pass rate (e.g., top 75%)
sorted_scores = sorted(scores)
index = int(len(sorted_scores) * (1 - 75 / 100))
threshold = sorted_scores[index]
print(f"Recommended threshold: {threshold}")
```

### Sources

- [Custom Metrics Guide](https://deepeval.com/guides/guides-building-custom-metrics)
- [Answer Correctness Guide](https://deepeval.com/guides/guides-answer-correctness-metric)
- [LLM Evaluation Metrics](https://www.confident-ai.com/blog/llm-evaluation-metrics-everything-you-need-for-llm-evaluation)
