---
date: 2026-08-04
tags:
  - llm
  - evaluation
  - deepeval
  - metrics
---

# DeepEval Guide — Part 7: Extra Metrics and Advanced Patterns

## Deterministic Metrics (No LLM Judge Needed)

These metrics do NOT use an LLM judge. They are fast, free, and deterministic.

---

### Exact Match

**What it checks:** Does the output exactly match the expected output?

```python
from deepeval import assert_test
from deepeval.metrics import ExactMatchMetric
from deepeval.test_case import LLMTestCase

def test_exact_match():
    """output matches expected output exactly."""
    test_case = LLMTestCase(
        input="What is 2 + 2?",
        actual_output="4",
        expected_output="4",
    )
    metric = ExactMatchMetric()
    assert_test(test_case, [metric])
```

---

### JSON Correctness

**What it checks:** Is the output valid JSON that matches a Pydantic schema?

**How scoring works:** The metric calls `expected_schema.model_validate_json(actual_output)`
directly — if Pydantic accepts it, score = 1.0; if validation raises an error,
score = 0.0. **No LLM is involved in scoring** — this is a pure deterministic
Pydantic check. An LLM is used only to generate a human-readable failure reason.

```python
from pydantic import BaseModel
from deepeval import assert_test
from deepeval.metrics import JsonCorrectnessMetric
from deepeval.test_case import LLMTestCase

class UserSchema(BaseModel):
    name: str
    age: int

def test_json_output():
    """output is valid JSON matching expected Pydantic schema."""
    test_case = LLMTestCase(
        input="Return user data as JSON.",
        actual_output='{"name": "John", "age": 30}',
    )
    metric = JsonCorrectnessMetric(expected_schema=UserSchema)
    assert_test(test_case, [metric])
```

---

### Pattern Match

**Important:** PatternMatch uses `fullmatch` — the pattern must match
the ENTIRE output string. Use `.*` wrappers to match substrings.

**What it checks:** Does the output match a regex pattern? No LLM needed.

```python
from deepeval import assert_test
from deepeval.metrics import PatternMatchMetric
from deepeval.test_case import LLMTestCase

def test_pattern_match_email():
    """output contains a valid email format."""
    test_case = LLMTestCase(
        input="What is the support email?",
        actual_output="support@company.com",
    )
    metric = PatternMatchMetric(
        pattern=r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}",
    )
    assert_test(test_case, [metric])
```

---

## Prompt Alignment

**What it checks:** Does the output follow the system prompt instructions?

```python
from deepeval import assert_test
from deepeval.metrics import PromptAlignmentMetric
from deepeval.test_case import LLMTestCase

def test_prompt_alignment():
    """output follows all prompt instructions."""
    test_case = LLMTestCase(
        input="Tell me about dogs.",
        actual_output="Dogs are loyal pets. They need daily walks "
        "and regular vet checkups. Dogs live 10-15 years on average.",
    )
    metric = PromptAlignmentMetric(
        prompt_instructions=[
            "Always respond in 3 sentences or less.",
            "Use simple language a child can understand.",
            "Never mention specific dog breeds.",
        ],
        threshold=0.7,
    )
    assert_test(test_case, [metric])
```

---

## Conversational GEval

**What it checks:** Custom criteria applied across a full multi-turn exchange.
Unlike single-turn `GEval` which uses `LLMTestCaseParams`, this metric uses
`TurnParams` to reference conversation turn fields.

### TurnParams vs LLMTestCaseParams

| Single-Turn GEval | Conversational GEval |
|---|---|
| `LLMTestCaseParams.INPUT` | `TurnParams.ROLE` |
| `LLMTestCaseParams.ACTUAL_OUTPUT` | `TurnParams.CONTENT` |

### Example: Semantic Precision Across Turns

```python
from deepeval import assert_test
from deepeval.metrics import ConversationalGEval
from deepeval.test_case import ConversationalTestCase, Turn, TurnParams

test_case = ConversationalTestCase(
    chatbot_role="A careful reader of a philosophical essay.",
    user_description="Someone probing distinctions across sections.",
    turns=[
        Turn(role="user", content="What does 'consistency' mean in physics?"),
        Turn(role="assistant", content="Novikov self-consistency: ..."),
        Turn(role="user", content="Is that the same as Gödel's consistency?"),
        Turn(role="assistant", content="Related but distinct: ..."),
    ],
)

metric = ConversationalGEval(
    name="SemanticPrecision",
    criteria=(
        "Evaluate whether the conversation correctly distinguishes "
        "between different meanings of the same term across turns, "
        "without conflating analogous but distinct concepts."
    ),
    evaluation_params=[TurnParams.ROLE, TurnParams.CONTENT],
    threshold=0.7,
)
assert_test(test_case, [metric])
```

### Example: Epistemic Humility

```python
metric = ConversationalGEval(
    name="EpistemicHumility",
    criteria=(
        "Evaluate whether the assistant preserves the source's "
        "speculative, exploratory register. Score lower if the "
        "assistant states claims more confidently than the source."
    ),
    evaluation_params=[TurnParams.ROLE, TurnParams.CONTENT],
    threshold=0.7,
)
```

**Optional `rubric`** — defines what different score ranges mean.
Without it, the judge decides scoring thresholds autonomously.
Define a rubric in production for tighter control over score calibration.

---

## Running Multiple Metrics at Once

