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
  - mocking
---

# Agno — Testing Agno Apps

An Agno app is deterministic Python (tools, step functions, hooks, storage, API) around a non-deterministic model. Test the deterministic parts **offline** with a scripted model on every commit, and keep a small, marked layer of tests and evals against real models.

Everything on this page was run with agno 3.0.11, pytest 9.1, pytest-asyncio 1.4 and Python 3.13: the full suite from this page and [06](./06-evals-ci.md) — 38 offline tests — passes in about 7 seconds without API keys.

## Test Layers

| Layer | What is checked | Model | When |
|-------|-----------------|-------|------|
| Tools, hooks, step functions | Pure logic, validation, error cases | None | Every commit |
| Agent behaviour | Tool calls and arguments, prompt and tool schema, errors, limits, structured output | `ScriptedModel` | Every commit |
| HITL, sessions, memory | Pause / confirm / reject, history across instances, state, memories | `ScriptedModel` + temp SQLite | Every commit |
| Teams and workflows | Delegation target, route mode, branches, skipped steps | `ScriptedModel` per agent | Every commit |
| Knowledge | Retrieval and filters | Fake embedder + temp LanceDB | Every commit |
| API and provider contract ([06](./06-evals-ci.md)) | AgentOS routes, auth, SSE; real `OpenAIChat` adapter | `ScriptedModel`, fake OpenAI server | Every commit |
| Traces ([06](./06-evals-ci.md)) | Agent and tool spans exist | `ScriptedModel` + in-memory exporter | Every commit |
| Quality evals ([06](./06-evals-ci.md)) | Right tools with a real model, answer accuracy | Real model and judge | Nightly / before release |

## Make the Agent Testable

Build agents in a **factory that receives the model and the db**; keep tools as module-level functions.

```python
# app/support_agent.py
from typing import Literal

from agno.agent import Agent
from agno.db.base import BaseDb
from agno.models.base import Model
from agno.tools import tool
from pydantic import BaseModel

INSTRUCTIONS = ["You are a support agent.", "Use tools for order data. Never guess an order status."]


def get_order_status(order_id: str) -> str:
    """Return the delivery status of an order.

    Args:
        order_id: Order ID, for example "ord-42".
    """
    if not order_id.startswith("ord-"):
        raise ValueError(f"invalid order id: {order_id}")
    return f"{order_id}: shipped"


@tool(requires_confirmation=True)
def issue_refund(order_id: str, amount: float) -> str:
    """Refund an order. Needs human approval."""
    return f"refunded {amount} for {order_id}"


class Triage(BaseModel):
    category: Literal["bug", "question", "refund"]
    priority: int
    summary: str


def build_support_agent(model: Model | str, db: BaseDb | None = None, **overrides) -> Agent:
    settings = dict(
        id="support-agent",
        name="Support Agent",
        instructions=INSTRUCTIONS,
        tools=[get_order_status, issue_refund],
        add_history_to_context=db is not None,
        num_history_runs=5,
        tool_call_limit=5,
    )
    return Agent(model=model, db=db, **{**settings, **overrides})


def build_triage_agent(model: Model | str) -> Agent:
    return Agent(id="triage-agent", model=model, output_schema=Triage,
                 instructions="Classify the support ticket.")
```

Layout used on this page:

```text
app/__init__.py
app/support_agent.py          # tools, schema, build_support_agent(model, db), build_triage_agent(model)
tests/__init__.py
tests/fakes.py                # ScriptedModel, tool_call(), scripted()
tests/fake_embedder.py        # HashEmbedder
tests/fake_openai.py          # FakeOpenAI HTTP server (06)
tests/conftest.py
tests/test_*.py
pyproject.toml
```

```toml
[tool.pytest.ini_options]
pythonpath = ["."]
asyncio_mode = "strict"
markers = ["llm: tests that call a real LLM (need API keys)"]
```

