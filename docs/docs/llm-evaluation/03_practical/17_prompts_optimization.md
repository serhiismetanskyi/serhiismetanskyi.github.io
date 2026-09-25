---
date: 2026-08-07
tags:
  - llm
  - evaluation
  - deepeval
  - rag
---

# DeepEval Guide — Part 17: Prompts & Prompt Optimization

## The Prompt Class

A `Prompt` in DeepEval is a first-class object that holds your prompt
template, model settings, and output configuration. It enables versioning,
evaluation tracking, and automated optimization.

### Creating Prompts

```python
from deepeval.prompt import Prompt, PromptMessage

# Text-based prompt
prompt_text = Prompt(
    alias="My Prompt",
    text_template="You are a helpful assistant. Answer: {input}",
)

# Message-based prompt (chat format)
prompt_msgs = Prompt(
    alias="Chat Prompt",
    messages_template=[
        PromptMessage(role="system", content="You are a helpful assistant."),
    ],
)
```

### Loading Prompts

```python
from deepeval.prompt import Prompt

# From Confident AI cloud
prompt = Prompt(alias="My Prompt")
prompt.pull(version="00.00.01")

# From local JSON or TXT file
prompt = Prompt()
prompt.load(file_path="prompt.json")
```

### Model & Output Settings

```python
from deepeval.prompt import Prompt, ModelSettings, ModelProvider, OutputType

prompt = Prompt(
    alias="Structured Prompt",
    text_template="Answer: {input}",
    model_settings=ModelSettings(
        provider=ModelProvider.OPEN_AI, name="gpt-4o",
        temperature=0.7, max_tokens=500,
    ),
    output_type=OutputType.SCHEMA,
    output_schema=MyPydanticModel,  # any BaseModel subclass
)
```

### Evaluating Prompts

Pass prompts in `hyperparameters` to track which prompt produced which scores:

```python
from deepeval import evaluate
from deepeval.metrics import AnswerRelevancyMetric
from deepeval.test_case import LLMTestCase

evaluate(
    test_cases=[LLMTestCase(input="...", actual_output="...")],
    metrics=[AnswerRelevancyMetric()],
    hyperparameters={"prompt": prompt},
)
```

For component-level evaluation, use `update_llm_span(prompt=prompt)`
inside an `@observe(type="llm")` span (see Part 12).

---

## Prompt Optimization

DeepEval's `PromptOptimizer` automatically rewrites prompts using
metric-driven feedback. Instead of manually tweaking prompts, the
optimizer evaluates candidates against your goldens and metrics.

### Quick Start

```python
from deepeval.dataset import Golden
from deepeval.metrics import AnswerRelevancyMetric
from deepeval.prompt import Prompt
from deepeval.optimizer import PromptOptimizer

prompt = Prompt(text_template="Respond to the query: {input}")

async def model_callback(prompt: Prompt, golden: Golden) -> str:
    text = prompt.interpolate(input=golden.input)
    return await your_llm(text)

optimizer = PromptOptimizer(
    metrics=[AnswerRelevancyMetric()],
    model_callback=model_callback,
)
optimized = optimizer.optimize(
    prompt=prompt,
    goldens=[Golden(input="What is RAG?", expected_output="...")],
)
print(optimized.text_template)
```

---

## Three Algorithms

### 1. GEPA (Genetic-Pareto) — Default

Evolutionary optimization with Pareto selection. Maintains a diverse
pool of candidate prompts and uses metric feedback for targeted mutations.

```python
from deepeval.optimizer.algorithms import GEPA

optimizer = PromptOptimizer(
    algorithm=GEPA(iterations=10, pareto_size=5, minibatch_size=8),
    metrics=[...], model_callback=model_callback,
)
```

**Steps:** split goldens → select parent from Pareto frontier →
collect metric feedback → LLM rewrites prompt → accept if improved →
final selection by aggregate score.

**Best for:** Diverse problem types where no single prompt excels.

### 2. MIPROv2 (Bayesian Optimization)

Jointly optimizes instructions AND few-shot demonstrations using
Bayesian Optimization (Optuna TPE sampler).

```python
from deepeval.optimizer.algorithms import MIPROV2

optimizer = PromptOptimizer(
    algorithm=MIPROV2(num_candidates=10, num_trials=20, num_demo_sets=5),
    metrics=[...], model_callback=model_callback,
)
```

**How it works:**
1. **Proposal phase:** generate N instruction candidates + M demo sets
2. **Optimization phase:** Bayesian search over (instruction, demo_set)
   combinations using minibatch scoring
3. Return best combination with demos rendered inline

**Best for:** Tasks where few-shot examples significantly improve output
quality (complex reasoning, formatting, code generation).

### 3. COPRO (Cooperative Prompt Optimization)

Bounded-population, zero-shot algorithm. Proposes multiple child
prompts cooperatively from shared feedback on each iteration.

```python
from deepeval.optimizer.algorithms import COPRO

optimizer = PromptOptimizer(
    algorithm=COPRO(population_size=4, proposals_per_step=4),
    metrics=[...], model_callback=model_callback,
)
```

**How it works:**
1. Epsilon-greedy parent selection from bounded population
2. Shared feedback → multiple child proposals per iteration
3. Accept children that improve; prune if population exceeds limit
4. Periodic full evaluation of best candidate

**Best for:** Fast exploration with multiple candidates per iteration.

---

## Algorithm Comparison

| Aspect | GEPA | MIPROv2 | COPRO |
|--------|------|---------|-------|
| Strategy | Pareto evolutionary | Bayesian (TPE) | Cooperative bounded |
| Few-shot demos | No | Yes (jointly optimized) | No |
| Diversity | Pareto frontier | Diverse tips + demo sets | Multi-child proposals |
| Dependencies | None | `optuna` | None |
| Default | ✅ | — | — |

### Sources

- [Prompt Optimization Docs](https://deepeval.com/docs/prompt-optimization-introduction)
- [GEPA Paper](https://arxiv.org/pdf/2507.19457)
- [MIPROv2 Paper](https://arxiv.org/pdf/2406.11695)
- [Prompts Docs](https://deepeval.com/docs/evaluation-prompts)
