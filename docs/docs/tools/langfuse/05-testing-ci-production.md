---
date: 2026-09-27
tags:
  - tools
  - observability
  - llm
  - langfuse
---

# Langfuse — Testing, CI & Production

Three ways Langfuse shows up in a QA workflow:

1. **Tests as traced traffic** — every pytest case produces a trace, tagged with the run id, so a failure links straight to the full LLM call tree.
2. **Experiments as regression gates** — a dataset run with evaluators decides whether a prompt/model change may merge.
3. **Production monitoring** — cost, latency and quality scores watched over time, with checks on the Metrics API.

## pytest: One Trace per Test

```python
# tests/conftest.py
import os
import uuid

import pytest
from langfuse import get_client, propagate_attributes

langfuse = get_client()
RUN_ID = os.getenv("GITHUB_RUN_ID", f"local-{uuid.uuid4().hex[:8]}")


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    rep = outcome.get_result()
    setattr(item, f"rep_{rep.when}", rep)          # item.rep_call.passed / .failed


@pytest.fixture(scope="session", autouse=True)
def langfuse_session():
    yield langfuse
    langfuse.flush()                               # tests exit fast — send everything


@pytest.fixture(autouse=True)
def lf_trace(request):
    trace_id = langfuse.create_trace_id(seed=f"{RUN_ID}:{request.node.nodeid}")   # deterministic
    with langfuse.start_as_current_observation(
        name=request.node.name,
        trace_context={"trace_id": trace_id},
        input={"test": request.node.nodeid},
    ):
        with propagate_attributes(
            session_id=RUN_ID,                     # whole run = one session in the UI
            tags=["pytest", f"run:{RUN_ID}"],
            metadata={"nodeid": request.node.nodeid[:200], "branch": os.getenv("GITHUB_REF_NAME", "local")},
        ):
            yield trace_id

    rep = getattr(request.node, "rep_call", None)
    if rep is not None:
        langfuse.create_score(trace_id=trace_id, name="test_passed", value=1 if rep.passed else 0, data_type="BOOLEAN")
        if rep.failed:
            print(f"\nLangfuse trace: {langfuse.get_trace_url(trace_id=trace_id)}")
```

- Everything the code under test traces (`@observe`, OpenAI wrapper, LangChain handler) nests under the test's root span.
- `session_id=RUN_ID` groups a CI run; filter by tag `run:<id>` to compare two runs.
- Run with `LANGFUSE_TRACING_ENVIRONMENT=ci` (or a dedicated project) so test traffic stays out of production views.
- Offline or fork PRs without secrets: `LANGFUSE_TRACING_ENABLED=false` — the fixtures still work, nothing is sent.

## Asserting on Quality

Compute scores **in the test**, assert on them, and also push them to Langfuse for trend analysis:

```python
import json
import pytest
from langfuse import get_client
from support_bot import triage

langfuse = get_client()

CASES = [
    ("Checkout returns 500 for all EU users", "P1"),
    ("Typo on the About page", "P4"),
]


@pytest.mark.parametrize("ticket,expected_priority", CASES)
def test_triage_priority(ticket, expected_priority, lf_trace):
    raw = triage(ticket)

    parsed = json.loads(raw)                                   # contract: valid JSON
    langfuse.score_current_trace(name="json_valid", value=1, data_type="BOOLEAN")

    match = parsed["priority"] == expected_priority
    langfuse.score_current_trace(name="priority_match", value=1.0 if match else 0.0)
    assert match, f"got {parsed['priority']}, want {expected_priority}"
```

!!! warning "Don't read scores back synchronously"
    Ingestion is asynchronous (queue → worker → ClickHouse). A score or trace written a moment ago may not be queryable yet. Assert on values you computed locally; read from the API only in dedicated checks with polling.

### Trace contract test (polling the API)

Verifies that the application itself emits correctly attributed traces — useful after SDK upgrades.

```python
import time
from langfuse import get_client

langfuse = get_client()


def wait_for_trace(trace_id: str, timeout: float = 30.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            return langfuse.api.trace.get(trace_id)
        except Exception:
            time.sleep(1)
    raise AssertionError(f"trace {trace_id} not ingested within {timeout}s")


def test_chat_turn_trace_contract(lf_trace):
    handle_chat_turn(user_id="qa-user-1", thread_id="thread-42", message="How do I reset my password?")
    langfuse.flush()

    trace = wait_for_trace(lf_trace)
    names = {o.name for o in trace.observations}
    assert trace.user_id == "qa-user-1" and trace.session_id == "thread-42"
    assert {"search_kb", "answer-llm"} <= names
    gen = next(o for o in trace.observations if o.name == "answer-llm")
    assert gen.type == "GENERATION" and gen.model
```

## Experiments as a CI Gate

### Option A — plain pytest

```python
# tests/llm/test_triage_regression.py
import pytest
from langfuse import get_client
from evals.triage import triage_task, priority_match, team_match, accuracy

THRESHOLD = 0.9


@pytest.mark.llm
def test_triage_dataset_regression():
    langfuse = get_client()
    dataset = langfuse.get_dataset("triage-regression")
    result = dataset.run_experiment(
        name="triage-ci",
        task=triage_task,
        evaluators=[priority_match, team_match],
        run_evaluators=[accuracy],
        max_concurrency=5,
    )
    langfuse.flush()

    assert len(result.item_results) == len(dataset.items), "some items crashed — see logs"
    acc = next(e.value for e in result.run_evaluations if e.name == "priority_accuracy")
    assert acc >= THRESHOLD, f"priority_accuracy {acc:.2f} < {THRESHOLD} — {result.dataset_run_url}"
```

### Option B — `langfuse/experiment-action`

