---
date: 2026-10-24 12:00:00
tags:
  - python
  - libraries
  - livekit
  - voice-ai
  - testing
  - evals
---

# LiveKit — Testing & Evals

A LiveKit voice agent has four things to test: the **agent logic** (prompts, tools, handoffs, tasks) in text-only sessions, **tokens and webhooks** (plain functions), the **worker and dispatch path** against a real server, and the **audio quality** of the full pipeline. The Agents framework ships test helpers for the first; the rest uses the Python SDKs, a local server and `lk`.

## Test Layers

| Layer | Tool | Speed | Needs |
|-------|------|-------|-------|
| Agent logic | `AgentSession` + `session.run(user_input=...)` + `result.expect` | ~1 s | A fake OpenAI-compatible server (or a real LLM) |
| Tool code, turn hooks, nodes | Plain `pytest`, `mock_tools`, call the hook or node directly | ms | Nothing |
| Tokens, webhooks | `livekit-api` + PyJWT | ms | Nothing |
| Behaviour | `judge()` and `JudgeGroup` (`livekit.agents.evals`) | seconds | A judge LLM: scripted offline, real in a nightly run |
| Worker, dispatch, room I/O | A local `livekit-server --dev`, a worker process, `livekit.rtc` client | ~20 s | Docker |
| Load | `lk perf load-test`, `lk perf agent-load-test` | minutes | A running server (and agent) |
| Voice quality | DeepEval voice metrics on recordings | seconds | See [DeepEval Part 8b](../../llm-evaluation/01_metrics/08b_voice_metrics.md) |
| Real providers | A few smoke tests with real keys | slow, costs money | Provider keys, nightly |

Agent Simulations (`lk agent simulate`) run on LiveKit Cloud and are not covered here.

## Setup

```bash
uv add --dev pytest pytest-asyncio aiohttp "livekit-agents[openai]"
```

```ini
# pytest.ini
[pytest]
asyncio_mode = auto
markers =
    integration: needs a running LiveKit server
```

## `AgentSession` in Tests

Create a session with only an LLM (no STT, TTS, VAD, room), start it with the agent and drive it with text:

```python
async with AgentSession(llm=llm, userdata=CallState()) as session:
    await session.start(SupportAgent())
    result = await session.run(user_input="Where is ord-42?")
    result.expect.next_event().is_function_call(name="lookup_order", arguments={"order_id": "ord-42"})
    result.expect.next_event().is_function_call_output()
    result.expect.next_event().is_message(role="assistant")
    result.expect.no_more_events()
```

`session.run(user_input=..., output_type=None)` returns a `RunResult` for one turn and can be awaited; call it repeatedly for a multi-turn conversation (history accumulates). Without an `llm` argument the agent's own `llm` is used.

| `result.expect` | Meaning |
|-----------------|---------|
| `next_event()` | Move to the next event and return an assertion object; `next_event(type="message")` filters by type |
| `.is_message(role="assistant")` | The event is a chat message; chain `await ....judge(llm, intent="...")` |
| `.is_function_call(name=..., arguments={...})` | A tool call with these arguments (compared as parsed JSON) |
| `.is_function_call_output(output=..., is_error=...)` | The tool result; `event().item.output`, `event().item.is_error` |
| `.is_agent_handoff(new_agent_type=...)` | A handoff event |
| `contains_message(role=...)`, `contains_function_call(name=..., arguments=...)`, `contains_function_call_output(...)`, `contains_agent_handoff(new_agent_type=...)` | Search the whole turn; preferred when the model may take several steps |
| `skip_next(n)`, `skip_next_event_if(type=..., role=...)` | Skip events |
| `no_more_events()` | The turn is complete |
| `expect[0]`, `expect[1:3]` | Index or slice the events |

A failed assertion prints the events of the turn; `LIVEKIT_EVALS_VERBOSE=1 uv run pytest -s -o log_cli=true` prints judge verdicts.

## A Fake OpenAI-Compatible Server

The `openai` plugin takes `base_url`, so the **real** LLM class, tool schema generation and tool loop run against a scripted local server. `conftest.py`:

