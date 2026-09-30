---
date: 2026-09-30 12:00:00
tags:
  - python
  - libraries
  - agno
  - ai-agents
  - llm
  - testing
  - pytest
  - evaluation
  - deepeval
  - ci-cd
---

# Agno — API Tests, Evals & CI

The second half of the testing guide. It reuses `app/support_agent.py`, `ScriptedModel` and the fixtures from [05 Testing Agno Apps](./05-testing.md), and adds tests for the HTTP layer, the real provider adapter, traces, evaluations and the CI setup.

## API Tests for AgentOS

```python
# tests/test_api.py
import pytest
from agno.os import AgentOS
from fastapi.testclient import TestClient

from app.support_agent import build_support_agent
from tests.fakes import scripted


@pytest.fixture
def client(sqlite_db):
    agent = build_support_agent(scripted("Hello from the API"), db=sqlite_db)
    app = AgentOS(agents=[agent], db=sqlite_db, telemetry=False).get_app()
    with TestClient(app) as test_client:
        yield test_client


def test_health(client):
    assert client.get("/health").json()["status"] == "ok"


def test_run_endpoint_returns_run_output(client):
    response = client.post("/agents/support-agent/runs",
                           data={"message": "hi", "stream": "false", "session_id": "api-1"})

    assert response.status_code == 200
    body = response.json()
    assert body["content"] == "Hello from the API"
    assert body["status"] == "COMPLETED" and body["session_id"] == "api-1"
```

Also worth one test each: `401` without `Authorization: Bearer <OS_SECURITY_KEY>` when the key is set, and `text/event-stream` with `RunCompleted` as the last event for `stream=true`.

## Provider Contract with a Fake OpenAI Server

`ScriptedModel` bypasses the provider adapter. To test the real `OpenAIChat` code path — request format, tool schema, tool-result messages, token usage — point it at a tiny OpenAI-compatible server:

```python
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class FakeOpenAI:
    """Minimal OpenAI-compatible /v1/chat/completions server (non-streaming)."""

    def __init__(self, replies: list[dict]):
        self.replies = list(replies)      # assistant messages: {"content": ...} or {"tool_calls": [...]}
        self.requests: list[dict] = []    # JSON bodies the client sent
        fake = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                fake.requests.append(body)
                message = {"role": "assistant", "content": None, **fake.replies.pop(0)}
                payload = {
                    "id": f"chatcmpl-{len(fake.requests)}", "object": "chat.completion", "created": 0,
                    "model": body["model"],
                    "choices": [{"index": 0, "message": message,
                                 "finish_reason": "tool_calls" if message.get("tool_calls") else "stop"}],
                    "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
                }
                data = json.dumps(payload).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *args):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.base_url = f"http://127.0.0.1:{self.server.server_port}/v1"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self):
        self.server.shutdown()
        self.server.server_close()
```

```python
# tests/test_openai_contract.py
import json

import pytest
from agno.models.openai import OpenAIChat

from app.support_agent import build_support_agent
from tests.fake_openai import FakeOpenAI


@pytest.fixture
def fake_openai():
    server = FakeOpenAI([
        {"tool_calls": [{"id": "call_1", "type": "function",
                         "function": {"name": "get_order_status", "arguments": json.dumps({"order_id": "ord-42"})}}]},
        {"content": "Order ord-42 has shipped."},
    ])
    yield server
    server.close()


def test_real_openai_adapter_against_fake_server(fake_openai):
    model = OpenAIChat(id="gpt-test", api_key="test-key", base_url=fake_openai.base_url)

    run = build_support_agent(model).run("Where is ord-42?")

    assert run.content == "Order ord-42 has shipped."
    first, second = fake_openai.requests
    assert first["model"] == "gpt-test"
    assert {t["function"]["name"] for t in first["tools"]} == {"get_order_status", "issue_refund"}
    assert second["messages"][-1] == {"role": "tool", "content": "ord-42: shipped", "tool_call_id": "call_1"}
    assert run.metrics.total_tokens == 30                   # usage from both responses
```

