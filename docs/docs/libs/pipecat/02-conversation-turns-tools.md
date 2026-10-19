---
date: 2026-10-19 12:00:00
tags:
  - python
  - libraries
  - pipecat
  - voice-ai
  - function-calling
---

# Pipecat — Conversation: Turns, Context & Tools

How a voice agent actually holds a conversation: the services in the cascade, the shared **context**, **VAD and turn detection** (who is speaking, when to answer), **interruptions**, and **function calling**. Verified on pipecat-ai 1.13.0; code that needs provider keys is marked as not run.

## The Cascade

```python
from pipecat.services.deepgram.stt import DeepgramSTTService          # extra: deepgram
from pipecat.services.openai.llm import OpenAILLMService               # extra: openai
from pipecat.services.cartesia.tts import CartesiaTTSService           # no extra needed

stt = DeepgramSTTService(api_key=os.getenv("DEEPGRAM_API_KEY"))
llm = OpenAILLMService(
    api_key=os.getenv("OPENAI_API_KEY"),
    settings=OpenAILLMService.Settings(
        model="gpt-5-mini",
        system_instruction="You are a friendly support agent. Keep answers under two sentences.",
    ),
)
tts = CartesiaTTSService(api_key=os.getenv("CARTESIA_API_KEY"), settings=CartesiaTTSService.Settings(voice="..."))
```

(Not run: needs keys. The `OpenAILLMService` construction and its `Settings(model=..., system_instruction=...)` were run with a placeholder key.)

| Group | Examples (150+ integrations) |
|-------|------------------------------|
| STT | Deepgram, AssemblyAI, Google, Azure, AWS, OpenAI (Whisper), Speechmatics |
| LLM | OpenAI, Anthropic, Gemini, Groq, Mistral, AWS, Azure, Ollama and OpenAI-compatible endpoints via `base_url` |
| TTS | Cartesia, ElevenLabs, Deepgram, OpenAI, Google, Azure, AWS |
| Speech-to-speech | OpenAI Realtime, Gemini Live, AWS Nova Sonic, Azure Voice Live, Ultravox |
| Local | Kokoro and Piper (TTS), Moonshine and Whisper (STT) via the `kokoro`, `piper`, `moonshine`, `whisper` extras |

Settings classes are nested on the service (`OpenAILLMService.Settings`) and read back from the read-only `service.settings`. Any OpenAI-compatible server works with `OpenAILLMService(base_url=...)`, which is also how the tests in [04](./04-testing-evals.md) run without network access.

## Context and Aggregators

The conversation lives in an `LLMContext`: `messages`, `tools` and `tool_choice`, in an OpenAI-compatible format that adapters translate for other providers.

```python
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)

context = LLMContext(messages=[{"role": "developer", "content": "Keep answers short."}], tools=[lookup_order])
pair = LLMContextAggregatorPair(
    context,
    user_params=LLMUserAggregatorParams(vad_analyzer=SileroVADAnalyzer()),
)
# pipeline: [..., stt, pair.user(), llm, tts, transport.output(), pair.assistant()]
```

| Item | Detail |
|------|--------|
| Roles | `user`, `assistant`, `developer`, `tool`. A `developer` message carries task instructions such as length limits |
| **System prompt** | Set `system_instruction` in the LLM service's `Settings`. The service prepends it to every request, so it survives context replacement and summarization. A `"system"` message in the context is deprecated since 1.9.0 (removal in 2.0.0); if both exist `system_instruction` wins and a warning is logged |
| User aggregator | Adds a `user` message when a `TranscriptionFrame` arrives; must sit **after STT**. Also runs VAD and the turn strategies |
| Assistant aggregator | Adds an `assistant` message from `TTSTextFrame`s (what was actually spoken); must sit **after `transport.output()`**, so context stays correct after an interruption |
| Function results | Stored in the context automatically as `tool` messages |
| Read the context | `pair.user().context` / `pair.assistant().context`, or keep the `context` object |

### Changing the context at runtime

Push a frame into the pipeline (`await worker.queue_frame(...)`):

| Frame | Effect |
|-------|--------|
| `LLMMessagesAppendFrame(messages, run_llm=True)` | Add messages |
| `LLMMessagesUpdateFrame(messages)` | Replace the whole context |
| `LLMMessagesTransformFrame(...)` | Edit with a transform function |
| `LLMSetToolsFrame(...)` | Replace the active tools mid-conversation |
| `TTSSpeakFrame("...", append_to_context=True)` | Make the bot say text and record it in context |
| `LLMRunFrame()` | Run the LLM on the current context (a greeting at the start) |

