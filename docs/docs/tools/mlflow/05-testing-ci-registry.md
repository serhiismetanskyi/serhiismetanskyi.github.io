---
date: 2026-09-29
tags:
  - tools
  - mlflow
  - testing
  - pytest
  - deepeval
  - ci-cd
---

# MLflow — Testing, CI & Model Registry

What MLflow gives an automated test suite for LLM apps:

1. **One run per CI job** — pass rate, eval scores and reports of every build in one searchable history.
2. **Regression detection** — compare the current run with the last green run on `main`, fail the build on a drop.
3. **Assertions on behaviour** — traces show which tools the agent called, with which arguments, how long it took.
4. **Release gates** — a prompt or model version gets the `production` alias only after its evaluation run passes.

## Logging pytest + DeepEval Results per CI Run

One session-scoped fixture opens the run, a hook counts outcomes, a helper fixture records metric scores. The DeepEval tests stay unchanged apart from calling `record_score`.

```python
# tests/conftest.py
import os
from collections import Counter, defaultdict
from statistics import mean

import mlflow
import pandas as pd
import pytest

_outcomes: Counter[str] = Counter()
_scores: dict[str, list[float]] = defaultdict(list)
_rows: list[dict] = []


def pytest_runtest_logreport(report):
    if report.when == "call" or (report.when == "setup" and report.outcome != "passed"):
        _outcomes[report.outcome] += 1


@pytest.fixture(scope="session", autouse=True)
def mlflow_run():
    mlflow.set_experiment(os.getenv("MLFLOW_EXPERIMENT_NAME", "llm-regression"))
    with mlflow.start_run(run_name=f"ci-{os.getenv('CI_PIPELINE_ID', 'local')}") as run:
        mlflow.set_tags({
            "git_sha": os.getenv("GITHUB_SHA", "local"),
            "git_branch": os.getenv("GITHUB_REF_NAME", "local"),
            "ci_pipeline_id": os.getenv("CI_PIPELINE_ID", "local"),
            "suite": "llm-regression",
        })
        mlflow.log_params({
            "model": os.getenv("APP_MODEL", "gpt-4.1-mini"),
            "prompt_version": os.getenv("PROMPT_VERSION", "dev"),
        })
        yield run
        total = sum(_outcomes.values())
        mlflow.log_metrics({
            "tests_total": total,
            "tests_failed": _outcomes["failed"],
            "pass_rate": _outcomes["passed"] / total if total else 0.0,
            **{f"{name}_mean": mean(values) for name, values in _scores.items()},
        })
        if _rows:
            mlflow.log_table(data=pd.DataFrame(_rows), artifact_file="eval_results.json")


@pytest.fixture
def record_score(request):
    def _record(metric_name: str, score: float, passed: bool, reason: str | None = None) -> None:
        _scores[metric_name].append(score)
        _rows.append({
            "test": request.node.nodeid, "metric": metric_name,
            "score": score, "passed": passed, "reason": reason,
        })
    return _record
```

```python
# tests/test_answers.py
import pytest
from deepeval.metrics import AnswerRelevancyMetric
from deepeval.test_case import LLMTestCase

from app.bot import answer          # the app under test

CASES = [
    ("What is the capital of France?", "Paris"),
    ("How do I reset my password?", "Settings"),
]


@pytest.mark.parametrize(("question", "must_mention"), CASES)
def test_answer_relevancy(question, must_mention, record_score):
    actual = answer(question)
    metric = AnswerRelevancyMetric(threshold=0.7)
    metric.measure(LLMTestCase(input=question, actual_output=actual))

    record_score("answer_relevancy", metric.score, metric.is_successful(), metric.reason)
    assert metric.is_successful(), metric.reason
    assert must_mention.lower() in actual.lower()
```

```bash
MLFLOW_TRACKING_URI=http://mlflow:5000 MLFLOW_EXPERIMENT_NAME=llm-regression \
GITHUB_SHA=$(git rev-parse HEAD) GITHUB_REF_NAME=$(git branch --show-current) \
uv run pytest --junitxml=report.xml
```

The run gets `tests_total`, `tests_failed`, `pass_rate`, `answer_relevancy_mean` as metrics and `eval_results.json` as a table artifact with one row per test and metric (score, pass, reason). Failing tests do not fail the run: the run status stays `FINISHED`, the failures are in the metrics.

