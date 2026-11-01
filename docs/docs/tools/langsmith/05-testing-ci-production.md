---
date: 2026-10-22 12:00:00
tags:
  - tools
  - observability
  - llm
  - langsmith
  - evaluation
---

# LangSmith — Testing, CI & Production

Three ways LangSmith fits a QA workflow:

1. **Tests as tracked experiments** — the pytest plugin syncs each test to a dataset example and records a result row per run, with a trace behind it.
2. **Experiments as regression gates** — `evaluate()` over a golden dataset decides whether a prompt, model or code change may merge.
3. **Production monitoring** — dashboards, alerts, online evaluators and automation rules watch live traffic.

## pytest Plugin

```bash
uv add --dev "langsmith[pytest]"        # rich output and HTTP caching extras
```

```python
# tests/llm/test_triage.py
import json

import pytest
from langsmith import expect, traceable
from langsmith import testing as t


@traceable
def triage(ticket: str) -> str:
    return json.dumps({"priority": "P1" if "500" in ticket else "P4"})


@pytest.mark.langsmith
def test_priority_p1():
    ticket = "Checkout returns 500 for all EU users"
    t.log_inputs({"ticket": ticket})                 # becomes the dataset example inputs
    t.log_reference_outputs({"priority": "P1"})      # example reference outputs
    out = json.loads(triage(ticket))
    t.log_outputs(out)                               # run outputs
    t.log_feedback(key="json_valid", score=1)        # extra feedback next to the automatic `pass`
    assert out["priority"] == "P1"


@pytest.mark.langsmith(output_keys=["expected"])     # parametrized args: `expected` is a reference output
@pytest.mark.parametrize("ticket,expected", [("Typo on About page", "P4"), ("API 500 on login", "P1")])
def test_priority_param(ticket, expected):
    out = json.loads(triage(ticket))
    t.log_outputs(out)
    expect(out["priority"]).to_equal(expected)       # logs an `expectation` score and asserts
```

```bash
LANGSMITH_TEST_SUITE="triage-suite" uv run pytest tests/llm
```

Each run creates or updates a **dataset** (per test file, or per `LANGSMITH_TEST_SUITE`), syncs one example per test case, and records an **experiment** with one row per test. Pass/fail is stored under the `pass` feedback key.

| Helper (`langsmith.testing`) | Purpose |
|------------------------------|---------|
| `log_inputs`, `log_reference_outputs`, `log_outputs` | Example inputs, expected outputs, actual outputs (a second call overwrites) |
| `log_feedback(key=, score=)` | Additional metrics per test |
| `trace_feedback()` | Context manager: LLM-judge calls inside are traced under the feedback key, not the test run |
| `expect(value).to_equal / to_contain / to_be_less_than / to_be_between ...` | Log a binary `expectation` score **and** assert |
| `expect.embedding_distance(prediction=, expectation=)`, `expect.edit_distance(...)` | Fuzzy scores logged as feedback; optional predicate such as `.to_be_less_than(0.5)` |

| Marker option / env var | Effect |
|-------------------------|--------|
| `output_keys=[...]` | Which test arguments are reference outputs |
| `test_suite_name=` / `LANGSMITH_TEST_SUITE` | Group tests into one dataset |
| `repetitions=3` | Run the test N times (flaky models) |
| `split=`, `metadata=` | Example split and metadata |
| `cached_hosts=[...]` | Cache only these hosts (see below) |
| `LANGSMITH_EXPERIMENT` | Name of the experiment |
| `LANGSMITH_EXPERIMENT_METADATA` / `langsmith_experiment_metadata` fixture | JSON metadata (model, prompt version, branch); fixture wins |
| `LANGSMITH_TEST_TRACKING=false` | Dry run: tests execute, nothing is synced |
| `--langsmith-output` | Live rich table (incompatible with `pytest-xdist`; hides standard pytest output) |

- Works with `parametrize`, fixtures, `pytest-asyncio` (async tests) and `pytest-xdist`. Switch to `evaluate()` when a parametrized list grows large.
- `openevals` evaluators run inside tests and log their result as feedback: `correctness(inputs=..., outputs=..., reference_outputs=...)`.
- With `LANGSMITH_TEST_TRACKING=false` the same tests still pass or fail locally, and `log_*` helpers become no-ops.

### Caching HTTP Calls

```bash
LANGSMITH_TEST_CACHE=tests/cassettes uv run pytest tests/llm     # first run records, later runs replay
```

