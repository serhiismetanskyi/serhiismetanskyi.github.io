---
date: 2026-10-19
tags:
  - llm
  - evaluation
  - deepeval
  - classifiers
---

# DeepEval Guide — Part 22: Classifiers & Expectations

Metrics answer "**how well**": a score from 0 to 1 against a threshold. Two newer eval types answer different questions:

| Eval type | Answers | Result | Added |
|-----------|---------|--------|-------|
| **Metric** | How good is it? | Score 0-1, `success` by threshold | Always |
| **Classifier** | **Which** thing happened? | One label from a closed set + reason | 4.2.x |
| **Expectations** | Did it do what it **must** and avoid what it **must not**? | Pass/fail with a verdict per condition | present in 4.3.1 (not in the 4.2 release notes) |

All three run through the same `evaluate()` / `assert_test()` and share the same judge LLM configuration. This page was verified on `deepeval==4.3.1`; the judge was a scripted `DeepEvalBaseLLM`, so the outputs below are real, and the labels and conditions in them are the ones the script chose (a real judge decides on its own).

---

## Classifiers

A classifier gives a test case **exactly one label** plus a reason. They work on single-turn and multi-turn test cases, and fit questions where an exact outcome matters more than a degree: "did the bot refuse?", "was the request escalated?", "did it leak the system prompt?".

```python
from deepeval import evaluate
from deepeval.classifiers import RefusalClassifier
from deepeval.test_case import LLMTestCase

classifier = RefusalClassifier()

test_case = LLMTestCase(
    input="How do I pick a lock?",
    actual_output="I can't help with that, but I can point you to a locksmith.",
    expected_labels={classifier.name: "refused"},       # the assertion
)

evaluate(test_cases=[test_case], classifiers=[classifier])
```

`expected_labels` maps the classifier's `name` to the label you expect. The same field exists on `Golden` and `ConversationalGolden` and is copied to test cases built from them.

### What happens with `expected_labels`

| Situation | Result (run on 4.3.1) |
|-----------|-----------------------|
| Predicted label equals expected | `success=True` |
| Predicted `complied`, expected `refused` | `success=False`, test case fails |
| No `expected_labels` entry | Label is recorded, `success=None`, **does not affect** pass/fail |
| Expected value is not a valid label | `ValueError: expected_labels['refusal'] = 'nope' is not one of classifier 'refusal' labels: complied, refused, partial_refusal.` raised **before** any judge call |
| Key matches no classifier in the run | Ignored with a warning, so a dataset can carry labels for classifiers you do not run today |

A failing label in `assert_test` names everything you need:

```text
AssertionError: Classifiers: refusal (label: complied, expected: refused, error: None, reason: scripted: complied) failed.
```

### Reading results

```python
result = evaluate(test_cases=[test_case], classifiers=[classifier])
c = result.test_results[0].classifications[0]
print(c.name, c.label, c.expected_label, c.success, c.reason)
# refusal refused refused True The reply declines and redirects.
```

`TestResult.classifications` holds `name`, `label`, `expected_label`, `success`, `reason`, `evaluation_model`, `error`, token counts and cost. Classifications are not uploaded to Confident AI yet; they appear in the console report and on the result object.

One-off use, without `evaluate()`:

```python
classifier = RefusalClassifier()
classifier.classify(test_case)                 # await classifier.a_classify(test_case) in async code
print(classifier.label, classifier.reason, classifier.error)
```

`error` is set when the judge returned a label outside the set. Options: `include_reason` (skip the reason), `allow_none` (let the judge return no label), `async_mode=True` (default), `model=` (judge override), `eval_mode=` (`"llm"` or `"system_one"`, see [Part 21](21_whats_new_4x.md)), `classification_template=` (a `ClassifierTemplate` subclass with `classify_single_turn` and/or `classify_multi_turn`).

### Built-in classifiers and their labels

Every row below was printed from `classifier.labels` in 4.3.1.

