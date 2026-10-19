---
date: 2026-10-19 12:00:00
tags:
  - python
  - libraries
  - pipecat
  - voice-ai
  - testing
---

# Pipecat — Testing & Evals

A voice agent has three things to test: **processors** (your frame logic), **flows** (context, tools and the LLM loop), and **behavior** (does the whole bot do the right thing in a conversation). Pipecat ships a utility for each level: `run_test` for processors, the same helper plus a fake LLM server for flows, and **Pipecat Evals** for behavior. All code below ran on pipecat-ai 1.13.0 with no provider keys.

## Test Layers

| Layer | Tool | Speed | Needs |
|-------|------|-------|-------|
| Processor | `pipecat.tests.utils.run_test` | ms | nothing |
| Flow (context, tools, aggregators) | `run_test` + a fake OpenAI-compatible server | ~1 s | `aiohttp` (any local server) |
| Behavior (conversation) | `pipecat eval run`, or `EvalSession` in pytest | seconds | A running bot; a judge LLM only for `eval:` criteria |
| Voice quality (audio) | DeepEval voice metrics on recorded calls | seconds | See [DeepEval Part 8b](../../llm-evaluation/01_metrics/08b_voice_metrics.md) |
| Real providers | A few smoke tests with real keys | slow, costs money | Provider keys, run nightly |

## Setup

```bash
uv add --dev pytest pytest-asyncio aiohttp
```

```ini
# pytest.ini
[pytest]
asyncio_mode = auto
```

## `run_test`: Testing a Processor

`run_test(processor, frames_to_send=[...], expected_down_frames=[...])` builds a small pipeline (`source → your processor → sink`), starts it, sends your frames, ends it, and returns the frames received downstream and upstream.

```python
from pipecat.frames.frames import TextFrame, TTSSpeakFrame
from pipecat.processors.frame_processor import FrameProcessor
from pipecat.tests.utils import run_test


class Redactor(FrameProcessor):
    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)
        if isinstance(frame, TextFrame):
            frame = TextFrame(text="".join("*" if c.isdigit() else c for c in frame.text))
        await self.push_frame(frame, direction)


async def test_redactor_masks_digits():
    down, up = await run_test(
        Redactor(),
        frames_to_send=[TextFrame("card 4111 1111"), TTSSpeakFrame("ok")],
        expected_down_frames=[TextFrame, TTSSpeakFrame],        # types, in order
    )
    assert down[0].text == "card **** ****"
```

A wrong expectation raises `AssertionError` and prints both lists, which makes failures easy to read:

```text
received DOWN frames = [TextFrame, ]
expected DOWN frames = [TextFrame, TextFrame, ]
AssertionError
```

`run_test` signature (1.13.0):

| Parameter | Meaning |
|-----------|---------|
| `processor` | The processor under test; a whole `Pipeline` also works |
| `frames_to_send` | Frames to push |
| `frames_to_send_direction` | `DOWNSTREAM` (default, from the start) or `UPSTREAM` (from the end) |
| `expected_down_frames`, `expected_up_frames` | Expected **types** in order; omit to skip the check |
| `observers`, `pipeline_params` | Attach observers or `PipelineParams` (for example `enable_metrics=True`) |
| `send_end_frame=True` | Send an `EndFrame` after your frames. With `False` you must end the run yourself |
| `ignore_start=True` | Do not list `StartFrame` in the captured frames |
| `enable_rtvi`, `start_timeout=1.0` | RTVI on or off; seconds to wait for startup before `TimeoutError` |

`SleepFrame(sleep=0.2)` (from `pipecat.tests.utils`) pauses between frames. It matters for flows that need time to finish, because `run_test` sends its `EndFrame` right after your last frame.

### What to test in processors

| Behavior | Assertion |
|----------|-----------|
| Transforms a frame | The text, fields or payload of the output frame |
| Passes everything else through | Unrelated frame types arrive unchanged and in order |
| Drops or filters | The expected list has fewer frames |
| Generates frames | Extra frame types appear in `expected_down_frames` |
| Reacts to direction | Send with `frames_to_send_direction=UPSTREAM` and check `up` |
| Timing | Use `SleepFrame` and observers (see the latency observer below) |

## Testing Flows with a Fake LLM Server

The OpenAI service accepts `base_url`, so you can test the **real** service, context handling, aggregators and function calling against a local server that returns scripted answers. This catches wiring mistakes that processor tests cannot: wrong aggregator order, a missing `result_callback`, a tool schema the service rejects.

