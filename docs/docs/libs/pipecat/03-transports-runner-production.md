---
date: 2026-10-19 12:00:00
tags:
  - python
  - libraries
  - pipecat
  - voice-ai
  - production
---

# Pipecat — Transports, Runner & Production

How a bot connects to users (transports), how you run it during development (the runner), and how to see what it does in production (observers, metrics, tracing, deployment). Verified on pipecat-ai 1.13.0; steps that need a browser, a phone number or a cloud account are marked as not run.

## Transports

A **transport** carries audio (and optionally video and messages) between the client and your pipeline. `transport.input()` and `transport.output()` are the two ends of the pipeline.

| Transport | Carries | Extra |
|-----------|---------|-------|
| `SmallWebRTCTransport` | Peer-to-peer WebRTC, no third-party service; good for local development | `webrtc` |
| `DailyTransport` | WebRTC rooms hosted by Daily; also PSTN dial-in/out | `daily` |
| LiveKit transport | WebRTC rooms via LiveKit | `livekit` |
| `FastAPIWebsocketTransport` | A WebSocket on your FastAPI app; telephony streams | `websocket` |
| WebSocket server / client transports | Raw-audio WebSocket | `websocket` |
| Vonage, WhatsApp, local audio | Specific channels; `local` uses the machine's microphone | `local`, provider extras |

**Frame serializers** adapt telephony stream formats for the WebSocket transports: Twilio, Telnyx, Plivo, Exotel, Genesys, Vonage. A phone call over Twilio is: the call connects to your webhook, Twilio opens a media WebSocket, and a serializer converts its μ-law audio to Pipecat frames.

### `TransportParams`

```python
from pipecat.transports.base_transport import TransportParams

params = TransportParams(
    audio_in_enabled=True,
    audio_out_enabled=True,
)
```

It has dozens of fields; the ones you meet first: `audio_in_enabled`, `audio_out_enabled`, `audio_in_sample_rate`, `audio_out_sample_rate`, `audio_in_filter` (noise suppression), `audio_out_mixer` (background audio), `audio_out_end_silence_secs`, `video_in_enabled`, `video_out_enabled`. Turn detection and VAD live on the **user aggregator** (see [02](./02-conversation-turns-tools.md)), not on the transport.

## The Bot Entry Point

The development runner and Pipecat Cloud call one function, `bot(runner_args)`. Keep the agent in a transport-agnostic `run_bot` so the same code runs everywhere:

```python
import os

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import WorkerRunner
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair, LLMUserAggregatorParams
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.services.openai.stt import OpenAISTTService
from pipecat.services.openai.tts import OpenAITTSService
from pipecat.transports.base_transport import BaseTransport, TransportParams

transport_params = {                       # one factory per transport the bot accepts
    "webrtc": lambda: TransportParams(audio_in_enabled=True, audio_out_enabled=True),
}


async def run_bot(transport: BaseTransport, runner_args: RunnerArguments):
    stt = OpenAISTTService(api_key=os.getenv("OPENAI_API_KEY"))
    llm = OpenAILLMService(
        api_key=os.getenv("OPENAI_API_KEY"),
        settings=OpenAILLMService.Settings(system_instruction="You are a friendly voice assistant."),
    )
    tts = OpenAITTSService(api_key=os.getenv("OPENAI_API_KEY"))

    context = LLMContext()
    pair = LLMContextAggregatorPair(context, user_params=LLMUserAggregatorParams(vad_analyzer=SileroVADAnalyzer()))

    pipeline = Pipeline([transport.input(), stt, pair.user(), llm, tts, transport.output(), pair.assistant()])
    worker = PipelineWorker(pipeline, params=PipelineParams(enable_metrics=True), name="assistant")
    runner = WorkerRunner(handle_sigint=runner_args.handle_sigint)

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        await runner.cancel()

    await runner.add_workers(worker)
    await runner.run()


async def bot(runner_args: RunnerArguments):
    transport = await create_transport(runner_args, transport_params)
    await run_bot(transport, runner_args)


if __name__ == "__main__":
    from pipecat.runner.run import main

    main()
```

This file was started with `python bot.py -t webrtc` on 1.13.0 (placeholder API key): the development runner came up and served its routes. A real conversation needs a browser client, a microphone and live provider keys, so the audio path itself was **not run**.

- `create_transport(runner_args, transport_params)` picks the transport from the runner arguments, configures telephony serializers automatically, and raises `ValueError` if a transport the bot accepts has no entry in `transport_params`.
- Start a conversation proactively by queueing `LLMRunFrame()` in an `on_client_connected` handler.
- `on_client_connected` / `on_client_disconnected` are transport events; do persistence in the **worker's** `on_pipeline_finished`, which fires for graceful and cancelled endings.

### Runner argument types (`pipecat.runner.types`)