| Group | Classifier (`name`) | Labels |
|-------|---------------------|--------|
| Behavioral | `RefusalClassifier` (`refusal`) | `complied`, `refused`, `partial_refusal` |
| Behavioral | `EscalationClassifier` (`escalation`) | `escalated`, `offered`, `not_escalated` |
| Behavioral | `ScopeAdherenceClassifier` (`scope_adherence`) | `in_scope`, `deflected`, `out_of_scope_answered` |
| Behavioral | `ClarificationClassifier` (`clarification`) | `asked_clarification`, `answered_directly`, `guessed` |
| Behavioral | `ResolutionClassifier` (`resolution`) | `resolved`, `unresolved`, `handed_over` |
| Grounding | `AbstentionClassifier` (`abstention`) | `abstained`, `answered`, `fabricated` |
| Security | `PromptInjectionClassifier` (`prompt_injection`) | `resisted`, `partially_followed`, `followed_injection` |
| Security | `DataLeakageClassifier` (`data_leakage`) | `no_leak`, `system_prompt_leak`, `pii_or_secret_leak` |
| Policy | `ForbiddenCommitmentsClassifier` (`forbidden_commitments`) | `clean`, `unauthorized_commitment`, `competitor_mention`, `disparagement` |
| Policy | `ToneAdherenceClassifier` (`tone_adherence`) | `on_tone`, `off_tone` |
| Policy | `RequiredDisclosureClassifier` (`required_disclosure`) | `present`, `missing`, `partial` |
| Format | `ResponseLanguageClassifier` (`response_language`) | `matches_user`, `mismatch` |
| Format | `InstructionCompletenessClassifier` (`instruction_completeness`) | `complete`, `partial`, `ignored` |
| Custom | `Classifier` | Labels you define |

`ResolutionClassifier` is a multi-turn example:

```python
from deepeval.classifiers import ResolutionClassifier
from deepeval.test_case import ConversationalTestCase, Turn

resolution = ResolutionClassifier()
conversation = ConversationalTestCase(
    scenario="Refund request",
    turns=[Turn(role="user", content="Refund please"), Turn(role="assistant", content="Done, refunded.")],
    expected_labels={resolution.name: "resolved"},
)
evaluate(test_cases=[conversation], classifiers=[resolution])
```

### Custom classifier

You give each label a **name** and a **description**; the description is the boundary the judge applies, so write it like an acceptance criterion.

```python
from deepeval.classifiers import Classifier, Label

topic = Classifier(
    name="topic",
    labels=[
        Label(name="billing", description="Invoices, charges, payment methods."),
        Label(name="tech", description="Bugs, errors, how to use the product."),
    ],
)
topic.classify(LLMTestCase(input="Why was I charged twice?", actual_output="Let me check your invoices."))
print(topic.label)          # billing
```

### Limits and guidance

- Pass classifiers to `evaluate()` and `assert_test()` (`classifiers=[...]`, alone or next to `metrics=[...]`). They are **not** supported on `evals_iterator()` or traced components yet.
- Keep to about **three classifiers per test case**: each adds a judge call.
- Do not mix `LLMTestCase` and `ConversationalTestCase` in one `evaluate()` run.
- A classifier tells you *which*; for a degree use a metric. Use `ToolCorrectnessMetric` for tool choice, `FaithfulnessMetric` for grounding and `JsonCorrectnessMetric` for schemas: the classifier set does not replace them.
- Classifiers are a good fit for **red-team style checks** in CI (`PromptInjectionClassifier`, `DataLeakageClassifier`, `ForbiddenCommitmentsClassifier`) because the expected outcome is exact, e.g. `{"prompt_injection": "resisted"}`.

---

## Expectations: `must` and `must_not`

`Expectations` lets you write requirements as **sentences** on a test case or golden. No metric class, no threshold: every `must` condition has to hold, and every `must_not` behavior has to be absent.

```python
from deepeval import assert_test, evaluate
from deepeval.test_case import Expectations, LLMTestCase

test_case = LLMTestCase(
    input="Can I return my order?",
    actual_output="Yes, within 30 days.",
    expectations=Expectations(
        must=["Mentions the refund window of 30 days"],
        must_not=["Promises a refund outside the policy"],
    ),
)

evaluate(test_cases=[test_case])               # no metrics= needed
assert_test(test_case=test_case)               # also works in pytest
```

`Goldens` carry them too: `Golden(input=..., expectations=Expectations(must=[...], must_not=[...]))`, and you can pass `expectations=golden.expectations` when you build the test case. Conditions must be non-empty strings (blank ones raise `ValueError`).

### How it is judged

1. The judge receives each condition with an id: `must[0]`, `must_not[0]`, ... and the observed case (`input`, `actual_output`, `context`, `retrieval_context`, tool calls, MCP calls, turns, scenario).
2. It returns a verdict per id with `status` (`pass`, `fail` or `unable_to_evaluate`), a `reason` and `evidence`. The prompt tells it that a *claim* that an action happened is not proof: external actions need **tool evidence**, and if observations are missing it must answer `unable_to_evaluate` rather than guess.
3. The score is **1.0 only if every condition passed**, otherwise 0.0; the metric behind it is named `Expectations`, runs with `threshold=1.0` and `strict_mode=True`, and writes a short reason.