The same server works for anything that talks to `base_url` (`OpenAILike`, LiteLLM proxy clients), and a slow or failing handler makes it easy to test timeouts and `retries`.

## Span Assertions

```python
# tests/test_tracing.py
import pytest
from openinference.instrumentation.agno import AgnoInstrumentor
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from app.support_agent import build_support_agent
from tests.fakes import scripted, tool_call


@pytest.fixture
def spans():
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    AgnoInstrumentor().instrument(tracer_provider=provider)
    yield exporter
    AgnoInstrumentor().uninstrument()


def test_run_produces_agent_and_tool_spans(spans):
    model = scripted(tool_call("get_order_status", {"order_id": "ord-1"}), "Shipped.")
    build_support_agent(model).run("Where is ord-1?")

    kinds = {(s.name, s.attributes.get("openinference.span.kind")) for s in spans.get_finished_spans()}
    assert ("Support_Agent.run", "AGENT") in kinds          # spaces in the name become "_"
    assert ("get_order_status", "TOOL") in kinds
```

With real Agno model classes an `LLM` span per model call appears as well; the custom `ScriptedModel` gets no LLM span ([04](./04-agentos-observability.md)).

## Agno Evals

`agno.eval` has four evaluators; all can store results in a `db` (`db=`) for the AgentOS UI.

| Eval | Checks | Needs a model |
|------|--------|---------------|
| `ReliabilityEval` | Expected tool calls (and arguments) in a `RunOutput` / `TeamRunOutput` | No |
| `AccuracyEval` | Answer vs `expected_output`, scored 1–10 by a judge | Yes (judge) |
| `AgentAsJudgeEval` | Custom `criteria`, `binary` pass / fail or `numeric` with `threshold`; can be a `post_hook` | Yes (judge) |
| `PerformanceEval` | Runtime (and memory) of any function over `num_iterations` | No |

```python
# tests/test_evals.py
from agno.eval.accuracy import AccuracyEval
from agno.eval.performance import PerformanceEval
from agno.eval.reliability import ReliabilityEval

from app.support_agent import build_support_agent, get_order_status
from tests.fakes import scripted, tool_call


def test_reliability_eval_checks_tool_calls_and_arguments():
    model = scripted(tool_call("get_order_status", {"order_id": "ord-42"}), "Shipped.")
    run = build_support_agent(model).run("Where is ord-42?")

    result = ReliabilityEval(
        agent_response=run,
        expected_tool_calls=["get_order_status"],
        expected_tool_call_arguments={"get_order_status": {"order_id": "ord-42"}},
    ).run()

    result.assert_passed()                                  # eval_status == "PASSED"
    assert result.missing_tool_calls == [] and result.failed_argument_checks == []


def test_reliability_eval_reports_missing_tools():
    run = build_support_agent(scripted("It has shipped, I think.")).run("Where is ord-42?")

    result = ReliabilityEval(agent_response=run, expected_tool_calls=["get_order_status"]).run()

    assert result.eval_status == "FAILED"
    assert result.missing_tool_calls == ["get_order_status"]


def test_accuracy_eval_with_scripted_judge():
    agent = build_support_agent(scripted(tool_call("get_order_status", {"order_id": "ord-42"}),
                                         "Order ord-42 has shipped."))
    judge = scripted('{"accuracy_score": 9, "accuracy_reason": "Matches the expected status."}')

    result = AccuracyEval(agent=agent, model=judge, input="Where is ord-42?",
                          expected_output="ord-42 has shipped", num_iterations=1).run(
        print_summary=False, print_results=False)

    assert result.avg_score >= 8


def test_tool_latency_budget():
    result = PerformanceEval(func=lambda: get_order_status("ord-1"), num_iterations=50,
                             warmup_runs=5, measure_memory=False).run()

    assert result.p95_run_time < 0.01                       # seconds
```