!!! warning "pytest-xdist"
    With `pytest -n 4` every worker is its own process and runs the session fixture separately — four runs instead of one. Either tag them with the same `ci_pipeline_id` and aggregate in the comparison step, or log from the controller process only (for example in `pytest_sessionfinish` when `not hasattr(session.config, "workerinput")`).

## Evaluation as a pytest Gate

When the metrics live in MLflow scorers, one test runs the whole golden dataset and asserts on the aggregated scores:

```python
# tests/test_quality_gate.py
import os

import mlflow
from mlflow.genai.scorers import Correctness, scorer

from app.bot import answer

THRESHOLDS = {"correctness/mean": 0.9, "contains_answer/mean": 0.95}
JUDGE = os.getenv("JUDGE_MODEL", "openai:/gpt-4.1-mini")

GOLDEN = [
    {"inputs": {"question": "Capital of France?"}, "expectations": {"expected_response": "Paris"}},
    {"inputs": {"question": "Capital of Spain?"}, "expectations": {"expected_response": "Madrid"}},
]


@scorer
def contains_answer(outputs: str, expectations: dict) -> bool:
    return expectations["expected_response"].lower() in outputs.lower()


def test_golden_dataset_quality():
    mlflow.set_experiment(os.getenv("MLFLOW_EXPERIMENT_NAME", "support-bot-quality"))
    with mlflow.start_run(run_name=f"quality-{os.getenv('GITHUB_SHA', 'local')[:7]}"):
        mlflow.set_tags({"git_sha": os.getenv("GITHUB_SHA", "local"), "judge_model": JUDGE})
        results = mlflow.genai.evaluate(
            data=GOLDEN,
            predict_fn=answer,
            scorers=[contains_answer, Correctness(model=JUDGE)],
        )

    failed = {k: results.metrics.get(k) for k, v in THRESHOLDS.items() if results.metrics.get(k, 0.0) < v}
    assert not failed, f"below threshold: {failed}; details: run {results.run_id}"
```

The failure message carries the run id; the per-case judge rationales are in the UI under that run.

## Asserting on Traces

Traces make agent behaviour testable: which tools ran, with which inputs, whether any span failed.

```python
# tests/test_agent_trace.py
import mlflow
import pytest
from mlflow.entities import SpanStatusCode, SpanType

from app.agent import agent        # decorated with @mlflow.trace, tools with span_type=SpanType.TOOL


@pytest.fixture
def last_trace():
    def _get():
        mlflow.flush_trace_async_logging()          # export is asynchronous
        return mlflow.get_trace(mlflow.get_last_active_trace_id())
    return _get


def test_weather_question_calls_tool_once(last_trace):
    answer = agent("What is the weather in Kyiv?")
    trace = last_trace()

    tools = trace.search_spans(span_type=SpanType.TOOL)
    assert [s.name for s in tools] == ["get_weather"]
    assert tools[0].inputs == {"city": "Kyiv"}
    assert all(s.status.status_code == SpanStatusCode.OK for s in trace.data.spans)
    assert "Sunny" in answer


def test_off_topic_question_uses_no_tools(last_trace):
    agent("Tell me a joke")
    assert last_trace().search_spans(span_type=SpanType.TOOL) == []
```

