---
date: 2026-09-27
tags:
  - tools
  - observability
  - llm
  - phoenix
---

# Phoenix — Evaluations

`arize-phoenix-evals` is a standalone library: evaluators run in **your** process (notebook, pytest, CI job), and their scores go to Phoenix as annotations on spans or as experiment evaluations.

| Evaluator type | How it scores | Cost | Use for |
|----------------|---------------|------|---------|
| Code (heuristic) | Python function | Free, deterministic | Format, exact match, regex, JSON schema, length, latency |
| LLM-as-judge | Classification prompt to a judge model | Tokens, non-deterministic | Correctness, faithfulness, relevance, tone, toxicity |
| Human | Annotation in the UI | People time | Ground truth, judge calibration |

!!! warning "API generations"
    `arize-phoenix-evals` 3.x uses `LLM`, `create_classifier`, `ClassificationEvaluator`, `phoenix.evals.metrics` and `evaluate_dataframe`. Older guides show `llm_classify`, `OpenAIModel` and `HALLUCINATION_PROMPT_TEMPLATE` — that API is no longer part of the package.

## Judge Model: `LLM`

```python
from phoenix.evals import LLM

judge = LLM(provider="anthropic", model="claude-haiku-4-5")        # cheap, fast judge
strict_judge = LLM(provider="openai", model="gpt-4o-mini")
litellm_judge = LLM(provider="litellm", model="anthropic/claude-sonnet-5")   # needs litellm installed
```

- Native providers: `openai`, `azure`, `anthropic`, `google`; with LiteLLM installed also `litellm`, `bedrock`, `vertex`.
- API keys come from the usual env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`).
- The judge must support tool calling or structured output — the label is extracted from a structured response, not parsed from free text.
- Extra kwargs on evaluators go to the model call: `CorrectnessEvaluator(llm=judge, temperature=0.0)`.

## Built-in Metrics

```python
from phoenix.evals.metrics import CorrectnessEvaluator, FaithfulnessEvaluator

faithfulness = FaithfulnessEvaluator(llm=judge)
scores = faithfulness.evaluate({
    "input": "How long is the refund window?",
    "context": "Refunds are accepted within 30 days of delivery. Electronics: 14 days.",
    "output": "You can get a refund within 90 days.",
})
print(scores[0].label, scores[0].score, scores[0].explanation)
# unfaithful 0.0 The context states 30 days, not 90.
```

| Evaluator | Inputs | Labels (score) |
|-----------|--------|----------------|
| `CorrectnessEvaluator` | `input`, `output` | correct (1) / incorrect (0) |
| `FaithfulnessEvaluator` | `input`, `output`, `context` | faithful (1) / unfaithful (0) — RAG groundedness |
| `HallucinationEvaluator` | `input` (conversation), `output` | hallucinated (1) / grounded (0) — direction: minimize |
| `DocumentRelevanceEvaluator` | `input`, `document_text` | relevant (1) / unrelated (0) — per retrieved doc |
| `RetrievalRelevanceEvaluator` | `input`, `context` | Retrieved context vs request |
| `ToxicityEvaluator` | `text` | toxic (1) / non-toxic (0) — minimize |
| `RefusalEvaluator` | `input`, `output` | refused / answered |
| `ConcisenessEvaluator`, `CompletenessEvaluator` | `input`, `output` / `conversation` | Style and coverage |
| `ToolSelectionEvaluator`, `ToolInvocationEvaluator` | `input`, `available_tools`, `tool_selection` | Agent picked / called the right tool correctly |
| `ToolResponseHandlingEvaluator` | `input`, `tool_call`, `tool_result`, `output` | Agent used the tool result correctly |
| `PiiDetectionEvaluator`, `UserFrictionEvaluator` | `conversation` (+ `user_message`) | PII leaks, frustrated users |
| `exact_match`, `MatchesRegex(pattern=)`, `PrecisionRecallFScore()` | code metrics | Deterministic checks |

Each call returns a list of `Score(name, score, label, explanation, metadata, kind, direction)`.

## Custom LLM Judge: `create_classifier`

```python
from phoenix.evals import create_classifier

TRIAGE_JUDGE = """You are reviewing a support-ticket router.
Ticket: {ticket}
Chosen queue: {queue}
Queues: billing (payments, invoices), bugs (crashes, errors), how-to (usage questions),
security (account takeover, prompt injection, fraud).
Is the chosen queue the best fit for the ticket?"""

routing_quality = create_classifier(
    name="routing_quality",
    prompt_template=TRIAGE_JUDGE,
    llm=judge,
    choices={"correct": 1.0, "acceptable": 0.5, "wrong": 0.0},
)

result = routing_quality.evaluate({"ticket": "Someone changed my password", "queue": "how-to"})
assert result[0].label == "wrong"
```

- Keep choices few and mutually exclusive; describe each label in the prompt.
- `choices` may be a list (labels only), a dict label→score, or label→(score, description).
- Explanations are on by default — read them when calibrating.

## Code Evaluators: `create_evaluator`

```python
import json
from phoenix.evals import Score, create_evaluator