```python
import json

import pytest
from aiohttp import web


def chunk(delta, finish=None) -> bytes:
    body = {"id": "c", "object": "chat.completion.chunk", "created": 0, "model": "fake",
            "choices": [{"index": 0, "delta": delta, "finish_reason": finish}]}
    return f"data: {json.dumps(body)}\n\n".encode()


class FakeLLM:
    """Scripted chat server. The first matching rule wins; every request body is recorded."""

    def __init__(self):
        self.requests: list[dict] = []
        self.rules: list = []

    def when(self, matcher, *, text="", call=None):             # call = (tool name, arguments dict)
        self.rules.append((matcher, text, call))


@pytest.fixture
async def fake_llm():
    fake = FakeLLM()

    async def completions(request: web.Request) -> web.StreamResponse:
        body = await request.json()
        fake.requests.append(body)
        text, call = "No scripted answer.", None
        for matcher, t, c in fake.rules:
            if matcher(body["messages"]):
                text, call = t, c
                break
        resp = web.StreamResponse(headers={"Content-Type": "text/event-stream"})
        await resp.prepare(request)
        if call:
            fn = {"name": call[0], "arguments": json.dumps(call[1])}
            await resp.write(chunk({"role": "assistant", "tool_calls": [{"index": 0, "id": "call_1", "type": "function", "function": fn}]}))
            await resp.write(chunk({}, "tool_calls"))
        else:
            for word in text.split(" "):
                await resp.write(chunk({"role": "assistant", "content": word + " "}))
            await resp.write(chunk({}, "stop"))
        await resp.write(b"data: [DONE]\n\n")
        return resp

    app = web.Application()
    app.add_routes([web.post("/v1/chat/completions", completions)])
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    fake.url = f"http://127.0.0.1:{site._server.sockets[0].getsockname()[1]}/v1"
    yield fake
    await runner.cleanup()
```

Rules are predicates over the OpenAI `messages` list: the tool-result round trip is `lambda m: m[-1]["role"] == "tool"`; a handoff or task has a different system prompt in `m[0]`, which a matcher can use to script each agent separately. Use the agents from [03](./03-tools-handoffs-workflows.md) (`SupportAgent`, `Intake`):

```python
from livekit.agents import AgentSession, mock_tools
from livekit.plugins import openai

from my_agent import CallState, SupportAgent         # the agents from 03


def last_role(m): return m[-1]["role"]
def last_user_text(m): return next(x["content"] for x in reversed(m) if x["role"] == "user")


@pytest.fixture
def llm(fake_llm):
    return openai.LLM(model="fake", base_url=fake_llm.url, api_key="sk-test")


async def test_tool_error_reaches_model(fake_llm, llm):
    fake_llm.when(lambda m: last_role(m) == "tool", text="That order number looks wrong.")
    fake_llm.when(lambda m: "bad" in last_user_text(m), call=("lookup_order", {"order_id": "bad-1"}))
    async with AgentSession(llm=llm, userdata=CallState()) as session:
        await session.start(SupportAgent())
        result = await session.run(user_input="Check bad-1")
        result.expect.next_event().is_function_call(name="lookup_order")
        out = result.expect.next_event().is_function_call_output()
        assert out.event().item.is_error and "Unknown order id" in out.event().item.output
        result.expect.next_event().is_message(role="assistant")


async def test_mocked_tool(fake_llm, llm):
    fake_llm.when(lambda m: last_role(m) == "tool", text="Our order system is down.")
    fake_llm.when(lambda m: True, call=("lookup_order", {"order_id": "ord-42"}))
    with mock_tools(SupportAgent, {"lookup_order": lambda: RuntimeError("order service is down")}):
        async with AgentSession(llm=llm, userdata=CallState()) as session:
            await session.start(SupportAgent())
            result = await session.run(user_input="Where is ord-42?")
            result.expect.next_event().is_function_call(name="lookup_order")
            result.expect.next_event().is_function_call_output(is_error=True)
            assert session.userdata.handled == []                 # the real tool never ran
```

Handoffs and tasks use the same pattern: script each agent through its system prompt in `m[0]` (`lambda m: "billing team" in str(m[-1]["content"])`), then assert `result.expect.contains_agent_handoff(new_agent_type=BillingAgent)` and `session.current_agent`; for an `AgentTask`, script its tool call (`record_consent`) and assert `contains_function_call(name="record_consent", arguments={"agreed": True})`.

