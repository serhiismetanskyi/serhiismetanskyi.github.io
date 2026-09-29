---
template: project.html
hide:
  - navigation   # the post-style sidebar (project.html) replaces the menu, as on blog posts
title: LLM Output Evaluation with DeepEval
description: Pytest suite that evaluates LLM output quality with DeepEval metrics using an LLM-as-a-judge approach — RAG, agent, chatbot and red teaming.
tags:
  - ai-testing
  - llm-evaluation
  - deepeval
  - pytest
  - pydantic
  - uv
---

# LLM Output Evaluation with DeepEval

A pytest-based test suite that evaluates LLM output quality with [DeepEval](https://github.com/confident-ai/deepeval) metrics, using an LLM-as-a-judge approach. The judge model is configurable (Cerebras or OpenRouter), and the tests are grouped by metric category, so each area can be run on its own, locally or in Docker.

## What's Covered

- **RAG** — AnswerRelevancy, Faithfulness, ContextualPrecision, ContextualRecall, ContextualRelevancy
- **LLM quality** — Hallucination, Toxicity, Bias, Summarization, GEval, PIILeakage, Misuse, NonAdvice, RoleViolation
- **Agents** — TaskCompletion, ToolCorrectness, GoalAccuracy, ToolUse, ArgumentCorrectness
- **Chatbots** — KnowledgeRetention, ConversationCompleteness, RoleAdherence, TopicAdherence, TurnRelevancy, TurnFaithfulness, ConversationalGEval
- **Extra metrics** — ExactMatch, JsonCorrectness, PatternMatch, PromptAlignment, ArenaGEval, DAGMetric
- **Custom metrics** — GEval with `evaluation_steps` and an answer correctness pattern
- **E2E and red teaming** — multi-metric conversational scenarios; PII leakage, jailbreak and prompt injection

## How It's Built

- **One module per metric category** — RAG, LLM quality, agent, chatbot, custom, extra, E2E and red teaming tests live in separate files, each with a matching `make` target.
- **Env-based configuration** — `pydantic-settings` loads the judge provider, model and API keys from `.env`.
- **Shared fixtures** — `conftest.py` provides the judge model and the inter-test delay.
- **Rate-limit guard** — an `autouse` fixture pauses between tests (10 seconds by default, `TEST_DELAY_SECONDS` to override) to avoid API 429 errors.
- **Structured JSON logs** — `JSONLogger` writes a timestamped log per run with metric name, score, success and reason for each test.
- **Deterministic subset** — `make test-deterministic` runs the fast tests that need no LLM.

## Tech Stack

- `deepeval` — LLM evaluation metrics
- `pytest` + `pytest-html` — test runner and HTML reports
- `pydantic` + `pydantic-settings` — env-based configuration
- `uv` — Python package manager
- `ruff` + `mypy` — linting and type checking
- `Docker` + `docker compose` — containerised test execution

## Running It

Install dependencies, create `.env` with the judge model settings, then run the suite:

```bash
make install   # install dependencies (uv sync --extra dev)
make env       # create .env from .env.example
make test      # run all tests
make test-html # run tests with HTML report → reports/test_report.html
```

<div class="page-actions" markdown>

[:material-arrow-left: All projects](index.md){ .md-button }
[:fontawesome-brands-github: View on GitHub](https://github.com/serhiismetanskyi/llm-output-evaluation-with-deepeval){ .md-button .md-button--primary target=_blank }

</div>
