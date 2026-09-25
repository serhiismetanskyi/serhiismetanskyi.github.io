---
date: 2026-09-25
tags:
  - llm
  - evaluation
  - harness
  - testing
  - ci-cd
---

# Eval Harness — Tools, Testing & CI

## Tool Landscape

| Tool | Best for | Style | License |
|---|---|---|---|
| **EleutherAI lm-evaluation-harness** | Academic benchmarks for base / instruct models (HF, vLLM, API backends) | CLI | MIT |
| **Inspect AI** (UK AISI) | Agent and model evals with sandboxes (Docker / Kubernetes) | Python + CLI + log viewer | MIT |
| **DeepEval** | Pytest-style LLM unit tests; RAG and agent metrics | Python / pytest | Apache-2.0 |
| **promptfoo** | Comparing prompts and models, red-teaming, CI | YAML + CLI | MIT |
| **Ragas** | RAG and agent quality metrics | Python | Apache-2.0 |
| **OpenAI Evals** | Eval framework and registry of benchmarks | CLI | MIT |
| **LangSmith** | Hosted datasets, experiments and tracing | Python SDK + platform | SDK MIT, platform commercial |
| **Braintrust** | Hosted experiments, scorers, CI integration | Python / TS SDK + platform | SDK MIT, platform commercial |
| **Harbor** | Containerised agent evals (runs Claude Code, Codex CLI, OpenHands…) | CLI | Apache-2.0 |

Also worth knowing: **Langfuse** and **Arize Phoenix** (observability + evals).
OpenAI's **simple-evals** repository is no longer updated.

**How to choose:**
- Benchmarking a model on public datasets → **lm-evaluation-harness**
- Evaluating an **agent** in a sandbox with many trials → **Inspect AI** or **Harbor**
- Tests that live next to your code in pytest → **DeepEval**
- Prompt / model comparison and red-teaming in CI with YAML → **promptfoo**
- RAG quality → **Ragas** or DeepEval
- Team dashboards, datasets and experiment history → **LangSmith** or **Braintrust**

## Quick Examples

Examples below are taken from the official docs of each tool.

### lm-evaluation-harness

```bash
lm_eval --model hf \
    --model_args pretrained=EleutherAI/gpt-j-6B \
    --tasks hellaswag \
    --device cuda:0 \
    --batch_size 8
```

### Inspect AI

```python title="simpleqa.py"
from inspect_ai import Task, task
from inspect_ai.dataset import FieldSpec, hf_dataset
from inspect_ai.scorer import model_graded_qa
from inspect_ai.solver import generate


@task
def simpleqa():
    return Task(
        dataset=hf_dataset(
            "codelion/SimpleQA-Verified",
            split="train",
            sample_fields=FieldSpec(input="problem", target="answer"),
        ),
        solver=generate(),
        scorer=model_graded_qa(),
    )
```

```bash
inspect eval simpleqa.py --model openai/gpt-4o
inspect eval simpleqa.py --model openai/gpt-4o --epochs 5   # 5 trials per sample
inspect view                                                # browse logs and transcripts
```

### DeepEval

```python title="test_example.py"
from deepeval import assert_test
from deepeval.metrics import GEval
from deepeval.test_case import LLMTestCase, SingleTurnParams


def test_correctness():
    correctness = GEval(
        name="Correctness",
        criteria="Determine if the 'actual output' is correct based on the 'expected output'.",
        evaluation_params=[SingleTurnParams.ACTUAL_OUTPUT, SingleTurnParams.EXPECTED_OUTPUT],
        threshold=0.5,
    )
    test_case = LLMTestCase(
        input="What is the capital of France?",
        actual_output="Paris is the capital of France.",
        expected_output="Paris",
    )
    assert_test(test_case, [correctness])
```

```bash
deepeval test run test_example.py
```

### promptfoo

```bash
npx promptfoo@latest init --example getting-started
cd getting-started
npx promptfoo@latest eval
npx promptfoo@latest view
```

```yaml title="promptfooconfig.yaml"
providers:
  - openai:chat:gpt-5.4
defaultTest:
  assert:
    - type: llm-rubric
      value: Do not mention that you are an AI or chat assistant
tests:
  - vars:
      name: Bob
      question: Can you help me find a specific product on your website?
```

### Harbor (agent in a container)

```bash
harbor run --dataset terminal-bench@2.0 \
    --agent claude-code \
    --model anthropic/claude-opus-4-1 \
    --n-concurrent 4
```

## Testing an Agent Harness

The harness is code. Test it in layers, from cheap and deterministic to expensive and realistic:

| Layer | What you test | Model | Speed | Runs |
|---|---|---|---|---|
| **Unit** | Tools, parsers, permission rules, hooks, compaction logic | Mocked / fake | ms | Every commit |
| **Replay** | Full agent loop with recorded model responses | Recorded | s | Every PR |
| **Integration** | Real model + real tools, small tasks | Real (small, token-capped) | min | PR (path-filtered) |
| **Trajectory eval** | Did the agent take reasonable steps? | Real | min | Nightly |
| **Outcome eval** | Final state in a sandbox, many trials | Real | min–h | Nightly / release |

### Unit: tools and policies without a model