Test dependencies: `uv add --dev pytest pytest-asyncio` plus `"agno[sqlite,os]" "sqlalchemy[asyncio]" lancedb openai` for the matching tests (`deepeval` and `opentelemetry-sdk` only for those sections).

## An Offline Model: `ScriptedModel`

Agno 3.0.11 ships no fake model, but a `Model` subclass needs only six methods. `ScriptedModel` replays a script — a string is a text answer, a dict is one tool call, a list of dicts is parallel tool calls — and records every request (messages and tool schemas) for assertions.

```python
# tests/fakes.py
import json
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Iterator

from agno.models.base import Model
from agno.models.message import Message
from agno.models.response import ModelResponse

Step = str | dict | list[dict]          # text reply, one tool call, or parallel tool calls


def tool_call(name: str, args: dict, call_id: str = "call_1") -> dict:
    """A tool call in the OpenAI format that Agno models return."""
    return {"id": call_id, "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}


@dataclass
class ScriptedModel(Model):
    """Offline Agno model: replays scripted steps in order and records every request."""

    id: str = "scripted"
    name: str = "ScriptedModel"
    provider: str = "Fake"
    script: list[Step] = field(default_factory=list)
    requests: list[dict] = field(default_factory=list)

    def _reply(self, messages: list[Message], tools: Any) -> ModelResponse:
        self.requests.append({"messages": [m.model_copy() for m in messages], "tools": tools or []})
        if not self.script:
            raise AssertionError(f"unexpected model call #{len(self.requests)}")
        step = self.script.pop(0)
        if isinstance(step, str):
            return ModelResponse(role="assistant", content=step)
        return ModelResponse(role="assistant", tool_calls=step if isinstance(step, list) else [step])

    # Agno calls these with keyword arguments; only messages and tools matter here
    def invoke(self, messages, assistant_message=None, tools=None, **kwargs) -> ModelResponse:
        return self._reply(messages, tools)

    async def ainvoke(self, messages, assistant_message=None, tools=None, **kwargs) -> ModelResponse:
        return self._reply(messages, tools)

    def invoke_stream(self, messages, assistant_message=None, tools=None, **kwargs) -> Iterator[ModelResponse]:
        yield self._reply(messages, tools)

    async def ainvoke_stream(self, messages, assistant_message=None, tools=None, **kwargs) -> AsyncIterator[ModelResponse]:
        yield self._reply(messages, tools)

    def _parse_provider_response(self, response: Any, **kwargs) -> ModelResponse:
        return response

    def _parse_provider_response_delta(self, response: Any) -> ModelResponse:
        return response

    # Helpers for assertions
    def tool_names_offered(self, call: int = 0) -> list[str]:
        return sorted(t["function"]["name"] for t in self.requests[call]["tools"])

    def sent_system_message(self, call: int = 0) -> str:
        first = self.requests[call]["messages"][0]
        return first.content if first.role == "system" else ""


def scripted(*steps: Step) -> ScriptedModel:
    return ScriptedModel(script=list(steps))
```

```python
# tests/conftest.py
import uuid

import pytest
from agno.db.sqlite import SqliteDb


@pytest.fixture(autouse=True)
def no_agno_telemetry(monkeypatch):
    monkeypatch.setenv("AGNO_TELEMETRY", "false")       # no telemetry calls from tests


@pytest.fixture
def sqlite_db(tmp_path):
    return SqliteDb(db_file=str(tmp_path / "agno.db"))   # fresh file per test


@pytest.fixture
def session_id():
    return f"test-{uuid.uuid4()}"
```

!!! tip "Script exactly the calls you expect"
    When the script is exhausted, `ScriptedModel` raises — and Agno turns that into a run with `RunStatus.error` and the message in `run.content`. An unexpected extra loop iteration therefore fails the test instead of passing silently (see `test_unexpected_extra_model_call_fails_the_run`).

