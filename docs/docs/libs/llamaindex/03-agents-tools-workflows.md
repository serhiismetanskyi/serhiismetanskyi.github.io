---
date: 2026-10-25 12:00:00
tags:
  - python
  - libraries
  - llamaindex
  - rag
  - ai-agents
  - llm
---

# LlamaIndex — Agents, Tools & Workflows

Agents in LlamaIndex are built on **Workflows**, the event-driven engine that also powers custom pipelines. A `FunctionAgent` is a workflow that loops *LLM call → tool calls → LLM call* until the model answers; an `AgentWorkflow` runs several agents with hand-off; a plain `Workflow` is where you write your own control flow (a RAG pipeline with branches, retries and fan-out).

| You want | Use |
|----------|-----|
| One tool-calling agent; for a model without native tool calling | `FunctionAgent`; `ReActAgent` (text Thought / Action format) |
| Several specialised agents with hand-off | `AgentWorkflow(agents=[...], root_agent="...")` |
| Agent that writes and runs Python | `CodeActAgent(code_execute_fn=...)`: runs model-written code, so sandbox it |
| Fixed multi-step pipeline with branches and loops | `Workflow` with `@step` |

## Tools

```python
from llama_index.core.tools import FunctionTool, QueryEngineTool


def order_status(order_id: str, include_history: bool = False) -> str:
    """Return the delivery status of an order.

    Args:
        order_id: Order id such as "o-1042".
        include_history: Also return past status changes.
    """
    return "shipped"


status_tool = FunctionTool.from_defaults(order_status)            # name, description, schema from the function
kb_tool = QueryEngineTool.from_defaults(
    index.as_query_engine(llm=llm, similarity_top_k=3),
    name="kb",
    description="Search the support knowledge base. Input: a full question.",
)
```

- A plain function in `tools=[...]` is wrapped automatically. The tool **description** is the function signature plus the docstring, and the JSON schema comes from the type hints (`order_id` is required, `include_history` has a default).
- `QueryEngineTool` takes one string argument named `input`. The tool description decides when the agent calls it; "Useful for questions" is not enough.
- Async functions work as tools. A tool that raises is reported to the model as an error result (`ToolOutput.is_error`), not as an exception in your code.
- Add `ctx: Context` as the **first parameter** to receive the workflow context (state, events); it is hidden from the model's schema.
- `return_direct=True` returns the tool output as the final answer without another LLM call.

## `FunctionAgent`

```python
from llama_index.core.agent.workflow import FunctionAgent
from llama_index.llms.openai import OpenAI

agent = FunctionAgent(
    name="support",
    description="Answers support questions",
    system_prompt="You are a support agent. Use the kb tool for policies and order_status for orders.",
    tools=[kb_tool, status_tool],
    llm=OpenAI(model="gpt-4o-mini", temperature=0),
)

response = await agent.run("Where is order o-1042 and what is the refund window?", max_iterations=10)
print(response)                          # AgentOutput; str() is the final text
response.tool_calls                      # list[ToolCallResult] made during the run
```

