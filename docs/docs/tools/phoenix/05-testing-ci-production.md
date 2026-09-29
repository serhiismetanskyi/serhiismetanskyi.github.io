---
date: 2026-09-27
tags:
  - tools
  - observability
  - llm
  - phoenix
---

# Phoenix — Testing, CI & Production

Three ways Phoenix helps a test suite for an LLM system:

1. **Trace test runs** — every test gets its own session in Phoenix; a failing test links to the full trace (prompts, tool calls, tokens).
2. **Assert on spans** — check *how* the agent reached an answer: tools called, number of LLM calls, token budget, no errors.
3. **Record tests as experiments** — pytest results become experiment runs with scores, comparable across commits.

## Phoenix in the Test Environment

| Environment | Setup |
|-------------|-------|
| Local | `uv run phoenix serve` once, keep it running |
| CI | Service container `arizephoenix/phoenix:<pinned>` or `phoenix serve` with a temp `PHOENIX_WORKING_DIR` |
| Shared staging | Central instance with auth, project `<app>-ci`, `PHOENIX_API_KEY` from CI secrets |

```python
# tests/conftest.py
import os
import pytest
from openinference.instrumentation import using_attributes
from openinference.instrumentation.anthropic import AnthropicInstrumentor
from phoenix.client import Client
from phoenix.otel import register

PROJECT = os.getenv("PHOENIX_PROJECT_NAME", "triage-ci")
RUN_ID = os.getenv("CI_PIPELINE_ID", "local")

# SimpleSpanProcessor (batch=False): each span is exported when it ends
tracer_provider = register(project_name=PROJECT, protocol="http/protobuf", verbose=False)
AnthropicInstrumentor().instrument(tracer_provider=tracer_provider)


@pytest.fixture(scope="session")
def phoenix() -> Client:
    return Client()


@pytest.fixture(autouse=True)
def phoenix_session(request):
    """One Phoenix session per test: session.id = pytest node id."""
    session_id = f"{RUN_ID}:{request.node.nodeid}"
    with using_attributes(
        session_id=session_id,
        metadata={"test_id": request.node.nodeid, "run_id": RUN_ID, "git_sha": os.getenv("GIT_SHA", "")},
        tags=["pytest", *[m.name for m in request.node.iter_markers()]],
    ):
        yield session_id
    request.node.user_properties.append(("phoenix_session", session_id))   # lands in JUnit XML


def pytest_sessionfinish(session, exitstatus):
    tracer_provider.force_flush()
```

In the UI, filter the project by `metadata['run_id'] == '1234'` to see one CI run, or open **Sessions** to find a test by its node id.

## Asserting on Spans (Trace-Based Testing)

Ingestion is asynchronous — poll until spans arrive.

```python
# tests/phoenix_helpers.py
import time

import httpx
from phoenix.client import Client


def wait_for_spans(px: Client, project: str, session_id: str, min_count: int = 1, timeout: float = 15.0) -> list[dict]:
    deadline = time.monotonic() + timeout
    while True:
        try:
            spans = px.spans.get_spans(
                project_identifier=project,
                attributes={"session.id": session_id},  # server >= 14.9
                limit=500,
            )
        except httpx.HTTPStatusError as exc:             # 404 until the project's first span lands
            if exc.response.status_code != 404:
                raise
            spans = []
        if len(spans) >= min_count or time.monotonic() > deadline:
            return spans
        time.sleep(0.5)


def by_kind(spans: list[dict], kind: str) -> list[dict]:
    return [s for s in spans if s["span_kind"] == kind]
```

```python
# tests/test_triage_agent.py
from app.agent import triage_agent
from tests.conftest import PROJECT
from tests.phoenix_helpers import by_kind, wait_for_spans


def test_refund_ticket_uses_billing_tool_once(phoenix, phoenix_session):
    result = triage_agent("I was charged twice for March, please refund")
    assert result["queue"] == "billing"

    spans = wait_for_spans(phoenix, PROJECT, phoenix_session, min_count=3)
    tools = [s["attributes"]["tool.name"] for s in by_kind(spans, "TOOL")]
    llm_calls = by_kind(spans, "LLM")

    assert tools.count("lookup_invoices") == 1                   # called exactly once
    assert "issue_refund" not in tools                            # agent must not refund on its own
    assert len(llm_calls) <= 3                                    # no runaway loop
    assert all(s["status_code"] != "ERROR" for s in spans)
    total_tokens = sum(s["attributes"].get("llm.token_count.total", 0) for s in llm_calls)
    assert total_tokens < 4_000, f"token budget exceeded: {total_tokens}"
```