- Do not name helper methods like `Model` fields: `Model` already has `system_prompt`, `instructions`, `retries`, `name`, … — overriding one breaks the model.
- `MemoryManager` works on a copy of the model it is given, so its fake's `requests` stay empty. Assert on the stored memories instead.

## Tools Are Plain Functions

```python
# tests/test_tools.py
import pytest

from app.support_agent import get_order_status, issue_refund


def test_plain_function_tool_is_just_a_function():
    assert get_order_status("ord-42") == "ord-42: shipped"


def test_plain_function_tool_rejects_bad_ids():
    with pytest.raises(ValueError, match="invalid order id"):
        get_order_status("42")


def test_decorated_tool_keeps_callable_and_flags():
    # @tool turns the function into agno.tools.Function; the original callable is .entrypoint
    assert issue_refund.name == "issue_refund"
    assert issue_refund.requires_confirmation is True
    assert issue_refund.entrypoint("ord-7", 25.0) == "refunded 25.0 for ord-7"
```

## Agent Behaviour

Assert the **tool calls and their arguments**, what was **sent to the model**, and the **status** — not the model's wording.

```python
# tests/test_agent.py
from pathlib import Path

from agno.run.base import RunStatus

from app.support_agent import INSTRUCTIONS, Triage, build_support_agent, build_triage_agent
from tests.fakes import scripted, tool_call


def test_agent_calls_order_tool_and_answers():
    model = scripted(tool_call("get_order_status", {"order_id": "ord-42"}), "Order ord-42 has shipped.")

    run = build_support_agent(model).run("Where is ord-42?")

    assert run.status == RunStatus.completed
    assert [(t.tool_name, t.tool_args) for t in run.tools] == [("get_order_status", {"order_id": "ord-42"})]
    assert run.tools[0].result == "ord-42: shipped"
    assert run.content == "Order ord-42 has shipped."
    assert len(model.requests) == 2                        # tool call + final answer, nothing else


def test_prompt_and_tool_schema_sent_to_model():
    model = scripted("Hello!")

    build_support_agent(model).run("hi")

    system = model.sent_system_message()
    assert all(line in system for line in INSTRUCTIONS)
    assert model.tool_names_offered() == ["get_order_status", "issue_refund"]
    schema = next(t for t in model.requests[0]["tools"] if t["function"]["name"] == "get_order_status")
    assert schema["function"]["parameters"]["required"] == ["order_id"]


def test_tool_error_is_returned_to_the_model_not_raised():
    model = scripted(tool_call("get_order_status", {"order_id": "42"}), "Please send a valid order ID.")

    run = build_support_agent(model).run("Where is 42?")

    assert run.status == RunStatus.completed
    assert run.tools[0].tool_call_error is True
    assert "invalid order id" in run.tools[0].result
    tool_message = model.requests[1]["messages"][-1]
    assert tool_message.role == "tool" and "invalid order id" in tool_message.content


def test_tool_call_limit_stops_tool_execution():
    calls = [tool_call("get_order_status", {"order_id": "ord-1"}, f"c{i}") for i in range(3)]
    model = scripted(*calls, "Stopping here.")

    run = build_support_agent(model, tool_call_limit=2).run("loop")

    assert len(run.tools) == 2                             # the third call was not executed
    assert "Tool call limit reached" in model.requests[3]["messages"][-1].content


def test_unexpected_extra_model_call_fails_the_run():
    model = scripted(tool_call("get_order_status", {"order_id": "ord-1"}))   # no final answer scripted

    run = build_support_agent(model).run("Where is ord-1?")

    assert run.status == RunStatus.error                   # agent.run() does not raise
    assert "unexpected model call #2" in run.content


def test_structured_output_is_parsed_into_the_schema():
    model = scripted('{"category": "bug", "priority": 1, "summary": "Checkout returns 500"}')

    run = build_triage_agent(model).run("Checkout returns error 500")

    assert isinstance(run.content, Triage)
    assert run.content.category == "bug" and run.content.priority == 1


def test_invalid_structured_output_stays_a_string():
    model = scripted('{"category": "urgent", "priority": "high"}')

    run = build_triage_agent(model).run("???")

    assert run.status == RunStatus.completed               # only a warning in the logs
    assert not isinstance(run.content, Triage)
    assert isinstance(run.content, str)


def test_system_message_matches_snapshot():
    model = scripted("ok")
    build_support_agent(model).run("hi")

    snapshot = Path(__file__).parent / "snapshots" / "support_system_message.txt"
    if not snapshot.exists():                              # first run: record, then review in the PR diff
        snapshot.parent.mkdir(exist_ok=True)
        snapshot.write_text(model.sent_system_message())
    assert model.sent_system_message() == snapshot.read_text()
```