- `get_last_active_trace_id()` is per process — fine for sequential tests; with threads or async, capture the id inside the call (`mlflow.get_active_trace_id()`) instead.
- Assert on span names, types, inputs and counts — not on exact LLM wording.
- The same checks can run as `@scorer` functions over a dataset (see [Evaluation & Prompts](./04-evaluation-prompts.md#custom-scorers)).

## Regression Gate: Compare with `main`

A script after the tests compares this commit's run with the latest finished run on `main` and fails the job on a drop larger than allowed:

```python
# scripts/compare_runs.py
"""Fail CI when the current run is worse than the latest run on main."""
import os
import sys

import mlflow

EXPERIMENT = os.getenv("MLFLOW_EXPERIMENT_NAME", "llm-regression")
METRICS = {"pass_rate": 0.0, "answer_relevancy_mean": 0.05}     # metric -> allowed drop

current_sha = os.environ["GITHUB_SHA"]
current = mlflow.search_runs(
    experiment_names=[EXPERIMENT],
    filter_string=f"tags.git_sha = '{current_sha}'",
    order_by=["attributes.start_time DESC"],
    max_results=1,
    output_format="list",
)
baseline = mlflow.search_runs(
    experiment_names=[EXPERIMENT],
    filter_string=f"tags.git_branch = 'main' and tags.git_sha != '{current_sha}' and attributes.status = 'FINISHED'",
    order_by=["attributes.start_time DESC"],
    max_results=1,
    output_format="list",
)
if not current:
    sys.exit(f"no run for {current_sha} in {EXPERIMENT}")
if not baseline:
    print("no baseline on main yet, skipping comparison")
    sys.exit(0)

cur, base = current[0].data.metrics, baseline[0].data.metrics
failures = []
for name, allowed_drop in METRICS.items():
    delta = cur.get(name, 0.0) - base.get(name, 0.0)
    print(f"{name}: {base.get(name)} -> {cur.get(name)} ({delta:+.3f})")
    if delta < -allowed_drop:
        failures.append(name)
if failures:
    sys.exit(f"regression in {failures} vs baseline run {baseline[0].info.run_id}")
```

```text
pass_rate: 0.5 -> 0.4 (-0.100)
answer_relevancy_mean: 0.91 -> 0.83 (-0.080)
regression in ['pass_rate', 'answer_relevancy_mean'] vs baseline run 3e2f5772afb048b78ee519d6309c3180
```

LLM scores are noisy: set the allowed drop from the spread of a few repeated runs of the same commit, not to zero.

## MLflow in GitHub Actions

The comparison needs history, so CI talks to a **persistent** MLflow server; a server started inside the job would lose everything when the job ends.

```yaml
# .github/workflows/llm-tests.yml (fragment)
jobs:
  llm-tests:
    runs-on: ubuntu-latest
    env:
      MLFLOW_TRACKING_URI: ${{ vars.MLFLOW_TRACKING_URI }}          # https://mlflow.company.com
      MLFLOW_TRACKING_USERNAME: ${{ secrets.MLFLOW_USER }}
      MLFLOW_TRACKING_PASSWORD: ${{ secrets.MLFLOW_PASSWORD }}
      MLFLOW_EXPERIMENT_NAME: support-bot-regression
      CI_PIPELINE_ID: ${{ github.run_id }}
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v6
      - name: Wait for MLflow
        run: curl -sf --retry 10 --retry-all-errors "$MLFLOW_TRACKING_URI/health"
      - name: Run LLM tests
        run: uv run pytest --junitxml=report.xml
      - name: Compare with main
        if: github.ref_name != 'main'
        run: uv run python scripts/compare_runs.py
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: junit
          path: report.xml
```

- `GITHUB_SHA` and `GITHUB_REF_NAME` are set by Actions; in GitLab use `CI_COMMIT_SHA` and `CI_COMMIT_REF_NAME`.
- On pull requests `GITHUB_REF_NAME` is `<pr>/merge` — tag the head branch from `github.head_ref` if you want readable branch names.
- For a throwaway server inside the job (smoke-testing the logging code only), start it in a step: `uv run mlflow server --port 5000 &` and wait on `/health`.

## Model Registry for Release Gating

A registered model has numbered versions; **aliases** (`candidate`, `champion`, `production`) are movable pointers that apps and tests load by name. Stages (`Staging`, `Production`) are deprecated — use aliases and tags.

```python
import mlflow
import pandas as pd
from mlflow import MlflowClient


class SupportBot(mlflow.pyfunc.PythonModel):
    def predict(self, context, model_input, params=None):
        return [answer(q) for q in model_input["question"]]


with mlflow.start_run(run_name="build-42"):
    info = mlflow.pyfunc.log_model(
        name="support-bot",
        python_model=SupportBot(),
        registered_model_name="support-bot",          # creates version N of the registered model
        input_example=pd.DataFrame({"question": ["hi"]}),
    )

client = MlflowClient()
version = info.registered_model_version
client.set_registered_model_alias("support-bot", "candidate", version)
client.set_model_version_tag("support-bot", version, "git_sha", "a1b2c3d")
```

Gate: evaluate the candidate, then move the alias.

```python
candidate = client.get_model_version_by_alias("support-bot", "candidate")
model = mlflow.pyfunc.load_model("models:/support-bot@candidate")

# ... run the evaluation / test suite against `model` ...
passed = True

client.set_model_version_tag("support-bot", candidate.version, "eval_status", "passed" if passed else "failed")
if passed:
    client.set_registered_model_alias("support-bot", "champion", candidate.version)   # the app loads @champion
```

| URI | Resolves to |
|-----|-------------|
| `models:/support-bot/3` | Version 3 |
| `models:/support-bot@champion` | The version the alias points to |
| `models:/m-<id>` | A logged model (MLflow 3 `LoggedModel`) before or without registration |

The same alias pattern applies to prompts (`prompts:/support-answer@production`), see [Prompt Registry](./04-evaluation-prompts.md#prompt-registry). For GenAI apps that are not a model file, `mlflow.set_active_model(name=f"support-bot-{git_sha}")` links traces to an app version without registering a model.

## Common Pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| Runs missing on the server, `mlflow.db` appears in the repo | `MLFLOW_TRACKING_URI` not set | Set it in CI env; add `mlflow.db`, `mlruns/`, `mlartifacts/` to `.gitignore` |
| `403 Invalid Host header - possible DNS rebinding attack detected` | Server does not know the host name used by the client (Compose service, DNS name) | Add it to `--allowed-hosts` |
| `401 Unauthorized` | Server with basic auth, client without credentials | `MLFLOW_TRACKING_USERNAME` / `MLFLOW_TRACKING_PASSWORD` |
| `Changing param values is not allowed` | Same param key logged twice with different values | Params are write-once; use a tag or a new run |
| Test reads no trace or an old one | Trace export is asynchronous | `mlflow.flush_trace_async_logging()` before `get_trace` / `search_traces` |
| Traces disappear from MLflow after adding OTel | `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` set — MLflow now exports only via OTLP | `MLFLOW_TRACE_ENABLE_OTLP_DUAL_EXPORT=true` or `MLFLOW_ENABLE_OTLP_EXPORTER=false` |
| Scorer results missing from `results.metrics` | Scorer returns strings like `"pass"` / `"fail"` | Return `bool`, a number or `"yes"`/`"no"` |
| Retrieval judge raises an error | No `RETRIEVER` spans in the trace | Trace the lookup with `span_type=SpanType.RETRIEVER` |
| Every row in the evaluation is slow or rate-limited | 10 parallel workers against the app and the judge | `MLFLOW_GENAI_EVAL_MAX_WORKERS=2` |
| No `mlflow.source.git.commit` on test runs | Entry point is pytest, outside the repo | Set `git_sha` / `git_branch` tags yourself |
| Four runs per CI job | pytest-xdist workers each open a run | Log from the controller only, or aggregate by `ci_pipeline_id` |
| Server fails to start after upgrade | Database schema is older than the server | Back up, then `mlflow db upgrade <uri>` |
| Postgres backend: `No module named 'psycopg2'` | Official image has no DB drivers | Build on top with `psycopg2-binary` (and `boto3` for S3) |
| Filter on `tags.git.sha` or `metrics.correctness/mean` fails | Dots and slashes in keys | Backticks: ``tags.`git.sha` ``, ``metrics.`correctness/mean` `` |

## QA Checklist

- [ ] CI uses a persistent, authenticated MLflow server; `MLFLOW_TRACKING_URI` and credentials come from CI secrets
- [ ] One run per CI job with `git_sha`, `git_branch`, `ci_pipeline_id` tags and model / prompt versions as params
- [ ] pass rate and eval score means logged as metrics; per-case results as a table artifact; JUnit XML attached
- [ ] Regression gate compares with the last finished run on `main`, with drop thresholds based on measured noise
- [ ] Agent tests assert on trace spans (tools, inputs, errors), not on exact wording
- [ ] Judge model pinned and logged as a param; judges checked against human labels
- [ ] Prompts and models loaded by alias; aliases moved only after a passing evaluation run
- [ ] Test traffic in its own experiment, never mixed with production traces

---
## See also
- [MLflow — Experiment Tracking, LLM Tracing & Evaluation](./index.md)
- [MLflow — Evaluation & Prompts](./04-evaluation-prompts.md)
- [DeepEval — Testing Workflows](../../llm-evaluation/02_testing/12_testing_workflows.md)
- [Pytest — Python Testing Framework](../../libs/pytest/index.md)
- [Eval Harness — Tools, Testing & CI](../../ai-harness/04-eval-harness-tools-ci.md)
- [Phoenix — Testing, CI & Production](../phoenix/05-testing-ci-production.md)
- [CI/CD](../../ci-cd-approaches/index.md)