`mock_tools(AgentClass, {"tool": fn})` replaces tool **execution** only; the model still sees the real schema. A mock may declare any subset of the parameters; returning an exception instance makes the tool fail. `mock_tools(..., session=session)` keeps mocks for the session's life. Assert on the requests the server recorded (`fake_llm.requests[-1]["messages"]`) to check what the model was sent: system prompt, injected facts, tool results.

### Unit-testing the turn hook

`session.run(user_input=...)` and text on `lk.chat` skip `on_user_turn_completed`, so test the hook directly:

```python
import pytest
from livekit.agents import ChatContext, ChatMessage, StopResponse

import my_agent
from my_agent import Guarded


async def test_turn_hook(monkeypatch):
    async def fake_search(query: str) -> str:
        return "the store opens at 9am"

    monkeypatch.setattr(my_agent, "search_kb", fake_search)    # my_agent: the module that defines Guarded and search_kb (see 03)
    agent = Guarded()
    ctx = ChatContext()
    await agent.on_user_turn_completed(ctx, ChatMessage(role="user", content=["When do you open?"]))
    assert "opens at 9am" in ctx.items[-1].text_content
    with pytest.raises(StopResponse):
        await agent.on_user_turn_completed(ChatContext(), ChatMessage(role="user", content=["  "]))
```

Code that calls `get_job_context()` needs a job: wrap it in `fake_job_context(job_metadata='{"user_id": "12345"}')` from `livekit.agents.testing` (yields a `JobContext`; no worker or server).

## Judges and Behavioural Evals

`judge()` asks an LLM whether one message fulfils an intent; `JudgeGroup` grades a whole conversation with several judges.

```python
await result.expect.next_event().is_message(role="assistant").judge(judge_llm, intent="reports the shipping status")
```

```python
from livekit.agents.evals import Judge, JudgeGroup, JudgmentResult, task_completion_judge


class ShippedMentionJudge(Judge):
    """Deterministic judge: no LLM call."""

    def __init__(self):
        super().__init__(name="mentions_shipping")

    async def evaluate(self, *, chat_ctx, reference=None, llm=None):
        ok = any("shipped" in (m.text_content or "") for m in chat_ctx.messages() if m.role == "assistant")
        return JudgmentResult(verdict="pass" if ok else "fail", reasoning="found" if ok else "missing")


async def test_conversation_passes_judges(fake_llm, llm):
    fake_llm.when(lambda m: "evaluator for conversational" in m[0]["content"],
                  call=("submit_verdict", {"verdict": "pass", "reasoning": "task done"}))   # scripted judge LLM
    fake_llm.when(lambda m: True, text="Your order has shipped.")
    async with AgentSession(llm=llm, userdata=CallState()) as session:
        await session.start(SupportAgent())
        await session.run(user_input="Where is my order?")
        result = await JudgeGroup(llm=llm, judges=[task_completion_judge(), ShippedMentionJudge()]).evaluate(session.history)
        assert result.all_passed and result.score == 1.0
```

| Item | Detail |
|------|--------|
| Built-in judges | `task_completion_judge`, `handoff_judge`, `accuracy_judge`, `tool_use_judge`, `safety_judge`, `relevancy_judge`, `coherence_judge`, `conciseness_judge` (each takes an optional `llm`) |
| Verdicts | `pass`, `fail`, `maybe`; `EvaluationResult` has `judgments` (by name), `score` (pass=1, maybe=0.5, fail=0), `all_passed`, `any_passed`, `majority_passed`, `none_failed` |
| Custom judges | Subclass `Judge`, implement `evaluate(*, chat_ctx, reference=None, llm=None)`; deterministic checks need no LLM |
| Reference | `evaluate(chat_ctx, reference=expected_conversation)` compares against a reference |
| Judge model | A different, stronger model than the agent's; temperature 0; pin it |

Offline, script the judge with the fake server as above to test the *wiring* (grouping, thresholds, reports). For real quality gates run a nightly job with a real judge (`openai.LLM(model="gpt-4o-mini")`), a fixed set of scripted user turns (`pytest.mark.parametrize`), several samples per case, and a pass-rate threshold instead of an exact match. Use deterministic judges for hard rules (no PII spoken, tool called before answer, handoff happened) and LLM judges for tone and task completion. Voice metrics such as word error rate and latency percentiles on recorded calls are covered in [DeepEval voice metrics](../../llm-evaluation/01_metrics/08b_voice_metrics.md); the same ideas for a frame-based stack are in [Pipecat testing](../pipecat/04-testing-evals.md).