- `run.tools` is the cleanest trajectory: `tool_name`, `tool_args`, `result`, `tool_call_error`.
- `model.requests[i]["messages"]` shows exactly what the model saw on call `i` — system message, history, tool results.
- `agent.run()` does not raise on model or tool failures: **always assert `run.status`**.

## Human-in-the-Loop

```python
# tests/test_hitl.py
from agno.run.base import RunStatus

from app.support_agent import build_support_agent
from tests.fakes import scripted, tool_call

REFUND = tool_call("issue_refund", {"order_id": "ord-7", "amount": 25.0})


def test_refund_pauses_before_execution(sqlite_db):
    run = build_support_agent(scripted(REFUND), db=sqlite_db).run("Refund ord-7")

    assert run.status == RunStatus.paused
    [pending] = run.active_requirements
    assert pending.needs_confirmation
    assert pending.tool_execution.tool_args == {"order_id": "ord-7", "amount": 25.0}
    assert pending.tool_execution.result is None             # nothing executed yet


def test_approved_refund_is_executed(sqlite_db):
    agent = build_support_agent(scripted(REFUND, "Refund done."), db=sqlite_db)
    run = agent.run("Refund ord-7")

    for requirement in run.active_requirements:
        requirement.confirm()
    run = agent.continue_run(run_id=run.run_id, requirements=run.requirements, session_id=run.session_id)

    assert run.status == RunStatus.completed
    assert run.tools[0].result == "refunded 25.0 for ord-7"
    assert run.content == "Refund done."


def test_rejected_refund_is_not_executed(sqlite_db):
    model = scripted(REFUND, "The refund was not approved.")
    agent = build_support_agent(model, db=sqlite_db)
    run = agent.run("Refund ord-7")

    run.active_requirements[0].reject(note="Refunds over 20 need a manager")
    run = agent.continue_run(run_id=run.run_id, requirements=run.requirements, session_id=run.session_id)

    assert run.tools[0].confirmed is False and run.tools[0].result is None
    assert model.requests[-1]["messages"][-1].content == "Refunds over 20 need a manager"
```

## Sessions, State and Memory with SQLite

A fresh SQLite file per test (`tmp_path`) keeps tests isolated and parallel-safe. Creating a **second agent instance** on the same file proves that history comes from the database, not from memory.