`conftest.py`: a fake that returns a tool call first and text after the tool result:

```python
import json
import time

import pytest
from aiohttp import web


def sse(delta, finish=None) -> bytes:
    payload = {
        "id": "c", "object": "chat.completion.chunk", "created": int(time.time()), "model": "fake",
        "choices": [{"index": 0, "delta": delta, "finish_reason": finish}],
    }
    return f"data: {json.dumps(payload)}\n\n".encode()


@pytest.fixture
async def fake_llm():
    """A local OpenAI-compatible server: first request -> tool call, request after a tool result -> text."""
    requests: list[dict] = []

    async def completions(request: web.Request) -> web.StreamResponse:
        body = await request.json()
        requests.append(body)
        resp = web.StreamResponse(headers={"Content-Type": "text/event-stream"})
        await resp.prepare(request)
        if body["messages"][-1]["role"] == "tool":
            for part in ("Your order ", "ord-42 ", "has shipped."):
                await resp.write(sse({"role": "assistant", "content": part}))
            await resp.write(sse({}, "stop"))
        else:
            call = {"index": 0, "id": "call_1", "type": "function",
                    "function": {"name": "lookup_order", "arguments": json.dumps({"order_id": "ord-42"})}}
            await resp.write(sse({"role": "assistant", "tool_calls": [call]}))
            await resp.write(sse({}, "tool_calls"))
        await resp.write(b"data: [DONE]\n\n")
        return resp

    app = web.Application()
    app.add_routes([web.post("/v1/chat/completions", completions)])
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = site._server.sockets[0].getsockname()[1]
    yield f"http://127.0.0.1:{port}/v1", requests
    await runner.cleanup()
```

The test:

```python
from pipecat.frames.frames import LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
from pipecat.services.llm_service import FunctionCallParams
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.tests.utils import SleepFrame, run_test


async def test_tool_loop_end_to_end(fake_llm):
    base_url, requests = fake_llm
    calls = []

    async def lookup_order(params: FunctionCallParams, order_id: str):
        """Look up an order's status.

        Args:
            order_id: The order number.
        """
        calls.append(order_id)
        await params.result_callback({"order_id": order_id, "status": "shipped"})

    llm = OpenAILLMService(
        api_key="sk-test",
        base_url=base_url,
        settings=OpenAILLMService.Settings(model="fake", system_instruction="You are a support agent."),
    )
    context = LLMContext(messages=[{"role": "user", "content": "Where is ord-42?"}], tools=[lookup_order])
    pair = LLMContextAggregatorPair(context)

    await run_test(
        Pipeline([pair.user(), llm, pair.assistant()]),
        frames_to_send=[LLMRunFrame(), SleepFrame(sleep=1.0)],      # give the 2nd inference time to finish
    )

    assert calls == ["ord-42"]                                       # the tool ran with the model's arguments
    assert len(requests) == 2                                        # tool call, then the answer
    assert requests[0]["messages"][0] == {"role": "system", "content": "You are a support agent."}
    assert [m["role"] for m in requests[1]["messages"]] == ["system", "user", "assistant", "tool"]
    assert [m["role"] for m in context.messages] == ["user", "assistant", "tool", "assistant"]
    assert context.messages[-1]["content"] == "Your order ord-42 has shipped."
```

Result: `3 passed` (together with the two `run_test` tests above), three runs in a row, about 1.7 s each. The test proves: the tool schema is accepted, the handler receives the model's arguments, the tool result goes back to the model as a `tool` message, the system prompt comes from `system_instruction`, and the final answer is recorded in the context.

Without `SleepFrame`, `run_test`'s `EndFrame` can arrive before the second inference finishes and the context ends at the `tool` message. If a flow test is flaky, give it time before blaming the code.

To test **error paths**, make the fake return a malformed tool call, a 500, or a slow response (an `await asyncio.sleep(...)` in the handler plus a short `function_call_timeout_secs`), and assert on what the context and frames look like afterwards.

### Testing latency logic

Observers can be driven by synthetic frames. `UserBotLatencyObserver` measures from `VADUserStoppedSpeakingFrame` to `BotStartedSpeakingFrame`:

```python
from pipecat.frames.frames import (
    BotStartedSpeakingFrame, BotStoppedSpeakingFrame, UserStoppedSpeakingFrame,
    VADUserStartedSpeakingFrame, VADUserStoppedSpeakingFrame,
)
from pipecat.observers.user_bot_latency_observer import UserBotLatencyObserver
from pipecat.pipeline.worker import PipelineParams

obs = UserBotLatencyObserver()
measured = []


@obs.event_handler("on_latency_measured")
async def on_measured(observer, latency):
    measured.append(latency)


await run_test(
    Passthrough(),                                   # any processor that pushes every frame
    frames_to_send=[
        VADUserStartedSpeakingFrame(), VADUserStoppedSpeakingFrame(), UserStoppedSpeakingFrame(),
        SleepFrame(sleep=0.4), BotStartedSpeakingFrame(), SleepFrame(sleep=0.2), BotStoppedSpeakingFrame(),
    ],
    observers=[obs],
    pipeline_params=PipelineParams(enable_metrics=True),
)
assert 0.3 < measured[0] < 0.6                       # 0.40 s in the run
```

Frames named `UserStoppedSpeakingFrame` alone do **not** trigger the observer; it keys off the VAD frames. That is useful for regression-testing your own latency instrumentation, not for measuring real latency.

## Pipecat Evals

`pipecat eval` tests **behavior**: it connects to your running bot over a WebSocket, plays a conversation, and checks what the bot does. It uses the same pipeline, services and code you deploy, so a prompt, model or service change that breaks behavior shows up before users see it.

| Concept | Meaning |
|---------|---------|
| **Scenario** | A conversation plus the behavior you expect. A file with `turns:` is **scripted**; one with `persona:` is **simulated** |
| **Scripted** | You write the user's lines and what must follow each |
| **Simulated** | An LLM plays the caller from a persona and a goal; a judge decides whether the goal was met |
| **Suite** | Many scenarios (both kinds) run concurrently, starting one bot each: `pipecat eval suite` with a manifest |
| **Judge** | Checks natural-language criteria (`eval:`, `success:`). Default: a local **Ollama** model (`gemma4:12b`); can be another LLM or a classifier such as Jev |
| **Modality** | `text` (default) skips STT and TTS: fast and free. `audio` uses real speech through local TTS and STT |

### Make the bot evaluable

Add an `"eval"` entry to `transport_params`. The development runner already exposes the eval WebSocket at `/ws`; no extra wiring is needed (the worker adds RTVI automatically):

```python
from pipecat.evals.transport import EvalTransportParams
from pipecat.transports.base_transport import TransportParams

transport_params = {
    "eval": lambda: EvalTransportParams(audio_in_enabled=True, audio_out_enabled=True),
    "webrtc": lambda: TransportParams(audio_in_enabled=True, audio_out_enabled=True),
}
```

Start the bot with **`python bot.py`** (no `-t`): `-t eval` still works in 1.13.0 but prints a deprecation warning, because the harness connects to `ws://<host>:<port>/ws`.

### A scripted scenario

```yaml
# capital.yaml
name: capital_question

scenarios:
  - name: berlin
    turns:
      - user: "What is the capital of Germany?"
        expect:
          - event: response
            text_contains: "Berlin"
            text_excludes: "Paris"

  - name: wrong_expectation
    turns:
      - user: "What is the capital of Germany?"
        expect:
          - event: response
            text_contains: "Munich"
            within_ms: 3000
```

