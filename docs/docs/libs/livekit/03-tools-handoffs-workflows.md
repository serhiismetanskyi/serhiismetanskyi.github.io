---
date: 2026-10-24 12:00:00
tags:
  - python
  - libraries
  - livekit
  - voice-ai
  - function-calling
  - ai-agents
---

# LiveKit — Tools, Handoffs & Workflows

How a LiveKit agent acts and structures a conversation: **function tools**, MCP servers, **handoffs** between agents, **tasks** that return typed results, shared state, chat context, and messaging with the frontend (text streams, RPC).

## Function Tools

Decorate an `Agent` method with `@function_tool()`. The name, type hints and the docstring `Args:` section become the JSON schema the model sees.

```python
from livekit.agents import Agent, RunContext, ToolError, function_tool


class SupportAgent(Agent):
    def __init__(self) -> None:
        super().__init__(instructions="You are a support agent. Keep answers under two sentences.")

    @function_tool()
    async def lookup_order(self, context: RunContext, order_id: str) -> dict:
        """Look up an order's status.

        Args:
            order_id: The order number, for example ord-42.
        """
        if not order_id.startswith("ord-"):
            raise ToolError(f"Unknown order id format: {order_id}")     # the model sees this message and can tell the user
        return {"order_id": order_id, "status": "shipped"}
```

| Topic | Behaviour |
|-------|-----------|
| Parameters | Type hints become the schema: `str`, `int`, `bool`, `Optional`, `list[...]`, enums, `Literal`, dataclasses and Pydantic models; the model's JSON arguments are validated before the call |
| Decorator options | `@function_tool(name=..., description=..., flags=..., on_duplicate=...)`; `raw_schema={...}` defines the schema by hand and the function receives `raw_arguments` |
| Flags | `ToolFlag.IGNORE_ON_ENTER` (hide the tool from `generate_reply` calls made in `on_enter`), `ToolFlag.CANCELLABLE` (the model may cancel a long-running tool); import `ToolFlag` from `livekit.agents.llm` |
| Return value | Converted to a string for the model; `None` completes silently with no model reply; an `Agent` hands off (below); `(agent, "message")` hands off with a result |
| Errors | `ToolError("...")` is sent to the model; invalid arguments are returned to the model as errors so it can retry; any other exception becomes a generic internal error and is logged |
| Where defined | Methods of an `Agent` subclass, `Agent(tools=[...])`, `AgentSession(tools=[...])` (shared by all agents), or at runtime with `function_tool(fn, name=..., description=...)` |
| Changing tools | `await agent.update_tools([...])` replaces all tools: include the ones you keep |
| Grouping | `Toolset(id="orders", tools=[...])` adds or removes a group together; tool names must be unique across all tools and toolsets |
| Tool loop | At most `max_tool_steps` (default 3) consecutive tool rounds per turn |

`RunContext` is the first parameter after `self`:

| Member | Use |
|--------|-----|
| `context.session` | The `AgentSession` (`say`, `generate_reply`, `history`, `update_agent`) |
| `context.userdata` | Typed session state (`RunContext[MyState]`) |
| `context.function_call` | The `FunctionCall` item (name, arguments, call id) |
| `context.speech_handle` | The speech that triggered the call; `speech_handle.interrupted` tells a read-only tool to stop |
| `context.disallow_interruptions()` | Call first in tools that mutate data, so the user cannot cancel half-way |
| `await context.wait_for_playout()` | Wait for the speech spoken before the tool call |
| `context.with_filler(...)`, `context.update(...)` | Filler speech and progress updates in long-running **async tools** |

Tools are interruptible by default and keep running after an interruption. For long-running work use async tools: `ctx.update("...")` posts progress for the model to voice while the tool continues, `ToolFlag.CANCELLABLE` lets the model cancel it, `on_duplicate` (`allow`, `reject`, `replace`, `confirm`) controls repeated calls, and wrapping tools in an `AsyncToolset` (`livekit.agents.llm.async_toolset`) keeps them alive across handoffs.