```python
from deepeval import assert_test
from deepeval.metrics import (
    AnswerRelevancyMetric, FaithfulnessMetric, ToxicityMetric,
)
from deepeval.test_case import LLMTestCase

def test_rag_with_multiple_metrics():
    """Test one response with 3 different metrics."""
    test_case = LLMTestCase(
        input="What is our refund policy?",
        actual_output="You can get a full refund within 30 days.",
        retrieval_context=["Refund policy: Full refund within 30 days."],
    )
    assert_test(test_case, [
        AnswerRelevancyMetric(threshold=0.7),
        FaithfulnessMetric(threshold=0.7),
        ToxicityMetric(threshold=0.5),
    ])
```

---

## Arena GEval (Comparison / A-B Testing)

**What it checks:** Which of two outputs is better? For A/B testing LLMs.

**How it works:** You create an `ArenaTestCase` with `Contestant` objects.
Each contestant wraps an `LLMTestCase`. Use `compare()` with the
`ArenaTestCase` list and an `ArenaGEval` metric to pick winners.

```python
from deepeval import compare
from deepeval.metrics import ArenaGEval
from deepeval.test_case import (
    LLMTestCase, LLMTestCaseParams, ArenaTestCase, Contestant,
)

def test_arena_geval():
    """Compare two outputs and pick the better one."""
    arena_case = ArenaTestCase(
        contestants=[
            Contestant(
                name="GPT-4o",
                test_case=LLMTestCase(
                    input="Explain Docker in one sentence.",
                    actual_output="Docker packages apps into containers "
                    "for consistent deployment across environments.",
                ),
            ),
            Contestant(
                name="GPT-3.5",
                test_case=LLMTestCase(
                    input="Explain Docker in one sentence.",
                    actual_output="Docker is a tool.",
                ),
            ),
        ],
    )
    metric = ArenaGEval(
        name="Clarity",
        criteria="Response should be clear and informative.",
        evaluation_params=[
            LLMTestCaseParams.INPUT,
            LLMTestCaseParams.ACTUAL_OUTPUT,
        ],
    )
    results = compare(test_cases=[arena_case], metric=metric)
    gpt4o_wins = results.get("GPT-4o", 0)
    baseline_wins = results.get("GPT-3.5", 0)
    assert gpt4o_wins > baseline_wins, (
        f"Expected GPT-4o to win: GPT-4o={gpt4o_wins}, GPT-3.5={baseline_wins}"
    )
```

**Note:** `compare()` returns a `dict[str, int]` of win counts per contestant name.
Use `.get("ContestantName", 0)` to read results. Arena masks names and randomises
order to prevent position bias. No pass/fail threshold — only win counts.

---

## DAG Metric (Directed Acyclic Graph)

**What it checks:** Does the output pass a multi-step evaluation graph?
Build branching evaluation logic with binary/non-binary judgement nodes.

```python
from deepeval import assert_test
from deepeval.metrics import DAGMetric, GEval
from deepeval.metrics.dag.graph import DeepAcyclicGraph
from deepeval.metrics.dag.nodes import BinaryJudgementNode, VerdictNode
from deepeval.test_case import LLMTestCase, LLMTestCaseParams

def test_dag_metric():
    """Multi-step evaluation: check format, then quality."""
    quality_check = GEval(
        name="Quality",
        criteria="Response is helpful and accurate.",
        evaluation_params=[
            LLMTestCaseParams.INPUT,
            LLMTestCaseParams.ACTUAL_OUTPUT,
        ],
        threshold=0.5,
    )
    dag = DeepAcyclicGraph(root_nodes=[
        BinaryJudgementNode(
            criteria="Is the response in English?",
            evaluation_params=[LLMTestCaseParams.ACTUAL_OUTPUT],
            children=[
                VerdictNode(verdict=True, child=quality_check),
                VerdictNode(verdict=False, score=0),
            ],
        ),
    ])
    test_case = LLMTestCase(
        input="What is Python?",
        actual_output="Python is a high-level programming language.",
    )
    metric = DAGMetric(name="FormatThenQuality", dag=dag)
    assert_test(test_case, [metric])
```

**ConversationalDAGMetric** works the same way for multi-turn evaluation.

---

## Turn-Level RAG Metrics (Conversational RAG)

For chatbots that use RAG at each turn:

- `TurnRelevancyMetric` — is each turn's answer relevant?
- `TurnFaithfulnessMetric` — is each turn faithful to its context?
- `TurnContextualPrecisionMetric` — are relevant docs ranked higher?
- `TurnContextualRecallMetric` — are all needed docs retrieved?
- `TurnContextualRelevancyMetric` — are all retrieved docs relevant?

```python
from deepeval import assert_test
from deepeval.metrics import TurnRelevancyMetric
from deepeval.test_case import ConversationalTestCase, Turn

def test_turn_relevancy():
    """Check if each turn's answer is relevant."""
    test_case = ConversationalTestCase(
        turns=[
            Turn(role="user", content="What is our return policy?"),
            Turn(role="assistant", content="Return within 30 days.",
                 retrieval_context=["Return policy: 30 day window."]),
        ],
    )
    metric = TurnRelevancyMetric(threshold=0.7)
    assert_test(test_case, [metric])
```

### Sources

- [DeepEval Docs](https://deepeval.com/docs/evaluation-introduction)
- [Deterministic Metrics](https://www.confident-ai.com/blog/how-i-built-deterministic-llm-evaluation-metrics-for-deepeval)
- [DAG Metrics Guide](https://deepeval.com/docs/metrics-dag)