## Tokens and Webhooks

Both are plain functions: test them with negative cases ([PyJWT test patterns](../pyjwt/05-testing-token-factory.md)).

```python
import base64
import datetime
import hashlib

import jwt
import pytest
from livekit import api

KEY, SECRET = "APIexample", "secret-at-least-32-characters-long"


def token(secret=SECRET, ttl=datetime.timedelta(minutes=5)) -> str:
    return (api.AccessToken(KEY, secret).with_identity("a").with_ttl(ttl)
            .with_grants(api.VideoGrants(room_join=True, room="r")).to_jwt())


@pytest.mark.parametrize(
    "bad, error",
    [(token(secret="x" * 40), jwt.InvalidSignatureError), (token(ttl=datetime.timedelta(minutes=-10)), jwt.ExpiredSignatureError)],
)
def test_verifier_rejects_bad_tokens(bad, error):
    with pytest.raises(error):
        api.TokenVerifier(KEY, SECRET).verify(bad)


def signed_webhook(body: str) -> str:
    digest = base64.b64encode(hashlib.sha256(body.encode()).digest()).decode()
    return api.AccessToken(KEY, SECRET).with_sha256(digest).to_jwt()


def test_webhook_rejects_tampered_body():
    body = '{"event": "participant_joined", "room": {"name": "r"}, "participant": {"identity": "alice"}}'
    receiver = api.WebhookReceiver(api.TokenVerifier(KEY, SECRET))
    assert receiver.receive(body, signed_webhook(body)).event == "participant_joined"
    with pytest.raises(Exception, match="hash mismatch"):
        receiver.receive(body.replace("alice", "mallory"), signed_webhook(body))
```

`TokenVerifier` also checks the issuer (`InvalidIssuerError`) and requires `exp`. Also assert grants (`can_publish`, `room`) on the tokens your backend mints.

## Worker and Dispatch Against a Real Server

Start `livekit/livekit-server --dev`, run the worker as a subprocess, dispatch, join with `livekit.rtc` and exchange text. The worker (`agent_text.py`) is text-only and takes its LLM URL from the environment:

```python
import os

from livekit import agents
from livekit.agents import Agent, AgentServer, AgentSession, JobContext, room_io
from livekit.plugins import openai

server = AgentServer(port=0, num_idle_processes=1, load_threshold=float("inf"))   # random health port, no load shedding in tests


@server.rtc_session(agent_name="support-test")
async def entrypoint(ctx: JobContext) -> None:
    session = AgentSession(llm=openai.LLM(model="fake", base_url=os.environ["LLM_BASE_URL"], api_key="sk-test"))
    await session.start(
        agent=Agent(instructions="You are a support agent."),
        room=ctx.room,
        room_options=room_io.RoomOptions(audio_input=False, audio_output=False),
    )


if __name__ == "__main__":
    agents.cli.run_app(server)
```

The test:

```python
import asyncio
import os
import subprocess
import sys
import time

import pytest
from livekit import api, rtc

URL, KEY, SECRET = "ws://localhost:7880", "devkey", "secret"


@pytest.fixture
def worker(fake_llm):
    env = {**os.environ, "LIVEKIT_URL": URL, "LIVEKIT_API_KEY": KEY, "LIVEKIT_API_SECRET": SECRET, "LLM_BASE_URL": fake_llm.url}
    proc = subprocess.Popen([sys.executable, "agent_text.py", "start"], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    deadline = time.time() + 30
    for line in proc.stdout:                                       # wait until the worker registered
        if "registered worker" in line:
            break
        assert time.time() < deadline and proc.poll() is None, "worker did not start"
    yield proc
    proc.terminate()
    proc.wait(timeout=30)


@pytest.mark.integration
async def test_dispatched_agent_answers_text(worker, fake_llm):
    fake_llm.when(lambda m: True, text="Your order has shipped.")
    room_name = f"it-{int(time.time())}"
    token = api.AccessToken(KEY, SECRET).with_identity("tester").with_grants(api.VideoGrants(room_join=True, room=room_name)).to_jwt()
    replies: asyncio.Queue[str] = asyncio.Queue()
    room = rtc.Room()

    async def read(reader, _identity):
        text = await reader.read_all()
        if reader.info.attributes.get("lk.transcription_final") == "true":
            await replies.put(text)

    room.register_text_stream_handler("lk.transcription", lambda r, p: asyncio.create_task(read(r, p)))
    await room.connect(URL, token)
    try:
        async with api.LiveKitAPI("http://localhost:7880", KEY, SECRET) as lk:
            await lk.agent_dispatch.create_dispatch(api.CreateAgentDispatchRequest(agent_name="support-test", room=room_name))
        while not any(p.kind == rtc.ParticipantKind.PARTICIPANT_KIND_AGENT for p in room.remote_participants.values()):
            await asyncio.sleep(0.2)                               # wrap in asyncio.wait_for in real code
        await asyncio.sleep(3)                                     # let the session link to the participant
        await room.local_participant.send_text("Where is my order?", topic="lk.chat")
        assert "shipped" in await asyncio.wait_for(replies.get(), 30)
    finally:
        await room.disconnect()
```