### Prebuilt tools

```python
from livekit.agents.beta.tools import EndCallTool

end_call = EndCallTool(extra_description="Only end after the issue is resolved.", end_instructions="Thank the caller and say goodbye.")
agent = Agent(instructions="...", tools=end_call.tools)        # adds an `end_call` tool
```

`EndCallTool` makes the model say goodbye, shuts the session down and, with `delete_room=True` (default), deletes the room. `send_dtmf_events` sends keypad tones on SIP calls.

## MCP Servers

```python
from livekit.agents import AgentSession, mcp          # uv add "livekit-agents[mcp]"

session = AgentSession(
    # stt=..., llm=..., tts=...
    tools=[
        mcp.MCPToolset(
            id="orders",
            mcp_server=mcp.MCPServerHTTP(
                "https://mcp.internal.example.com/mcp",           # /mcp = streamable HTTP, /sse = SSE; or transport_type=...
                headers={"Authorization": f"Bearer {token}"},
                allowed_tools=["order_status", "refund_quote"],   # everything else is excluded
            ),
        ),
        mcp.MCPToolset(id="files", mcp_server=mcp.MCPServerStdio(command="npx", args=["-y", "@modelcontextprotocol/server-filesystem", "/data"])),
    ],
)
```

Servers start in parallel; one that fails to connect is logged and the agent still starts. Tools set on an `Agent` replace (do not merge with) session-level tools. MCP tools and `@function_tool` methods can be combined. The `mcp_servers=` argument of `AgentSession` and `Agent` is deprecated in favour of `MCPToolset` in `tools`. `tool_result_resolver` transforms a successful result before the model sees it.

## Handoffs

A tool that returns an `Agent` switches the session to it. The new agent starts with an **empty** chat history unless you pass `chat_ctx`.

```python
from dataclasses import dataclass, field

from livekit.agents import Agent, AgentSession, RunContext, function_tool


@dataclass
class CallState:
    customer: str | None = None
    handled: list[str] = field(default_factory=list)


class SupportAgent(Agent):                                   # the class from "Function Tools" with one more tool
    # __init__ and lookup_order as above

    @function_tool()
    async def transfer_to_billing(self, context: RunContext[CallState]) -> "BillingAgent":
        """Transfer the caller to the billing team."""
        return BillingAgent(chat_ctx=self.chat_ctx.copy(exclude_instructions=True))


class BillingAgent(Agent):
    def __init__(self, chat_ctx=None) -> None:
        super().__init__(instructions="You handle billing questions only.", chat_ctx=chat_ctx)

    async def on_enter(self) -> None:                       # runs on every entry: greet or continue
        self.session.generate_reply(instructions="Say you are the billing team.")


session = AgentSession[CallState](userdata=CallState())      # llm=... in real use
```

| Item | Detail |
|------|--------|
| Carry history | `self.chat_ctx.copy(exclude_instructions=True)` keeps the conversation without the old system prompt; `copy(...)` also takes `exclude_function_call`, `exclude_handoff`, `exclude_empty_message`, `exclude_config_update` |
| Limit history | `chat_ctx.copy().truncate(max_items=6)` keeps the latest items (instructions are kept; orphaned tool results are dropped) |
| Summarize | Summarize long history with a separate LLM call and pass the summary as a message |
| Hooks | `on_enter` on the new agent, `on_exit` on the old one (goodbyes, cleanup) |
| Explicit switch | `session.update_agent(agent)` from your own code |
| Full history | `session.history` holds the whole conversation across agents, including `agent_handoff` items |
| Tools after handoff | Session-level tools stay; agent-level tools belong to the agent that defined them |

Patterns: **single agent + tools** for simple flows; **supervisor** (one agent stays in control and delegates sub-steps to tasks); **handoff** when roles, permissions or prompts differ; **subagent delegation** (a background model works while the conversation continues); **task group** for ordered steps the user may revisit.