| Span assertion | Catches |
|----------------|---------|
| Tool X called / not called | Wrong routing, unsafe actions (refund, delete) |
| Count of `LLM` spans | Infinite agent loops, retry storms |
| `llm.token_count.total` budget | Prompt bloat, cost regressions |
| `llm.model_name` | Wrong model deployed (e.g. fallback to an expensive one) |
| `RETRIEVER` documents contain an expected doc id | Retrieval regressions in RAG |
| No `ERROR` status anywhere | Swallowed tool exceptions behind a "correct" answer |

`px.spans.get_spans_dataframe(query=SpanQuery().where("metadata['test_id'] == '...'"))` gives the same data as a DataFrame; `px.traces.get_traces(project_identifier=, session_id=, include_spans=True)` returns whole traces (server ≥ 20.8).

!!! tip "No server needed for unit-level checks"
    For fast in-process tests add an `InMemorySpanExporter` to the provider: `tracer_provider.add_span_processor(SimpleSpanProcessor(exporter))` and assert on `span.attributes["openinference.span.kind"]`. See [OpenTelemetry — Testing](../../libs/opentelemetry/06-testing.md).

## The Phoenix pytest Plugin

`arize-phoenix-client` ships a pytest plugin (auto-registered when pytest is installed). Tests marked `@pytest.mark.phoenix` are recorded as **experiment runs**: the test file (or `dataset=`) becomes a dataset, each parametrized case an example, the assertion outcome a `pass` annotation.

```python
import pytest
from phoenix.client.pytest import evaluate, log_evaluation, log_output
from phoenix.evals import LLM
from phoenix.evals.metrics import CorrectnessEvaluator

from app.rag import answer

judge = LLM(provider="anthropic", model="claude-haiku-4-5")
correctness = CorrectnessEvaluator(llm=judge)

CASES = [
    ("How long is the refund window?", "30 days"),
    ("Can I export reports to CSV?", "Settings → Export"),
]


@pytest.mark.phoenix(dataset="docs-rag-regression", repetitions=2)
@pytest.mark.parametrize("question,must_mention", CASES, ids=["refund-window", "csv-export"])
def test_docs_answers(question, must_mention):
    reply = answer(question)
    log_output({"answer": reply})
    log_evaluation(name="length_ok", score=float(len(reply) < 600))          # recorded, does not fail
    result = evaluate(correctness, input=question, output=reply)            # recorded + returned
    assert must_mention.lower() in reply.lower()
    assert result[0].label == "correct"
```

| Control | Effect |
|---------|--------|
| `@pytest.mark.phoenix(dataset=, repetitions=, evaluators=[...], experiment_metadata=)` | Per-test settings |
| `PHOENIX_TEST_DATASET=smoke` or ini `phoenix_dataset` | Put the whole selection into one dataset |
| `PHOENIX_TEST_REPETITIONS=3` | Default repetitions (flakiness measurement) |
| `PHOENIX_TEST_TRACKING=false` | Run the tests without talking to Phoenix |

The plugin works with `pytest-xdist` and prints `Phoenix: recorded N run(s) across M experiment(s)` in the terminal summary. It is a recent addition — pin `arize-phoenix-client` and check its changelog when upgrading.

## Experiments as CI Regression Gates