- `ReliabilityEval` results: `eval_status` (`"PASSED"` / `"FAILED"`), `passed_tool_calls`, `failed_tool_calls` (calls that were made but not expected), `missing_tool_calls`, `additional_tool_calls`, `failed_argument_checks`; `assert_passed()` for pytest.
- `AccuracyEval` returns `avg_score`, `min_score`, `max_score`, `std_dev_score` and per-iteration `results`. With a real agent and judge use `num_iterations` of 3–5 and assert on `avg_score` and `min_score`.

## DeepEval

Map a `RunOutput` to a DeepEval `LLMTestCase` and reuse the metrics from the [DeepEval guide](../../llm-evaluation/index.md). In deepeval 4.2, `ToolCorrectnessMetric` initialises a judge model when it is created, so metric tests need a key (or a custom judge model) even for tool comparisons.

```python
# tests/test_deepeval.py
import os

import pytest
from deepeval import assert_test
from deepeval.metrics import ToolCorrectnessMetric
from deepeval.test_case import LLMTestCase, ToolCall, ToolCallParams

from app.support_agent import build_support_agent
from tests.fakes import scripted, tool_call


def to_test_case(question: str, run, expected_tools: list[ToolCall]) -> LLMTestCase:
    return LLMTestCase(
        input=question,
        actual_output=str(run.content),
        tools_called=[ToolCall(name=t.tool_name, input_parameters=t.tool_args, output=t.result)
                      for t in run.tools or []],
        expected_tools=expected_tools,
    )


def test_run_output_maps_to_deepeval_test_case():
    run = build_support_agent(scripted(tool_call("get_order_status", {"order_id": "ord-42"}), "Shipped.")).run(
        "Where is ord-42?")

    case = to_test_case("Where is ord-42?", run, [ToolCall(name="get_order_status")])

    assert [t.name for t in case.tools_called] == ["get_order_status"]
    assert case.tools_called[0].input_parameters == {"order_id": "ord-42"}


@pytest.mark.llm
@pytest.mark.skipif(not os.getenv("OPENAI_API_KEY"), reason="DeepEval metrics need a judge model")
def test_tool_correctness_with_deepeval():
    question = "Where is ord-42?"
    run = build_support_agent("openai:gpt-5-mini").run(question)
    expected = [ToolCall(name="get_order_status", input_parameters={"order_id": "ord-42"})]

    metric = ToolCorrectnessMetric(evaluation_params=[ToolCallParams.INPUT_PARAMETERS], threshold=1.0)
    assert_test(to_test_case(question, run, expected), [metric])
```

## Tests Against a Real Model

```python
# tests/test_real_llm.py
import os

import pytest
from agno.run.base import RunStatus

from app.support_agent import build_support_agent

pytestmark = [
    pytest.mark.llm,                                              # run with: pytest -m llm
    pytest.mark.skipif(not os.getenv("OPENAI_API_KEY"), reason="no API key"),
]


@pytest.mark.parametrize("attempt", range(3))                     # repeat: behaviour must be stable
def test_real_model_uses_the_order_tool(attempt):
    agent = build_support_agent("openai:gpt-5-mini")

    run = agent.run("Where is order ord-42?")

    assert run.status == RunStatus.completed
    assert [(t.tool_name, t.tool_args) for t in run.tools] == [("get_order_status", {"order_id": "ord-42"})]
    assert "shipped" in run.content.lower()
```

- Run `pytest -m "not llm"` on every PR and `pytest -m llm` nightly or before a release.
- Assert behaviour (tool, arguments, status, schema type), repeat 3–5 times, and allow a pass rate only where the product allows it.
- Pass `metadata={"suite": ..., "case_id": ..., "git_sha": ...}` and trace the runs ([04](./04-agentos-observability.md)) so a failure can be debugged from the trace.