## Tasks

An `AgentTask[T]` is a short-lived agent that holds the conversation until it calls `complete(result)`, then returns `T` to the code that awaited it.

```python
from dataclasses import dataclass

from livekit.agents import Agent, AgentTask, RunContext, function_tool


@dataclass
class ConsentResult:
    agreed: bool


class CollectConsent(AgentTask[ConsentResult]):
    def __init__(self, chat_ctx=None) -> None:
        super().__init__(
            instructions="Ask whether the call may be recorded. Call record_consent with the answer.",
            chat_ctx=chat_ctx,
        )

    async def on_enter(self) -> None:
        self.session.generate_reply(instructions="Ask for recording consent.")

    @function_tool()
    async def record_consent(self, context: RunContext, agreed: bool) -> None:
        """Record the caller's answer.

        Args:
            agreed: True if the caller agrees to recording.
        """
        self.complete(ConsentResult(agreed=agreed))


class Intake(Agent):
    def __init__(self) -> None:
        super().__init__(instructions="You are an intake agent.")

    @function_tool()
    async def start_recording_flow(self, context: RunContext) -> str:
        """Ask the caller for recording consent and report the outcome."""
        result = await CollectConsent(chat_ctx=self.chat_ctx)      # awaiting runs the task
        return "consent granted" if result.agreed else "consent refused"
```

- **Await** a task only from `on_enter`, `on_exit` or a tool body; elsewhere it raises `RuntimeError`.
- A task starts with an empty context unless you pass `chat_ctx`.
- `complete(Exception)` raises it in the awaiting code; `task.cancel()` cancels.
- **`TaskGroup`** (`livekit.agents.beta.workflows`, beta) runs tasks in order and lets the user go back: `TaskGroup(summarize_chat_ctx=True, return_exceptions=False, chat_ctx=..., on_task_completed=...)`, `group.add(lambda: MyTask(), id="email", description="...")`, `results = await group`, then `results.task_results["email"]`. Do not call `session.shutdown()` inside `on_task_completed`; raise your own exception and catch it around the `await`.
- **Prebuilt tasks** in `livekit.agents.beta.workflows`: `GetNameTask`, `GetEmailTask`, `GetAddressTask`, `GetDOBTask`, `GetPhoneNumberTask`, `GetCreditCardTask`, `GetDtmfTask`, `WarmTransferTask`. For example `result = await GetEmailTask(chat_ctx=self.chat_ctx)` then `result.email_address`.

## Session State (userdata)

```python
session = AgentSession[CallState](llm=llm, userdata=CallState())
# in a tool:   context.userdata.handled.append(order_id)
# anywhere:    session.userdata.customer = "ord-42"
```

