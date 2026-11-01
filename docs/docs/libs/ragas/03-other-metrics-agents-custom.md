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

# Ragas — Other Metrics, Agents & Custom

RAG metrics ([02](./02-rag-metrics.md)) are one family. Ragas also ships prompt-driven metrics you define yourself, classic NLP and string metrics that need no LLM, SQL and table checks, and metrics for agents that call tools. This page covers all of them, how to write your own, and how to check that an LLM judge agrees with people.

Snippets that use `await` run inside an `async def` (or a notebook); `llm` is a judge from `llm_factory` ([01](./01-datasets-samples-setup.md)).

## Prompt-Driven Metrics: Discrete, Numeric, Ranking

`DiscreteMetric`, `NumericMetric` and `RankingMetric` turn a prompt template into a metric. The template uses `{placeholders}` that you fill at call time, and the judge must answer with a `value` and a `reason`. They import from `ragas.metrics` (not from `collections`) and take the judge per call.

```python
from ragas.metrics import DiscreteMetric, NumericMetric, RankingMetric

plain = DiscreteMetric(
    name="plain_language",
    prompt="Does the response avoid jargon?\nQuestion: {user_input}\nResponse: {response}\nAnswer pass or fail.",
    allowed_values=["pass", "fail"],
)
clarity = NumericMetric(name="clarity", prompt="Rate clarity from 0 to 10.\nResponse: {response}", allowed_values=(0.0, 10.0))
order = RankingMetric(name="rank", prompt="Rank the candidates from best to worst.\nCandidates: {candidates}", allowed_values=3)

result = await plain.ascore(llm=llm, user_input="How do I reset my password?", response="Use the reset link on the login page.")
result.value          # "pass" or "fail"  (for DiscreteMetric a value outside allowed_values fails validation and is retried)
result.reason         # the judge's explanation
result.traces         # {"input": rendered prompt, "output": {"reason": ..., "value": ...}}
plain.get_variables() # ['user_input', 'response']
```

| Type | `allowed_values` | `value` |
|------|------------------|---------|
| `DiscreteMetric` | list of strings, default `["pass", "fail"]` | one of the strings |
| `NumericMetric` | `(min, max)` tuple or `range`, default `(0.0, 1.0)` | float |
| `RankingMetric` | integer list length | list of items |

Rules that save debugging time:

- Every placeholder must be passed, or `str.format` raises `KeyError: 'user_input'`. A literal brace in the prompt must be doubled (`{{`); a JSON example such as `{"a": 1}` raises `KeyError: '"a"'`.
- The judge is passed as `llm=` on each call, `await metric.ascore(llm=llm, ...)` or `metric.score(llm=llm, ...)`. These classes have no `llm` constructor argument: `NumericMetric(llm=...)` raises `TypeError: unexpected keyword argument 'llm'`.
- Few-shot examples go through `Prompt`; they are appended to the rendered prompt:

```python
from ragas.prompt import Prompt

prompt = Prompt(
    "Does the response avoid jargon?\nResponse: {response}\nAnswer with value pass or fail and a reason.",
    examples=[
        ({"response": "Reset your password from the login page."}, {"value": "pass", "reason": "plain words"}),
        ({"response": "Invoke the credential rotation workflow."}, {"value": "fail", "reason": "jargon"}),
    ],
)
plain = DiscreteMetric(name="plain_language", prompt=prompt, allowed_values=["pass", "fail"])
plain.save("plain_language.json")                         # version the prompt with your code
plain = DiscreteMetric.load("plain_language.json")
```

`AspectCritic` ("is this response harmless?") and `SimpleCriteriaScore` (a 1-5 score for a criterion) are the older equivalents. They still import from `ragas.metrics` with a `DeprecationWarning` and run through `evaluate()`; new code defines the criterion with `DiscreteMetric` or `NumericMetric`.

## Pure-Python Metrics with Decorators

`@discrete_metric`, `@numeric_metric` and `@ranking_metric` wrap an ordinary function (sync or async) into a metric object without an LLM. Use them for rules such as citations, length, schema checks or regex.