```python
# tests/test_sessions.py
from agno.agent import Agent
from agno.db.sqlite import SqliteDb
from agno.memory import MemoryManager
from agno.run import RunContext

from app.support_agent import build_support_agent
from tests.fakes import scripted, tool_call


def test_history_survives_a_new_agent_instance(tmp_path, session_id):
    db_file = str(tmp_path / "agno.db")
    build_support_agent(scripted("Hi Ann!"), db=SqliteDb(db_file=db_file)).run(
        "My name is Ann", session_id=session_id, user_id="u-1")

    model = scripted("Your name is Ann.")                   # new process, same database file
    build_support_agent(model, db=SqliteDb(db_file=db_file)).run(
        "What is my name?", session_id=session_id, user_id="u-1")

    sent = [(m.role, m.content) for m in model.requests[0]["messages"] if m.role != "system"]
    assert sent == [("user", "My name is Ann"), ("assistant", "Hi Ann!"), ("user", "What is my name?")]


def test_sessions_are_isolated(sqlite_db):
    build_support_agent(scripted("Hi Ann!"), db=sqlite_db).run("My name is Ann", session_id="s-1")

    model = scripted("I don't know.")
    build_support_agent(model, db=sqlite_db).run("What is my name?", session_id="s-2")

    assert [m.role for m in model.requests[0]["messages"]] == ["system", "user"]


def test_session_is_stored_with_runs(sqlite_db, session_id):
    agent = build_support_agent(scripted("a", "b"), db=sqlite_db)
    agent.run("one", session_id=session_id, user_id="u-1")
    agent.run("two", session_id=session_id, user_id="u-1")

    session = agent.get_session(session_id=session_id)
    assert session.user_id == "u-1" and len(session.runs) == 2
    assert [m.content for m in agent.get_chat_history(session_id=session_id)] == ["one", "a", "two", "b"]


def add_item(run_context: RunContext, item: str) -> str:
    """Add an item to the shopping list."""
    run_context.session_state.setdefault("items", []).append(item)
    return f"added {item}"


def test_session_state_is_persisted(sqlite_db, session_id):
    model = scripted(tool_call("add_item", {"item": "milk"}), "Added.")
    agent = Agent(model=model, db=sqlite_db, tools=[add_item], session_state={"items": []})

    agent.run("Add milk", session_id=session_id)

    assert agent.get_session_state(session_id=session_id)["items"] == ["milk"]


def test_user_memory_is_saved_and_injected(sqlite_db):
    memory_model = scripted(tool_call("add_memory", {"memory": "User is Ann, a QA lead", "topics": ["name"]}),
                            "Memory added.")
    agent = Agent(model=scripted("Nice to meet you."), db=sqlite_db,
                  memory_manager=MemoryManager(model=memory_model), update_memory_on_run=True)
    agent.run("I'm Ann, QA lead", user_id="u-9")

    assert [m.memory for m in agent.get_user_memories(user_id="u-9")] == ["User is Ann, a QA lead"]

    model = scripted("Hi Ann.")
    Agent(model=model, db=sqlite_db, add_memories_to_context=True).run("Hi", user_id="u-9")
    assert "User is Ann, a QA lead" in model.sent_system_message()
```

## Teams and Workflows

Give the leader and every member its own scripted model. An empty `scripted()` for a member that must not be called turns an unwanted delegation into a failure.