```python
# scripts/eval_gate.py — run in CI after unit tests
import sys
from phoenix.client import Client
from phoenix.client.experiments import run_experiment

from app.triage import route_ticket

THRESHOLDS = {"queue_match": 0.92, "valid_queue": 1.0}

px = Client()
dataset = px.datasets.get_dataset(dataset="triage-golden", splits=["smoke", "adversarial"])


def queue_match(output, expected) -> bool:
    return output["queue"] == expected["queue"]


def valid_queue(output) -> bool:
    return output["queue"] in {"billing", "bugs", "how-to", "security"}


exp = run_experiment(
    dataset=dataset,
    task=lambda input: route_ticket(input["ticket"]),
    evaluators=[queue_match, valid_queue],
    experiment_name=f"ci-{sys.argv[1]}",                 # commit SHA
    experiment_metadata={"sha": sys.argv[1], "branch": sys.argv[2]},
    client=px,
)

failed = []
for name, minimum in THRESHOLDS.items():
    scores = [r.result["score"] for r in exp["evaluation_runs"] if r.name == name and r.result]
    mean = sum(scores) / max(len(scores), 1)
    print(f"{name}: {mean:.3f} (min {minimum})")
    if mean < minimum:
        failed.append(name)

print(px.experiments.get_experiment_url(exp["dataset_id"], exp["experiment_id"]))
sys.exit(1 if failed else 0)
```

```yaml
# .github/workflows/llm-eval.yml (fragment)
jobs:
  eval-gate:
    runs-on: ubuntu-latest
    services:
      phoenix:
        image: arizephoenix/phoenix:20.16.0      # pinned
        ports: ["6006:6006", "4317:4317"]
    env:
      PHOENIX_COLLECTOR_ENDPOINT: http://localhost:6006
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v6
      - run: uv sync
      - run: uv run python scripts/seed_datasets.py         # upload golden set from the repo
      - run: uv run python scripts/eval_gate.py "$GITHUB_SHA" "$GITHUB_REF_NAME"
```

- Keep the golden dataset **in the repo** (CSV/JSONL) and upload it in CI when Phoenix is ephemeral; use a shared instance to keep history across commits.
- Gate on deterministic evaluators first; add LLM-judge thresholds only after calibration, with a tolerance band.
- Run the smoke split on every PR, the full split nightly.

## Production: Retention, Sampling, PII

| Concern | Setting |
|---------|---------|
| Retention | `PHOENIX_DEFAULT_RETENTION_POLICY_DAYS=30` for new projects; per-project policies in Settings |
| Storage growth | PostgreSQL, monitor disk; separate projects for noisy sources |
| Head sampling | `register(..., sampler=ParentBased(TraceIdRatioBased(0.1)))` — kwargs go to the OTel `TracerProvider` |
| Tail sampling | OTel Collector `tail_sampling`: keep errors, slow traces, negative feedback, test traffic |
| Hide prompts / outputs | `OPENINFERENCE_HIDE_INPUTS=true`, `OPENINFERENCE_HIDE_OUTPUTS=true`, `OPENINFERENCE_HIDE_INPUT_MESSAGES=true` |
| Per-instrumentor masking | `AnthropicInstrumentor().instrument(tracer_provider=tp, config=TraceConfig(hide_inputs=True))` |
| Pattern redaction (emails, cards) | Custom span processor or Collector `redaction` / `transform` processor before export |
| Access | Auth on, viewer role for most users, system keys per service |

!!! warning "Prompts are user data"
    LLM spans contain full prompts, retrieved documents and model outputs — often personal data. Decide what is captured before production traffic, not after the first incident.

## Production Checklist

- [ ] Separate projects per environment; test runs never go to the production project
- [ ] `batch=True` in services, `force_flush()`/`shutdown()` in jobs and test sessions
- [ ] Session and user ids set for conversational flows; feedback wired to span annotations
- [ ] Retention policy set; storage monitored
- [ ] Sampling strategy chosen (keep errors and negative feedback at 100%)
- [ ] PII masking verified by a test that inspects exported spans
- [ ] Production failures regularly curated into the golden dataset
- [ ] CI gate: experiment on every PR, thresholds versioned in the repo
- [ ] LLM judges calibrated against human labels, judge model pinned

---
## See also
- [Arize Phoenix — LLM Tracing & Evaluation](./index.md)
- [Phoenix — Datasets & Experiments](./03-datasets-experiments.md)
- [Phoenix — Evaluations](./04-evaluations.md)
- [Pytest — Python Testing Framework](../../libs/pytest/index.md)
- [OpenTelemetry — Testing with OpenTelemetry](../../libs/opentelemetry/06-testing.md)
- [Agentic AI — Testing, Evaluation & Observability](../../agentic-ai-architecture/06-testing-observability.md)
- [Langfuse — LLM Tracing, Prompts & Evals](../langfuse/index.md)
