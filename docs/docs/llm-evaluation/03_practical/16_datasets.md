---
date: 2026-08-07
tags:
  - llm
  - evaluation
  - deepeval
  - rag
---

# DeepEval Guide — Part 16: Datasets and Goldens

## Golden vs Test Case

A **Golden** is a template — it holds input data and expected results
but is missing the dynamic parts (`actual_output`, `retrieval_context`,
`tools_called`) that your LLM produces at evaluation time.

A **Test Case** is a fully-formed evaluation unit with all fields populated.

```
Golden (what you expect) + LLM output = Test Case (what you evaluate)
```

Goldens are the preferred way to build datasets because they let you
re-evaluate the same inputs across different LLM versions.

---

## Golden Data Model

```python
from deepeval.dataset import Golden

golden = Golden(
    input="What is RAG?",                     # required
    expected_output="Retrieval-Augmented...",  # optional
    context=["RAG combines retrieval..."],     # optional
    expected_tools=[ToolCall(...)],            # optional
    additional_metadata={"source": "faq"},     # optional
    comments="Edge case — ambiguous query",    # optional
    custom_column_key_values={"priority": "high"},  # optional
)
```

For multi-turn conversations:

```python
from deepeval.dataset import ConversationalGolden

golden = ConversationalGolden(
    scenario="Frustrated user asking for a refund.",    # required
    expected_outcome="Redirected to a human agent.",    # optional
    user_description="Impatient, uses short sentences", # optional
    context=["Refund policy: 30 days..."],              # optional
)
```

---

## Single-Turn vs Multi-Turn Datasets

Datasets are **stateful** — once set to single-turn or multi-turn,
the type cannot be changed:

```python
from deepeval.dataset import EvaluationDataset, Golden, ConversationalGolden

# Single-turn dataset
st_dataset = EvaluationDataset(goldens=[Golden(input="What is RAG?")])
print(st_dataset._multi_turn)  # False

# Multi-turn dataset
mt_dataset = EvaluationDataset(
    goldens=[ConversationalGolden(scenario="User asks for refund.")]
)
print(mt_dataset._multi_turn)  # True
```

---

## Adding Goldens and Test Cases

After initialization, use `add_golden()` and `add_test_case()`:

```python
from deepeval.dataset import EvaluationDataset, Golden
from deepeval.test_case import LLMTestCase

dataset = EvaluationDataset(goldens=[Golden(input="What is RAG?")])

# Add more goldens
dataset.add_golden(Golden(input="Explain embeddings."))

# Add a test case (with actual LLM output)
dataset.add_test_case(LLMTestCase(
    input="What is RAG?",
    actual_output="RAG is Retrieval-Augmented Generation.",
))
```

---

## Local Save/Load: JSON

```python
from deepeval.dataset import EvaluationDataset, Golden

dataset = EvaluationDataset(goldens=[
    Golden(input="What is RAG?", expected_output="..."),
])

# Save
dataset.save_as(file_type="json", directory="./datasets")

# Load
dataset = EvaluationDataset()
dataset.add_goldens_from_json_file(
    file_path="./datasets/dataset.json",
)
```

---

## Local Save/Load: CSV

```python
from deepeval.dataset import EvaluationDataset

dataset = EvaluationDataset()

# Load goldens from CSV
dataset.add_goldens_from_csv_file(file_path="goldens.csv")

# Load test cases from CSV (map custom column names)
dataset.add_test_cases_from_csv_file(
    file_path="test_data.csv",
    input_col_name="query",
    actual_output_col_name="actual_output",
    expected_output_col_name="expected_output",
    context_col_name="context",
    context_col_delimiter=";",
)
```

---

## Synthesizer: All 4 Generation Methods

Part 12 covers `from_docs` and `from_contexts`. Two more methods:

### Generate from Scratch (no documents needed)

```python
from deepeval.synthesizer import Synthesizer

synthesizer = Synthesizer()
goldens = synthesizer.generate_goldens_from_scratch(
    subject="customer support for an e-commerce store",
    num_goldens=20,
)
```

Useful when you have no knowledge base yet — just describe the domain.

### Generate from Goldens (augment existing data)

```python
from deepeval.synthesizer import Synthesizer
from deepeval.dataset import Golden

seed_goldens = [
    Golden(input="How do I return an item?"),
    Golden(input="Where is my order?"),
]

synthesizer = Synthesizer()
goldens = synthesizer.generate_goldens_from_goldens(
    goldens=seed_goldens,
    num_goldens=50,
)
```

Takes existing goldens and creates variations — different phrasings,
edge cases, complexity levels.

### All 4 Methods Summary

| Method | Input | Best For |
|--------|-------|----------|
| `from_docs()` | Document files (PDF, TXT, DOCX) | RAG testing |
| `from_contexts()` | Pre-extracted context lists | Controlled evaluation |
| `from_scratch()` | Subject description string | No existing data |
| `from_goldens()` | Existing goldens list | Augmenting small datasets |

---

## Dataset Curation Best Practices

1. **Diverse coverage** — include easy, medium, hard inputs + edge cases
2. **Focused scope** — each test case targets one evaluation goal
3. **Clear objectives** — align datasets with specific metrics
4. **Start simple** — begin with prompts you already manually check
5. **Version datasets** — use `push(alias="v1")`, `push(alias="v2")`

### Sources

- [DeepEval Datasets Docs](https://deepeval.com/docs/evaluation-datasets)
- [Synthesizer Docs](https://deepeval.com/docs/synthesizer-introduction)
