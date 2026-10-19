---
date: 2026-10-19 12:00:00
tags:
  - python
  - libraries
  - pydantic-ai
  - ai-agents
  - llm
  - testing
---

# Pydantic AI — Testing, Evals & Observability

Testing a Pydantic AI app has three layers. **Unit tests** replace the model with a fake and run offline. **Evals** score the output of a real model over a dataset. **Tracing** shows what each production run did. All code below was run on pydantic-ai-slim 2.57.0, `pydantic-evals` 2.57.0, `pytest` 9.1 and OpenTelemetry SDK, without any API key.

## Test Layers

| Layer | Model | Checks | Speed | Runs |
|-------|-------|--------|-------|------|
| Unit | `TestModel` / `FunctionModel` | Tool wiring, schemas, validators, retries, routing, `deps` | ms | Every commit |
| Eval (offline) | `FunctionModel` or recorded outputs | Evaluator logic and dataset format | ms | Every commit |
| Eval (real) | Real model | Quality: correctness, tone, tool choice | seconds-minutes, costs money | Nightly / release |
| Tracing | Real model | What happened in production | n/a | Always |

## Block Real Requests

Make a forgotten override fail loudly instead of calling a paid API. Put this in `conftest.py`:

```python
import pytest
from pydantic_ai import models

models.ALLOW_MODEL_REQUESTS = False          # also protects test modules at import time


@pytest.fixture(autouse=True)
def _no_real_model_calls():
    previous = models.ALLOW_MODEL_REQUESTS
    models.ALLOW_MODEL_REQUESTS = False
    yield
    models.ALLOW_MODEL_REQUESTS = previous
```

A real call then raises `RuntimeError: Model requests are not allowed, since ALLOW_MODEL_REQUESTS is False`.

!!! warning "A model *string* needs its provider SDK and key even in tests"
    `Agent("openai:gpt-5-mini")` builds the provider client when the agent is created. Without `OPENAI_API_KEY` (or without the `openai` extra) that raises before your test code runs, and the "requests are not allowed" guard never gets a chance. Pass `defer_model_check=True` to `Agent(...)` so the model is resolved on the first run, then replace it with `agent.override(model=...)`. Setting a dummy `OPENAI_API_KEY=sk-test` in CI works too.

## `TestModel`: Schema Smoke Test

`TestModel` needs no script. It **calls every registered tool** once with arguments generated from the schema, then returns a valid output (or text built from the tool results). Use it to prove that tools and output schema are wired and that nothing crashes.

```python
from pydantic_ai.models.test import TestModel

with support_agent.override(model=TestModel()):
    result = support_agent.run_sync("x", deps=Deps({"a": "shipped"}))

assert isinstance(result.output, Answer)
```

Details that surprise people:

- Generated string arguments are `"a"`, integers `0`, so a tool that checks an ID must accept (or the deps must contain) the key `"a"`. Otherwise a `ModelRetry` is raised until the retry budget is spent and the run fails with `UnexpectedModelBehavior: Tool 'get_order_status' exceeded max retries count of 1`.
- `TestModel(custom_output_text="Paris")` returns that exact text; `custom_output_args={...}` fixes the structured output; `call_tools=[...]` limits which tools are called (`[]` for none).
- For plain text output the answer is a JSON summary of tool results, such as `{"get_order_status":"shipped","ping":"pong"}`.

## `FunctionModel`: Scripted Behaviour

`FunctionModel` runs a function you write instead of an LLM. It receives the message list and an `AgentInfo` (tool definitions, output tools, instructions) and returns a `ModelResponse`. Use it to test the real multi-step path: tool call, then answer.