```python
# experiments/triage_experiment.py
from langfuse import RegressionError, RunnerContext
from evals.triage import triage_task, priority_match, accuracy


def experiment(context: RunnerContext):
    result = context.run_experiment(           # dataset + GitHub metadata injected by the action
        name="triage-ci",
        task=triage_task,
        evaluators=[priority_match],
        run_evaluators=[accuracy],
    )
    acc = next(e.value for e in result.run_evaluations if e.name == "priority_accuracy")
    if acc < 0.9:
        raise RegressionError(result=result, metric="priority_accuracy", value=acc, threshold=0.9)
    return result
```

```yaml
# .github/workflows/llm-regression.yml
on: pull_request
permissions: { contents: read, pull-requests: write, actions: read }
jobs:
  experiment:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-python@v6
        with: { python-version: "3.13" }
      - uses: langfuse/experiment-action@v1.0.10   # pin to a release SHA in real pipelines
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        with:
          langfuse_public_key: ${{ secrets.LANGFUSE_PUBLIC_KEY }}
          langfuse_secret_key: ${{ secrets.LANGFUSE_SECRET_KEY }}
          langfuse_base_url: https://cloud.langfuse.com
          experiment_path: experiments/triage_experiment.py
          dataset_name: triage-regression
          github_token: ${{ github.token }}
```

The action runs the script, comments the run summary on the PR and fails the job on `RegressionError` (`should_fail_on_regression`, default `true`).

Gate design: threshold the **aggregate** score (one flaky item shouldn't block), keep a small exact-check smoke set separate from the quality set, compare with the last `main` run to catch slow drift, and use `temperature=0`, pinned models and `max_concurrency` limits to cut noise. Mark with `@pytest.mark.llm` and run only on PRs touching prompts or LLM code.

## Dashboards and Metrics API

Built-in dashboards show cost, token usage, latency (incl. time to first token) and scores, filterable by environment, tags, model, prompt name/version, release. Custom dashboards can be built from the same dimensions.

```python
import json
from datetime import datetime, timedelta, timezone
from langfuse import get_client

langfuse = get_client()
now = datetime.now(timezone.utc)

query = {
    "view": "observations",
    "dimensions": [{"field": "promptName"}, {"field": "promptVersion"}],
    "metrics": [
        {"measure": "totalCost", "aggregation": "sum"},
        {"measure": "latency", "aggregation": "p95"},
        {"measure": "count", "aggregation": "count"},
    ],
    "filters": [
        {"column": "type", "operator": "=", "value": "GENERATION", "type": "string"},
        {"column": "environment", "operator": "=", "value": "production", "type": "string"},
    ],
    "fromTimestamp": (now - timedelta(days=1)).isoformat(),
    "toTimestamp": now.isoformat(),
}
for row in langfuse.api.metrics.metrics(query=json.dumps(query)).data:
    print(row)            # one dict per promptName/promptVersion with the requested aggregates
```

- Views: `observations`, `scores-numeric`, `scores-boolean`, `scores-categorical`; aggregations `sum`, `avg`, `count`, `min`, `max`, `p50`–`p99`, `histogram`.
- High-cardinality fields (`traceId`, `userId`, `sessionId`) work as **filters**, not dimensions.
- `langfuse.api.metrics` targets the v2 endpoint of a v4 server; older self-hosted servers need `langfuse.api.legacy.metrics_v1`.
- A nightly job over this query (daily cost per prompt version, p95 latency, avg judge score) is a cheap production SLO check.

## Retention and PII

| Topic | Practice |
|-------|----------|
| Retention | Per project, minimum 3 days; deletes traces, observations, scores, media; keeps dataset items and audit logs. Cloud Pro/Enterprise or self-hosted EE. Self-hosted OSS keeps data forever unless you clean up |
| Test projects | Short retention (e.g. 14–30 days) |
| PII in prompts/outputs | `mask=` / `mask_otel_spans=` in the SDK — masked before data leaves the process |
| Large or sensitive payloads | `@observe(capture_input=False, capture_output=False)` on specific functions |
| Right to erasure | Delete traces via `langfuse.api.trace.delete(trace_id)` / `delete_multiple(trace_ids=[...])`; find them by `user_id` |
| Secrets | Secret key only on the server and in CI secrets; rotate per consumer |

## Production Checklist

- [ ] `LANGFUSE_BASE_URL`, keys and `LANGFUSE_TRACING_ENVIRONMENT` set per environment
- [ ] `flush()` / `shutdown()` wired into workers, jobs and serverless handlers
- [ ] `user_id`, `session_id`, `tags`, `version`/release propagated on every request
- [ ] Prompts fetched by label with `fallback`; generations linked to prompts
- [ ] PII masking in place and unit-tested
- [ ] Sampling rate chosen for high-volume endpoints (100% in CI)
- [ ] Online LLM-as-a-judge on a sampled subset; user feedback captured as scores
- [ ] Regression dataset grows from production failures; CI gate on experiment scores
- [ ] Cost/latency alerts or nightly Metrics API checks
- [ ] Retention configured; test traffic isolated in its own project or environment
- [ ] Self-hosted: backups for Postgres + ClickHouse, S3 lifecycle rules, `CHANGEME` secrets replaced

---
## See also
- [Langfuse — LLM Tracing, Prompts & Evals](./index.md)
- [Langfuse — Datasets & Evaluations](./04-datasets-evaluations.md)
- [Pytest — Python Testing Framework](../../libs/pytest/index.md)
- [OpenTelemetry — Testing with OpenTelemetry](../../libs/opentelemetry/06-testing.md)
- [DeepEval — LLM Testing Guide](../../llm-evaluation/index.md)
- [Arize Phoenix](../phoenix/index.md)