@create_evaluator(name="valid_json", kind="code")
def valid_json(output: str) -> Score:
    try:
        payload = json.loads(output)
    except json.JSONDecodeError as exc:
        return Score(score=0.0, label="invalid", explanation=str(exc))
    missing = {"queue", "priority"} - payload.keys()
    return Score(score=float(not missing), label="valid" if not missing else "incomplete")


@create_evaluator(name="within_budget", kind="code", direction="maximize")
def within_budget(output: str) -> bool:
    return len(output) <= 400
```

Return a `Score`, `bool`, number or string. Code evaluators run in the same pipelines as LLM judges.

## Mapping Columns: `bind_evaluator`

Evaluators expect fixed input names; map your fields with `bind_evaluator` (JSONPath-like strings or lambdas):

```python
from phoenix.evals import bind_evaluator

correctness = bind_evaluator(
    evaluator=CorrectnessEvaluator(llm=judge),
    input_mapping={
        "input": "attributes.input.value",          # column in a spans DataFrame
        "output": "attributes.output.value",
    },
)
# Inside experiments: input / output / expected are dicts
exp_correctness = bind_evaluator(
    evaluator=CorrectnessEvaluator(llm=judge),
    input_mapping={"input": lambda x: x["input"]["question"], "output": lambda x: x["output"]["answer"]},
)
```

## Evaluating Traces and Logging Results Back

```python
from phoenix.client import Client
from phoenix.client.types.spans import SpanQuery
from phoenix.evals import evaluate_dataframe
from phoenix.evals.utils import to_annotation_dataframe

px = Client()
spans = px.spans.get_spans_dataframe(
    query=SpanQuery().where("span_kind == 'CHAIN' and name == 'rag_answer'"),
    project_identifier="docs-rag-staging",
    limit=500,
)                                                    # index: context.span_id

results = evaluate_dataframe(
    dataframe=spans,
    evaluators=[correctness, valid_json],
    exit_on_error=False,
    max_retries=3,
)                                                    # adds <name>_score and <name>_execution_details

px.spans.log_span_annotations_dataframe(dataframe=to_annotation_dataframe(dataframe=results))
```

Scores appear on each span in the UI (filterable: `annotations['correctness'].label == 'incorrect'`) and in project-level aggregates. Use `async_evaluate_dataframe` for large batches — it runs judge calls concurrently with rate limiting.

For RAG, evaluate documents too: explode `attributes.retrieval.documents` from `RETRIEVER` spans, run `DocumentRelevanceEvaluator`, log with `log_document_annotations_dataframe` — the UI then shows relevance per retrieved chunk.

## Choosing Judge Models

| Guideline | Why |
|-----------|-----|
| Judge ≠ model under test (or at least a different size) | Self-preference bias inflates scores |
| Cheap judge (`claude-haiku-4-5`, `gpt-4o-mini`) for high-volume binary labels | Cost scales with dataset × evaluators × repetitions |
| Stronger judge (`anthropic/claude-sonnet-5`) for nuanced rubrics | Better agreement with humans on subtle cases |
| `temperature=0.0`, pinned model version | Reproducible gates |
| Binary or 3-level labels, not 1–10 scales | Judges are far more consistent on classification |

## Judge Calibration

A judge is a classifier — measure it like one before trusting it in CI.

1. Take 50–200 real outputs; have humans label them (Phoenix annotation UI, `annotator_kind="HUMAN"`).
2. Run the judge on the same rows.
3. Compare judge vs human labels: precision, recall, Cohen's kappa for the failure label.
4. Read disagreements and their explanations; fix the rubric, add label descriptions or few-shot examples.
5. Re-run; freeze the prompt and judge model once agreement is acceptable (e.g. recall ≥ 0.9 on failures).
6. Re-calibrate on every judge model or prompt change, and periodically on fresh production data.

```python
from sklearn.metrics import cohen_kappa_score, classification_report

human = labels_df["human_label"]                 # from UI annotations export
judge_labels = labels_df["judge_label"]
print(classification_report(human, judge_labels))
print("kappa:", cohen_kappa_score(human, judge_labels))
```

`download_benchmark_dataset(...)` fetches Arize's public labelled benchmarks for sanity-checking built-in evaluators with your judge model.

---
## See also
- [Arize Phoenix — LLM Tracing & Evaluation](./index.md)
- [Phoenix — Datasets & Experiments](./03-datasets-experiments.md)
- [Phoenix — Testing, CI & Production](./05-testing-ci-production.md)
- [DeepEval — LLM Testing Guide](../../llm-evaluation/index.md)
- [Agentic AI — Testing, Evaluation & Observability](../../agentic-ai-architecture/06-testing-observability.md)