```python
from pydantic_ai.messages import (
    ModelMessage, ModelRequest, ModelResponse, ToolCallPart, ToolReturnPart,
)
from pydantic_ai.models.function import AgentInfo, FunctionModel


def scripted(order_id: str) -> FunctionModel:
    """Call the lookup tool once, then return the final structured answer."""

    def fn(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        returns = [
            p for m in messages if isinstance(m, ModelRequest)
            for p in m.parts if isinstance(p, ToolReturnPart)
        ]
        if not returns:
            return ModelResponse(parts=[ToolCallPart("get_order_status", {"order_id": order_id})])
        return ModelResponse(parts=[
            ToolCallPart(info.output_tools[0].name, {"order_id": order_id, "status": returns[-1].content})
        ])

    return FunctionModel(fn)
```

- `info.function_tools` lists the tools the model would see, with `name`, `description` and `parameters_json_schema` — assert on it to guard your docstrings.
- `info.output_tools[0].name` is `final_result` for a plain `output_type`; use the property instead of hard-coding it.
- `info.instructions` holds the rendered instructions, so you can test dynamic `@agent.instructions`.
- For streaming tests give `FunctionModel(stream_function=...)` an async generator of text chunks.

## A Complete Test Module

Agent under test (`support.py`):

```python
from dataclasses import dataclass

from pydantic import BaseModel, Field
from pydantic_ai import Agent, ModelRetry, RunContext


@dataclass
class Deps:
    orders: dict[str, str]


class Answer(BaseModel):
    order_id: str
    status: str = Field(description="Delivery status")


support_agent = Agent(
    "openai:gpt-5-mini",
    deps_type=Deps,
    output_type=Answer,
    instructions="You are a support agent. Use tools for order data.",
    defer_model_check=True,
)


@support_agent.tool
def get_order_status(ctx: RunContext[Deps], order_id: str) -> str:
    """Return the delivery status of an order."""
    if order_id not in ctx.deps.orders:
        raise ModelRetry(f"Unknown order {order_id!r}")
    return ctx.deps.orders[order_id]
```

Tests (`test_support.py`, with the `scripted` helper above and the `conftest.py` above):

```python
import pytest
from pydantic_ai import capture_run_messages
from pydantic_ai.messages import RetryPromptPart
from pydantic_ai.models.test import TestModel

from support import Answer, Deps, support_agent

pytestmark = pytest.mark.anyio          # lets `async def` tests run (anyio ships a pytest plugin)


def test_real_calls_are_blocked():
    with pytest.raises(RuntimeError, match="Model requests are not allowed"):
        support_agent.run_sync("hi", deps=Deps({}), model="openai:gpt-5-mini")


def test_schema_only_with_test_model():
    with support_agent.override(model=TestModel()):
        result = support_agent.run_sync("x", deps=Deps({"a": "shipped"}))
    assert isinstance(result.output, Answer)


def test_tool_and_output_with_function_model():
    deps = Deps({"ord-1": "shipped"})
    with support_agent.override(model=scripted("ord-1")):
        result = support_agent.run_sync("Where is ord-1?", deps=deps)
    assert result.output == Answer(order_id="ord-1", status="shipped")
    assert result.usage.tool_calls == 1


def test_unknown_order_triggers_retry():
    with capture_run_messages() as messages:
        with support_agent.override(model=scripted("ord-9")):
            with pytest.raises(Exception):
                support_agent.run_sync("Where is ord-9?", deps=Deps({}))
    retries = [p for m in messages for p in m.parts if isinstance(p, RetryPromptPart)]
    assert retries and "Unknown order" in str(retries[0].content)


async def test_async_run():
    with support_agent.override(model=scripted("ord-2")):
        result = await support_agent.run("?", deps=Deps({"ord-2": "pending"}))
    assert result.output.status == "pending"
```

Run with `OPENAI_API_KEY=sk-test pytest -q` (needed only by `test_real_calls_are_blocked`, which builds a real provider client). Result: `5 passed`.

Patterns used:

| Pattern | Why |
|---------|-----|
| `agent.override(model=...)` | Swaps the model (and `deps=`, `tools=`, `toolsets=`) for the test only; the module-level agent stays unchanged |
| `capture_run_messages()` | Keeps the messages even when the run **raises**, so you can assert on what led to the failure |
| `deps=Deps({...})` | The fake database is a dict; no mocking library is needed |
| `result.usage.tool_calls` | Verifies that the tool was really called |
| `pytest.mark.anyio` or `pytest-asyncio` | Needed only for `async def` tests; sync tests use `run_sync` |

### What to assert

| Behaviour | Assertion |
|-----------|-----------|
| Right tool, right arguments | Inspect `ToolCallPart` objects in `result.all_messages()` or add a `Hooks` `before_tool_execute` recorder |
| Prompt sent to the model | In a `FunctionModel`, assert on `messages` and `info.instructions` |
| Structured output | `result.output == Model(...)` — Pydantic equality, not string compare |
| Retry on bad data | `RetryPromptPart` exists in `capture_run_messages()` |
| Approval flow | First run returns `DeferredToolRequests`, second run with `DeferredToolResults` returns the final output |
| Cost guard | `UsageLimitExceeded` is raised with `UsageLimits(request_limit=1)` and a tool-calling script |
| Schema of tools | `info.function_tools[i].parameters_json_schema` |

## Evals with `pydantic-evals`

Unit tests prove the wiring. Evals measure whether the agent is *good*. Install `uv add "pydantic-ai-slim[evals]"` (or `pydantic-evals`).

```python
from dataclasses import dataclass

from pydantic_ai import Agent
from pydantic_evals import Case, Dataset
from pydantic_evals.evaluators import EqualsExpected, Evaluator, EvaluatorContext, IsInstance

agent = Agent("openai:gpt-5-mini", instructions="Answer with the city name only.")


async def task(question: str) -> str:
    return (await agent.run(question)).output


@dataclass
class ShortAnswer(Evaluator):
    max_len: int = 10

    def evaluate(self, ctx: EvaluatorContext) -> bool:
        return len(ctx.output) <= self.max_len


dataset = Dataset(
    name="geo",                                       # required
    cases=[
        Case(name="france", inputs="Capital of France?", expected_output="Paris"),
        Case(name="spain", inputs="Capital of Spain?", expected_output="Madrid"),
    ],
    evaluators=[EqualsExpected(), IsInstance(type_name="str"), ShortAnswer()],
)

report = dataset.evaluate_sync(task)
report.print(include_input=True, include_output=True)
```

Run offline with a scripted model that always answers "Paris", the report is:

```text
                     Evaluation Summary: task
┏━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━┳━━━━━━━━━━━━┳━━━━━━━━━━┓
┃ Case ID  ┃ Inputs             ┃ Outputs ┃ Assertions ┃ Duration ┃
┡━━━━━━━━━━╇━━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━╇━━━━━━━━━━━━╇━━━━━━━━━━┩
│ capital  │ Capital of France? │ Paris   │ ✔✔✔        │    5.7ms │
│ capital2 │ Capital of Spain?  │ Paris   │ ✗✔✔        │    4.1ms │
│ Averages │                    │         │ 83.3% ✔    │    4.9ms │
└──────────┴────────────────────┴─────────┴────────────┴──────────┘
```

Read results in code, not only on screen, so CI can gate on them:

```python
for case in report.cases:
    print(case.name, {k: v.value for k, v in case.assertions.items()})
    # spain {'EqualsExpected': False, 'IsInstance': True, 'ShortAnswer': True}

assert report.averages().assertions >= 0.8        # 0.8333 in the run above
```

| Evaluator | Checks |
|-----------|--------|
| `EqualsExpected` | Output equals `expected_output` |
| `Equals`, `Contains`, `IsInstance` | Simple value checks |
| `MaxDuration` | Case finishes within a time budget |
| `LLMJudge` | A second model grades the output against a rubric (real model, costs tokens) |
| Your own `Evaluator` subclass | Any rule that returns `bool`, a number or a string label |

Keep two suites: a **small** one that runs on every pull request, and a **large** one that runs nightly. For LLM-as-judge metrics and RAG diagnostics see [DeepEval — LLM Testing Guide](../../llm-evaluation/index.md).

