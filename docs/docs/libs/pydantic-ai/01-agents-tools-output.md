---
date: 2026-10-19 12:00:00
tags:
  - python
  - libraries
  - pydantic-ai
  - ai-agents
  - llm
---

# Pydantic AI — Agents, Tools & Structured Output

This page covers the `Agent` class, dependency injection with `RunContext`, function tools, and `output_type`. All code was run on pydantic-ai-slim 2.57.0 with `TestModel` / `FunctionModel`, so it needs no API key.

## Agent Parameters

```python
from pydantic_ai import Agent

agent = Agent(
    "openai:gpt-5-mini",              # or a Model instance; None = pick per run
    deps_type=Deps,                   # type of the object passed as deps=
    output_type=Answer,               # str by default
    instructions="You are a support agent.",
    retries=2,                        # default retries for tools and output validation
    model_settings={"temperature": 0.0, "max_tokens": 800},
    name="support",                   # shows up in traces
)
```

| Parameter | Purpose |
|-----------|---------|
| `model` | `"provider:model"` string or a model object (`TestModel`, `FunctionModel`, `FallbackModel`, ...). Can be given per run: `agent.run(..., model=...)` |
| `deps_type` | Static type of `deps`; makes `RunContext[Deps]` type-check |
| `output_type` | What the run returns: `str`, a Pydantic model, a list/union of types, a function, `ToolOutput(...)` and friends |
| `instructions` | Role text (string, or functions registered with `@agent.instructions`) |
| `system_prompt` | Like `instructions`, but stored in the message history |
| `retries` | Default retry budget for tool calls and output validation (default 1) |
| `tools`, `toolsets` | Tools given at construction; toolsets group them (see [02](./02-runs-history-capabilities.md)) |
| `model_settings` | `temperature`, `max_tokens`, `top_p`, `seed`, `timeout`, `parallel_tool_calls`, `tool_choice`, `thinking`, ... |
| `end_strategy` | `'graceful'` (default) finishes tool calls that were made together with the final output |
| `tool_timeout` | Seconds a single tool may run |
| `capabilities` | Reusable bundles: `Hooks`, `ProcessHistory`, `Thinking`, `WebSearch`, `MCP`, ... |
| `name`, `description`, `metadata` | Identification in traces and when an agent is used as a tool |

## Dependencies and `RunContext`

`deps` carries everything a tool or instruction needs that is not part of the prompt: a database session, an HTTP client, the current user, settings. It is passed per run, so one module-level agent serves every request.

```python
from dataclasses import dataclass

import httpx
from pydantic_ai import Agent, RunContext


@dataclass
class Deps:
    user_id: int
    client: httpx.AsyncClient


agent = Agent("openai:gpt-5-mini", deps_type=Deps)


@agent.instructions
async def add_user(ctx: RunContext[Deps]) -> str:        # dynamic, evaluated every run
    return f"The current user id is {ctx.deps.user_id}."


@agent.tool
async def get_profile(ctx: RunContext[Deps]) -> dict:
    """Return the profile of the current user."""
    response = await ctx.deps.client.get(f"https://api.example.com/users/{ctx.deps.user_id}")
    response.raise_for_status()
    return response.json()


async def handle(user_id: int) -> str:
    async with httpx.AsyncClient() as client:
        result = await agent.run("Summarise my profile", deps=Deps(user_id, client))
    return result.output
```

`RunContext` also exposes `ctx.usage` (tokens and requests so far), `ctx.retry` (current retry number), `ctx.messages` and `ctx.model`.

!!! note "Sync tools run in a thread"
    A plain `def` tool runs in a worker thread, so it does not block the event loop. Use `async def` for I/O so the call stays on the loop.

## Function Tools

| Decorator | First parameter | Use when |
|-----------|-----------------|----------|
| `@agent.tool` | `ctx: RunContext[Deps]` | The tool needs `deps`, usage or messages |
| `@agent.tool_plain` | none | Pure function |
| `Agent(tools=[...])` | either | Tools defined elsewhere, shared between agents |

The tool name is the function name, the description is the docstring, and the parameters come from type hints. An `Args:` section (Google style; NumPy and Sphinx also work) fills the per-parameter `description`. This is exactly what the model receives for the function below:

```python
@agent.tool_plain
def lookup(order_id: str, limit: int = 5) -> str:
    """Look up an order.

    Args:
        order_id: Order ID like ord-42.
        limit: Max rows.
    """
```