- Requires the `pytest` (or `vcr`) extra. One YAML cassette per test suite is written to the directory; commit it so CI replays instead of calling the model.
- Requests are matched on URI, method, path **and body**: change a prompt and the call is re-recorded (`new_episodes` mode). Request headers are not stored; the LangSmith API itself is never cached.
- `@pytest.mark.langsmith(cached_hosts=["api.openai.com", "https://api.anthropic.com"])` limits caching to specific hosts.
- Caching is active only while test tracking is enabled. Delete the cassettes to re-record against the live model.

## Regression Gates in CI

### Gate script

```python
# scripts/eval_gate.py
import os
import sys
from collections import defaultdict
from statistics import mean

from langsmith import Client, evaluate

THRESHOLDS = {"priority_match": 0.90, "json_valid": 1.0}      # minimum mean score per feedback key


def triage(inputs: dict) -> dict:
    return call_triage_model(inputs["ticket"])               # application entry point


def priority_match(outputs: dict, reference_outputs: dict) -> bool:
    return outputs["priority"] == reference_outputs["priority"]


def json_valid(outputs: dict) -> bool:
    return isinstance(outputs, dict) and {"priority", "team"} <= outputs.keys()


def check(rows: list[dict], thresholds: dict[str, float]) -> list[str]:
    scores: dict[str, list[float]] = defaultdict(list)
    failures = []
    for row in rows:
        if row["run"].error:
            failures.append(f"run failed on {row['example'].inputs}: {row['run'].error[:120]}")
        for res in row["evaluation_results"]["results"]:
            if res.score is not None:
                scores[res.key].append(float(res.score))
    for key, minimum in thresholds.items():
        got = mean(scores[key]) if scores[key] else 0.0
        if got < minimum:
            failures.append(f"{key}: {got:.2f} < {minimum:.2f}")
    return failures


def main() -> int:
    sha = os.getenv("GITHUB_SHA", "local")[:7]
    client = Client()
    results = evaluate(
        triage,
        data=client.list_examples(dataset_name="triage-regression", splits=["regression"]),
        evaluators=[priority_match, json_valid],
        experiment_prefix=f"ci-{sha}",
        metadata={"git_sha": sha, "branch": os.getenv("GITHUB_REF_NAME", "local")},
        max_concurrency=4,
        num_repetitions=2,
    )
    failures = check(list(results), THRESHOLDS)
    for line in failures:
        print(f"GATE FAILED: {line}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
```

`check()` is pure Python, so the gate itself is unit-testable with `evaluate(..., upload_results=False)` over `Example` objects and a good, a bad and a crashing target.

### GitHub Actions

```yaml
name: llm-evals
on:
  pull_request:
    paths: ["src/**", "prompts/**", "tests/llm/**", "scripts/eval_gate.py"]
permissions:
  contents: read
jobs:
  unit:                                    # no secrets: fork PRs, no network
    runs-on: ubuntu-latest
    env:
      LANGSMITH_TRACING: "false"
      LANGSMITH_TEST_TRACKING: "false"
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v6
      - run: uv sync
      - run: uv run pytest tests --ignore=tests/llm -q      # LLM tests need keys: run them in `evals`
  evals:
    if: github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    env:
      LANGSMITH_TRACING: "true"
      LANGSMITH_API_KEY: ${{ secrets.LANGSMITH_API_KEY }}      # service key, workspace-scoped
      LANGSMITH_PROJECT: support-bot-ci
      LANGSMITH_TEST_SUITE: support-bot-pytest
      LANGSMITH_EXPERIMENT: ${{ github.sha }}
      LANGSMITH_EXPERIMENT_METADATA: '{"git_sha": "${{ github.sha }}"}'
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v6
      - run: uv sync
      - run: uv run pytest tests/llm -q
      - run: uv run python scripts/eval_gate.py
```

Gate design:

- Threshold **aggregate** scores; one flaky example should not block a merge. Use `num_repetitions` and `temperature=0` to cut noise.
- Keep a small exact-check smoke split separate from the quality split (`splits=[...]`); pin the dataset version with `as_of="prod"`.
- Compare against the last `main` experiment in the UI (**Compare**) to catch drift; keep `git_sha` and `branch` in experiment metadata.
- CI runs write experiments and traces to the workspace: use a dedicated CI project and a workspace-scoped service key.

## Asserting on Traces

Check the **shape** of what the application did, offline, using in-memory runs:

```python
# tests/conftest.py
import pytest
import langsmith as ls


@pytest.fixture
def capture_trace():
    def _run(fn, *args, **kwargs):
        captured = {}
        with ls.tracing_context(enabled="local"):                 # builds the run tree, uploads nothing
            result = fn(*args, langsmith_extra={"on_end": lambda rt: captured.setdefault("root", rt)}, **kwargs)
        return result, captured["root"]
    return _run


def flatten(run):
    yield run
    for child in run.child_runs:
        yield from flatten(child)
```