`run_llm=True` triggers a reply; the default (`None`) updates silently.

### Long calls

Context grows with every turn. Turn on automatic summarization on the **assistant** aggregator before long sessions hit token or latency limits:

```python
from pipecat.processors.aggregators.llm_response_universal import LLMAssistantAggregatorParams

pair = LLMContextAggregatorPair(
    context,
    user_params=LLMUserAggregatorParams(vad_analyzer=SileroVADAnalyzer()),
    assistant_params=LLMAssistantAggregatorParams(enable_auto_context_summarization=True),
)
```

`LLMAssistantAggregatorParams` (verified) has `enable_auto_context_summarization=False` and `auto_context_summarization_config=` (`LLMAutoContextSummarizationConfig`); the summarizer itself is `LLMContextSummarizer` in `pipecat.processors.aggregators.llm_context_summarizer`. Not run end to end (needs a real model to write summaries).

## Voice Activity Detection (VAD)

VAD tells the pipeline when someone is speaking. Pipecat ships **Silero VAD** (it runs locally on the CPU and needs no extra download):

```python
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams

vad = SileroVADAnalyzer(params=VADParams(stop_secs=0.2))
```

Verified `VADParams` defaults:

| Parameter | Default | Effect |
|-----------|---------|--------|
| `confidence` | 0.7 | Minimum model confidence that audio is speech |
| `start_secs` | 0.2 | Speech must last this long to count as started. Lower is more responsive but triggers on clicks |
| `stop_secs` | 0.2 | Silence this long ends the speech segment. Lower means faster replies and more cut-offs |
| `min_volume` | 0.6 | Minimum loudness |

Leave `confidence` and `min_volume` alone unless you have profiled your audio; use an upstream noise filter (RNNoise, Krisp Viva, ai-coustics) for noisy input. If you change `stop_secs`, re-measure your STT latency and pass it to the STT service as `ttfs_p99_latency` so turn timing stays correct. Attach VAD to the **user aggregator**: `LLMUserAggregatorParams(vad_analyzer=vad)`.

## User Turns

VAD hears *speech*; **turn strategies** decide when a *turn* starts and ends, which is when the bot interrupts or answers.

```python
from pipecat.turns.user_start import MinWordsUserTurnStartStrategy, TranscriptionUserTurnStartStrategy, VADUserTurnStartStrategy
from pipecat.turns.user_stop import SpeechTimeoutUserTurnStopStrategy, TurnAnalyzerUserTurnStopStrategy
from pipecat.turns.user_turn_strategies import UserTurnStrategies

params = LLMUserAggregatorParams(
    vad_analyzer=SileroVADAnalyzer(),
    user_turn_strategies=UserTurnStrategies(
        start=[VADUserTurnStartStrategy(), TranscriptionUserTurnStartStrategy()],
        stop=[SpeechTimeoutUserTurnStopStrategy(user_speech_timeout=0.6)],
    ),
)
```

| Strategy | Starts / ends a turn when |
|----------|---------------------------|
| `VADUserTurnStartStrategy` | VAD detects speech (default) |
| `TranscriptionUserTurnStartStrategy` | A transcript arrives even though VAD missed it |
| `MinWordsUserTurnStartStrategy(min_words=3)` | The user said at least N words: ignores "uh-huh" and coughs |
| `WakePhraseUserTurnStartStrategy` | A wake phrase was heard |
| `ExternalUserTurnStartStrategy`, `ExternalUserTurnStopStrategy` | An external system (a speech-to-speech service, a vendor) decides |
| **`TurnAnalyzerUserTurnStopStrategy`** | A turn analyzer says the user finished their thought. **Default**, with `LocalSmartTurnAnalyzerV3` |
| `SpeechTimeoutUserTurnStopStrategy(user_speech_timeout=0.6)` | Silence for the timeout after a transcript: simpler, predictable |
| `LLMTurnCompletionUserTurnStopStrategy`, `EagerUserTurnStopStrategy`, `DeferredUserTurnStopStrategy` | LLM-judged completion, speculative early start, or deferred end |

All start strategies take `enable_interruptions=True` by default. `LocalSmartTurnAnalyzerV3` is an audio model that judges whether the user is done (it builds offline in 1.13.0; the `local-smart-turn` extra covers its dependencies). Defaults in 1.13.0: Smart Turn for turn end, `SileroVADAnalyzer` with `stop_secs=0.2` for speech.