| Parameter | Meaning |
|-----------|---------|
| `can_handoff_to` | Names of agents this one may hand off to (`AgentWorkflow`) |
| `initial_state` | Dict copied into the run state ([below](#state-in-context)) |
| `output_cls`, `structured_output_fn` | Structured final answer ([below](#structured-output)) |
| `early_stopping_method` | `"force"` (default) raises at the iteration limit; `"generate"` makes one more LLM call without tools to produce a final answer |
| `allow_parallel_tool_calls` | Let the model request several tools per turn |

`agent.run(user_msg, chat_history=None, memory=None, ctx=None, max_iterations=None)` returns an awaitable **handler**. Awaiting it gives the result; `handler.stream_events()` gives live events. At the iteration limit with `"force"` a `WorkflowRuntimeError: Max iterations of N reached!` is raised: always set `max_iterations`. A non-function-calling LLM raises `ValueError: LLM must be a FunctionCallingLLM` on the first step; use `ReActAgent` for those.

### Streaming events

```python
from llama_index.core.agent.workflow import AgentOutput, AgentStream, ToolCall, ToolCallResult

handler = agent.run("Where is order o-1042?")
async for event in handler.stream_events():
    if isinstance(event, AgentStream):
        print(event.delta, end="", flush=True)                  # text tokens
    elif isinstance(event, ToolCall):
        print(f"\n-> {event.tool_name}({event.tool_kwargs})")
    elif isinstance(event, ToolCallResult):
        print(f"<- {event.tool_output.content}")
result = await handler
```

| Event | Fields |
|-------|--------|
| `AgentStream` | `delta`, `response` (text so far), `tool_calls`, `current_agent_name` |
| `ToolCall` | `tool_name`, `tool_kwargs`, `tool_id` |
| `ToolCallResult` | `tool_name`, `tool_kwargs`, `tool_output`, `return_direct` |
| `AgentOutput` | `response`, `structured_response`, `tool_calls`, `current_agent_name` |
| `AgentInput` | `input`: the messages sent to the LLM |

## State in `Context`

Each run has a `Context` holding state shared by tools and steps. Reuse one context to keep **state** across runs; pass the same `memory` to keep the **conversation** (the chat history is not stored in the context between runs).

```python
from llama_index.core.memory import Memory
from llama_index.core.workflow import Context


async def remember_name(ctx: Context, name: str) -> str:
    """Remember the customer's name."""
    async with ctx.store.edit_state() as state:          # atomic update
        state["state"]["name"] = name
    return f"saved {name}"


agent = FunctionAgent(tools=[remember_name, status_tool], llm=llm, initial_state={"name": None})
ctx, memory = Context(agent), Memory.from_defaults(session_id="user-42")
await agent.run("I am Ann", ctx=ctx, memory=memory)
await agent.run("Where is o-1042?", ctx=ctx, memory=memory)   # same ctx: state continues; same memory: history continues
await ctx.store.get("state")                                  # {'name': 'Ann'}
```

The agent's `state_prompt` (default `Current state:\n{state}\n\nCurrent message:\n{msg}`) puts the state into each user message, so everything in `state` is sent to the LLM.

**Persisting a context.** `ctx.to_dict(serializer=JsonSerializer())` returns a JSON-safe dict and `Context.from_dict(agent, data, serializer=JsonSerializer())` restores it. The chat **memory is not included** (`UnserializableKeyWarning: Skipping serialization of known unserializable key: memory`), so without `memory=` the agent has no history. Keep the memory in a database ([Memory](#memory)) and pass it again: `agent.run("next question", ctx=restored, memory=memory_for_session)`.

## Human-in-the-Loop

A tool can pause the run and wait for a person with `ctx.wait_for_event`. The workflow emits an `InputRequiredEvent`; the answer comes back as a `HumanResponseEvent`.

```python
from llama_index.core.workflow import Context, HumanResponseEvent, InputRequiredEvent


async def refund(ctx: Context, order_id: str) -> str:
    """Refund an order. A human must approve first."""
    answer = await ctx.wait_for_event(
        HumanResponseEvent,
        waiter_id=f"refund-{order_id}",
        waiter_event=InputRequiredEvent(prefix=f"Approve refund for {order_id}? (yes/no)"),
    )
    return "refunded" if answer.response.strip().lower() == "yes" else "refused by approver"


agent = FunctionAgent(tools=[refund], llm=llm)
handler = agent.run("Refund order o-1042")
async for event in handler.stream_events():
    if isinstance(event, InputRequiredEvent):
        print(event.prefix)
        handler.ctx.send_event(HumanResponseEvent(response="yes"))      # from a UI, queue, or Slack callback
print(await handler)
```

For approvals that take hours, stop the run and resume it in a later request: after the `InputRequiredEvent`, `await handler.cancel_run()`, store `ctx.to_dict(serializer=JsonSerializer())` and the memory session, then in the next request restore the context, call `handler = agent.run(ctx=restored)`, **immediately** `await handler.ctx.store.set("memory", memory_for_session)`, and `handler.ctx.send_event(HumanResponseEvent(response="yes"))`. Setting memory before `agent.run(...)` is lost; set it right after.

Put the `wait_for_event` inside the tool that does the damage; never rely on the model to ask for approval.

## Multi-Agent with `AgentWorkflow`

```python
from llama_index.core.agent.workflow import AgentWorkflow, FunctionAgent, ToolCall

triage = FunctionAgent(
    name="triage", description="Routes requests to the right specialist",
    system_prompt="Hand off order questions to the orders agent.", tools=[], llm=llm, can_handoff_to=["orders"],
)
orders = FunctionAgent(
    name="orders", description="Looks up order status",
    system_prompt="Answer order questions with order_status.", tools=[status_tool], llm=llm, can_handoff_to=["triage"],
)
workflow = AgentWorkflow(agents=[triage, orders], root_agent="triage", initial_state={"seen": []}, timeout=120)

handler = workflow.run("Where is order o-1042?")
async for event in handler.stream_events():
    if isinstance(event, ToolCall) and event.tool_name == "handoff":
        print("handoff:", event.tool_kwargs)            # {'to_agent': 'orders', 'reason': '...'}
print(await handler)
await handler.ctx.store.get("current_agent_name")       # 'orders': the next run starts here
```

Every agent with `can_handoff_to` receives an extra `handoff` tool (`to_agent`, `reason`) and a prompt listing the reachable agents by `description`. State is shared by all agents in the workflow. `AgentWorkflow.from_tools_or_functions([...], llm=llm, system_prompt=...)` builds a single-agent workflow quickly. For comparison with graph-based multi-agent designs see [LangGraph](../langgraph/index.md) and [Pydantic AI](../pydantic-ai/index.md); the architectural trade-offs are in [Agentic AI Architecture](../../agentic-ai-architecture/index.md).

## Custom `Workflow`

Use a `Workflow` when the control flow is yours: a step receives one event type and returns the next. Branches are `if` statements returning different events, loops return an earlier step's event, and a step returning `None` waits for more events.

```python
from llama_index.core.response_synthesizers import get_response_synthesizer
from llama_index.core.schema import NodeWithScore
from llama_index.core.workflow import Context, Event, StartEvent, StopEvent, Workflow, step


class RetrievedEvent(Event):
    query: str
    nodes: list[NodeWithScore]


class RAGWorkflow(Workflow):
    def __init__(self, index, llm, **kwargs):
        super().__init__(**kwargs)
        self.retriever = index.as_retriever(similarity_top_k=3)
        self.llm = llm

    @step
    async def retrieve(self, ev: StartEvent) -> RetrievedEvent | StopEvent:
        query = ev.get("query")
        if not query:
            return StopEvent(result="Please ask a question.")          # branch: stop early
        return RetrievedEvent(query=query, nodes=await self.retriever.aretrieve(query))

    @step
    async def synthesize(self, ev: RetrievedEvent) -> StopEvent:
        synth = get_response_synthesizer(llm=self.llm, response_mode="compact")
        return StopEvent(result=await synth.asynthesize(ev.query, nodes=ev.nodes))


workflow = RAGWorkflow(index, llm, timeout=60)
response = await workflow.run(query="express delivery time")           # StartEvent fields as keyword arguments
print(response, [n.node_id for n in response.source_nodes])
```

| Piece | Notes |
|-------|-------|
| `Event` | Pydantic model; subclass it with typed fields |
| `StartEvent` / `StopEvent` | Entry and exit. `run(**kwargs)` becomes `StartEvent` attributes (`ev.get("query")`); `StopEvent(result=...)` is what `await run()` returns |
| `@step` | Reads the signature: the event parameter is the trigger, the return annotation lists the events it may emit |
| `timeout` | Seconds for the whole run, **default 45**. On expiry `WorkflowTimeoutError` names the active steps. Pass `timeout=None` to disable |
| `workflow.validate()` | Checks that every emitted event has a consumer and every step is reachable |
| `ctx.store.get/set` | Per-run key-value state; `ctx.write_event_to_stream(ev)` sends progress events to `handler.stream_events()` |

### Concurrency, retries and visualisation

```python
import asyncio

from workflows.retry_policy import ConstantDelayRetryPolicy


class Item(Event):
    n: int


class Done(Event):
    n: int


class FanOut(Workflow):
    @step
    async def start(self, ev: StartEvent) -> list[Item]:
        return [Item(n=i) for i in range(3)]                    # a list fans out: one event per item

    @step(num_workers=3, retry_policy=ConstantDelayRetryPolicy(delay=0.5, maximum_attempts=3))
    async def work(self, ev: Item) -> Done:                    # up to 3 copies run concurrently
        await asyncio.sleep(0.2)
        return Done(n=ev.n * 10)

    @step
    async def join(self, ev: list[Done]) -> StopEvent:         # a list parameter waits for all results
        return StopEvent(result=sorted(e.n for e in ev))


await FanOut(timeout=30).run()                                   # [0, 10, 20]
```

For dynamic fan-out, a step can call `ctx.send_event(Item(...))` repeatedly (declare `Item` in its return annotation, for example `-> Item | None`, and return `None`) and a later step can gather results with `ctx.collect_events(ev, [Done] * count)`, which returns `None` until all have arrived.

- `@step(num_workers=N)` sets how many invocations of that step run at once (default 4). Use a lower number for steps that call a rate-limited API.
- `retry_policy=` accepts `ConstantDelayRetryPolicy(maximum_attempts, delay)` and `ExponentialBackoffRetryPolicy`; `ctx.retry_info()` tells a step which attempt it is on.
- Draw the graph: `from llama_index.utils.workflow import draw_all_possible_flows` (package `llama-index-utils-workflow`), then `draw_all_possible_flows(RAGWorkflow, filename="rag_flow.html")`. `draw_most_recent_execution` shows what one run did.
- Workflows are async-first: one `asyncio.run(main())` entry point and `await workflow.run(...)`.
- Clients, indexes and models that should not be serialised into state belong on `self` or in injected resources (`Resource` from `workflows.resource`), not in `ctx.store`.

## MCP Tools

`llama-index-tools-mcp` turns an MCP server's tools into `FunctionTool`s.

```python
from llama_index.tools.mcp import BasicMCPClient, McpToolSpec

client = BasicMCPClient("python", args=["orders_mcp_server.py"])          # stdio server
# client = BasicMCPClient("https://mcp.example.com/mcp", headers={"Authorization": "Bearer <TOKEN>"})   # HTTP
spec = McpToolSpec(client=client, allowed_tools=["order_status"])         # allowlist; default is every tool
tools = await spec.to_tool_list_async()

agent = FunctionAgent(tools=tools, llm=llm, system_prompt="Support agent")
await agent.run("Status of o-1?")
```

`aget_tools_from_mcp_url(url, allowed_tools=[...])` is the one-call variant for remote servers, and `workflow_as_mcp` exposes a workflow as an MCP server. The model receives each result as the string form of the MCP `CallToolResult`. Treat a remote MCP server like third-party code: allowlist tools and pin the server ([OWASP LLM Security](../../owasp-llm-security/index.md)).

## Memory

`Memory` is the current chat memory: a FIFO message queue with a token budget plus optional **memory blocks** that are injected into the system message (or the last user message) as messages age out.

```python
from llama_index.core.memory import Memory, StaticMemoryBlock

memory = Memory.from_defaults(
    session_id="user-42",                                     # key in the chat store
    token_limit=30000,                                        # default
    async_database_uri="sqlite+aiosqlite:///memory.db",       # default is an in-memory SQLite database
    memory_blocks=[StaticMemoryBlock(name="persona", static_content="Always answer in English.")],
)
await agent.run("Hi, I am Ann", memory=memory)
await agent.run("What is my name?", memory=memory)           # history comes from the store
await memory.aget()                                          # list[ChatMessage] as sent to the LLM
```

| Piece | Behaviour |
|-------|-----------|
| `token_limit`, `chat_history_token_ratio` (0.7), `token_flush_size` | Budget; the oldest messages beyond it are flushed into the blocks |
| `StaticMemoryBlock` | Fixed text, always injected |
| `FactExtractionMemoryBlock`, `VectorMemoryBlock` | An LLM extracts facts from flushed messages; flushed messages go to a vector store and are retrieved by relevance |
| `async_database_uri` / `chat_store=` | Persistence; messages survive a restart and are found again by `session_id`. `chat_store` takes any `AsyncDBChatStore` |

Without `memory=`, each run starts with a fresh `ChatMemoryBuffer`. One `session_id` per end user is the isolation boundary: reusing an id mixes conversations.

## Structured Output

```python
from pydantic import BaseModel


class Ticket(BaseModel):
    order_id: str
    action: str


agent = FunctionAgent(tools=[status_tool], llm=llm, output_cls=Ticket)
result = await agent.run("Status of o-1042, then propose an action")
result.structured_response            # {'order_id': 'o-1042', 'action': 'none'}
result.get_pydantic_model(Ticket)     # Ticket(order_id='o-1042', action='none')
```

The agent runs its normal tool loop, then makes one extra LLM call to produce the structured answer from the conversation. `structured_output_fn` takes a list of `ChatMessage` and returns your own `BaseModel` instance (it is ignored when `output_cls` is set). For plain extraction without tools use `llm.as_structured_llm(Ticket)`.

**Planning.** The old `StructuredPlannerAgent` is gone. Build planning explicitly: a `create_plan` tool that writes steps into `ctx.store` state, an `output_cls` plan produced first, or a `Workflow` whose steps are the plan.

## Guardrails

| Risk | Control |
|------|---------|
| Runaway loops and cost | `max_iterations`, workflow `timeout`, a call counter in state, rate limiter ([05](./05-testing-production.md)) |
| Destructive tool calls | `ctx.wait_for_event` inside the tool; read-only tools by default |
| Over-broad tools or bad arguments | Small tool lists, MCP `allowed_tools`, per-user tools built per request; validate inside the tool (type hints are a schema, not authorisation) |
| Prompt injection from retrieved text or tool output | Treat as untrusted data; no tool should act on instructions found in documents ([05](./05-testing-production.md)) |
| PII in context | `PIINodePostprocessor` on retrieval, redaction before logging ([02](./02-retrieval-query-engines.md)) |
| Output format and policy | `output_cls`, or a validator step in a `Workflow` before `StopEvent`; [Guardrails AI](../guardrails/index.md) for validators |
| Model-written code | `CodeActAgent` only with a sandboxed `code_execute_fn` |

## Common Mistakes

| Mistake | Effect | Fix |
|---------|--------|-----|
| No `max_iterations` | A confused model loops until the timeout | Set it, and handle `WorkflowRuntimeError` |
| One shared `Context` for all users | State and history leak across users | One `Context` and `Memory` per session |
| Reused or restored `Context` without `memory=` | Agent forgets the conversation (state is kept) | Pass the session's `Memory` on every run |

---
## See also
- [LlamaIndex — RAG and Agents over Your Data](./index.md)
- [LlamaIndex — Retrieval & Query Engines](./02-retrieval-query-engines.md)
- [LlamaIndex — Evaluation & Observability](./04-evaluation-observability.md)
- [LangGraph — Stateful Agent Orchestration](../langgraph/index.md)
- [Pydantic AI — Type-Safe Agents](../pydantic-ai/index.md)
- [Guardrails AI](../guardrails/index.md)
- [OWASP LLM Security](../../owasp-llm-security/index.md)
- [Agentic AI Architecture](../../agentic-ai-architecture/index.md)