```python
def test_search_tool_truncates_large_results():
    result = search_tool.run(query="error", limit=5)
    assert len(result["items"]) <= 5
    assert "next_page" in result


def test_policy_blocks_force_push():
    assert not is_allowed(ToolCall(name="Bash", args={"command": "git push --force"}))
```

### Replay: record once, replay in CI

Use `vcrpy` / `pytest-recording` to record real HTTP calls to the model API once and replay them later:

```bash
pytest --record-mode=once      # first run records cassettes
pytest                         # later runs replay them — no API calls, no cost
```

- Filter auth headers out of the cassettes.
- Cassettes go **stale** when prompts or tools change — re-record them as part of the change.

### Trajectory tests

Compare the agent's tool-call sequence with a reference:

| Match mode | Passes when |
|---|---|
| `strict` | Same calls in the same order |
| `unordered` | Same calls, any order |
| `subset` | Agent's calls are a subset of the reference |
| `superset` | Agent made at least the reference calls (extra calls allowed) |

Use trajectory checks for **safety and cost** (e.g. "never called `delete`", "no more than 3 searches").
Grade **correctness** by the outcome, not by the path.

### Headless runs in CI

Coding agents can run without a UI and return machine-readable output:

```bash
claude -p "Run the test suite and fix failing tests" --output-format json
```

### Resilience checks

Not covered by a single vendor guide, but a natural extension of the patterns above — simulate failures
and check that the harness recovers:
- tool timeouts and 5xx errors → retry or a clear error, not an endless loop
- huge tool outputs → truncation works
- context limit reached → compaction / reset keeps the task on track
- turn limit reached → clean stop with a useful message

## Evals in CI/CD

```
Every PR ─────────► unit tests + replayed agent tests            (fast, free, deterministic)
PR touching ──────► eval subset: promptfoo / deepeval / bt eval  (prompts/**, tools/**, agent/**)
prompts or tools
Nightly ──────────► full capability suites, several trials each  (trend dashboards)
Release ──────────► regression suite near 100% + human review    (hard gate)
Production ───────► tracing, monitoring, transcript review, A/B  (new eval cases from failures)
```

### promptfoo in GitHub Actions

```yaml title=".github/workflows/prompt-evals.yml"
name: Prompt evals
on:
  pull_request:
    paths:
      - "prompts/**"

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: promptfoo/promptfoo-action@v1
        with:
          config: promptfooconfig.yaml
          github-token: ${{ secrets.GITHUB_TOKEN }}
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### DeepEval in pytest

```yaml
      - run: uv run deepeval test run tests/evals/
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### Gating rules

| Suite | Gate |
|---|---|
| Unit + replay | Must pass — blocks the merge |
| Regression evals | Pass rate near 100% — blocks the merge / release |
| Capability evals | Tracked as a trend; alert on a significant drop |
| Cost and latency | Budget per run; alert when exceeded |

## Checklist

- [ ] Harness configuration (model, prompt, tools, limits, sandbox) is recorded with every result
- [ ] Tools and policies have unit tests without a model
- [ ] Model calls in CI are replayed from recordings
- [ ] Every trial starts from a clean, isolated environment
- [ ] Graders are tested on known good and bad answers; LLM judges are calibrated against humans
- [ ] Several trials per task; pass@k and pass^k are reported
- [ ] Regression suite gates merges; capability suite is tracked over time
- [ ] Failed production transcripts are turned into new tasks

---
## Sources
- [EleutherAI lm-evaluation-harness](https://github.com/EleutherAI/lm-evaluation-harness)
- [Inspect AI](https://inspect.aisi.org.uk/) — [options](https://inspect.aisi.org.uk/options.html)
- [DeepEval — Getting started](https://deepeval.com/docs/getting-started)
- [promptfoo — Getting started](https://www.promptfoo.dev/docs/getting-started/), [GitHub Action](https://www.promptfoo.dev/docs/integrations/github-action/)
- [Ragas — Quickstart](https://docs.ragas.io/en/stable/getstarted/quickstart/)
- [OpenAI Evals](https://github.com/openai/evals), [simple-evals](https://github.com/openai/simple-evals)
- [LangSmith — Evaluation quickstart](https://docs.langchain.com/langsmith/evaluation-quickstart)
- [Braintrust — Eval SDK](https://www.braintrust.dev/docs/start/eval-sdk)
- [Harbor](https://github.com/harbor-framework/harbor)
- LangChain — [Testing agents](https://docs.langchain.com/oss/python/langchain/test): [integration testing](https://docs.langchain.com/oss/python/langchain/test/integration-testing), [trajectory evals](https://docs.langchain.com/oss/python/langchain/test/evals)
- Claude Agent SDK — [Overview](https://code.claude.com/docs/en/agent-sdk/overview)
- Anthropic — [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) (Jan 2026)

## See also
- [AI Harness](index.md)
- [Eval Harness — Concepts & Metrics](03-eval-harness-concepts.md)
- [Agent Harness — Patterns & Anti-Patterns](02-agent-harness-patterns.md)
- [DeepEval — LLM Testing Guide](../llm-evaluation/index.md)
- [CI/CD Approaches](../ci-cd-approaches/index.md)