| Type | Fields |
|------|--------|
| `SmallWebRTCRunnerArguments` | `webrtc_connection`, `body` |
| `DailyRunnerArguments` | `room_url`, `token`, `body` |
| `LiveKitRunnerArguments` | `room_name`, `url`, `token`, `body`, `session_id` |
| `WebSocketRunnerArguments` | `websocket`, `transport_type` |
| `VonageRunnerArguments`, `MOQRunnerArguments`, `EvalRunnerArguments` | Transport-specific |
| `RunnerArguments` (base) | `handle_sigint`, `handle_sigterm`, `file_storage` |

To support several transports in one `bot()`, branch with `isinstance(runner_args, ...)`.

## The Development Runner

```bash
uv add "pipecat-ai[runner,webrtc]"
python bot.py                      # FastAPI server on http://localhost:7860, all transports at once
python bot.py -t webrtc            # only SmallWebRTC; other transports get HTTP 400
python bot.py -t daily             # Daily rooms
python bot.py -t twilio -x yourproxy.ngrok.io     # telephony webhook behind a public hostname
```

| Flag | Meaning |
|------|---------|
| `-t`, `--transport` | Restrict to one transport and make it the default for `/start` |
| `--host` / `--port` | Bind address, default `localhost:7860` |
| `-x`, `--proxy` | Public hostname for telephony webhooks |
| `-d`, `--direct` | Connect straight to a Daily room for testing |
| `--dialin` / `--no-dialin` | Daily PSTN dial-in webhook (on by default) |
| `--allowed-origins`, `--ice-servers` | CORS and ICE configuration |
| `-f`, `-u` (`--downloads-folder`, `--uploads-folder`) | File storage for file input (1.13.0) |
| `-v`, `--verbose` | More logging |

Routes served in 1.13.0 (from the OpenAPI document): `POST /start` (the client picks a transport with `"transport"` in the body), `POST /api/offer` (WebRTC signalling), `GET /status`, and file routes under `/files` and `/sessions/{session_id}/...`. `GET /` redirects (307) to the prebuilt client.

Environment variables the runner reads: Daily `DAILY_API_KEY` (and optional `DAILY_ROOM_URL`); LiveKit `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`; telephony `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TELNYX_API_KEY`, `PLIVO_AUTH_ID`, `PLIVO_AUTH_TOKEN`; `PIPECAT_ALLOWED_ORIGINS`, `PIPECAT_ICE_SERVERS`, `PIPECAT_UPLOADS_FOLDER`. The runner sets `ENV=local` in development, which you can use to switch behavior.

### Scaffolding with the CLI

```bash
uv tool install "pipecat-ai[cli]"
pipecat init                       # new project; also writes AGENTS.md / CLAUDE.md for coding agents
pipecat init quickstart            # canned quickstart bot in ./pipecat-quickstart
pipecat init . --bot-type web -t daily -m cascade --stt deepgram_stt --llm openai_llm --tts cartesia_tts
```

`pipecat --version` prints the CLI version (`1.13.0`). The CLI has `init`, `eval`, `cloud` (Pipecat Cloud) and `context-hub` (a local docs/examples index for coding agents).

## Observability

### Metrics

```python
worker = PipelineWorker(pipeline, params=PipelineParams(enable_metrics=True, enable_usage_metrics=True))
```

With `enable_metrics`, services report **TTFB** (time to first byte) and processing time; with `enable_usage_metrics`, tokens and characters. `report_only_initial_ttfb=True` limits reports to the first one.

### Observers

Observers watch every frame pushed in the pipeline without being part of it. Attach them to the worker with `observers=[...]`.

| Observer | Shows |
|----------|-------|
| `UserBotLatencyObserver` | Time from the user stopping to the bot speaking, with a per-service breakdown |
| `DebugLogObserver` | Selected frame types as they flow (`frame_types=...`) |
| `LLMLogObserver`, `TranscriptionLogObserver`, `MetricsLogObserver` | LLM traffic, transcripts, service metrics in the logs |
| `FunctionCallObserver`, `ErrorObserver` | Tool calls and errors |
| `StartupTimingObserver` | Time to start each processor (warmup, setup, start) |
| `TurnTrackingObserver` | Turn boundaries (also feeds traces) |
| `SpeakingObserver` | Who is speaking |

```python
from pipecat.observers.user_bot_latency_observer import UserBotLatencyObserver

latency = UserBotLatencyObserver()


@latency.event_handler("on_latency_measured")
async def measured(observer, seconds: float):
    log.info("user→bot latency %.2fs", seconds)


@latency.event_handler("on_latency_breakdown")
async def breakdown(observer, b):                  # LatencyBreakdown
    for line in b.turn_contribution_lines(by_cost=True):
        log.info(line)


worker = PipelineWorker(pipeline, observers=[latency], params=PipelineParams(enable_metrics=True))
```

Driven with synthetic frames on 1.13.0 (a `VADUserStoppedSpeakingFrame`, 0.4 s later a `BotStartedSpeakingFrame`), the observer measured **0.40 s** and the breakdown listed one contribution (`pipeline`, 0.403 s). In a real call the breakdown names each service (STT finalization, LLM TTFB, TTS TTFB), which is how you find the slow stage. Events: `on_latency_measured(observer, seconds)`, `on_latency_breakdown(observer, breakdown)`, `on_first_bot_speech_latency(observer, seconds)` (greeting latency, not fired if the user speaks first).