```json
{
  "name": "lookup",
  "description": "Look up an order.",
  "parameters": {
    "type": "object",
    "properties": {
      "order_id": {"type": "string", "description": "Order ID like ord-42."},
      "limit": {"type": "integer", "default": 5, "description": "Max rows."}
    },
    "required": ["order_id"],
    "additionalProperties": false
  }
}
```

Tools can return any value that Pydantic can serialise to JSON: strings, numbers, dicts, dataclasses, models. Arguments the model sends are validated first; a wrong type becomes a retry prompt, not an exception.

### Retrying from a tool

Raise `ModelRetry` when the model can fix its call:

```python
from pydantic_ai import ModelRetry


@agent.tool
def get_order_status(ctx: RunContext[Deps], order_id: str) -> str:
    """Return the delivery status of an order."""
    if order_id not in ctx.deps.orders:
        raise ModelRetry(f"Unknown order {order_id!r}. Ask the user for a valid ID.")
    return ctx.deps.orders[order_id]
```

The message is sent back to the model as a retry prompt. After `retries` attempts (default 1 per tool) the run stops with `UnexpectedModelBehavior`:

```text
UnexpectedModelBehavior: Tool 'bad' exceeded max retries count of 2.
```

Set the budget per agent (`Agent(retries=3)`), per tool (`@agent.tool(retries=3)`) or per run (`agent.run(..., retries=3)`). Any exception **other** than `ModelRetry` and validation errors propagates out of `agent.run()`.

### Hiding a tool for one run

`prepare=` receives the tool definition on every model request and may return `None` to hide the tool:

```python
from pydantic_ai.tools import ToolDefinition


async def admin_only(ctx: RunContext[dict], tool_def: ToolDefinition) -> ToolDefinition | None:
    return tool_def if ctx.deps.get("admin") else None


@agent.tool(prepare=admin_only)
def reset_password(ctx: RunContext[dict], user: str) -> str:
    """Reset the password of a user."""
    return f"reset {user}"
```

With `deps={"admin": False}` the model never sees `reset_password` (the run answers without a tool call); with `{"admin": True}` it is offered and called.

## Structured Output

`output_type` tells Pydantic AI what a successful run returns. By default Pydantic AI registers an *output tool* named `final_result` whose arguments are the output schema; the model "calls" it to finish.

```python
from pydantic import BaseModel, Field


class Ticket(BaseModel):
    title: str
    priority: int = Field(ge=1, le=3, description="1 = urgent, 3 = low")


agent = Agent("openai:gpt-5-mini", output_type=Ticket)
result = agent.run_sync("The disk on db-1 is full!")
print(result.output)           # title='Disk full on db-1' priority=1   (a Ticket instance)
```

If the model returns `priority=9`, validation fails and the model receives a retry prompt with the Pydantic error. In a run with a scripted model the message history after one such retry looks like this:

```text
UserPromptPart → ToolCallPart(final_result, priority=9) → RetryPromptPart
               → ToolCallPart(final_result, priority=2) → ToolReturnPart
```

`result.output` is the valid `Ticket`. Output validation retries use the same `retries` budget.

### Output type forms

| `output_type` | Result | Notes |
|---------------|--------|-------|
| `str` (default) | Plain text | |
| `Ticket` (`BaseModel`, dataclass, `TypedDict`) | Validated instance | |
| `list[str]`, `dict[str, int]` | Validated container | Wrapped in an object for providers that need an object schema |
| `[City, Fail]` (list of types) | Whichever the model picks | One output tool per type, so the model *chooses* between success and failure |
| `[Ticket, str]` | A `Ticket` or free text | Useful for "answer or ask a clarifying question" |
| a function | The function's return value | The model's arguments are passed to the function |
| `[Ticket, DeferredToolRequests]` | Ticket or a pause for approval | See [02](./02-runs-history-capabilities.md) |

```python
class City(BaseModel):
    name: str
    population: int


class Fail(BaseModel):
    reason: str


agent = Agent("openai:gpt-5-mini", output_type=[City, Fail])   # City | Fail
```

### Output modes

How the schema is delivered to the provider is selected by wrapping the type:

| Wrapper | Mechanism | When to use |
|---------|-----------|-------------|
| `ToolOutput(Ticket, name="file_ticket", description="...")` | Output tool call (the default for a bare type) | Works on every model; rename the tool or add a description |
| `NativeOutput(Ticket)` | Provider's native JSON-schema mode | Provider supports it and you want fewer tokens spent on tool framing |
| `PromptedOutput(Ticket)` | Schema is written into the prompt, the reply is parsed as JSON | Models without tool calling or native structured output |
| `TextOutput(fn)` | Plain text reply passed through `fn(text: str)` | Post-process free text (the function must take one `str` parameter) |

```python
from pydantic_ai import Agent, NativeOutput, PromptedOutput, ToolOutput


def shout(text: str) -> str:
    return text.upper()


Agent("openai:gpt-5-mini", output_type=NativeOutput(Ticket))
Agent("openai:gpt-5-mini", output_type=ToolOutput(Ticket, name="file_ticket"))
Agent("openai:gpt-5-mini", output_type=PromptedOutput(Ticket))
```

### Output validators

A validator runs after Pydantic validation and can reject a semantically bad answer with `ModelRetry`:

```python
@agent.output_validator
async def check_title(ctx: RunContext[Deps], output: Ticket) -> Ticket:
    if not output.title[0].isupper():
        raise ModelRetry("The title must start with a capital letter.")
    return output
```

The validator may also return a *modified* output. Use `ctx.partial_output` to skip the check while a streamed response is still incomplete.

## Model Settings

`model_settings` can be set on the agent, on the model, or on one run; the more specific value wins.

```python
agent = Agent("openai:gpt-5-mini", model_settings={"temperature": 0.0})

result = agent.run_sync("...", model_settings={"max_tokens": 200, "timeout": 30})
```

| Key | Meaning |
|-----|---------|
| `temperature`, `top_p`, `top_k`, `seed` | Sampling |
| `max_tokens`, `stop_sequences` | Length control |
| `timeout` | HTTP timeout in seconds |
| `parallel_tool_calls`, `tool_choice` | Tool-calling behaviour |
| `thinking` | Reasoning effort on models that support it |
| `extra_headers`, `extra_body` | Provider-specific escape hatches |

Not every provider honours every key; unsupported keys are ignored or rejected by the provider, so keep per-provider settings next to the model.

## Usage and Limits

`result.usage` is a `RunUsage` with `input_tokens`, `output_tokens`, `requests` and `tool_calls`:

```python
result = agent.run_sync("Where is ord-1?", deps=deps)
print(result.usage)
# RunUsage(input_tokens=108, output_tokens=20, requests=2, tool_calls=2)
```

`UsageLimits` caps a run. When a limit would be crossed the run raises `UsageLimitExceeded` *before* the next request:

```python
from pydantic_ai import UsageLimitExceeded
from pydantic_ai.usage import UsageLimits

try:
    agent.run_sync("...", usage_limits=UsageLimits(request_limit=5, total_tokens_limit=20_000))
except UsageLimitExceeded as exc:
    ...   # "The next request would exceed the request_limit of 5"
```

Other fields: `input_tokens_limit`, `output_tokens_limit`, `tool_calls_limit`, `cost_limit`, `per_request_input_tokens_limit`. A `request_limit` is the simplest guard against an agent that keeps calling tools.

Useful per-tool options on `@agent.tool` / `@agent.tool_plain`: `retries`, `prepare`, `timeout`, `sequential=True` (never run in parallel with other tools), `strict`, `requires_approval`, `args_validator` and `docstring_format`.

## Common Mistakes

| Mistake | Effect | Fix |
|---------|--------|-----|
| Calling `result.usage()` | `TypeError: 'RunUsage' object is not callable` | `result.usage` is a property |
| Creating a new `Agent` per request | Rebuilds schemas on each call | Module-level agent, `deps=` per run |
| Returning huge strings from a tool | Burns context and tokens | Truncate or summarise in the tool |
| `ModelRetry` for infrastructure errors | Model retries something it cannot fix | Let the exception propagate |
| Tool without a docstring | Model guesses from the name only | Always add a docstring with `Args:` |
| Reading `result.output` as `str` while `output_type` is a union | Wrong type at runtime | Narrow with `isinstance` |

---
## See also
- [Pydantic AI — Type-Safe Agents](./index.md)
- [Pydantic AI — Runs, History, Approval & Capabilities](./02-runs-history-capabilities.md)
- [Pydantic — Models & Fields](../pydantic/01-models-fields.md)
- [Pydantic — Validators & Serialization](../pydantic/02-validators-serialization.md)
- [Tool Integration & Prompt Engineering](../../agentic-ai-architecture/04-tool-integration-prompting.md)