```python
# tests/test_team_workflow.py
from agno.agent import Agent
from agno.run.base import RunStatus
from agno.team import Team, TeamMode
from agno.workflow import Condition, Step, StepInput, StepOutput, Workflow

from app.support_agent import get_order_status
from tests.fakes import scripted, tool_call


def build_team(leader, orders_model, billing_model, mode=TeamMode.coordinate) -> Team:
    orders = Agent(id="orders", name="Orders", role="Order status questions",
                   model=orders_model, tools=[get_order_status])
    billing = Agent(id="billing", name="Billing", role="Invoices and payments", model=billing_model)
    return Team(id="support-team", members=[orders, billing], model=leader, mode=mode)


def test_leader_delegates_to_the_right_member():
    leader = scripted(tool_call("delegate_task_to_member", {"member_id": "orders", "task": "Status of ord-1"}),
                      "Your order ord-1 has shipped.")
    orders_model = scripted(tool_call("get_order_status", {"order_id": "ord-1"}), "ord-1 is shipped.")
    billing_model = scripted()                              # any call to billing fails the test

    run = build_team(leader, orders_model, billing_model).run("Where is ord-1?")

    assert run.status == RunStatus.completed
    assert [(t.tool_name, t.tool_args["member_id"]) for t in run.tools] == [("delegate_task_to_member", "orders")]
    [member_run] = run.member_responses
    assert member_run.agent_id == "orders"
    assert [t.tool_name for t in member_run.tools] == ["get_order_status"]
    assert billing_model.requests == []


def test_route_mode_returns_the_member_answer_directly():
    leader = scripted(tool_call("delegate_task_to_member", {"member_id": "billing", "task": "Invoice INV-9"}))
    team = build_team(leader, scripted(), scripted("Invoice INV-9 is paid."), mode=TeamMode.route)

    run = team.run("Is INV-9 paid?")

    assert run.content == "Invoice INV-9 is paid."
    assert len(leader.requests) == 1                        # the leader did not rewrite the answer


def normalize(step_input: StepInput) -> StepOutput:
    return StepOutput(content=step_input.input.strip().lower())


def is_bug(step_input: StepInput) -> bool:
    return "error" in (step_input.previous_step_content or "")


def build_workflow(writer_model) -> Workflow:
    writer = Agent(name="Writer", model=writer_model, instructions="Write a bug title.")
    return Workflow(name="triage", steps=[
        Step(name="normalize", executor=normalize),
        Condition(name="only_bugs", evaluator=is_bug, steps=[Step(name="write_title", agent=writer)]),
    ])


def test_step_functions_are_unit_testable():
    assert normalize(StepInput(input="  Error 500 ")).content == "error 500"
    assert is_bug(StepInput(previous_step_content="error 500")) is True


def test_workflow_runs_the_bug_branch():
    writer_model = scripted("BUG: checkout error 500")

    run = build_workflow(writer_model).run(input="  Checkout returns ERROR 500 ")

    assert run.status == RunStatus.completed
    assert [s.step_name for s in run.step_results] == ["normalize", "only_bugs"]
    assert run.content == "BUG: checkout error 500"
    assert writer_model.requests[0]["messages"][-1].content == "checkout returns error 500"


def test_workflow_skips_the_agent_for_questions():
    writer_model = scripted()

    run = build_workflow(writer_model).run(input="How do I reset my password?")

    assert run.status == RunStatus.completed
    assert writer_model.requests == []
```

