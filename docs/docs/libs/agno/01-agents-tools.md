---
date: 2026-09-30 12:00:00
tags:
  - python
  - libraries
  - agno
  - ai-agents
  - llm
---

# Agno — Agents, Tools & Structured Output

An Agno `Agent` is a model plus everything around it: instructions, tools, hooks, output schema and (on [02](./02-sessions-memory-knowledge.md)) storage and knowledge. Almost everything is a constructor parameter; `agent.run()` returns one `RunOutput`.

## Agent Anatomy

| Parameter | Purpose |
|-----------|---------|
| `model` | `Model` instance or `"provider:model_id"` string |
| `id`, `name`, `role` | Identity; `id` is used by teams, AgentOS routes and stored sessions |
| `description`, `instructions`, `expected_output`, `additional_context` | Parts of the system message |
| `markdown`, `add_datetime_to_context` | Extra lines in the system message |
| `tools`, `tool_call_limit`, `tool_choice`, `tool_hooks` | Tools and how many calls one run may execute |
| `output_schema`, `input_schema`, `parser_model`, `output_model` | Structured input and output |
| `pre_hooks`, `post_hooks` | Functions, guardrails or evals before / after the run |
| `dependencies`, `add_dependencies_to_context` | Values for tools (via `RunContext`) and optionally for the prompt |
| `db`, `session_state`, `add_history_to_context`, `knowledge`, `memory_manager` | Storage, state, history, RAG and memory ([02](./02-sessions-memory-knowledge.md)) |
| `retries`, `delay_between_retries`, `exponential_backoff`, `fallback_models` | Resilience against provider errors |
| `stream`, `stream_events`, `debug_mode`, `telemetry` | Output mode and diagnostics |

## Models

```python
from agno.agent import Agent
from agno.models.anthropic import Claude          # needs: uv add anthropic
from agno.models.openai import OpenAIChat, OpenAILike

Agent(model="openai:gpt-5-mini")                   # string -> OpenAIResponses (Responses API)
Agent(model="openai-chat:gpt-5-mini")              # string -> OpenAIChat (Chat Completions API)
Agent(model=Claude(id="claude-sonnet-5"))
Agent(model=OpenAIChat(id="gpt-5-mini", base_url="http://localhost:4000/v1"))   # e.g. a LiteLLM proxy
Agent(model=OpenAILike(id="my-model", base_url="http://localhost:8000/v1", api_key="local"))
```

- The string form is `"<provider>:<model_id>"`; `openai` maps to `OpenAIResponses`, `openai-chat` to `OpenAIChat`, `anthropic` to `Claude`, plus `google`, `ollama`, `litellm` and many more.
- Provider SDKs are separate dependencies — importing `agno.models.anthropic` without `anthropic` installed raises `ImportError`.
- Any OpenAI-compatible endpoint (vLLM, LiteLLM proxy, local servers) works through `OpenAIChat(base_url=...)` or `OpenAILike`. [05 Testing](./05-testing.md) uses this with a fake server.

## Instructions and the System Message

```python
agent = Agent(
    model="openai:gpt-5-mini",
    description="You are a QA assistant.",
    instructions=["Be brief.", "Cite ticket IDs."],
    expected_output="One line.",
    markdown=True,
)
```

The system message built from this:

```text
You are a QA assistant.
- Be brief.
- Cite ticket IDs.

<additional_information>
- Use markdown to format your answers.
</additional_information>

<expected_output>
One line.
</expected_output>
```

`system_message=` replaces it completely. The offline model in [05](./05-testing.md) records the system message it received — snapshot it in tests so prompt changes show up in review.

## Function Tools

Any function with type hints and a docstring is a tool. Agno builds the JSON schema from the signature and uses the docstring (including the `Args:` section) as descriptions.

```python
from agno.agent import Agent


def get_order_status(order_id: str) -> str:
    """Return the delivery status of an order.

    Args:
        order_id: Order ID, for example "ord-42".
    """
    return f"{order_id}: shipped"


agent = Agent(model="openai:gpt-5-mini", tools=[get_order_status])
# schema sent to the model:
# {"type": "object",
#  "properties": {"order_id": {"type": "string", "description": "Order ID, for example \"ord-42\"."}},
#  "required": ["order_id"]}
```

Parameters named `run_context`, `agent` or `team` are **injected** by Agno and never appear in the schema:

```python
from agno.run import RunContext


def add_item(run_context: RunContext, item: str) -> str:
    """Add an item to the shopping list."""
    run_context.session_state.setdefault("items", []).append(item)   # per-session state
    return f"added {item}"


def customer_tier(run_context: RunContext) -> str:
    """Return the current customer tier."""
    return run_context.dependencies["tier"]


agent = Agent(
    model="openai:gpt-5-mini",
    tools=[add_item, customer_tier],
    session_state={"items": []},
    dependencies={"tier": "gold"},          # add_dependencies_to_context=True also puts it in the prompt
)
```

`RunContext` also carries `run_id`, `session_id`, `user_id` and `metadata`.

### The `@tool` Decorator

```python
from agno.tools import tool


@tool(name="lookup_order", description="Find an order by ID.", requires_confirmation=True)
def get_order(order_id: str) -> str:
    return f"{order_id}: shipped"


get_order.name               # "lookup_order"  (a agno.tools.Function now, not a plain function)
get_order.entrypoint("x")    # "x: shipped"    (the original callable, for unit tests)
```

| `@tool` option | Effect |
|----------------|--------|
| `name`, `description` | Override the name and docstring sent to the model |
| `requires_confirmation` | Pause the run until a human confirms ([below](#human-approval)) |
| `requires_user_input`, `user_input_fields` | Pause and ask the user for argument values |
| `external_execution` | Pause; your code runs the tool and passes the result back |
| `stop_after_tool_call` | End the run right after this tool |
| `show_result` | Show the tool result to the user as well as sending it to the model |
| `pre_hook`, `post_hook`, `tool_hooks` | Wrap the call (logging, auth, argument checks) |
| `cache_results`, `cache_ttl`, `cache_dir` | Cache results on disk |
| `strict` | Strict parameter checking in the generated schema |

### Toolkits

A `Toolkit` groups related tools that share configuration:

```python
from agno.tools import Toolkit


class OrderTools(Toolkit):
    def __init__(self, base_url: str, **kwargs):
        self.base_url = base_url
        super().__init__(name="order_tools", tools=[self.get_status, self.cancel], **kwargs)

    def get_status(self, order_id: str) -> str:
        """Return the order status."""
        return f"{order_id}: shipped"

    def cancel(self, order_id: str) -> str:
        """Cancel an order."""
        return f"{order_id}: cancelled"


read_only = OrderTools("https://orders.internal", include_tools=["get_status"])
list(read_only.functions)          # ['get_status']
```

`include_tools` / `exclude_tools` limit what the model sees; `requires_confirmation_tools=[...]` and `stop_after_tool_call_tools=[...]` apply those flags per toolkit method.

### Built-in Toolkits

`agno.tools` ships toolkits for search, files, code, databases, SaaS APIs and more. A few that matter for QA work:

| Toolkit | Import | Notes |
|---------|--------|-------|
| `CalculatorTools` | `agno.tools.calculator` | `add`, `divide`, `factorial`, `is_prime`, … — deterministic, good for demos |
| `FileTools` | `agno.tools.file` | Read / write / search under `base_dir`; `enable_delete_file` is off by default |
| `LocalFileSystemTools` | `agno.tools.local_file_system` | Simple file writing |
| `PythonTools`, `ShellTools` | `agno.tools.python`, `agno.tools.shell` | Execute code / commands — sandbox them |
| `SQLTools`, `PostgresTools`, `DuckDbTools` | `agno.tools.sql`, `agno.tools.postgres`, `agno.tools.duckdb` | Query databases; use a read-only user |
| `DuckDuckGoTools`, `TavilyTools` | `agno.tools.duckduckgo`, `agno.tools.tavily` | Web search |
| `ReasoningTools` | `agno.tools.reasoning` | `think` and `analyze` scratchpad tools ([02](./02-sessions-memory-knowledge.md#reasoning)) |
| `MCPTools` | `agno.tools.mcp` | Tools from an MCP server |

Most toolkits need an extra package (for example `DuckDuckGoTools` needs `ddgs`) — the `ImportError` names it.

!!! warning "`FileTools` exclusions are not a sandbox"
    Its `exclude_patterns` only filter listing and search results. `read_file` and `save_file` still open an excluded path if the model names it. Point `base_dir` at a directory without secrets.

### MCP Servers

```python
import asyncio

from agno.agent import Agent
from agno.tools.mcp import MCPTools


async def main():
    async with MCPTools(command="uvx mcp-server-git") as git_tools:        # stdio server
        agent = Agent(model="openai:gpt-5-mini", tools=[git_tools])
        await agent.aprint_response("Summarise the last 3 commits")

    # remote server: MCPTools(url="https://example.com/mcp", transport="streamable-http")

asyncio.run(main())
```

MCP tools are async — run the agent with `arun()` / `aprint_response()`.

## Tool Errors and Limits

| Situation | What Agno does |
|-----------|----------------|
| Tool raises an exception | Caught; the error text goes back to the model as the tool result; `run.tools[i].tool_call_error` is `True`; the run continues |
| More tool calls than `tool_call_limit` | Extra calls are **not executed**; the model receives `"Tool call limit reached. Tool call <name> not executed..."` and the loop continues until it answers |
| Async tool with sync `agent.run()` | Run ends with `RunStatus.error`: *"Async function ... can't be used with synchronous agent.run()"* |
| Exception inside the model call | Run ends with `RunStatus.error`, message in `run.content` — `run()` does not raise |
| Invalid `input_schema` input | `ValueError` raised **before** the run |

`tool_call_limit` limits executed tool calls, not model calls. A model that keeps asking for tools keeps getting "limit reached" answers — test that the loop ends ([05](./05-testing.md)).

## Human Approval

`requires_confirmation=True` pauses the run **before** the tool executes. The paused run lists what it waits for in `active_requirements`; `continue_run()` resumes it.

```python
from agno.agent import Agent
from agno.db.sqlite import SqliteDb
from agno.tools import tool


@tool(requires_confirmation=True)
def issue_refund(order_id: str, amount: float) -> str:
    """Refund an order."""
    return f"refunded {amount} for {order_id}"


agent = Agent(model="openai:gpt-5-mini", tools=[issue_refund], db=SqliteDb(db_file="tmp/agents.db"))

run = agent.run("Refund 25 for ord-7")
if run.is_paused:                                           # run.status == RunStatus.paused
    for requirement in run.active_requirements:
        if requirement.needs_confirmation:
            print(requirement.tool_execution.tool_name, requirement.tool_execution.tool_args)
            requirement.confirm()                           # or requirement.reject(note="Not allowed")
    run = agent.continue_run(run_id=run.run_id, requirements=run.requirements, session_id=run.session_id)

print(run.content)
```

- On `reject(note=...)` the tool is not executed and the note is sent to the model as the tool result.
- `requirement.needs_user_input` / `provide_user_input({...})` and `needs_external_execution` / `set_external_execution_result(...)` handle the other pause types.
- With a `db`, the paused run is stored, so another process (an API call from a reviewer UI) can resume it by `run_id`.

## Structured Output

```python
from typing import Literal

from pydantic import BaseModel, Field

from agno.agent import Agent


class BugReport(BaseModel):
    title: str
    severity: Literal["low", "medium", "high"]
    steps: list[str] = Field(default_factory=list)


agent = Agent(model="openai:gpt-5-mini", output_schema=BugReport)
run = agent.run("Checkout page crashes after clicking Pay")

if isinstance(run.content, BugReport):            # always check — see the warning below
    print(run.content.severity, run.content.steps)
```

- Models with native structured outputs get the JSON schema directly. For the others Agno adds JSON instructions to the system message and parses the reply, including replies wrapped in a code block.
- `run(..., output_schema=Other)` overrides the schema for one run; a JSON-schema `dict` is also accepted (the content is then a `dict`).
- `parser_model=` lets a second (cheaper) model convert a free-text answer into the schema; `output_model=` generates the final answer with a different model.
- `input_schema=Ticket` validates input: `agent.run(Ticket(...))` or `agent.run({...})`; invalid input raises `ValueError`.

!!! warning "Invalid output does not fail the run"
    If the reply is not valid JSON or fails Pydantic validation, Agno logs *"Failed to convert response to output_schema"*, keeps the raw string in `run.content` and still reports `RunStatus.completed`. Assert `isinstance(run.content, BugReport)` in tests and in production code.

## The `RunOutput` Object

| Field | Content |
|-------|---------|
| `content`, `content_type` | Final answer (`str`, Pydantic object or `dict`) and its type name |
| `status` | `RunStatus.completed`, `paused`, `error`, `cancelled`, ... |
| `tools` | `ToolExecution` list: `tool_name`, `tool_args`, `result`, `tool_call_error`, `confirmed`, `metrics` |
| `messages` | Every message of the run: system, user, assistant (with `tool_calls`), tool |
| `metrics` | `input_tokens`, `output_tokens`, `total_tokens`, `cost`, `duration`, `time_to_first_token` |
| `run_id`, `session_id`, `user_id`, `agent_id` | Identifiers for storage and tracing |
| `references` | Knowledge search results used in the run |
| `reasoning_content`, `reasoning_steps` | Reasoning output when enabled |
| `requirements`, `active_requirements`, `is_paused` | Human-in-the-loop state |
| `session_state`, `metadata` | State after the run, metadata passed to `run()` |

## Streaming

```python
from agno.agent import Agent, RunEvent

agent = Agent(model="openai:gpt-5-mini", tools=[get_order_status])

for event in agent.run("Where is ord-42?", stream=True, stream_events=True):
    if event.event == RunEvent.run_content.value:
        print(event.content, end="", flush=True)
    elif event.event == RunEvent.tool_call_started.value:
        print(f"\n[calling {event.tool.tool_name}]")
```

- `stream=True` alone yields only content events; `stream_events=True` adds lifecycle events.
- A tool run with the offline model produced: `RunStarted, ModelRequestStarted, ModelRequestCompleted, ToolCallStarted, ToolCallCompleted, ModelRequestStarted, RunContent, ModelRequestCompleted, RunContentCompleted, RunCompleted`.
- `yield_run_output=True` also yields the final `RunOutput` at the end of the stream.
- Other events: `RunError`, `RunPaused`, `ToolCallError`, `ReasoningStep`, `MemoryUpdateStarted/Completed`, `PreHookStarted/Completed`, `CustomEvent`, ...

## Async

```python
import asyncio

from agno.agent import Agent, RunOutput


async def fetch_status(order_id: str) -> str:
    """Return the delivery status of an order."""
    await asyncio.sleep(0)                        # e.g. an httpx.AsyncClient call
    return f"{order_id}: shipped"


async def main():
    agent = Agent(model="openai:gpt-5-mini", tools=[fetch_status])
    run = await agent.arun("Where is ord-42?")

    async for item in agent.arun("And ord-43?", stream=True, stream_events=True, yield_run_output=True):
        if isinstance(item, RunOutput):
            print(item.content)

asyncio.run(main())
```

Every sync method has an async twin: `arun`, `acontinue_run`, `aprint_response`, `aget_session`, ...

## Hooks and Guardrails

`pre_hooks` run before the model sees the input, `post_hooks` after the output is parsed. A hook stops the run by raising `InputCheckError` / `OutputCheckError`.

```python
from agno.agent import Agent
from agno.exceptions import CheckTrigger, OutputCheckError
from agno.guardrails import PIIDetectionGuardrail, PromptInjectionGuardrail
from agno.run.agent import RunInput, RunOutput


def log_input(run_input: RunInput) -> None:
    print("input:", run_input.input_content)


def block_secrets(run_output: RunOutput) -> None:
    if "sk-" in str(run_output.content):
        raise OutputCheckError("Secret in output", check_trigger=CheckTrigger.OUTPUT_NOT_ALLOWED)


agent = Agent(
    model="openai:gpt-5-mini",
    pre_hooks=[PromptInjectionGuardrail(), PIIDetectionGuardrail(), log_input],
    post_hooks=[block_secrets],
)
```

| Case | Result |
|------|--------|
| `PromptInjectionGuardrail` matches ("Ignore previous instructions ...") | `RunStatus.error`, the model is **not called** |
| Post-hook raises `OutputCheckError` | `RunStatus.error`, but `run.content` **still holds the blocked text** — do not show `content` without checking `status` |

Built-in guardrails: `PromptInjectionGuardrail` and `PIIDetectionGuardrail` (pattern-based) and `OpenAIModerationGuardrail` (calls the OpenAI moderation API). For richer validation see [Guardrails AI](../guardrails/index.md).

## Agent Checklist

- [ ] Agent built by a factory that receives the model (and db)
- [ ] Explicit `id` and `name`; instructions short and snapshot-tested
- [ ] Every tool has type hints and an `Args:` docstring
- [ ] Risky tools use `requires_confirmation=True`; `tool_call_limit` is set
- [ ] Code checks `run.status` and `isinstance(run.content, Schema)`
- [ ] Async tools are only used with `arun()`
- [ ] Guardrails on input, output checks on everything shown to users

---
## See also
- [Agno — Agents, Teams & Workflows in Python](./index.md)
- [Agno — Sessions, Memory & Knowledge](./02-sessions-memory-knowledge.md)
- [Agno — Testing Agno Apps](./05-testing.md)
- [Pydantic](../pydantic/index.md)
- [Guardrails AI — LLM Guards & Validators](../guardrails/index.md)
- [Agentic AI — Tool Integration & Prompting](../../agentic-ai-architecture/04-tool-integration-prompting.md)
