---
date: 2026-10-19
tags:
  - llm
  - evaluation
  - deepeval
  - migration
---

# DeepEval Guide — Part 21: What's New in DeepEval 4.x

The rest of this guide was written against `deepeval==3.8.4` (February 2026). By October 2026 the current release is **4.3.1**. This page lists what changed, what breaks when you upgrade, and the new evals (voice, classifiers, expectations, deterministic metrics) with pointers to the pages that cover them.

How this page was built: the official [2026 changelog](https://deepeval.com/changelog/changelog-2026), the [GitHub releases](https://github.com/confident-ai/deepeval/releases) and the [DeepEval 4.0 post](https://deepeval.com/blog/introducing-deepeval-4), plus a check of every claim that could be checked against the installed `deepeval==4.3.1` (imports, signatures, source, and offline runs). Items I could only read about and not confirm in code are marked.

---

## Timeline

| Version | Highlights |
|---------|------------|
| 3.8.x (Jan-Feb) | OpenRouter, `upload()` for `GEval`, Azure AD auth, prompt tool support and commit-hash caching |
| 3.9.x (Mar-Apr) | AgentCore and OpenInference tracing, conversation-simulator controller (`proceed()` / `end()`), `generate` CLI command, Opus 4.7, default OpenAI judge `gpt-5.4`. **Breaking:** `observed_callback` and the legacy `API_KEY` alias removed |
| 4.0.x (May-Jul) | DeepEval as an evaluation harness for coding agents. `deepeval inspect` local trace viewer, Google ADK / Strands integrations, `OpenRouterModel`, dataset versioning, `simulation_graph`, token tracking, new deterministic metrics |
| 4.1.x (Aug) | Voice conversation simulations, flaky marking for metrics, MCP server support, TypeScript parity (Vitest, Mastra) |
| 4.2.0 (24 Aug) | **Voice evaluation**, and **scores standardized to higher-is-better** for Bias, Hallucination, Misuse and Toxicity |
| 4.2.4 (22 Sep) | **Jev** (an opt-in judge model for closed-ended decisions) and `deepeval.classifiers` |
| Oct | `deepeval setup` wizard, `TranscriptionAccuracyMetric`, `AudioGlitchMetric`, audio input on judge models and in `ConversationalGEval`; 4.3.1 contains `Expectations` |

---

## Breaking and Behavior Changes (Migration)

| Change | Since | What to do |
|--------|-------|-----------|
| **`BiasMetric`, `HallucinationMetric`, `MisuseMetric`, `ToxicityMetric` now score higher = better** | 4.2.0 | A test passes when `score >= threshold`, like every other metric. Scores are now the fraction of *good* verdicts, so an old score `s` corresponds to `1 − s`. Update thresholds: an old `threshold=0.3` ("at most 30% bad") becomes `threshold=0.7`. The default `0.5` still means "at least half good". Fix any code that assumed `score <= threshold` |
| `assert_test(..., observed_callback=...)` removed | 3.9.8 | Use an `@observe`-instrumented app and `assert_test(golden=golden, metrics=[...])`, or `evals_iterator()` |
| `API_KEY` alias removed | 3.9.9 | Set `CONFIDENT_API_KEY` (cloud uploads) |
| Dataset loading uses `metadata` instead of `additional_metadata` | 3.9.9 | Rename the column/key in CSV and JSON goldens you load |
| Per-result `.log` output and the metric logging manager removed | 3.9.8 | Use `results_folder` / `results_subfolder` in `DisplayConfig`, or `deepeval inspect` |
| `ConversationSimulator(controller=...)` deprecated | 4.0.3 | Use `stopping_controller=` (and `simulation_graph=` with `SimulationNode`) |
| `TurnRelevancyMetric` verdicts restricted to yes/no | 4.0.8 | Scores of borderline turns can shift. New `evaluation_template` parameter to customize the rubric |
| Neutral wording in `KnowledgeRetention`, `Summarization` and multimodal-faithfulness prompts | 4.1.10 | Borderline verdicts may move slightly, so re-baseline |
| `GEval` logprob weighting uses the final score token | 4.1.10 | Scores may differ slightly from 3.x |
| MCP metrics read `tools_called` | 4.0.8 | Put MCP calls in `tools_called` as well as `mcp_tools_called` |

### The score inversion in detail

In 4.3.1 `ToxicityMetric`, `BiasMetric`, `MisuseMetric`, `NonAdviceMetric` and `PIILeakageMetric` compute the score as the share of verdicts that are *good* (`Verdict.NO` for "yes is bad" questions), and `HallucinationMetric` as the share of context items the answer agrees with. The base `is_successful()` is `score >= threshold`. Consequences:

```python
# deepeval 3.x: low score = good, pass when score <= threshold
ToxicityMetric(threshold=0.2)        # allows up to 20% toxic opinions

# deepeval 4.2+: high score = good, pass when score >= threshold
ToxicityMetric(threshold=0.8)        # requires at least 80% non-toxic opinions
```

Dashboards, CI gates and your own `assert metric.score < 0.3` checks all need the same flip. Search your code for `Hallucination`, `Toxicity`, `Bias` and `Misuse` together with `score <`. Pages [Part 2](../01_metrics/02_rag_metrics.md) and [Part 3](../01_metrics/03_llm_quality_metrics.md) of this guide show both behaviors.

### Pin and upgrade deliberately

```bash
uv add "deepeval==4.3.1"          # exact pin; the project ships many releases a month
uv run deepeval --version         # 4.3.1
```

One release (4.0.8) was yanked from PyPI because of a broken login flow; use 4.0.9 or newer.

---

## New Evals and Metrics

### Voice evaluation (4.2.0+)

Simulated phone calls with recorded audio, and nine metrics that score the call from the audio signal. Seven need no LLM at all. See [Part 8b: Voice Evaluation](../01_metrics/08b_voice_metrics.md).

### Classifiers and Expectations (4.2.4+ / 4.3.1)

Closed-label judges (`RefusalClassifier`, `PromptInjectionClassifier`, ...) and `must` / `must_not` sentences on a test case. See [Part 22: Classifiers & Expectations](22_classifiers_expectations.md).

### `ToolPermissionMetric` (4.0.8) — deterministic

An allowlist/denylist check on `tools_called`. No LLM, no API key. Run offline on 4.3.1:

```python
from deepeval.metrics import ToolPermissionMetric
from deepeval.test_case import LLMTestCase, ToolCall

tc = LLMTestCase(
    input="clean up", actual_output="done",
    tools_called=[ToolCall(name="read_file", input_parameters={"path": "a"}),
                  ToolCall(name="delete_file", input_parameters={"path": "a"})],
)

ToolPermissionMetric(allowed_tools=["read_file", "list_dir"])      # allowlist
ToolPermissionMetric(denied_tools=["delete_file"])                 # denylist
```

| Configuration | Result |
|---------------|--------|
| `allowed_tools=["read_file", "list_dir"]` | score **0.5**, fail: `1 of 2 tool call(s) were unauthorized: ['delete_file']` |
| `denied_tools=["delete_file"]` | score **0.5**, fail, same reason |
| `allowed_tools=["read_file", "delete_file"]` | score **1.0**, pass: `All 2 tool call(s) stayed within the permitted set.` |

The default threshold is **1.0**: one unauthorized call fails the case. Use it as a guardrail test for coding agents and tool-using agents.

### `AgentLoopDetectionMetric` (4.0.8) — deterministic, trace-based

Detects an agent stuck in a loop. It reads the **trace**, not `tools_called`, so the app must be instrumented with `@observe`:

```python
from deepeval.dataset import EvaluationDataset, Golden
from deepeval.metrics import AgentLoopDetectionMetric
from deepeval.tracing import observe, update_current_trace


@observe(type="tool")
def search(q: str) -> str:
    return "no results"


@observe()
def agent(q: str) -> str:
    for _ in range(5):
        search(q)                       # same tool, same arguments
    update_current_trace(input=q, output="gave up")
    return "gave up"


dataset = EvaluationDataset(goldens=[Golden(input="find x")])
for golden in dataset.evals_iterator(metrics=[AgentLoopDetectionMetric(threshold=0.9)]):
    agent(golden.input)
```

Three checks, weighted: tool-call repetition 40% (same name and arguments at least `repetition_threshold=3` times), reasoning stagnation 35% (consecutive LLM outputs with similarity ≥ `similarity_threshold=0.85`), call-graph cycles 25% (a span repeated on one root-to-leaf path). Disabled checks (`check_tool_repetition=False`, ...) do not count against the score.

Run on 4.3.1: five identical `search` calls scored **0.80** and the report said "Tool 'search' called 5 times with identical arguments"; a trace with one call scored **1.00**. With `threshold=0.7` the looping run **passed**, with `0.9` it failed, so set the threshold deliberately. Without trace data the metric returns 0 with `No trace data found. This metric requires trace data from @observe.` The metric instance you pass to `evals_iterator()` is copied, so read scores from the report rather than from your object.

### `CitationFaithfulnessMetric` (listed in the 4.0.8 changelog)

The changelog announces it for citation misattribution. I could **not** find it in `deepeval.metrics` of 4.3.1 (the 58 exported `*Metric` classes include `AgentLoopDetectionMetric` and `ToolPermissionMetric` but no citation metric), so check the docs and your installed version before depending on it.

### Other metric changes

| Change | Detail |
|--------|--------|
| `flaky=True` on every metric | Failures are recorded but do not block; `assert_test()` prints a warning, reports show flaky sub-counts. Every evaluation still needs at least one non-flaky metric with a threshold |
| `threshold=None` | Score-only mode: score and reason, never pass/fail |
| Token usage | Metrics report token usage (4.0.6) |
| `ConversationCompleteness` / `TopicAdherence` respect `include_reason` | 4.1.10 fix |
| `ContextualPrecisionMetric` groups retrieval context by source | 4.0.7 |
| Tool-call metrics report tool *type* mismatches | 4.1.9 |
| gpt-5-family judges without logprobs cannot be judges for `GEval` / `ConversationalGEval` | Docs warning added in 4.0.8; use a model that returns logprobs |

---

## Eval Modes and Jev (4.2.4+)

LLM-as-a-judge metrics can now be configured by **who decides**:

| `eval_mode` | Who does what |
|-------------|---------------|
| `llm` (default) | The evaluation LLM runs the whole chain: extraction, decision, reason |
| `hybrid` | The LLM extracts and writes the reason; **Jev**, a small model for closed-ended decisions, answers the decision points. If a Jev call fails at runtime the LLM decides that item |
| `system_one` | Jev runs the whole metric in one request over the raw test case; the reason is deterministic text. No LLM is built or called and there is **no fallback**: a Jev error surfaces as is |

Select it per metric (`HallucinationMetric(eval_mode="hybrid")`), globally with `deepeval set-eval-mode`, or with the `DEEPEVAL_EVAL_MODE` environment variable. Precedence: the metric argument, then the setting, then `llm`. Classifiers and `Expectations` accept only `llm` and `system_one`. Jev needs the TypeSafe SDK and an API key; a missing key or SDK fails when the metric is constructed. Nothing turns it on implicitly: existing suites behave as before. The release notes label Jev opt-in and experimental, so treat scores from `hybrid` and `system_one` as a separate baseline from `llm`.

---

## CLI

`deepeval --help` on 4.3.1 lists these commands (selection):

| Command | Purpose |
|---------|---------|
| `deepeval test run <file.py>` | Pytest-based runs; since 4.0.5 any Python file, not only `test_*.py` |
| `deepeval inspect` | Terminal UI to inspect a saved test run's traces locally |
| `deepeval generate` | Generate synthetic goldens with the synthesizer, from the CLI |
| `deepeval setup` | Setup wizard (macOS and Linux) that sets up an eval for the project with a coding agent; options such as `--project-dir`, `--proj-id` pass through |
| `deepeval diagnose` | Show the effective configuration and where each value came from |
| `deepeval set-eval-mode`, `set-mode` | Choose who decides in LLM-judge metrics; choose the feature channel |
| `deepeval set-local-store` | Choose the local backend for test runs (`DEEPEVAL_LOCAL_STORE`) |
| `deepeval gate` | Check the project against a governance policy on Confident AI; non-zero exit on failure |
| `deepeval login` / `logout` / `view` | Confident AI |
| `deepeval settings`, `set-debug`, `unset-debug` | Power-user configuration and verbosity |
| `deepeval set-openai`, `set-azure-openai`, `set-anthropic`, `set-bedrock`, ... | Choose the judge provider |

`deepeval inspect` plus local trace storage is the main 4.0 idea: a coding agent (Claude Code, Codex, Cursor) can run `deepeval test run`, read the saved traces and iterate. DeepEval publishes agent *skills* for Cursor and Claude in its repository.

`evaluate()` and `DisplayConfig` gained report options: HTML and Markdown exports, truncation of passing cases (`truncate_passing_cases=True`), `inspect_after_run=True`, `results_folder`. `assert_test()` now takes `classifiers=`; `evaluate()` takes `classifiers=`, `mcp_servers=` and `official=` (baseline runs, needs `CONFIDENT_API_KEY`).

---

## Tracing and Integrations

One-line tracing and evaluation for several frameworks, plus OpenTelemetry export:

| Integration | Notes |
|-------------|-------|
| LangChain / LangGraph | `from deepeval.integrations.langchain import CallbackHandler` and `config={"callbacks": [CallbackHandler()]}` |
| Pydantic AI | Agent spans populate `tools_called` (4.0.7). See [Pydantic AI testing](../../libs/pydantic-ai/04-testing-evals.md) |
| OpenAI Agents, Strands, AgentCore, Google ADK | Listed in the 4.0 announcement and changelog; Strands, AgentCore and Google ADK go through OpenTelemetry tracing |
| OpenInference | Span interception and OTLP export |
| Mastra (TypeScript) | 4.1.5 |
| Multimodal traces | Images and PDFs in LangChain and native traces (4.0.3) |

New judge-model providers: `OpenRouterModel`, Gemini 3 series, Vertex AI with user credentials, Amazon Bedrock fixes, `claude-opus-4-8` and `gpt-5.4-mini`.

---

## Datasets, Goldens and Simulation

| Feature | Detail |
|---------|--------|
| Dataset versioning | `EvaluationDataset` has `push`, `pull`, `create_version` and `get_versions` (4.0.5) |
| Edit goldens | `update_golden()` and `delete_golden()` in the SDK (4.1.7) |
| New golden fields | `expectations` and `expected_labels` on `Golden` and `ConversationalGolden`; `ConversationalGolden` also takes a `persona` |
| Synthetic contexts | Generation across several source files (4.0.6) |
| Simulation control | `stopping_controller=` replaces `controller=`; `simulation_graph=` with `SimulationNode` shapes the conversation |
| Voice simulation | `ConversationSimulator(voice_config=...)`, see [Part 8b](../01_metrics/08b_voice_metrics.md) |
| Prompt optimization | GEPA included (labelled beta: single prompts only); SIMBA and COPRO docs added (4.0.2) |

---

## Upgrade Checklist

1. Pin `deepeval==4.3.1` in a branch and run your suite once **unchanged**; note every flipped result.
2. Flip thresholds for `Bias`, `Hallucination`, `Misuse` and `Toxicity` (and any code comparing their scores).
3. Replace `observed_callback`, `API_KEY` and `additional_metadata` usage; rename `controller=` to `stopping_controller=`.
4. Re-baseline `TurnRelevancy`, `KnowledgeRetention`, `Summarization` and `GEval` scores: wording and weighting changed.
5. Add deterministic guardrails that cost nothing: `ToolPermissionMetric`, `AgentLoopDetectionMetric`, `JsonCorrectnessMetric`, `PatternMatchMetric`.
6. Add classifiers for exact outcomes (refusal, prompt injection, data leakage) and `Expectations` for plain-language acceptance criteria.
7. If you ship a voice agent, add the voice metrics in [Part 8b](../01_metrics/08b_voice_metrics.md) to the smoke suite.
8. Set `DEEPEVAL_TELEMETRY_OPT_OUT=YES` in CI if you do not want telemetry, and decide on `deepeval login` for result history.

---

### Sources

- [DeepEval 2026 changelog](https://deepeval.com/changelog/changelog-2026)
- [GitHub releases](https://github.com/confident-ai/deepeval/releases)
- [Introducing DeepEval 4.0](https://deepeval.com/blog/introducing-deepeval-4)
- [Introduction to LLM Evals](https://deepeval.com/docs/evaluation-introduction)
- [Agent Loop Detection](https://deepeval.com/docs/metrics-agent-loop-detection)
- [deepeval on PyPI](https://pypi.org/project/deepeval/)

---
## See also
- [DeepEval Guide — Part 8b: Voice Evaluation](../01_metrics/08b_voice_metrics.md)
- [DeepEval Guide — Part 22: Classifiers & Expectations](22_classifiers_expectations.md)
- [DeepEval Guide — Part 18: Evaluation Configs, Flags & Reference](18_configs_flags_reference.md)
- [DeepEval Guide — Part 4: AI Agent Metrics](../01_metrics/04_agent_metrics.md)
- [DeepEval — LLM Testing Guide](../index.md)