For workflows, also assert that no step was silently skipped: step errors are retried and then skipped by default ([03](./03-teams-workflows.md#step-failures-are-skipped-by-default)).

```python
assert all(step.success for step in run.step_results), [(s.step_name, s.error) for s in run.step_results]
```

## Knowledge with a Fake Embedder

A deterministic embedder and a LanceDB table under `tmp_path` test ingestion, retrieval, filters and the agent's use of `search_knowledge_base` without any API:

```python
# tests/fake_embedder.py
import hashlib
import math
from dataclasses import dataclass

from agno.knowledge.embedder.base import Embedder


@dataclass
class HashEmbedder(Embedder):
    """Deterministic bag-of-words embedder: same text -> same vector, no network."""

    dimensions: int = 64

    def get_embedding(self, text: str) -> list[float]:
        vector = [0.0] * self.dimensions
        for word in text.lower().split():
            vector[int(hashlib.md5(word.encode()).hexdigest(), 16) % self.dimensions] += 1.0
        norm = math.sqrt(sum(v * v for v in vector)) or 1.0
        return [v / norm for v in vector]

    def get_embedding_and_usage(self, text: str):
        return self.get_embedding(text), None

    async def async_get_embedding(self, text: str) -> list[float]:
        return self.get_embedding(text)

    async def async_get_embedding_and_usage(self, text: str):
        return self.get_embedding(text), None
```

```python
# tests/test_knowledge.py
import pytest
from agno.agent import Agent
from agno.knowledge.knowledge import Knowledge
from agno.vectordb.lancedb import LanceDb

from tests.fake_embedder import HashEmbedder
from tests.fakes import scripted, tool_call


@pytest.fixture
def knowledge(tmp_path):
    kb = Knowledge(vector_db=LanceDb(uri=str(tmp_path / "lancedb"), table_name="docs", embedder=HashEmbedder()))
    kb.insert(name="refunds", text_content="Refunds are processed within 5 business days.",
              metadata={"topic": "refunds"})
    kb.insert(name="shipping", text_content="Standard shipping takes 3 to 7 days.",
              metadata={"topic": "shipping"})
    return kb


def test_retrieval_returns_the_relevant_document(knowledge):
    [top] = knowledge.search("how long do refunds take", max_results=1)
    assert top.name == "refunds"


def test_metadata_filter_limits_results(knowledge):
    docs = knowledge.search("days", filters={"topic": "shipping"})
    assert [d.name for d in docs] == ["shipping"]


def test_agent_searches_knowledge_and_records_references(knowledge):
    model = scripted(tool_call("search_knowledge_base", {"query": "refunds"}), "5 business days.")

    run = Agent(model=model, knowledge=knowledge).run("How long do refunds take?")

    assert "search_knowledge_base" in model.tool_names_offered()
    assert "Refunds are processed within 5 business days." in run.tools[0].result
    assert run.references[0].query == "refunds"
```

A bag-of-words embedder only proves the plumbing. Retrieval **quality** needs the real embedder and a golden question set — see [DeepEval — RAG Metrics](../../llm-evaluation/01_metrics/02_rag_metrics.md).

## Streaming and Async

```python
# tests/test_stream_async.py
import pytest
from agno.agent import RunEvent, RunOutput

from app.support_agent import build_support_agent
from tests.fakes import scripted, tool_call


def test_stream_emits_tool_events_in_order():
    model = scripted(tool_call("get_order_status", {"order_id": "ord-1"}), "Shipped.")
    events = build_support_agent(model).run("Where is ord-1?", stream=True, stream_events=True)

    names = [e.event for e in events]

    assert names[0] == RunEvent.run_started.value and names[-1] == RunEvent.run_completed.value
    assert names.index(RunEvent.tool_call_started.value) < names.index(RunEvent.tool_call_completed.value)
    assert RunEvent.run_error.value not in names


@pytest.mark.asyncio
async def test_async_stream_yields_final_run_output():
    model = scripted(tool_call("get_order_status", {"order_id": "ord-1"}), "Shipped.")
    agent = build_support_agent(model)

    final = None
    async for item in agent.arun("Where is ord-1?", stream=True, stream_events=True, yield_run_output=True):
        if isinstance(item, RunOutput):
            final = item

    assert final is not None and final.content == "Shipped."
    assert [t.tool_name for t in final.tools] == ["get_order_status"]
```

## Next: API, Evals & CI

API tests for AgentOS, a fake OpenAI server for provider-contract tests, span assertions, Agno evals, DeepEval, real-model tests, flaky-test pitfalls and CI are on [06 API Tests, Evals & CI](./06-evals-ci.md).

## Testing Checklist

- [ ] Agents, teams and workflows are built by factories that receive the model and db
- [ ] `ScriptedModel` scripts exactly the expected calls; no network in the offline suite
- [ ] Every test asserts `run.status` before content
- [ ] Tool calls and arguments are asserted from `run.tools`
- [ ] Prompt and tool schema are asserted or snapshot-tested
- [ ] HITL is tested for pause, confirm and reject
- [ ] Each test has its own SQLite file and session IDs
- [ ] Workflow tests check `step_results[*].success`
- [ ] Knowledge tests use a fake embedder and a temporary vector table

---
## See also
- [Agno — Agents, Teams & Workflows in Python](./index.md)
- [Agno — API Tests, Evals & CI](./06-evals-ci.md)
- [LangGraph — Testing LangGraph Apps](../langgraph/05-testing.md)
- [Pytest](../pytest/index.md)
- [Pytest — Advanced Patterns & Best Practices](../pytest/01-core-guides/02-advanced-patterns.md)
- [Agentic AI — Testing, Evaluation & Observability](../../agentic-ai-architecture/06-testing-observability.md)
