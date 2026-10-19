---
date: 2026-10-19 12:00:00
tags:
  - python
  - libraries
  - pydantic-ai
  - ai-agents
  - llm
---

# Pydantic AI — Runs, History, Approval & Capabilities

How to run an agent in each mode, carry a conversation between runs, pause a run for human approval, attach toolsets and MCP servers, and extend the loop with hooks. Examples use `TestModel` so they run offline (pydantic-ai-slim 2.57.0).

## Ways to Run an Agent

| Method | Returns | Use when |
|--------|---------|----------|
| `await agent.run(prompt)` | `AgentRunResult` | Normal async code |
| `agent.run_sync(prompt)` | `AgentRunResult` | Scripts and tests (it drives its own event loop; do not call it inside a running loop) |
| `async with agent.run_stream(prompt) as stream` | `StreamedRunResult` | Show text or partial structured output as it arrives |
| `async with agent.run_stream_events(prompt) as events` | async iterator of events | Show tool calls and thinking as well as text |
| `async with agent.iter(prompt) as run` | `AgentRun` (iterate over graph nodes) | Step through the loop yourself |

### Streaming

```python
async with agent.run_stream("Write a haiku") as stream:
    async for text in stream.stream_text():          # cumulative text by default
        print(text)
    print(stream.usage)                               # a property, like on the result
```

`stream_text()` yields the **whole text so far** (`'hello '`, `'hello world '`, `'hello world foo'`). Pass `delta=True` for only the new chunk. `await stream.get_output()` waits for the final validated output, and for a structured `output_type` use `stream_output()` to get partially filled objects while the model is still writing.

### Streaming every event

```python
async with agent.run_stream_events("Where is ord-1?") as events:
    async for event in events:
        print(type(event).__name__)
```

For a plain text answer the sequence is `PartStartEvent`, `FinalResultEvent`, several `PartDeltaEvent`, `PartEndEvent` and finally `AgentRunResultEvent`, which carries the result. With tools you also get `FunctionToolCallEvent` and `FunctionToolResultEvent`.

### Stepping through the loop

```python
async with agent.iter("Where is ord-1?") as run:
    async for node in run:
        print(type(node).__name__)
    print(run.result.output)
# UserPromptNode → ModelRequestNode → CallToolsNode → End
```

## Messages and Conversation History

A run does not remember previous runs. To continue a conversation pass the earlier messages:

```python
r1 = agent.run_sync("What is the capital of France?")
r2 = agent.run_sync("And its population?", message_history=r1.new_messages())

print(len(r1.all_messages()))   # 2  (request + response)
print(len(r2.all_messages()))   # 4  (history + new request + new response)
print(len(r2.new_messages()))   # 2  (only this run)
```

| Accessor | Contents |
|----------|----------|
| `result.all_messages()` | History passed in **plus** this run |
| `result.new_messages()` | Only this run |
| `all_messages_json()` / `new_messages_json()` | The same as JSON bytes |

!!! warning "`instructions` vs `system_prompt` in history"
    `instructions` are read from the agent that runs *now* and are never stored in the history, so you can change the role between runs. A `system_prompt` is stored as a `SystemPromptPart` and replayed to whichever agent continues the conversation, even one with different instructions. Use `instructions` unless you want the old system prompt to travel with the history.

### Persisting history

```python
from pydantic_ai import ModelMessagesTypeAdapter

raw = ModelMessagesTypeAdapter.dump_json(result.all_messages())      # bytes: store in a DB column
history = ModelMessagesTypeAdapter.validate_json(raw)                # list[ModelMessage]
result = agent.run_sync("Continue", message_history=history)
```

### `Conversation` — history plus usage

`message_history=` carries only messages. A `Conversation` also carries the running `usage` (so a `UsageLimits` budget spans the whole conversation instead of restarting every turn), a `conversation_id`, and any pending deferred tool requests:

```python
r1 = agent.run_sync("q1")
r2 = agent.run_sync("q2", conversation=r1.conversation)
print(r2.usage)        # RunUsage(requests=2, ...)  — cumulative, not just this turn
```

It is a Pydantic value: store it as a field on your own model or serialise it with `ConversationTypeAdapter`.

### Trimming history

`ProcessHistory` is a capability that rewrites the message list before every model request. The result is what the model sees **and** what is kept in `all_messages()`:

```python
from pydantic_ai.capabilities import ProcessHistory
from pydantic_ai.messages import ModelMessage


def keep_recent(messages: list[ModelMessage]) -> list[ModelMessage]:
    return messages[-6:]


agent = Agent("openai:gpt-5-mini", capabilities=[ProcessHistory(keep_recent)])
```

The list already contains the new user prompt. Do not cut it so that the history starts with a tool result whose tool call was dropped — providers reject that.

## Human Approval (Deferred Tools)

A tool marked `requires_approval=True` does not run. The run ends early and returns a `DeferredToolRequests` listing the calls waiting for a decision. Add that class to `output_type` so the agent is allowed to return it:

```python
from pydantic_ai import Agent, DeferredToolRequests, DeferredToolResults, ToolApproved, ToolDenied

agent = Agent(
    "openai:gpt-5-mini",
    output_type=[str, DeferredToolRequests],
)


@agent.tool_plain(requires_approval=True)
def delete_file(path: str) -> str:
    """Delete a file."""
    return f"deleted {path}"


result = agent.run_sync("Delete /tmp/old.log")
if isinstance(result.output, DeferredToolRequests):
    decisions = DeferredToolResults()
    for call in result.output.approvals:                     # ToolCallPart objects
        decisions.approvals[call.tool_call_id] = (
            ToolApproved() if ask_user(call) else ToolDenied("The user declined.")
        )
    result = agent.run_sync(
        message_history=result.all_messages(),               # no new prompt needed
        deferred_tool_results=decisions,
    )
print(result.output)
```