```python
from ragas.metrics import discrete_metric, numeric_metric


@discrete_metric(name="has_citation", allowed_values=["yes", "no"])
def has_citation(response: str) -> str:
    return "yes" if "[1]" in response else "no"


@numeric_metric(name="brevity", allowed_values=(0.0, 1.0))
def brevity(response: str, max_words: int = 50) -> float:
    return min(1.0, max_words / max(len(response.split()), 1))


has_citation.score(response="See [1].")      # MetricResult(value=yes)
await brevity.ascore(response="a b c")        # MetricResult(value=1.0)
has_citation(response="x")                    # plain call returns the raw function result: "no"
```

| Behaviour | Detail |
|-----------|--------|
| Arguments | Keyword only. Positional arguments raise `TypeError: ... requires keyword arguments`; a wrong type (for example `None` for `response: str`) raises `TypeError` with a Pydantic message |
| Exception inside the function | Swallowed: the result is `MetricResult(value=None, reason="Error executing metric has_citation: ...")` |
| Value outside `allowed_values` | `MetricResult(value=None, reason="Metric ... returned 'maybe' but expected one of [...]")` |

Both failure results have `value=None`, so a gate must check for `None` or NaN explicitly.

## Rubric Metrics

Rubrics describe each score level in words. `DomainSpecificRubrics` takes a rubric for the whole run; `InstanceSpecificRubrics` takes one per sample.

```python
from ragas.metrics.collections import DomainSpecificRubrics, InstanceSpecificRubrics

rubrics = {
    "score1_description": "Gives wrong refund terms.",
    "score2_description": "Right window, wrong conditions.",
    "score3_description": "Right terms, missing the exception for sale items.",
    "score4_description": "Right terms with one minor omission.",
    "score5_description": "Complete and correct terms.",
}
metric = DomainSpecificRubrics(llm=llm, rubrics=rubrics, with_reference=True)
result = await metric.ascore(user_input=q, response=a, reference=ref)    # value is the raw 1-5 integer as float, reason is the feedback
per_sample = await InstanceSpecificRubrics(llm=llm).ascore(rubrics=rubrics, user_input=q, response=a)
```

Without `rubrics`, built-in generic 1-5 descriptions are used. The score is the raw level (1.0 to 5.0), not normalised to 0-1.

## NLP and String Metrics (No LLM)

These cost nothing and are deterministic; they compare `response` with `reference` as text. Install `sacrebleu`, `rouge-score` and `rapidfuzz` as needed. The values below come from one pair: reference `The capital of France is Paris.` and response `Paris is the capital of France.`

| Metric | Call | Score |
|--------|------|-------|
| `BleuScore` | `await BleuScore().ascore(reference=..., response=...)` | 0.29 |
| `RougeScore` | `RougeScore(rouge_type="rougeL", mode="fmeasure")` (also `"rouge1"`; modes `precision`, `recall`) | 0.67 (`rougeL` f-measure), 1.00 (`rouge1` recall) |
| `CHRFScore` | character n-gram F-score | 0.74 |
| `ExactMatch` | `reference == response` | 0.0 |
| `StringPresence` | `reference in response` | 0.0 |
| `NonLLMStringSimilarity` | `distance_measure=DistanceMeasure.LEVENSHTEIN` (also `HAMMING`, `JARO`, `JARO_WINKLER`) | 0.39 (Levenshtein), 0.74 (Jaro-Winkler) |
| `QuotedSpansAlignment` | share of quoted spans in `response` that appear verbatim in `retrieved_contexts` (`min_span_words=3`; whitespace and case are normalised) | 1.0 |
| `SemanticSimilarity` | cosine similarity of embeddings; a `threshold=` converts the score to 0 / 1 | needs `embeddings=` |

The same correct answer scores between 0.29 and 1.0 depending on the metric, which is why lexical metrics suit extraction, translation and templated output but not free-form answers. `BleuScore` splits both texts into sentences on `". "`. Pick one metric per property and keep it.

## SQL and Table Metrics

| Metric | Inputs | Notes |
|--------|--------|-------|
| `SQLSemanticEquivalence` | `response`, `reference`, `reference_contexts` (schema text) | One judge call explains both queries against the schema and decides whether they are equivalent |
| `DataCompyScore` | `response`, `reference` as CSV text | Row- or column-wise precision, recall or F1 (`mode`, `metric`); needs `datacompy<1` |

Execution-based checks (run both queries on a test database and compare rows) are stronger than a judge when you can afford them; use `DataCompyScore` on the result sets.

## Agent Metrics

Agent metrics read a conversation from `MultiTurnSample.user_input` (see [01](./01-datasets-samples-setup.md)) or pass it directly as `user_input`.