`LatencyBreakdown` fields: `contributions` (each with `key`, `label`, `owner`, `owner_kind` = `SERVICE`/`SETTING`/`BOT`/`PIPELINE`, `start_time`, `duration_secs`), `total_secs`, `measured_from`, `ttfb`, `text_aggregation`, `user_turn_start_time`, `user_turn_secs`, `function_calls`. It needs `enable_metrics=True` for per-service data. The measurement starts at the VAD's stop event, so **VAD `stop_secs` is part of the latency** you see.

### Where does latency come from?

| Stage | Typical lever |
|-------|---------------|
| End-of-turn detection | `stop_secs`, Smart Turn vs `SpeechTimeoutUserTurnStopStrategy` |
| STT finalization | Streaming STT with a fast final-transcript path |
| LLM TTFB | Smaller or faster model, shorter context (summarize), prompt caching |
| Tool calls | Async tools, a "one moment" `TTSSpeakFrame`, caching results |
| TTS TTFB | Streaming TTS, sentence aggregation, a nearby region |
| Network | Run the bot close to the user and to the providers |

### Tracing

`PipelineWorker(..., enable_tracing=True)` emits OpenTelemetry spans per conversation and turn (extra `tracing`; set up an exporter with `pipecat.utils.tracing.setup`). Spans carry service attributes, so you can chart LLM and TTS time per turn in any OTLP backend. See [OpenTelemetry](../opentelemetry/index.md). Sentry is available through the `sentry` extra.

## Ending Sessions Cleanly

| Concern | Setting |
|---------|---------|
| Client leaves | `on_client_disconnected` → `await runner.cancel()` |
| Silent session | `idle_timeout_secs=300` (default) cancels the pipeline |
| Max call length | A timer that queues a goodbye `TTSSpeakFrame` then `EndFrame` (see [01](./01-pipelines-frames-processors.md)) |
| Cleanup and transcripts | `on_pipeline_finished` |
| Signals | `WorkerRunner(handle_sigint=runner_args.handle_sigint)` |

## Deployment

Pipecat runs wherever Python and UDP/WebSocket traffic run. The official deployment guides describe these patterns (none were run here):

| Pattern | Idea | Use when |
|---------|------|----------|
| **VM per session** | One machine per call | Strong isolation, low scale |
| **Warm pool with subprocess workers** | A pool of ready processes, one session each | Many short sessions, cold-start sensitive |
| **Managed agent runtime** | A platform runs the bot (Pipecat Cloud, or a platform like Fly.io, Modal, Cerebrium) | You do not want to run infrastructure |
| **Telephony in production** | Webhook → media WebSocket, with a public hostname and a serializer | Phone agents |

Practical rules:

- **One session = one pipeline**, and a pipeline does not share mutable global state with other sessions. Keep clients and pools in `app_resources` (`PipelineWorker(app_resources=...)`, read in tools as `params.app_resources`).
- Create heavy objects (Silero VAD, Smart Turn analyzer, HTTP clients) once per process where you can, rather than per session, and measure the first-greeting latency with `on_first_bot_speech_latency`.
- Scale by **sessions per CPU core** measured with a real load test; audio processing is CPU-bound and latency-sensitive.
- Run behind TLS; put WebRTC on a TURN-capable network (`--ice-servers`) for restrictive corporate networks.
- Keep provider keys in the environment or a secret manager; the runner reads them from the environment.
- Alert on `UserBotLatencyObserver` percentiles and on pipelines ending with errors, not only on process uptime.

## Common Mistakes

| Mistake | Effect | Fix |
|---------|--------|-----|
| Building the transport inside `run_bot` | The agent works on one transport only | `bot()` creates the transport, `run_bot(transport, ...)` is transport-agnostic |
| `transport_params` missing a transport you accept | `ValueError` from `create_transport` | One factory per accepted transport |
| `python bot.py -t eval` | Deprecated since 1.13.0 | Run `python bot.py`; the eval harness uses `/ws` |
| Bot never speaks first | Silent line after connect | Queue `LLMRunFrame()` in `on_client_connected` |
| Cleanup only in `on_client_disconnected` | Skipped when the pipeline ends another way | Use `on_pipeline_finished` |
| Measuring latency without `enable_metrics` | No per-service breakdown | `PipelineParams(enable_metrics=True)` |
| Rebuilding heavy objects per session | Slower first greeting | Share what is safe to share; measure `on_first_bot_speech_latency` |
| Public telephony webhook without `-x` / proxy | Provider cannot reach the bot | Expose a public hostname |

---
## See also
- [Pipecat — Open-Source Framework for Voice Agents](./index.md)
- [Pipecat — Conversation: Turns, Context & Tools](./02-conversation-turns-tools.md)
- [Pipecat — Testing & Evals](./04-testing-evals.md)
- [OpenTelemetry](../opentelemetry/index.md)
- [FastAPI](../fastapi/index.md)
- [WebSocket](../../api-architectures/04-websocket/index.md)