## Observability

Pydantic AI emits OpenTelemetry spans that follow the GenAI semantic conventions. Switch it on for every agent with Logfire or any OTLP backend:

```python
import logfire
from pydantic_ai import Agent

logfire.configure()                    # token from the environment
Agent.instrument_all()                 # every agent created or run afterwards emits spans
```

Per agent, or with your own tracer provider, use the `Instrumentation` capability (the old `Agent(instrument=...)` argument no longer exists):

```python
from pydantic_ai import Agent, InstrumentationSettings
from pydantic_ai.capabilities import Instrumentation

settings = InstrumentationSettings(tracer_provider=provider, include_content=False)
agent = Agent("openai:gpt-5-mini", name="support", capabilities=[Instrumentation(settings)])
```

One run of an agent with one tool produces these spans (names printed from an in-memory exporter):

```text
chat test                 gen_ai.operation.name=chat          gen_ai.request.model=test
execute_tool ping         gen_ai.operation.name=execute_tool  gen_ai.tool.name=ping
chat test                 gen_ai.operation.name=chat
invoke_agent demo         gen_ai.operation.name=invoke_agent  gen_ai.agent.name=demo
```

- `invoke_agent <name>` is the parent of the run; give agents a `name` so traces are readable.
- `chat <model>` is one model request; `execute_tool <tool>` is one tool call.
- `include_content=False` keeps prompts and outputs out of the spans — use it when they contain personal data.

Test tracing with `InMemorySpanExporter` from `opentelemetry-sdk`: build a `TracerProvider`, add `SimpleSpanProcessor(exporter)`, pass the provider in `InstrumentationSettings`, run the agent with `TestModel`, then assert on `exporter.get_finished_spans()`. For backend options see [OpenTelemetry](../opentelemetry/index.md).

## CI Checklist

1. `PYDANTIC_AI_NO_BANNER=1` and `models.ALLOW_MODEL_REQUESTS = False` in the test environment.
2. Agents built with `defer_model_check=True`, or a dummy provider key, so import never needs a real key.
3. Unit tests on `TestModel` and `FunctionModel` run on every commit.
4. Offline eval test that runs a dataset through a `FunctionModel` and checks the evaluators themselves.
5. Real-model evals in a separate job (nightly or on release) with a cost cap (`UsageLimits`) and the key from CI secrets.
6. Pin `pydantic-ai-slim` (`uv lock`) and upgrade deliberately: the project changes quickly and this guide already lists renamed APIs.

## Common Mistakes

| Mistake | Effect | Fix |
|---------|--------|-----|
| Unit test calls the real model | Slow, flaky, costs money | `ALLOW_MODEL_REQUESTS = False` and `override(model=...)` |
| `TestModel` with a tool that validates its input | `ModelRetry` loop, `UnexpectedModelBehavior` | Make the fake deps accept `"a"`, or use `FunctionModel` |
| Asserting on exact model wording | Test breaks when the model changes | Assert on structure and tool calls; use evals for wording |
| `Dataset(cases=[...])` without `name` | `TypeError: missing 1 required keyword-only argument: 'name'` | `Dataset(name="...", cases=[...])` |
| `Agent(..., instrument=True)` | `TypeError: unexpected keyword argument 'instrument'` | `capabilities=[Instrumentation(...)]` or `Agent.instrument_all()` |
| Real-model evals on every PR | Slow and expensive pipeline | Small PR suite, large nightly suite |

---
## See also
- [Pydantic AI — Type-Safe Agents](./index.md)
- [Pydantic AI — Agents, Tools & Structured Output](./01-agents-tools-output.md)
- [Testing, Evaluation & Observability](../../agentic-ai-architecture/06-testing-observability.md)
- [DeepEval — LLM Testing Guide](../../llm-evaluation/index.md)
- [OpenTelemetry](../opentelemetry/index.md)
- [pytest](../pytest/index.md)