| Metric | Inputs | LLM calls | Score |
|--------|--------|-----------|-------|
| `ToolCallAccuracy(strict_order=True)` | `user_input`, `reference_tool_calls` | 0 | Per call with a matching name, the share of reference arguments with equal values (compared as strings); averaged over reference calls and multiplied by 1 or 0 for name-sequence alignment |
| `ToolCallF1` | same | 0 | F1 over the sets of predicted and reference calls; a call counts only when name and all arguments match; order and duplicates are ignored |
| `AgentGoalAccuracyWithReference` (alias `AgentGoalAccuracy`) | `user_input`, `reference` | 2 | 1.0 if the inferred end state matches the reference outcome, else 0.0 |
| `AgentGoalAccuracyWithoutReference` | `user_input` | 2 | 1.0 if the end state achieves the goal the judge inferred from the conversation |
| `TopicAdherence(mode="f1")` | `user_input`, `reference_topics` | 3 | The judge extracts the topics discussed, marks each as answered or refused, and classifies each against `reference_topics`. Precision: answered topics that are on the list; recall: on-list topics that were answered; `mode` picks precision, recall or F1. NaN when no topic is extracted |

```python
from ragas.messages import AIMessage, HumanMessage, ToolCall, ToolMessage
from ragas.metrics.collections import AgentGoalAccuracy, ToolCallAccuracy, ToolCallF1

conversation = [
    HumanMessage(content="Book a table for 2 at 7pm"),
    AIMessage(content="Checking", tool_calls=[ToolCall(name="check_availability", args={"party": 2, "time": "19:00"})]),
    ToolMessage(content="available"),
    AIMessage(content="Booking", tool_calls=[ToolCall(name="book_table", args={"party": 2, "time": "19:00"})]),
    ToolMessage(content="confirmed #42"),
    AIMessage(content="Your table is booked, confirmation #42."),
]
expected = [ToolCall(name="check_availability", args={"party": 2, "time": "19:00"}),
            ToolCall(name="book_table", args={"party": 2, "time": "19:00"})]

(await ToolCallAccuracy().ascore(user_input=conversation, reference_tool_calls=expected)).value                 # 1.0
(await ToolCallAccuracy().ascore(user_input=conversation, reference_tool_calls=expected[::-1])).value           # 0.0, order differs
(await ToolCallAccuracy(strict_order=False).ascore(user_input=conversation, reference_tool_calls=expected[::-1])).value   # 1.0
(await ToolCallF1().ascore(user_input=conversation, reference_tool_calls=expected[:1])).value                   # 0.67, one extra call
(await AgentGoalAccuracy(llm=llm).ascore(user_input=conversation, reference="Table for 2 booked at 19:00")).value
```

- Argument values are compared as strings: `{"time": "19:00"}` vs `{"time": "7pm"}` is a miss (half the arguments in the example above). Normalise arguments before scoring, or write a custom metric.
- The `reference_tool_calls` list must be complete: extra predicted calls lower `ToolCallF1` and trigger a length-mismatch warning in `ToolCallAccuracy`.
- `ragas.integrations.langgraph.convert_to_ragas_messages(messages)` converts LangChain / LangGraph messages (system messages are dropped). It reads tool calls from `additional_kwargs["tool_calls"]` (OpenAI wire format), which `ChatOpenAI` fills; for other chat models build `ToolCall` objects yourself. See [LangGraph](../langgraph/index.md).
- The legacy equivalents (`ToolCallAccuracy`, `ToolCallF1`, `TopicAdherenceScore`, `AgentGoalAccuracyWithReference` in `ragas.metrics`) run through `evaluate()` on a multi-turn `EvaluationDataset`.

## Writing a Custom Metric Class

Subclass `BaseMetric` from `ragas.metrics.collections`, set `self.llm` before calling `super().__init__` (the base class then verifies that it is an `InstructorBaseRagasLLM`), and implement `async def ascore(...)` with explicit keyword arguments. You inherit `abatch_score`, `score` and `batch_score`.