- Approved: the tool runs and its return value goes to the model (`{"delete":"deleted a"}` with `TestModel`).
- Denied: the model receives the denial message as the tool result and decides what to say next.
- A tool can also decide at runtime: raise `ApprovalRequired` inside it (for example only for paths outside a safe directory).
- `CallDeferred` is the sibling for work done outside the process (a job queue): the result is supplied later in `DeferredToolResults.calls`.

## Toolsets

A **toolset** is a group of tools that can be shared between agents or filtered, prefixed and wrapped:

```python
from pydantic_ai import Agent
from pydantic_ai.toolsets import FunctionToolset

orders = FunctionToolset()


@orders.tool_plain
def get_order(order_id: str) -> str:
    """Return an order."""
    return f"{order_id}: shipped"


agent = Agent("openai:gpt-5-mini", toolsets=[orders])
```

`FunctionToolset.tool` expects a `RunContext` first parameter, like `@agent.tool`; for a plain function use `tool_plain`. Wrappers such as `.prefixed("orders_")`, `.filtered(...)`, `.renamed(...)` and `.approval_required()` adapt a toolset without editing its tools.

### MCP servers

`MCPToolset` connects to a Model Context Protocol server (`uv add "pydantic-ai-slim[mcp]"`) and exposes its tools to the agent:

```python
from pydantic_ai import Agent
from pydantic_ai.mcp import MCPToolset

remote = MCPToolset("http://localhost:8000/mcp")        # streamable HTTP
local = MCPToolset("my_mcp_server.py")                  # stdio, a local script

agent = Agent("openai:gpt-5-mini", toolsets=[remote, local])

async with agent:                                       # opens and closes the connections
    result = await agent.run("List the open tickets")
```

For OAuth or custom headers pass a pre-built FastMCP `Client` (`MCPToolset(client)`). `MCPServerStdio` and `MCPServerStreamableHTTP` from 0.x / 1.x are gone. For protocol background see [Model Context Protocol (MCP)](../../ai-skills/11-mcp-protocol.md).

## Capabilities and Hooks

A **capability** bundles behaviour that attaches to an agent: tools, instructions, model settings, or lifecycle hooks. Built-in ones include `Hooks`, `ProcessHistory`, `Thinking`, `WebSearch`, `WebFetch`, `MCP`, `Caching`, `PrefixTools`, `PrepareTools` and `ToolSearch`.

`Hooks` lets application code intercept the run without writing a subclass:

```python
from pydantic_ai import Agent
from pydantic_ai.capabilities import Hooks

hooks = Hooks()
audit: list[str] = []


@hooks.on.before_tool_execute
async def record(ctx, *, call, tool_def, args):
    audit.append(call.tool_name)
    return args                                  # may return modified args


@hooks.on.before_model_request
async def log_request(ctx, request_context):
    print("messages:", len(request_context.messages))
    return request_context


agent = Agent("openai:gpt-5-mini", capabilities=[hooks])
```

| Hook family | Fires |
|-------------|-------|
| `before_run` / `after_run` / `run_error` | Around the whole run |
| `before_model_request` / `after_model_request` / `model_request_error` | Around each model call |
| `before_tool_validate` / `before_tool_execute` / `after_tool_execute` / `tool_execute_error` | Around each tool call |
| `before_output_validate` / `after_output_validate` | Around output validation |
| `prepare_tools`, `deferred_tool_calls`, `event` | Tool visibility, approvals, streaming events |

Use hooks for audit logging, redaction before a model request, metrics and policy checks; keep business logic in tools.

## Fallback Between Models

`FallbackModel` tries the next model when the first one fails:

```python
from pydantic_ai import Agent
from pydantic_ai.models.fallback import FallbackModel

model = FallbackModel("openai:gpt-5-mini", "anthropic:claude-sonnet-5-5")
agent = Agent(model)
```

By default it falls back on `ModelAPIError` (which includes `ModelHTTPError`: 5xx, 429, network failures). A bug in your own code, such as a `RuntimeError`, is **not** caught. Pass `fallback_on=(...)` to change what triggers it. If every model fails, a `FallbackExceptionGroup` is raised.

## Common Mistakes

| Mistake | Effect | Fix |
|---------|--------|-----|
| `agent.run_sync()` inside `async def` | `RuntimeError` about a running loop | Use `await agent.run()` |
| Passing `message_history` and expecting the old `instructions` | Current agent's instructions are used | Use `system_prompt` if the old text must follow the history |
| Forgetting `DeferredToolRequests` in `output_type` | The run raises a `UserError` instead of pausing | `output_type=[str, DeferredToolRequests]` |
| Resuming with a new prompt instead of `message_history=` | The paused tool call is lost | Pass `result.all_messages()` and `deferred_tool_results=` |
| MCP calls without `async with agent` | Connection is opened per run | Enter the agent's context once |
| Expecting `FallbackModel` to catch any exception | Only `ModelAPIError` by default | Set `fallback_on=` |

---
## See also
- [Pydantic AI — Type-Safe Agents](./index.md)
- [Pydantic AI — Agents, Tools & Structured Output](./01-agents-tools-output.md)
- [Pydantic AI — Multi-Agent & Graphs](./03-multi-agent-graphs.md)
- [Model Context Protocol (MCP)](../../ai-skills/11-mcp-protocol.md)
- [LiteLLM — Unified LLM Gateway](../litellm/index.md)