`session.userdata` raises `ValueError` if it was never set; initialise it at construction when tools or tasks use it. Keep the state a dataclass or Pydantic model with the fields a handoff needs (name, account id, verified flag) and set `userdata` before the first turn. Per-process objects (HTTP clients, model weights) belong in `ctx.proc.userdata` ([02](./02-agents-framework.md#prewarm)).

## Chat Context and Memory

`ChatContext` is the history sent to the LLM: ordered `items` of type `message`, `function_call`, `function_call_output`, `agent_handoff`, `agent_config_update`.

| Operation | Use |
|-----------|-----|
| `agent.chat_ctx`, `session.history` | The agent's context; the whole cross-agent history |
| `ctx.add_message(role=..., content=...)` | Add `system`, `user` or `assistant` text (or text plus `ImageContent`) |
| `ctx.messages()`, `msg.text_content` | Iterate messages; read text |
| `ctx.copy(...)`, `ctx.truncate(max_items=...)`, `ctx.merge(other)` | Snapshot, shorten, combine (merge de-duplicates by item id, useful after parallel tasks) |
| `ctx.to_dict()`, `ChatContext.from_dict(d)` | Serialise for storage; restore into `Agent(chat_ctx=...)` |
| `await agent.update_chat_ctx(ctx)` | Replace the agent's context |
| `session.generate_reply(chat_ctx=ctx)` | Run one reply on a modified copy without changing history |

**Memory** across calls is your code: load saved facts (`ChatContext.from_dict` or a profile) and seed them as an assistant message in `Agent(chat_ctx=...)` so no extra LLM round trip is needed; save `session.history.to_dict()` in `on_session_end` or a shutdown callback.

**Turn hook for retrieval (RAG)** — `on_user_turn_completed` runs after the user's turn ends and before the reply. Add retrieved facts to `turn_ctx` (applies to this turn; call `await self.update_chat_ctx(turn_ctx)` to keep them) or raise `StopResponse` to skip the reply:

```python
from livekit.agents import Agent, ChatContext, ChatMessage, StopResponse


class Guarded(Agent):
    def __init__(self) -> None:
        super().__init__(instructions="Answer from the provided facts.")

    async def on_user_turn_completed(self, turn_ctx: ChatContext, new_message: ChatMessage) -> None:
        text = (new_message.text_content or "").strip()
        if not text:
            raise StopResponse()                              # no reply for an empty turn
        facts = await search_kb(text)                         # your retriever
        turn_ctx.add_message(role="assistant", content=f"Facts: {facts}")
```

The hook runs when a spoken turn ends (and on `session.commit_user_turn()`). Text typed on `lk.chat`, `session.generate_reply(user_input=...)` and `session.run(user_input=...)` go straight to a reply and bypass it, so unit-test the hook by calling it directly ([05](./05-testing-evals.md#unit-testing-the-turn-hook)) and apply the same retrieval in a custom `text_input_cb` if text clients need it.

## Structured Output

| Need | Use |
|------|-----|
| Typed arguments from the model | Tool parameters: `async def save_address(self, context: RunContext, address: Address)` with a Pydantic `Address` model |
| Typed result of a sub-conversation | `AgentTask[T]` and `complete(T(...))` |
| One-off extraction outside the voice loop | `llm.chat(chat_ctx=ctx, response_format=Ticket)` returns JSON text; validate with `Ticket.model_validate_json(text)` |
| Typed values spoken or shown | Override `llm_node` / `transcription_node` to post-process |

```python
from pydantic import BaseModel
from livekit.agents import ChatContext
from livekit.plugins import openai


class Ticket(BaseModel):
    category: str
    urgent: bool


async def classify(llm: openai.LLM, text: str) -> Ticket:
    ctx = ChatContext()
    ctx.add_message(role="user", content=text)
    stream = llm.chat(chat_ctx=ctx, response_format=Ticket)
    out = "".join([c.delta.content async for c in stream if c.delta and c.delta.content])
    return Ticket.model_validate_json(out)
```

[Pydantic](../pydantic/index.md) models define the schema; [Pydantic AI](../pydantic-ai/index.md) can sit behind a tool for text-only subagents.

## Text and Data Messaging

| Channel | Direction | Use |
|---------|-----------|-----|
| Text stream `lk.chat` | client to agent | A typed message; the agent interrupts and replies |
| Text stream `lk.transcription` | agent to client | The agent's text and the user's transcripts; attributes `lk.segment_id`, `lk.transcription_final` (`"true"` for final, `"false"` for interim), `lk.transcribed_track_id` (user speech) |
| Custom text stream | either | `await room.local_participant.send_text("...", topic="app.events")`, or `info = await ...stream_text(topic=...)` then `await info.write(...)` and `await info.aclose()` |
| Byte stream | either | Files and images (`register_byte_stream_handler`) |
| RPC | either | Call a method on one participant and wait for the string result |
| Participant attributes, room metadata | shared state | `await room.local_participant.set_attributes({...})` |

Receive streams with `room.register_text_stream_handler(topic, handler)`; the handler gets `(reader, participant_identity)` and `await reader.read_all()` returns the text. Interim and final transcription streams share one `lk.segment_id`: replace interim text with the final text. Agent speech is synchronised with its transcript (word by word, truncated on interruption) unless `TextOutputOptions(sync_transcription=False)`. Handle custom commands with `TextInputOptions(text_input_cb=...)`:

```python
from livekit.agents import room_io

def on_text(session, event: room_io.TextInputEvent) -> None:
    if event.text == "/status":
        session.say("The agent is running normally.")
        return
    session.interrupt()
    session.generate_reply(user_input=event.text)         # default behaviour

options = room_io.RoomOptions(text_input=room_io.TextInputOptions(text_input_cb=on_text))
```

### RPC and forwarding tools to the frontend

Register RPC methods after the room is connected (after `session.start(...)` or `await ctx.connect()`); `ctx.room.local_participant` is not available before.

```python
import json

from livekit import rtc
from livekit.agents import Agent, RunContext, ToolError, function_tool, get_job_context


class Assistant(Agent):
    @function_tool()
    async def get_user_location(self, context: RunContext, high_accuracy: bool = False) -> str:
        """Ask the user's browser for its location.

        Args:
            high_accuracy: Whether to ask for a precise fix.
        """
        room = get_job_context().room
        user = next(iter(room.remote_participants.values()), None)
        if user is None:
            raise ToolError("The user is not connected.")
        try:
            return await room.local_participant.perform_rpc(
                destination_identity=user.identity,
                method="getUserLocation",
                payload=json.dumps({"highAccuracy": high_accuracy}),
                response_timeout=10.0 if high_accuracy else 5.0,
            )
        except rtc.RpcError as exc:
            raise ToolError(f"Unable to retrieve user location ({exc.code})") from exc


async def entrypoint(ctx):                                       # after the session started:
    @ctx.room.local_participant.register_rpc_method("setLanguage")
    async def set_language(data: rtc.RpcInvocationData) -> str:   # data.caller_identity, data.payload
        session.userdata = {"lang": data.payload}
        return "ok"
```

The browser registers the counterpart with `localParticipant.registerRpcMethod('getUserLocation', handler)` and throws `RpcError` for failures. Limits: payloads up to 15 KiB each way, method names up to 64 bytes, default response timeout 10 s, hidden participants cannot call RPC. Error codes `1400` to `1505` are LiveKit's (`1400` unsupported method, `1401` recipient not found, `1500` application error in the handler, `1502` response timeout, `1503` recipient disconnected); use codes outside `1001-1999` for your own.

## Quick Rules

1. **Document every tool parameter** in the docstring `Args:`; the model only sees the schema.
2. **Raise `ToolError`** for failures the user should hear about; let bugs raise normally so they are logged.
3. **Call `disallow_interruptions()`** before mutating tools and check `speech_handle.interrupted` in read-only ones.
4. **Pass `chat_ctx=self.chat_ctx.copy(exclude_instructions=True)`** on handoffs; summarize or truncate long histories.
5. **Use `AgentTask` for sub-flows** that return a value (consent, email, address) instead of ad-hoc state flags.
6. **Initialise `userdata`** with the session and keep it small and typed.
7. **Register RPC methods and send streams after the room is connected**, and always set `response_timeout` on `perform_rpc`.
8. **Allow-list MCP tools** (`allowed_tools`) and keep tokens in headers read from the environment.

---
## See also
- [Digital Garden: Knowledge Base](../../index.md)
- [LiveKit — Open-Source WebRTC Server and Agents Framework](./index.md)
- [LiveKit — Agents Framework](./02-agents-framework.md)
- [Pydantic](../pydantic/index.md)
- [Pydantic AI — Type-Safe Agents](../pydantic-ai/index.md)
- [Pipecat — Conversation: Turns, Context & Tools](../pipecat/02-conversation-turns-tools.md)
- [Agentic AI Architecture](../../agentic-ai-architecture/index.md)
- [WebSocket](../../api-architectures/04-websocket/index.md)