```python
from pydantic import BaseModel
from ragas.llms import InstructorBaseRagasLLM
from ragas.metrics import MetricResult
from ragas.metrics.collections import BaseMetric


class Verdict(BaseModel):
    polite: bool
    reason: str


class Politeness(BaseMetric):                                   # LLM-judged
    def __init__(self, llm: InstructorBaseRagasLLM, name: str = "politeness", **kwargs):
        self.llm = llm
        super().__init__(name=name, **kwargs)

    async def ascore(self, response: str) -> MetricResult:
        verdict = await self.llm.agenerate(f"Is this reply polite? Reply: {response}", Verdict)
        return MetricResult(value=1.0 if verdict.polite else 0.0, reason=verdict.reason)


class WithinWordLimit(BaseMetric):                              # pure Python, no llm attribute
    def __init__(self, limit: int = 120, name: str = "within_word_limit", **kwargs):
        self.limit = limit
        super().__init__(name=name, **kwargs)

    async def ascore(self, response: str) -> MetricResult:
        return MetricResult(value=float(len(response.split()) <= self.limit))
```

`llm.agenerate(prompt, ResponseModel)` returns a validated Pydantic object, so the metric never parses JSON. `allowed_values=(0.0, 1.0)` is the declared score range; pass `allowed_values=(1.0, 5.0)` to `super().__init__` for another scale. For `evaluate()` compatibility, subclass the legacy `MetricWithLLM` and `SingleTurnMetric` instead and implement `_single_turn_ascore(sample, callbacks)` with a `PydanticPrompt` and `self.prompt.generate(data=..., llm=self.llm, callbacks=callbacks)`.

## Judge Calibration and Bias

An LLM judge is a classifier whose accuracy you can measure. Before trusting a custom metric, compare it with human labels.

```python
import asyncio
import json

from openai import AsyncOpenAI
from ragas.llms import llm_factory
from sklearn.metrics import cohen_kappa_score, confusion_matrix

# evals/judge_labels.jsonl rows: {"user_input": ..., "response": ..., "human": "pass" | "fail"}
rows = [json.loads(line) for line in open("evals/judge_labels.jsonl")]


async def judge_all(metric, rows, concurrency=8):
    llm = llm_factory("gpt-4o-mini", client=AsyncOpenAI(), temperature=0)     # client created inside the loop
    sem = asyncio.Semaphore(concurrency)

    async def one(row):
        async with sem:
            result = await metric.ascore(llm=llm, user_input=row["user_input"], response=row["response"])
            return result.value

    return await asyncio.gather(*[one(r) for r in rows])


predicted = asyncio.run(judge_all(plain, rows))               # `plain` is the DiscreteMetric defined above
human = [r["human"] for r in rows]
print(cohen_kappa_score(human, predicted))                    # also: plain.get_correlation(human, predicted)
print(confusion_matrix(human, predicted, labels=["pass", "fail"]))
```

| Step | Practice |
|------|----------|
| Labels | 50-100 rows labelled by two people, disagreements resolved; include borderline cases and known-bad answers |
| Agreement | Cohen's kappa between judge and humans; compare with kappa between the two humans |
| Errors | Read the false passes first; they hide defects. Tighten the prompt, add few-shot examples taken from those rows |
| Re-run | Same labelled set after each prompt edit; keep the prompt in version control (`metric.save`) |
| Freeze | Fix judge model, temperature 0 and prompt; re-calibrate when any of them changes |

Known judge biases and the mitigations that fit Ragas:

| Bias | Symptom | Mitigation |
|------|---------|------------|
| Position | Prefers the first or last of two answers | Swap order and average (the built-in `AnswerAccuracy` does this); randomise order in pairwise custom metrics |
| Verbosity | Longer answers score higher | Add a length-controlled test pair to the labelled set; add a brevity rule via `@numeric_metric` |
| Self-preference | A model rates its own family's output higher | Judge with a different model family than the generator |
| Leniency | Almost everything passes | Include negative examples in few-shot; calibrate against known-bad rows |
| Format | Scores change with markdown or punctuation | Normalise the response text before judging |
| Non-determinism | Same row, different verdict on reruns | `temperature=0`, cache, and treat single-row flips as noise ([05](./05-testing-ci.md)) |

---
## See also
- [Ragas — Evaluation for LLM, RAG and Agent Applications](./index.md)
- [Ragas — RAG Metrics](./02-rag-metrics.md)
- [Ragas — Testing & CI](./05-testing-ci.md)
- [DeepEval — Agent Metrics](../../llm-evaluation/01_metrics/04_agent_metrics.md)
- [LangGraph — Stateful Agent Orchestration](../langgraph/index.md)
- [Agentic AI Architecture](../../agentic-ai-architecture/index.md)
