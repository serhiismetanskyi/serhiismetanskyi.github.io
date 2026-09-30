---
date: 2026-08-03
tags:
  - llm
  - evaluation
  - deepeval
---

# DeepEval Testing Guide for QA Engineers

## Part 1: Introduction

### What is DeepEval?

DeepEval is a Python testing framework for LLM (Large Language Model) systems.
It works like pytest but for AI. You write test cases, pick metrics, and
DeepEval checks if your LLM output is good enough.

**Version used in this guide:** `deepeval==3.8.4`

### How Does LLM Testing Work?

In traditional testing, you compare output to expected result: `assert 2 + 2 == 4`.

In LLM testing, outputs are text. You cannot use exact match because the same
question can have many correct answers. Instead, DeepEval uses **LLM-as-Judge**:
another LLM evaluates if the output is good.

### LLM-as-Judge Pattern

```
Your LLM (generates answer) --> Judge LLM (evaluates quality) --> Score (0.0 to 1.0)
```

- **Your LLM** produces the `actual_output`
- **Judge LLM** (like GPT-4) reads the output and scores it
- **Score** is between 0.0 (bad) and 1.0 (perfect)
- **Threshold** is the minimum score to pass (default: 0.5)

### Key Concepts

| Concept | What It Means |
|---------|---------------|
| `input` | The question or prompt sent to your LLM |
| `actual_output` | The answer your LLM returned |
| `expected_output` | The correct answer (ground truth) you wrote |
| `context` | Facts your LLM should know (provided by you) |
| `retrieval_context` | Documents your RAG system found |
| `tools_called` | Tools your AI agent used |
| `threshold` | Minimum score to pass the test (0.0-1.0) |

### Test Case Types

DeepEval has two test case types:

1. **LLMTestCase** — for single question-answer tests
2. **ConversationalTestCase** — for multi-turn chat conversations

### Setup

```bash
uv init my-llm-tests
cd my-llm-tests
uv add deepeval pytest
```

Set your OpenAI API key (DeepEval uses it for the judge LLM):

```bash
export OPENAI_API_KEY="sk-your-key-here"
```

### How to Run Tests

```bash
# Run with pytest
uv run pytest tests/ -v

# Run with deepeval CLI (adds dashboard reporting)
uv run deepeval test run tests/ -v
```

### Basic Test Example

```python
from deepeval import assert_test
from deepeval.metrics import AnswerRelevancyMetric
from deepeval.test_case import LLMTestCase

def test_basic_llm_output():
    """Check: does the answer match the question?"""
    test_case = LLMTestCase(
        input="What is Python?",
        actual_output="Python is a programming language."
    )
    metric = AnswerRelevancyMetric(threshold=0.5)
    assert_test(test_case, [metric])
```

**What happens:**
1. DeepEval sends `input` + `actual_output` to the judge LLM
2. Judge LLM scores how relevant the answer is (0.0 to 1.0)
3. If score >= 0.5 (threshold), test passes
4. If score < 0.5, test fails with a reason

### All 47 Metrics by Category (as of v3.8)

> **Note:** DeepEval continues to add metrics. The official docs list
> "50+ metrics" — the count below reflects the metrics covered in this guide.

| Category | Metrics |
|----------|---------|
| RAG (5) | AnswerRelevancy, Faithfulness, ContextualPrecision, ContextualRecall, ContextualRelevancy |
| Quality (5) | Hallucination, Toxicity, Bias, Summarization, GEval |
| Red Team (4) | PIILeakage, Misuse, NonAdvice, RoleViolation |
| Agent (8) | ToolCorrectness, TaskCompletion, GoalAccuracy, ToolUse, PlanQuality, PlanAdherence, StepEfficiency, ArgumentCorrectness |
| Chatbot (4) | KnowledgeRetention, ConversationCompleteness, RoleAdherence, TopicAdherence |
| MCP (3) | MCPUse, MCPTaskCompletion, MultiTurnMCPUse |
| Deterministic (3) | ExactMatch, JsonCorrectness, PatternMatch |
| Advanced (5) | PromptAlignment, ConversationalGEval, ArenaGEval, DAGMetric, ConversationalDAGMetric |
| Multimodal (5) | ImageCoherence, ImageEditing, ImageHelpfulness, ImageReference, TextToImage |
| Turn-Level (5) | TurnRelevancy, TurnFaithfulness, TurnContextualPrecision, TurnContextualRecall, TurnContextualRelevancy |

### Guide Structure

| Part | Topic |
|------|-------|
| 1 | Introduction (this file) |
| 2 | [RAG Metrics + RAG Triad](01_metrics/02_rag_metrics.md) |
| 3 | [LLM Quality + Safety Metrics](01_metrics/03_llm_quality_metrics.md) |
| 4 | [AI Agent Metrics](01_metrics/04_agent_metrics.md) |
| 5 | [Chatbot Metrics + ConversationSimulator](01_metrics/05_chatbot_metrics.md) |
| 6 | [MCP Metrics](01_metrics/06_mcp_metrics.md) |
| 7 | [Extra Metrics](01_metrics/07_extra_metrics.md) (Deterministic, DAG, Arena, Turn-Level) |
| 8 | [Multimodal (Image) Metrics](01_metrics/08_multimodal_metrics.md) |
| 9 | [Red Teaming](02_testing/09_red_teaming.md) (RedTeamer, scanning, vulnerabilities) |
| 10 | [Custom LLMs and Embedding Models](02_testing/10_custom_llms.md) |
| 11 | [Building Custom Metrics + Answer Correctness](02_testing/11_custom_metrics.md) |
| 12 | [Workflows](02_testing/12_testing_workflows.md) (CI/CD, Synthesizer, Datasets, Tracing, Prod Evals) |
| 13 | [LLM Benchmarks](02_testing/13_benchmarks.md) (MMLU, HellaSwag, DROP, HumanEval, etc.) |
| 14 | [Practical RAG Testing](03_practical/14_practical_rag_testing.md) (LangChain + Ollama + DeepEval) |
| 14b | [Conversational RAG Evaluation](02_testing/14_conversational_rag_evaluation.md) |
| 15 | [RAG Diagnostic Testing](03_practical/15_rag_diagnostic_testing.md) (parameter tuning, query-type analysis) |
| 16 | [Datasets and Goldens](03_practical/16_datasets.md) (data models, local save/load, curation) |
| 17 | [Prompts & Prompt Optimization](03_practical/17_prompts_optimization.md) (GEPA, MIPROv2, COPRO) |
| 18 | [Evaluation Configs, Flags & Reference](03_practical/18_configs_flags_reference.md) (RAGAS, env vars) |
| 19 | [Reference Appendix](03_practical/19_reference_appendix.md) (DeepTeam vulns, Arena, troubleshooting) |
| 20 | [End-to-End Complex Tests](03_practical/20_e2e_complex_tests.md) (conversational + RAG + tools in one test) |

### Sources

- [DeepEval Docs](https://deepeval.com/docs/evaluation-introduction)
- [DeepEval Metrics](https://deepeval.com/docs/metrics-introduction)
- [LLM-as-Judge](https://www.confident-ai.com/blog/why-llm-as-a-judge-is-the-best-llm-evaluation-method)
- [AI Testing Series](https://testerstories.com/2026/02/ai-and-testing-evaluation-and-deepeval/)