Choosing a stop strategy:

| You want | Use |
|----------|-----|
| Natural pauses ("my number is... 555...") not treated as the end | Smart Turn (default) |
| Fully predictable timing and the smallest dependencies | `SpeechTimeoutUserTurnStopStrategy` |
| The platform decides (telephony vendor, realtime model) | `External...` strategies |

### Other `LLMUserAggregatorParams` fields

Verified in 1.13.0: `user_turn_stop_timeout=5.0`, `user_idle_timeout=0` (off), `audio_idle_timeout=1.0`, `user_mute_strategies=[...]`, `filter_incomplete_user_turns=False`, `add_tool_change_messages=False`, `empty_user_turn=EmptyUserTurnConfig(...)`.

- **Empty turns** (1.12.0): when the user spoke but nothing was recognized, the aggregator can prompt recovery. `EmptyUserTurnConfig` has `interrupted_prompt` (asks the user to repeat when the bot was cut off), `idle_prompt` and `max_consecutive_recoveries=1`. It is on by default.
- **Mute strategies** stop the user from interrupting at the wrong moment: `FirstSpeechUserMuteStrategy` (during the first bot speech), `MuteUntilFirstBotCompleteUserMuteStrategy`, `FunctionCallUserMuteStrategy` (while a tool runs), `AlwaysUserMuteStrategy`.
- **`filter_incomplete_user_turns=True`** drops turns the model judges unfinished.

## Interruptions

When a user turn starts, the bot stops speaking and in-flight work is cancelled (`InterruptionFrame`; system frames survive, queued speech is dropped). They are on by default through `enable_interruptions` on the start strategies. Keep them on for natural conversations; if the bot is cut off by background noise, raise `MinWordsUserTurnStartStrategy(min_words=...)` or use a noise filter, rather than turning interruptions off. The assistant aggregator records only the part the user actually heard.

## Function Calling

A tool is an `async def` whose first parameter is `params: FunctionCallParams`. Type hints and a Google-style docstring become the schema:

```python
from pipecat.services.llm_service import FunctionCallParams


async def lookup_order(params: FunctionCallParams, order_id: str):
    """Look up an order's status.

    Args:
        order_id: The order number the customer provided.
    """
    await params.result_callback({"order_id": order_id, "status": "shipped"})


context = LLMContext(tools=[lookup_order])        # "direct function": schema derived from the signature
```

The schema the OpenAI adapter produced from that function (run on 1.13.0):

```json
{
  "type": "function",
  "function": {
    "name": "lookup_order",
    "description": "Look up an order's status.",
    "parameters": {
      "type": "object",
      "properties": {"order_id": {"type": "string", "description": "The order number the customer provided."}},
      "required": ["order_id"]
    }
  }
}
```

### Ways to register tools

| Way | When |
|-----|------|
| **Direct functions** in `LLMContext(tools=[fn, ...])` | Preferred: one place, schema from the signature |
| `FunctionSchema(name, description, properties, required, handler=fn)` | Explicit control, for example a strict `enum` |
| `llm.register_function("name", handler)` plus a handler-free schema | Register a handler separately from the schema |
| `ToolsSchema(standard_tools=[...], custom_tools={...})` | Mix standard tools with provider-native tool definitions |
| `LLMSetToolsFrame` | Change the tool set mid-conversation |

### `FunctionCallParams`

`function_name`, `tool_call_id`, `arguments`, `llm`, `pipeline_worker`, `context`, `result_callback`, `app_resources` (shared objects passed to `PipelineWorker(app_resources=...)`: database pool, HTTP client) and `worker_runner`.

`await params.result_callback(result, properties=FunctionCallResultProperties(...))`: `run_llm` (run the model after this result; default yes), `on_context_updated` (callback after the result is in context), `is_final=False` (intermediate update on an async call).

### Synchronous vs asynchronous tools

```python
from pipecat.adapters.schemas.direct_function import tool_options


@tool_options(cancel_on_interruption=False, timeout_secs=30, cancellable_by_llm=True)
async def generate_report(params: FunctionCallParams, topic: str):
    """Generate a report on a topic.

    Args:
        topic: The subject of the report.
    """
    ...
```

`tool_options(fn=None, *, cancel_on_interruption=True, timeout_secs=None, cancellable_by_llm=False)` (signature verified).