This checks registration, explicit dispatch, room I/O, the text channel and the LLM round trip with no audio and no provider keys. Extend it for RPC (`perform_rpc` to the agent), metadata (`CreateAgentDispatchRequest(metadata=...)`) and SIP dispatch rules.

## Load Testing

```bash
lk --dev perf load-test --room lt --audio-publishers 20 --subscribers 20 --duration 2m      # the SFU
lk --dev perf agent-load-test --rooms 10 --agent-name support --duration 5m                 # a running agent worker
```

`load-test` flags: `--video-publishers`, `--audio-publishers`, `--subscribers`, `--num-per-second` (join rate, default 5), `--video-resolution`, `--video-codec`, `--layout`, `--no-simulcast`, `--duration`; the report lists tracks, bitrate and packet loss per subscriber. `agent-load-test` opens `--rooms`, dispatches `--agent-name` and drives each room with an echo track (`--echo-speech-delay`: pause between the echo speaking and the agent starting to speak, default 5 s). Watch `lk_agents_worker_load`, job counts and per-turn latency ([04](./04-telephony-egress-production.md#observability)) and find the job count where load crosses `load_threshold`.

## CI

```yaml
name: voice-agent-tests
on: [push, pull_request]
jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
      - run: uv sync
      - run: uv run pytest -m "not integration"
  integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
      - run: docker run -d -p 7880:7880 -p 7881:7881 -p 7882:7882/udp livekit/livekit-server:v1.13.10 --dev --bind 0.0.0.0
      - run: uv sync && uv run pytest -m integration
```

Run unit tests on every push, integration on pull requests, real-provider smoke and judge-based evals nightly with keys from the CI secret store. `lk agent debugger` (text mode, no LiveKit project needed) is handy for ad-hoc scripted conversations: `lk agent debugger start`, `lk agent debugger say --json "What are your hours?"`.

## Quick Rules

1. **Test logic in text-only sessions** (`AgentSession(llm=...)`, no audio, no room) with a fake OpenAI-compatible server.
2. **Use `contains_*` assertions** for multi-step turns and `next_event()` chains for exact flows; end with `no_more_events()` when the turn must be complete.
3. **Mock tool execution** with `mock_tools`, and assert on the requests the model received.
4. **Call hooks and nodes directly**; `session.run` bypasses `on_user_turn_completed`.
5. **Script judges offline, use a real judge nightly**, with thresholds and several samples, not exact output matching.
6. **Test token and webhook code with negative cases** (bad signature, wrong issuer, expired, tampered body).
7. **Keep one worker-to-room integration test** against `--dev` in Docker; mark it `integration`.
8. **Load test the SFU and the agent separately**, then derive worker capacity from the agent test.

---
## See also
- [Digital Garden: Knowledge Base](../../index.md)
- [LiveKit — Open-Source WebRTC Server and Agents Framework](./index.md)
- [LiveKit — Tools, Handoffs & Workflows](./03-tools-handoffs-workflows.md)
- [Pipecat — Testing & Evals](../pipecat/04-testing-evals.md)
- [DeepEval Guide — Part 8b: Voice Evaluation](../../llm-evaluation/01_metrics/08b_voice_metrics.md)
- [Pytest](../pytest/index.md)
- [PyJWT — JSON Web Tokens](../pyjwt/index.md)
- [Docker](../../tools/docker/index.md)