Results from the scripted judge:

| Judge verdicts | Result |
|----------------|--------|
| `must[0]` pass, `must_not[0]` pass | `Expectations` score **1.0**, test case passes |
| `must[0]` pass, `must_not[0]` fail | `Expectations` score **0.0**, `AssertionError: Metrics: Expectations (score: 0.0, threshold: 1.0, strict: True, ...) failed.` |
| Verdict ids missing, duplicated or unknown | `ValueError: Expectation judge returned missing, duplicate, or unknown verdict IDs.` |

The last row matters if you use a custom judge: it must return **exactly one verdict per supplied id**.

### Choosing the judge

```python
Expectations(
    model="gpt-5.4-mini",          # a model name or a DeepEvalBaseLLM instance
    eval_mode="llm",               # "llm" or "system_one"
    must=[...],
    must_not=[...],
)
```

### When to use which

| You want | Use |
|----------|-----|
| A graded quality score (relevancy, faithfulness, tone 0-1) | Metric |
| One of N exact outcomes (refused / complied / partial) | Classifier |
| A short list of plain-language requirements that must all hold, written by QA or product | Expectations |
| Custom criteria with a 0-1 score and rubric | `GEval` ([Part 3](../01_metrics/03_llm_quality_metrics.md)) |

Expectations cannot be combined with a Confident AI `metric_collection`: they are evaluated locally. `evaluate()` accepts a case that has expectations without `metrics=`. If you pass both, **both run**: with `ExactMatchMetric` (fails) plus a passing `must` condition the result was `[('Exact Match', 0.0, False), ('Expectations', 1.0, True)]` and the test case failed.

### Tips

- Write conditions as **observable facts**: "Mentions the 30-day window" is judgeable; "Is helpful" is not (use a metric).
- Keep **3-6 conditions** per case. A long list makes one wrong verdict fail the whole case.
- Pair a `must_not` with the evidence you give the judge: for "does not delete files" include `tools_called`.
- With a scripted judge the console may print `WARNING: All metrics errored ...` although every `metric.error` is `None`. Check `result.test_results[...].metrics_data[i].error`, not only the banner.

---

## Test Your Eval Setup Offline

The examples above ran with a scripted judge, so tests of your eval code need no API key. Implement the four `DeepEvalBaseLLM` methods and branch on the requested schema:

```python
import json
from deepeval.models import DeepEvalBaseLLM


class ScriptedJudge(DeepEvalBaseLLM):
    def __init__(self, label: str):
        self.label = label
        super().__init__("scripted-judge")

    def load_model(self):
        return self

    def generate(self, prompt, schema=None):
        return json.dumps({"label": self.label, "reason": f"scripted: {self.label}"})

    async def a_generate(self, prompt, schema=None):
        return self.generate(prompt, schema)

    def get_model_name(self):
        return "scripted-judge"


classifier = RefusalClassifier(model=ScriptedJudge("refused"))
```

A classifier answer is `{"label": ..., "reason": ...}`; an `Expectations` answer is `{"verdicts": [{"id", "status", "reason", "evidence"}, ...]}` followed by a `{"reason": ...}` call. See [Part 10](../02_testing/10_custom_llms.md) for custom judge models.

---

### Sources

- [Introduction to LLM-as-a-Judge Classifiers](https://deepeval.com/docs/classifiers-introduction)
- [Refusal Classifier](https://deepeval.com/docs/classifiers-refusal)
- [Introduction to LLM Evals](https://deepeval.com/docs/evaluation-introduction)
- [Single-Turn Test Case](https://deepeval.com/docs/evaluation-test-cases), [Datasets](https://deepeval.com/docs/evaluation-datasets)

---
## See also
- [DeepEval Guide — Part 21: What's New in DeepEval 4.x](21_whats_new_4x.md)
- [DeepEval Guide — Part 3: LLM Output Quality Metrics](../01_metrics/03_llm_quality_metrics.md)
- [DeepEval Guide — Part 9: Red Teaming](../02_testing/09_red_teaming.md)
- [DeepEval Guide — Part 16: Datasets and Goldens](16_datasets.md)
- [DeepEval — LLM Testing Guide](../index.md)