```python
def test_rag_retrieves_before_generating(capture_trace):
    answer, root = capture_trace(rag, "How do I reset my password?")
    steps = [(r.name, r.run_type) for r in flatten(root)]
    assert steps == [("rag", "chain"), ("search_kb", "retriever"), ("answer_llm", "llm")]
    assert root.error is None
    llm = next(r for r in flatten(root) if r.run_type == "llm")
    assert llm.metadata["ls_model_name"] == "gpt-4o-mini"
```

To check what actually **reached** LangSmith (SDK upgrades, masking, metadata propagation), query the project with the v2 run API. Ingestion is asynchronous, so poll:

```python
import asyncio
import datetime as dt
import time

from langsmith import Client

client = Client()


async def names_in_trace(project_id: str, trace_id: str) -> set[str]:
    since = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=1)    # window defaults to 24 h if omitted
    return {
        run.name
        async for run in client.runs.query(
            project_ids=[project_id], trace_id=trace_id, min_start_time=since, selects=["ID", "NAME", "RUN_TYPE", "STATUS"]
        )
    }


def wait_for_trace(project_id: str, trace_id: str, expected: set[str], timeout: float = 60.0) -> set[str]:
    deadline = time.monotonic() + timeout
    names: set[str] = set()
    while time.monotonic() < deadline:
        names = asyncio.run(names_in_trace(project_id, trace_id))
        if expected <= names:
            return names
        time.sleep(2)
    raise AssertionError(f"trace {trace_id} is missing {expected - names}")
```

Use a custom `run_id` (`langsmith_extra={"run_id": uuid7()}`; the root run ID is the trace ID) to know which trace to look for. `selects` limits returned fields — skip `INPUTS` / `OUTPUTS` for speed. The filter language (`eq(name, "search_kb")`, `has(tags, "smoke")`, `gt(latency, "5s")`, `and(eq(feedback_key, "user_score"), lt(feedback_score, 1))`) applies to `filter`, `trace_filter` (root run) and `tree_filter` (any run in the trace). Old `client.list_runs()` code needs migrating to `client.runs.query()` / `client.traces.query()`.

## Monitoring, Alerts and Automations