| Option | Behavior |
|--------|----------|
| `cancel_on_interruption=True` (default) | **Synchronous**: the LLM waits for the result and an interruption cancels the call |
| `cancel_on_interruption=False` | **Asynchronous**: the conversation continues while the tool runs; a late result is added as a developer message and triggers a new inference |
| `timeout_secs` | Per-tool deadline overriding the LLM service's `function_call_timeout_secs`. On expiry the handler gets `asyncio.CancelledError` (clean up!), the call settles as cancelled and the bot can tell the user |
| `cancellable_by_llm=True` | On async tools only: Pipecat adds a `cancel_<name>` tool the model can call |

LLM-service options (`LLMService.__init__`): `run_in_parallel=True` (several tool calls in one turn run concurrently), `group_parallel_tools=True` (the model runs **once** after the whole batch; turn it off and the bot may answer once per tool), `function_call_timeout_secs`, `enable_async_tool_cancellation=False`.

### Telling the user something is happening

A slow tool leaves silence. Say something first, then call the tool. Run offline, the `TTSSpeakFrame` appeared downstream of the LLM *between* `FunctionCallInProgressFrame` and `FunctionCallResultFrame`, so the caller hears it while the tool works:

```python
from pipecat.frames.frames import TTSSpeakFrame


async def lookup_order(params: FunctionCallParams, order_id: str):
    """Look up an order's status.

    Args:
        order_id: The order number.
    """
    await params.llm.push_frame(TTSSpeakFrame("One moment while I check that."))
    status = await orders_api.get(order_id)
    await params.result_callback(status)
```

### What a full tool turn does (run offline)

Against a local fake OpenAI server that answered the first request with a tool call and the second with text, `Pipeline([pair.user(), llm, pair.assistant()])` fed an `LLMRunFrame` made **two** requests. The second request's roles were `['system', 'user', 'assistant', 'tool']`, the system message was the configured `system_instruction`, the tool list was `['lookup_order']`, and the context ended as:

```text
roles:  ['user', 'assistant', 'tool', 'assistant']
tool:   {'role': 'tool', 'content': '{"order_id": "ord-42", "status": "shipped"}', 'tool_call_id': 'call_1'}
final:  {'role': 'assistant', 'content': 'Your order ord-42 has shipped.'}
```

The full test is in [04](./04-testing-evals.md).

### MCP tools

`MCPClient` (extra `mcp`) registers the tools of an MCP server as Pipecat functions. See [Model Context Protocol (MCP)](../../ai-skills/11-mcp-protocol.md) for the protocol.

## Multiple Agents (Alpha)

Pipecat 1.x lets several workers coordinate over a shared **bus** (`AsyncQueueBus` in process, `RedisBus` or `PgmqBus` across machines): hand-off between agents, parallel fan-out, jobs, sidecar workers and distributed agents. `LLMWorker` adds an LLM pipeline and automatic `@tool` registration; `LLMContextWorker` adds a context; `UIWorker` drives a client GUI. The multi-agent API is still marked alpha in the 1.13.0 release notes (`LLMWithBackend`), so pin your version and read the *Agent Handoff* and *Multiple LLM Agents* guides before relying on it.

## Common Mistakes

| Mistake | Effect | Fix |
|---------|--------|-----|
| Persona as a `system` message | Deprecated; lost on context replacement | `system_instruction` in `Settings` |
| User aggregator before STT | No transcripts reach the context | Place it after STT |
| Assistant aggregator before output | Context contains text the user never heard | Place it after `transport.output()` |
| Long silence during a tool call | The caller thinks the line is dead | `TTSSpeakFrame` before the slow call, or an async tool |
| Forgetting `await params.result_callback(...)` | The turn never completes | Always call it, also on errors |
| `stop_secs` very low | Bot answers mid-sentence | Use Smart Turn, or `stop_secs` ≥ 0.2 with `SpeechTimeoutUserTurnStopStrategy` |
| Disabling interruptions to hide noise problems | Unnatural bot | Noise filter or `MinWordsUserTurnStartStrategy` |
| Huge tool results | Slow, expensive turns | Return only what the model needs |

---
## See also
- [Pipecat — Open-Source Framework for Voice Agents](./index.md)
- [Pipecat — Pipelines, Frames & Processors](./01-pipelines-frames-processors.md)
- [Pipecat — Transports, Runner & Production](./03-transports-runner-production.md)
- [Pipecat — Testing & Evals](./04-testing-evals.md)
- [Model Context Protocol (MCP)](../../ai-skills/11-mcp-protocol.md)
- [Pydantic AI — Agents, Tools & Structured Output](../pydantic-ai/01-agents-tools-output.md)
