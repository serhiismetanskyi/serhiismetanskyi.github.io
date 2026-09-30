---
date: 2026-08-06
tags:
  - llm
  - evaluation
  - deepeval
---

# DeepEval Guide — Part 13: LLM Benchmarks

## What Are LLM Benchmarks?

Benchmarks are standardized tests to measure LLM performance on various
skills: reasoning, knowledge, code generation, truthfulness, bias.

A benchmark consists of:
- **Tasks** — evaluation datasets with target labels (`expected_output`)
- **Scorer** — determines if predictions are correct (usually exact match)
- **Prompting techniques** — few-shot learning and/or Chain-of-Thought (CoT)

To benchmark any LLM, wrap it in `DeepEvalBaseLLM` (see [Part 10](10_custom_llms.md)).

---

## Quick Start

```python
from deepeval.benchmarks import MMLU
from deepeval.benchmarks.tasks import MMLUTask

benchmark = MMLU(
    tasks=[MMLUTask.HIGH_SCHOOL_COMPUTER_SCIENCE, MMLUTask.ASTRONOMY],
    n_shots=3,
)
benchmark.evaluate(model=my_custom_llm, batch_size=5)

print("Overall:", benchmark.overall_score)   # 0.0 — 1.0
print("Tasks:\n", benchmark.task_scores)     # pandas DataFrame
print("Details:\n", benchmark.predictions)   # per-question DataFrame
```

**`batch_size`** — generates outputs in batches if `batch_generate()` is
implemented in your custom LLM. Available for all benchmarks except
HumanEval and GSM8K.

---

## All 16 Benchmarks

| # | Benchmark | What It Tests | Size | Scorer | Config |
|---|-----------|--------------|------|--------|--------|
| 1 | **MMLU** | Academic knowledge (57 subjects) | 14K MCQ | Exact match | tasks, n_shots (≤5) |
| 2 | **HellaSwag** | Commonsense reasoning / sentence completion | 10K | Exact match | tasks, n_shots (≤15) |
| 3 | **BIG-Bench Hard** | 23 challenging multi-step reasoning tasks | 6.5K | Exact match | tasks, n_shots (≤3), enable_cot |
| 4 | **DROP** | Numerical reasoning over paragraphs | 9.5K | Exact match | tasks, n_shots (≤5) |
| 5 | **TruthfulQA** | Truthfulness (common misconceptions) | 817 | Exact/truth ID | tasks, mode (MC1/MC2) |
| 6 | **HumanEval** | Code generation (Python) | 164 | pass@k | tasks, n |
| 7 | **GSM8K** | Grade-school math word problems | 1.3K | Exact match | n_problems, n_shots (≤3), enable_cot |
| 8 | **IFEval** | Instruction-following compliance | — | Custom | n_problems |
| 9 | **SQuAD** | Reading comprehension (Wikipedia QA) | 10K | LLM-as-judge | tasks, n_shots (≤5), evaluation_model |
| 10 | **MathQA** | Multi-step math reasoning (GRE/GMAT level) | 37K MCQ | Exact match | tasks, n_shots (≤5) |
| 11 | **LogiQA** | Logical/deductive reasoning | 8.7K MCQ | Exact match | tasks, n_shots (≤5) |
| 12 | **BoolQ** | Yes/No reading comprehension | 3.3K | Exact match | n_problems, n_shots (≤5) |
| 13 | **ARC** | Science reasoning (grades 3–9) | 8K MCQ | Exact match | n_problems, n_shots (≤5), mode (EASY/CHALLENGE) |
| 14 | **BBQ** | Social bias detection in QA | 58K | Exact match | tasks, n_shots (≤5) |
| 15 | **LAMBADA** | Context comprehension (predict last word) | 5.2K | Exact match | n_problems, n_shots (≤5) |
| 16 | **Winogrande** | Commonsense reasoning (binary choice) | 1.3K | Exact match | n_problems, n_shots (≤5) |

---

## Configuration Options

### Tasks — select benchmark subsets

```python
from deepeval.benchmarks import MMLU
from deepeval.benchmarks.tasks import MMLUTask

benchmark = MMLU(tasks=[MMLUTask.MACHINE_LEARNING, MMLUTask.ASTRONOMY])
```

By default, all tasks are used. Each benchmark has its own Task enum.

### Few-Shot Learning (`n_shots`)

```python
from deepeval.benchmarks import HellaSwag

benchmark = HellaSwag(n_shots=5)
```

More shots → better format compliance → higher scores.

### Chain-of-Thought (`enable_cot`)

Only BIG-Bench Hard and GSM8K support CoT:

```python
from deepeval.benchmarks import BigBenchHard

benchmark = BigBenchHard(n_shots=3, enable_cot=True)
```

---

## Code Examples by Benchmark

### MMLU — 57 academic subjects, MCQ format

```python
from deepeval.benchmarks import MMLU
from deepeval.benchmarks.tasks import MMLUTask

benchmark = MMLU(
    tasks=[MMLUTask.HIGH_SCHOOL_COMPUTER_SCIENCE],
    n_shots=5,
)
benchmark.evaluate(model=my_llm)
```

### TruthfulQA — MC1 (single correct) or MC2 (multi-true)

```python
from deepeval.benchmarks import TruthfulQA
from deepeval.benchmarks.tasks import TruthfulQATask
from deepeval.benchmarks.modes import TruthfulQAMode

benchmark = TruthfulQA(
    tasks=[TruthfulQATask.HEALTH, TruthfulQATask.FINANCE],
    mode=TruthfulQAMode.MC2,
)
benchmark.evaluate(model=my_llm)
```

### HumanEval — code generation with pass@k

```python
from deepeval.benchmarks import HumanEval
from deepeval.benchmarks.tasks import HumanEvalTask

benchmark = HumanEval(
    tasks=[HumanEvalTask.HAS_CLOSE_ELEMENTS, HumanEvalTask.SORT_NUMBERS],
    n=100,
)
benchmark.evaluate(model=my_llm, k=10)
```

Requires `generate_samples(prompt, n, temperature)` method on the model.

### SQuAD — reading comprehension with LLM-as-judge

```python
from deepeval.benchmarks import SQuAD
from deepeval.benchmarks.tasks import SQuADTask

benchmark = SQuAD(
    tasks=[SQuADTask.PHARMACY, SQuADTask.NORMANS],
    n_shots=3,
    evaluation_model="gpt-4.1",
)
benchmark.evaluate(model=my_llm)
```

### GSM8K / ARC — numeric and science reasoning

```python
from deepeval.benchmarks import GSM8K, ARC
from deepeval.benchmarks.modes import ARCMode

gsm = GSM8K(n_problems=100, n_shots=3, enable_cot=True)
arc = ARC(n_problems=100, n_shots=3, mode=ARCMode.CHALLENGE)
```

---

## Reading Results

All benchmarks return: `benchmark.overall_score` (0.0–1.0),
`benchmark.task_scores` (pandas DataFrame per task),
`benchmark.predictions` (pandas DataFrame per question).

---

## Important Notes

1. **Output format matters** — most benchmarks require MCQ letter answers
   (A/B/C/D). If your LLM produces full sentences, scores will be near 0.
   Use JSON confinement (see [Part 10](10_custom_llms.md)) to ensure correct output format.

2. **Few-shot improves format** — always use maximum allowed `n_shots`
   for best format compliance.

3. **`batch_generate()`** — implement this optional method in your custom
   LLM to speed up benchmarking significantly.

4. **SQuAD is unique** — it uses LLM-as-judge scoring instead of exact
   match, making it more flexible but requiring an `evaluation_model`.

5. **HumanEval is unique** — uses `pass@k` metric and requires
   `generate_samples()` method (not `generate()`).

### Sources

- [DeepEval Benchmarks Intro](https://deepeval.com/docs/benchmarks-introduction)
- [MMLU](https://deepeval.com/docs/benchmarks-mmlu) ·
  [HellaSwag](https://deepeval.com/docs/benchmarks-hellaswag) ·
  [BIG-Bench Hard](https://deepeval.com/docs/benchmarks-big-bench-hard) ·
  [DROP](https://deepeval.com/docs/benchmarks-drop) ·
  [TruthfulQA](https://deepeval.com/docs/benchmarks-truthful-qa) ·
  [HumanEval](https://deepeval.com/docs/benchmarks-human-eval) ·
  [GSM8K](https://deepeval.com/docs/benchmarks-gsm8k) ·
  [IFEval](https://deepeval.com/docs/benchmarks-ifeval) ·
  [SQuAD](https://deepeval.com/docs/benchmarks-squad) ·
  [MathQA](https://deepeval.com/docs/benchmarks-math-qa) ·
  [LogiQA](https://deepeval.com/docs/benchmarks-logi-qa) ·
  [BoolQ](https://deepeval.com/docs/benchmarks-bool-q) ·
  [ARC](https://deepeval.com/docs/benchmarks-arc) ·
  [BBQ](https://deepeval.com/docs/benchmarks-bbq) ·
  [LAMBADA](https://deepeval.com/docs/benchmarks-lambada) ·
  [Winogrande](https://deepeval.com/docs/benchmarks-winogrande)