| Key | Meaning |
|-----|---------|
| `name` | File name (required) |
| `scenarios[].name`, `turns[]` | Scenario and its turns |
| `turn.user` | What the caller says (a string, or a list with `pause_ms:` silences); omit to just wait for the agent (a greeting) |
| `turn.audio` | A recording to play instead of synthesized speech |
| `turn.dtmf`, `turn.image` | Keypresses (instead of `user`), or an image |
| `turn.send_after` | Wait for an `event` and/or `delay_ms` before sending |
| `expect[].event` | `response` (the bot's reply), `function_call`, `llm_marker`, ... |
| `expect[].text_contains` / `text_excludes` | Substring checks, ignoring whitespace differences |
| `expect[].eval` | A natural-language criterion for the judge: *yes*, *no* or *continue* (collect more text) |
| `expect[].absent: true` + `within_ms` | Nothing matching may arrive in that window |
| `expect[].calls` | Match function calls by `name` and a subset of `args` |
| `expect[].within_ms` | Latency budget for this expectation (default 60 s) |
| `context:` | Seed the bot's LLM messages |
| `stop_on_failure` | Stop at the first failed turn (default true) |

Expectations of a turn must be met **in the listed order**, other events may arrive in between. Setting `within_ms` on every expectation is what keeps a failing scenario from waiting the 60-second default.

### Run it

```bash
python bot.py                                   # terminal 1
pipecat eval run capital.yaml -v --timeout 3    # terminal 2 (-t/--timeout: default per-expectation seconds)
```

Real output from 1.13.0 (the bot used a local fake LLM, so no judge was needed):

```text
      turn 0 → "What is the capital of Germany?"
        ✓ llm_response — "The capital of Germany is Berlin. "
  ✓ ws://localhost:7862/ws capital_question/berlin (164ms)
      turn 0 → "What is the capital of Germany?"
        ✗ llm_response — not satisfied within 3000ms: does not contain 'Munich'
  ✗ ws://localhost:7862/ws capital_question/wrong_expectation 0/1 turns (3047ms)

  Failures (1 of 2):

  ✗ ws://localhost:7862/ws capital_question/wrong_expectation 0/1 turns passed
      • turn 0 llm_response text_mismatch — not satisfied within 3000ms: does not contain 'Munich'

  1/2 passed, 1 failed  ·  3.2s
```

The command exits **0** when everything passes and **1** otherwise, so it drops straight into CI. Each scenario writes `<logs-dir>/<scenario>.eval.log` with the timeline: connect, handshake (`bot-ready`), the text sent, `llm_started`, `llm_response`, the verdict.

`pipecat eval run` options (from `--help`): `--bot-url` (default `ws://localhost:7860/ws`), `-v`/`--verbose`, `-a`/`--audio` (record each scenario's audio to `--record-dir`, default `recordings`), `--cache-dir` and `--no-cache` (cached synthesized user audio), `-t`/`--timeout` (default 60), `--logs-dir`, `-d`/`--debug` (also save `<scenario>.debug.log`). Subcommands: `run`, `judge` (judge saved conversations against a simulation's success and metrics), `suite`.

### Simulated scenarios

```yaml
name: refund_request

scenarios:
  - name: approved_refund
    persona: |
      Sam, asking for a refund on a damaged blender. Has the order number
      ready and answers one question at a time.
    goal: "Get a refund for the damaged blender."
    success: "the agent started a refund for the blender"
    metrics:
      - name: empathy
        criterion: "the reply acknowledges the customer's frustration"
        min_score: 1
```

An LLM plays Sam; at the end the judge decides whether `success` held and scores each metric (`min_score` is the pass threshold). Both files above load with `EvalScenarioFile.load(...)`: the first as `EvalScriptScenario`, the second as `EvalSimulationScenario` (verified). Simulated scenarios need the judge and persona LLMs (the same local Ollama model by default, or an OpenAI-compatible model through `simulator:` and `judge:` blocks; the persona model must support function calling), so they were **not run** here. Other simulation keys: `max_turns`, `max_duration_s`, `max_silence_s`, `runs` (honored by suites only).

### Judge, speech and modality configuration

| Block | Keys |
|-------|------|
| `user:` | `modality: text` (default) or `audio`; `speech.service` (`kokoro`, local), `voice`, `sample_rate`, `speed` (0.5-2.0), `language`, `factory` |
| `judge:` | `modality` (`text` or `audio`); `transcription.service` (`moonshine` default, or `whisper`), `eval.service` (`ollama`), `eval.model` (`gemma4:12b`), `eval.endpoint`, `eval.allow_continue`, `eval.explain_below` (0.75), `eval.explainer`, `eval.factory` |
| `simulator:` | `service`, `model`, `endpoint`, `extra`, `factory` (defaults to the judge's model) |
| anywhere | Keys set at file top level act as defaults; a scenario value replaces the default entirely. `!include path` is resolved relative to the scenario file |

Setup for the judge: `ollama pull gemma4:12b`. For audio mode: `uv add "pipecat-ai[kokoro,moonshine]"`.

### Evals as a library, in pytest

```python
import pytest

from pipecat.evals.scenario import EvalScenarioFile
from pipecat.evals.session import EvalSession

BOT_URL = "ws://localhost:7862/ws"


async def test_berlin():
    scenario = EvalScenarioFile.load("capital.yaml")["capital_question/berlin"]
    result = await EvalSession.from_scenario(scenario, BOT_URL).run()
    assert result.passed, "\n".join(str(f) for f in result.failures)


async def test_wrong_expectation_is_reported():
    scenario = EvalScenarioFile.load("capital.yaml")["capital_question/wrong_expectation"]
    result = await EvalSession.from_scenario(scenario, BOT_URL).run()
    assert not result.passed
```

Run against the bot above, both tests passed in 3.6 s: the first reported `passed=True`, `turns=['passed']`, 55 ms; the second reported a failure of `kind='text_mismatch'`.

| Result field | Meaning |
|--------------|---------|
| `EvalScriptResult.passed`, `failures`, `turns`, `duration_ms`, `events_seen`, `skipped` | Scripted run. Each turn's `status` is `passed`, `failed` or `not_run` (kept apart so unreached turns do not inflate a pass rate) |
| `EvalSimulationResult.passed`, `succeeded`, `reason`, `metrics`, `conversation`, `ended_by`, `confidence` | Simulated run; each metric has `score`, `passed`, `failure_kind` |
| `failure.kind` | A stable label (`text_mismatch`, `timeout`, `connect_failed`, `judge_no`, ...) for grouping failures across a sweep |

`from_scenario()` returns the right session type for the scenario kind. Import the classes from their submodules (`pipecat.evals.scenario`, `.session`, `.results`, `.judge`, `.suite`): `pipecat.evals` itself exports nothing. Customize with `EvalSessionParams(use_cache=False)`, `persona_llm=`, `user_tts=`, `bot_stt=`, and `EvalJudge(LLMClassifier(llm=llm), explainer=llm)` (the one-argument `EvalJudge(llm)` is deprecated since 1.12.0). `EvalManifest` and `EvalSuite` are the library behind `pipecat eval suite`.

!!! warning "Start the bot before the tests"
    The eval session connects to a **running** bot. In CI start `python bot.py` in the background (or use `pipecat eval suite`, which spawns the bots in a manifest itself), wait until the server is up (the runner logs `Uvicorn running on http://localhost:7860`), then run the tests.

## Scoring Audio Quality

Pipecat Evals judge *what the bot said and did*. To score the **audio** (clipping, dead streams, turn-taking gaps, voice consistency), run DeepEval's voice metrics over recorded calls. DeepEval has a `PipecatConnector` for simulated calls against a Pipecat bot, and its voice metrics also work on your own recordings; see [DeepEval Part 8b](../../llm-evaluation/01_metrics/08b_voice_metrics.md). `pipecat eval run --audio` records each scenario's conversation to `recordings/<scenario>.wav`.

## CI Checklist

1. `pytest` with `asyncio_mode = auto`; processor and flow tests on every commit (they take seconds and need no network).
2. A fake LLM fixture for tool, context and error-path tests; real providers only in a nightly smoke job.
3. Eval scenarios in the repository (`scenarios/*.yaml`), with `within_ms` on every expectation and `--timeout` set low in CI.
4. `python bot.py` started in the job, health-checked, then `pipecat eval run scenarios/` (exit code 1 fails the job).
5. Judge model pinned and available in CI (Ollama service container), or `text_contains` / `calls` assertions only for the pull-request job and `eval:` criteria in a nightly one.
6. Track `UserBotLatencyObserver` numbers from a nightly run and alert on regressions.
7. Pin `pipecat-ai` (`uv lock`); minor releases ship frequently and several names are deprecated for 2.0.0.

## Common Mistakes

| Mistake | Effect | Fix |
|---------|--------|-----|
| `run_test` with a flow that needs time | The `EndFrame` cuts it short; flaky context assertions | Add `SleepFrame(sleep=1.0)` |
| Using `UserStoppedSpeakingFrame` alone for latency tests | `UserBotLatencyObserver` never fires | Send the `VAD...` frames too |
| No `within_ms` on a failing expectation | The scenario waits the 60 s default | `within_ms` or `--timeout` |
| `-t eval` in the start command | Deprecation warning, removed in 2.0.0 | `python bot.py` and an `"eval"` entry in `transport_params` |
| Running evals before the bot is up | `connect_failed` | Wait until the runner logs `Uvicorn running ...` |
| `eval:` criteria without a judge | Judge cannot connect (Ollama default) | Start Ollama, or use `text_contains`, `calls` |
| Importing from `pipecat.evals` | Nothing is exported there | Import from the submodule that defines the class |
| Testing only with real providers | Slow, flaky, costs money | Fake LLM for flows, real providers in smoke tests |

---
## See also
- [Pipecat — Open-Source Framework for Voice Agents](./index.md)
- [Pipecat — Pipelines, Frames & Processors](./01-pipelines-frames-processors.md)
- [Pipecat — Transports, Runner & Production](./03-transports-runner-production.md)
- [DeepEval Guide — Part 8b: Voice Evaluation](../../llm-evaluation/01_metrics/08b_voice_metrics.md)
- [aiohttp — Testing](../aiohttp/03-testing.md)
- [Pydantic AI — Testing, Evals & Observability](../pydantic-ai/04-testing-evals.md)