| Feature | What it does |
|---------|--------------|
| **Dashboards** (prebuilt per project / environment, plus custom) | Traces (count, latency, errors), LLM calls, cost and tokens, tools, run types, feedback scores; group by tag or metadata |
| **Alerts** | Metric thresholds on one project or environment; **Slack**, **PagerDuty**, **webhook** (recipes for Teams, email, Google Chat) |
| **Automation rules** | filter + sampling + action on runs or threads |
| **Online evaluators** | Score sampled production runs ([04](./04-datasets-evaluations.md#online-evaluators)) |
| **Insights** | Automatic report of usage patterns and failure modes over many traces (Plus and Enterprise) |

**Alerts**: metrics are Run Count, Cost, Errors (count or percent), Feedback Score (per feedback key) and Latency; aggregation window 5 or 15 minutes; operators `>=` / `<=`; filters (status, run type, tag, error text) combine with AND only. Example: error rate above 5% over 5 minutes for `run_type = llm` and tag `support_agent` to PagerDuty; average `user_score` below 0.7 over 15 minutes to Slack.

**Automation rules** apply to *runs* or *threads* (threads act after an idle period, default 10 minutes) and can: add to a dataset, add to an annotation queue, trigger a webhook, run an online evaluator, extend retention. Examples: negative-feedback runs to a review queue; 10% of traces to a spot-check queue; errored traces upgraded to extended retention. Each rule polls independently — a webhook can fire before an evaluator has scored the run; add a feedback-key filter to the webhook rule to order them. Backfilling past runs is possible only when creating a rule.

## Cost and Token Tracking

| Source | How |
|--------|-----|
| LangChain, `wrap_openai`, `wrap_anthropic`, `@traceable` returning OpenAI/Anthropic-shaped output | Automatic: tokens and cost per `llm` run |
| Custom model call | `run_type="llm"`, `metadata={"ls_provider": ..., "ls_model_name": ...}`, then `get_current_run_tree().set(usage_metadata={"input_tokens": 27, "output_tokens": 13, "total_tokens": 40, "input_token_details": {"cache_read": 10}})` |
| Non-linear pricing | Send `usage_metadata` with `input_cost`, `output_cost`, `total_cost` (and `*_cost_details`) |
| Tool or retriever cost | `run.set(usage_metadata={"total_cost": 0.0015})` |

- Prices come from the workspace **model pricing map** (match pattern on `ls_model_name`, optional `ls_provider`); edit it for private or negotiated prices.
- Costs roll up per trace, project and thread (threads need the `thread_id` on child runs) and feed dashboards and **Cost** alerts. In v2 queries a run reports only its *own* usage; read trace totals from `client.traces.query()` (`trace_aggregates`).
- Evaluator LLM spend has separate weekly limits per organization or evaluator.

## PII, Retention and Access

| Topic | Practice |
|-------|----------|
| Mask or skip | `Client(anonymizer=...)`, `hide_inputs`, `process_inputs`, `create_secret_anonymizer()`; `tracing_context(enabled=False)` for zero-retention tenants ([02](./02-tracing-sdk.md#masking-and-redaction)) |
| Retention | Base 14 days; extended 180 days; datasets are kept — copy needed runs into datasets ([01](./01-setup-architecture.md#data-retention)) |
| Retention surprises | Online evaluators, rules and SDK feedback upgrade traces; opt out per evaluator or pass `extend_trace_retention=False` |
| Access | Workspace-scoped service keys for CI, tracing keys for apps; ABAC policies can hide PII-tagged resources (Enterprise) |
| Deletion | Delete a trace in the UI; data purging (delete by metadata, custom retention) is documented among the Enterprise compliance features; self-hosted keeps data in your network |

## Production Checklist

- [ ] `LANGSMITH_ENDPOINT`, key type and workspace match the region; tracing keys for services, service keys for CI
- [ ] Separate project or agent environment per environment; CI traffic isolated; `thread_id`, tags and `LANGSMITH_REVISION_ID` (git SHA) set on every request
- [ ] `Client().flush()` wired into jobs and serverless handlers; sampling chosen for high-volume endpoints (100% in CI)
- [ ] Masking configured and unit-tested; `LANGSMITH_*` env values contain no secrets
- [ ] Prompts pulled by `production` / `staging` tag; cache TTL understood
- [ ] Golden dataset grows from production failures; CI gate on aggregate scores; dataset version pinned
- [ ] Online evaluators on a sampled subset; user feedback via `create_feedback`; alerts on errors, latency, cost and feedback score; rules feed review queues
- [ ] Retention tiers and evaluator spend limits reviewed; self-hosted: backups for PostgreSQL and ClickHouse

## LangSmith vs Langfuse vs Phoenix vs MLflow

| Aspect | LangSmith | [Langfuse](../langfuse/index.md) | [Phoenix](../phoenix/index.md) | [MLflow](../mlflow/index.md) |
|--------|-----------|----------|---------|--------|
| License | SDKs MIT; platform commercial | MIT core + Enterprise Edition | Elastic License 2.0 | Apache 2.0 |
| Hosting | Cloud (4 regions), BYOC, self-hosted on Kubernetes (Enterprise) | Cloud or self-hosted (Compose / Helm) | Single container or `pip install` | Self-hosted server (SQL + artifact store) |
| Instrumentation | `@traceable`, wrappers, native LangChain / LangGraph; OTLP in | Own SDK on OTel; OTLP in | OpenInference on OTel | Autolog per library, `@mlflow.trace`; OTel in and out |
| Prompts | Commits, tags, `staging` / `production`, Playground, canvas | Versions + labels | Available | Registry with aliases |
| Evaluation | `evaluate()`, online evaluators, pairwise, annotation queues, openevals | Experiments, LLM-as-judge, annotation queues | Experiments, `phoenix.evals` | `mlflow.genai.evaluate`, scorers, judges |
| pytest | Native `@pytest.mark.langsmith` plugin + HTTP cache | Hand-written fixtures | `@pytest.mark.phoenix` plugin | Hand-written fixtures, DeepEval results |
| Production ops | Dashboards, alerts, rules, Insights | Dashboards, Metrics API | Lightweight, notebook-first | Run history, model registry |
| Best fit | LangChain / LangGraph teams, test-suite-as-experiment workflows, managed or BYOC | Shared open-source platform for traces, prompts and scores | Local debugging and eval notebooks | Teams already on MLflow for ML |

---
## See also
- [LangSmith — LLM Tracing, Prompts & Evals](./index.md)
- [LangSmith — Datasets & Evaluations](./04-datasets-evaluations.md)
- [Pytest — Python Testing Framework](../../libs/pytest/index.md)
- [DeepEval — LLM Testing Guide](../../llm-evaluation/index.md)
- [AI Harness](../../ai-harness/index.md)
- [OWASP LLM Security](../../owasp-llm-security/index.md)
- [LangChain — Security, Evaluation & Operations](../../libs/langchain/07-security-evaluation-operations.md)
- [Langfuse — Testing, CI & Production](../langfuse/05-testing-ci-production.md)
- [Phoenix — Testing, CI & Production](../phoenix/05-testing-ci-production.md)
- [MLflow — Testing, CI & Model Registry](../mlflow/05-testing-ci-registry.md)