## Flaky-Test Pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| Test passes although the agent broke | Asserting only `run.content`; `run()` does not raise | Assert `run.status == RunStatus.completed` first |
| Schema test passes with garbage | Invalid `output_schema` JSON leaves a `str` | `assert isinstance(run.content, Schema)` |
| History or memories leak between tests | Shared SQLite file or fixed `session_id` | `tmp_path` db per test, `uuid` session IDs |
| Different results locally and in CI | Real model or embedder called because a default kicked in (`OpenAIEmbedder`, `MemoryManager` model) | Pass fakes explicitly everywhere; no API keys in the unit-test job |
| Workflow "passes" with a broken step | Step errors are retried and skipped | Assert `step.success` for all steps; `OnError.fail` for critical steps |
| Endless or slow tool loops | `tool_call_limit` stops execution, not model calls | Script the loop and assert the stop; set timeouts in the real-model job |
| Team test depends on leader wording | Asserting the leader's final text | Assert delegation tool calls and `member_responses` |
| Random agent IDs in stored data | No explicit `id` | Set `id` on agents, teams, workflows |
| Unexpected network calls | Telemetry on by default | `AGNO_TELEMETRY=false` (autouse fixture and CI env) |
| Import error only in CI | `SqliteDb` needs `greenlet` | Add `sqlalchemy[asyncio]` to dev dependencies |
| Async test hangs or errors | Async tool with sync `run()`, or MCP tools | `arun()` + `pytest-asyncio` |

## CI

```yaml
# .github/workflows/agents.yml
name: agents
on: [push, pull_request]
env:
  AGNO_TELEMETRY: "false"
jobs:
  offline:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v6
      - run: uv sync --locked
      - run: uv run pytest -m "not llm" -n auto        # pytest-xdist; every test has its own db
  llm:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs: offline
    runs-on: ubuntu-latest
    env:
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v6
      - run: uv sync --locked
      - run: uv run pytest -m llm --junitxml=reports/llm.xml
```

More CI patterns: [CI/CD — Quality Gates](../../ci-cd-approaches/03-testing/02-quality-gates.md), [Pytest](../pytest/index.md).

## What to Test in Every Agno App

| Risk | Test |
|------|------|
| Wrong tool or wrong arguments | Scripted run → `run.tools`; real-model `ReliabilityEval` nightly |
| Risky action without approval | `requires_confirmation` → `RunStatus.paused`, nothing executed; reject path |
| Tool failure hidden | Tool raises → `tool_call_error`, the model gets the error text |
| Endless tool loop | Script repeated tool calls → only `tool_call_limit` executed |
| Broken structured output | Invalid JSON → content is not the schema type, and the caller handles it |
| Lost or leaked memory | New agent instance, same db → history present; other session / user → empty |
| Unsafe input or output | Guardrail pre-hook → model not called; output check → `RunStatus.error` |
| Wrong specialist | Team test per intent; unused members must not be called |
| Silently skipped step | `all(s.success for s in run.step_results)` |
| API regression | AgentOS routes with `TestClient`, auth, SSE |

## Evals & CI Checklist

- [ ] AgentOS routes, auth and streaming are covered with `TestClient` and an offline model
- [ ] At least one contract test runs the real provider adapter against a fake server
- [ ] Traces are asserted for agent and tool spans
- [ ] `ReliabilityEval` / `AccuracyEval` run on a golden set with a real model before release
- [ ] Real-model tests are marked, repeated, behaviour-based and traced
- [ ] PR pipeline runs `-m "not llm"` without API keys; `AGNO_TELEMETRY=false` in tests and CI

---
## See also
- [Agno — Agents, Teams & Workflows in Python](./index.md)
- [Agno — Testing Agno Apps](./05-testing.md)
- [Agno — AgentOS & Observability](./04-agentos-observability.md)
- [DeepEval — LLM Testing Guide](../../llm-evaluation/index.md)
- [FastAPI — Testing](../fastapi/05-testing.md)
- [CI/CD](../../ci-cd-approaches/index.md)
