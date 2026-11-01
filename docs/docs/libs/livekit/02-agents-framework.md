---
date: 2026-10-24 12:00:00
tags:
  - python
  - libraries
  - livekit
  - voice-ai
  - ai-agents
---

# LiveKit — Agents Framework

How a LiveKit voice agent is built and run: the `Agent` and `AgentSession` classes, the voice pipeline (STT, LLM, TTS, VAD, turn detection), realtime models, and the worker side (`AgentServer`, jobs, dispatch, prewarm). Tools and handoffs are in [03](./03-tools-handoffs-workflows.md); production operations are in [04](./04-telephony-egress-production.md).

## Packages and Plugins

```bash
uv add "livekit-agents[openai,silero,turn-detector]"   # core + plugins you use
uv add "livekit-agents[deepgram,cartesia,elevenlabs,google,anthropic,groq]"
uv run python -m livekit.agents download-files          # fetch model weights (turn detector) at build time
```

Each provider is a `livekit-plugins-<name>` package imported as `livekit.plugins.<name>`; the extras of `livekit-agents` install them. `from livekit.agents import inference` exposes the **LiveKit Inference** gateway (`inference.STT`, `inference.LLM`, `inference.TTS`, model strings such as `"openai/gpt-4o"`), which needs LiveKit Cloud credentials. On your own infrastructure use the provider plugins; `inference.VAD` and `inference.TurnDetector(version="v1-mini")` run locally.

| Stage | Plugin examples | Notes |
|-------|-----------------|-------|
| STT | `openai.STT`, `deepgram.STT`, `assemblyai.STT`, `google.STT`, `speechmatics.STT` | Streaming STT; non-streaming STTs are wrapped with VAD automatically |
| LLM | `openai.LLM`, `anthropic.LLM`, `google.LLM`, `groq.LLM`, `openai.LLM.with_ollama(model=...)` | Any OpenAI-compatible endpoint: `openai.LLM(model=..., base_url=..., api_key=...)` |
| TTS | `openai.TTS`, `cartesia.TTS`, `elevenlabs.TTS`, `google.TTS` | Streaming TTS; text is stripped of markdown and emoji by default |
| VAD | `silero.VAD.load()` | Local ONNX model; bundled `inference.VAD` is the default when `vad` is omitted |
| Realtime | `openai.realtime.RealtimeModel`, Gemini Live, Nova Sonic | One speech-to-speech model replaces STT, LLM and TTS |
| Fallback | `llm.FallbackAdapter([...])`, `stt.FallbackAdapter([...])`, `tts.FallbackAdapter([...])` | First instance is primary; `retry_on_chunk_sent=True` allows mid-stream LLM fallback |

## `Agent` and `AgentSession`

An **`Agent`** holds instructions, tools and hooks. An **`AgentSession`** owns the conversation runtime: it connects room audio and text to STT, LLM, TTS, VAD and turn detection, keeps the chat history, and runs tools. One session runs one agent at a time; handoffs swap the agent.

```python
from livekit.agents import Agent, AgentSession, function_tool, RunContext


class Concierge(Agent):
    def __init__(self) -> None:
        super().__init__(instructions="You are a hotel concierge. Keep replies under two sentences.")

    async def on_enter(self) -> None:                     # runs when this agent becomes active
        self.session.generate_reply(instructions="Welcome the guest and ask what they need.")

    @function_tool()
    async def opening_hours(self, context: RunContext, place: str) -> str:
        """Return opening hours.

        Args:
            place: The place, for example "pool" or "spa".
        """
        return f"The {place} is open 7am to 9pm."
```

| `AgentSession` argument | Meaning |
|-------------------------|---------|
| `stt`, `llm`, `tts`, `vad` | Components; omit `stt`/`tts` for text-only. `llm` may be a realtime model |
| `turn_handling` | `TurnHandlingOptions` (below) |
| `tools` | Tools or toolsets shared by every agent in the session |
| `max_tool_steps` | Consecutive tool calls per turn (default `3`; one final call without tools at the limit) |
| `userdata` | Per-session typed state, read as `session.userdata` / `context.userdata` |
| `user_away_timeout` | Seconds of silence before `user_state` becomes `away` (default `15.0`, `None` disables) |
| `transcription_timeout` | Emit `user_transcription_timeout` when VAD heard speech but no final transcript arrived (default off) |
| `tts_text_transforms` | Default `["filter_markdown", "filter_emoji"]`; `None` disables |
| `use_tts_aligned_transcript`, `min_consecutive_speech_delay` | Transcript alignment, minimum pause between consecutive utterances |
| `stt_context_options`, `conn_options` | STT key terms, connection and retry options |

Session methods: `await session.start(agent=..., room=..., room_options=...)`, `session.generate_reply(user_input=..., instructions=..., tool_choice=..., allow_interruptions=...)`, `session.say(text, allow_interruptions=..., add_to_chat_ctx=...)`, `session.interrupt()`, `session.update_agent(agent)`, `session.shutdown(drain=True)`, `await session.aclose()`, `session.history` (chat context), `session.usage`, `session.current_agent`.

`Agent` accepts the same `stt`/`llm`/`tts`/`vad`/`turn_handling` arguments to override the session defaults for that agent, plus `chat_ctx`, `tools`, `id`. Hooks: `on_enter`, `on_exit`, `on_user_turn_completed`, and the pipeline nodes `stt_node`, `llm_node`, `tts_node`, `transcription_node`, `realtime_audio_output_node`.

### Room I/O

`session.start(room=ctx.room, room_options=room_io.RoomOptions(...))` links the session to one participant (the first `STANDARD` or `SIP` participant, or `participant_identity`).

| `RoomOptions` field | Default / effect |
|---------------------|------------------|
| `audio_input`, `audio_output` | On; `audio_input=room_io.AudioInputOptions(noise_cancellation=...)` adds a filter; `False` disables |
| `text_input`, `text_output` | On: text arrives on topic `lk.chat`, transcripts leave on `lk.transcription`; `text_output=room_io.TextOutputOptions(sync_transcription=False)` sends text without waiting for speech |
| `video_input` | Off |
| `participant_kinds`, `participant_identity` | Which participant to link |
| `close_on_disconnect` | Close the session when the linked participant leaves |
| `delete_room_on_close` | Default `False` |

A text-only agent sets `audio_input=False, audio_output=False` and has no `stt`/`tts`; a message sent to `lk.chat` is answered on `lk.transcription` (see [03](./03-tools-handoffs-workflows.md#text-and-data-messaging)).

## Turn Handling

`turn_handling=TurnHandlingOptions(...)` replaces the old `min_endpointing_delay`, `allow_interruptions`, `turn_detection`, ... keyword arguments (they still work and warn).

```python
from livekit.agents import AgentSession, TurnHandlingOptions, inference

session = AgentSession(
    # stt=..., llm=..., tts=..., vad=...
    turn_handling=TurnHandlingOptions(
        turn_detection=inference.TurnDetector(version="v1-mini"),   # local model; or "vad" / "stt" / "manual"
        endpointing={"mode": "fixed", "min_delay": 0.5, "max_delay": 3.0},
        interruption={"mode": "vad", "min_duration": 0.5, "min_words": 0},
        preemptive_generation={"enabled": True, "preemptive_tts": False},
    ),
)
```

| Key | Option | Default |
|-----|--------|---------|
| `turn_detection` | `inference.TurnDetector(...)`, `"stt"`, `"vad"`, `"realtime_llm"`, `"manual"` | Auto: realtime model, then a turn detector or VAD, then STT, then manual |
| `endpointing` | `mode` (`fixed` / `dynamic`), `min_delay`, `max_delay`, `alpha` | `fixed`, `0.5`, `3.0`, `0.9` (`0.3` / `2.5` with the streaming turn detector) |
| `interruption` | `enabled` | `True` |
| | `mode` (`adaptive` / `vad`) | `adaptive` needs the LiveKit Inference service; use `vad` on your own infrastructure |
| | `min_duration`, `min_words` (needs STT) | `0.5` s, `0` |
| | `resume_false_interruption`, `false_interruption_timeout` | `True`, `2.0` s: resume speech when the "interruption" was noise |
| | `discard_audio_if_uninterruptible`, `backchannel_boundary` | `True`, `(1.0, 1.0)` |
| `preemptive_generation` | `enabled`, `preemptive_tts`, `max_speech_duration`, `max_retries` | `True`, `False`, `10.0` s, `3` |
| `user_turn_limit` | `max_words`, `max_duration` | Disabled; `Agent.on_user_turn_exceeded` runs when the user talks too long |

Turn detection decides when the user is done. VAD alone ends a turn after silence (`min_delay`); a turn-detector model reads the speech and extends the wait when the sentence is unfinished. **Preemptive generation** starts the LLM call on the interim transcript, before the turn is confirmed, and discards it if the user keeps talking: lower latency, more tokens. Turn on `preemptive_tts` only when latency matters more than cost.

Turn detector options:

| Detector | Runs | Notes |
|----------|------|-------|
| `inference.TurnDetector(version="v1-mini")` | Locally on CPU | Audio-based; LiveKit Model License; install weights with `python -m livekit.agents download-files` |
| `inference.TurnDetector()` | `v1` (hosted LiveKit Inference) in dev mode and on Cloud, `v1-mini` locally in `start` mode | Pin the version for predictable behaviour |
| `MultilingualModel()` from `livekit.plugins.turn_detector.multilingual` | Locally, text-based, needs a separate STT | The plugin package is deprecated; create it inside the job (it needs the job's inference executor) |
| `"vad"`, `"stt"` | No model | Silence-based endpointing |

The default session VAD (`inference.VAD`) is a local Silero model. To tune it use `silero.VAD.load(min_silence_duration=0.55, activation_threshold=0.5, min_speech_duration=0.05, prefix_padding_duration=0.5)`; the values shown are the defaults.

## Realtime (Speech-to-Speech) Models

```python
from livekit.agents import AgentSession
from livekit.plugins import openai

session = AgentSession(llm=openai.realtime.RealtimeModel(voice="marin"))                            # audio in, audio out
hybrid = AgentSession(llm=openai.realtime.RealtimeModel(modalities=["text"]), tts=openai.TTS())     # model understands speech, your TTS speaks
```

| Pipeline | Strengths | Trade-offs |
|----------|-----------|------------|
| Cascade (STT, LLM, TTS) | Swap each stage, inspect text, exact `say()` scripts, mature tool calling | More latency per stage |
| Realtime | Lower latency, expressive voice, hears tone | No `say()`-style scripted speech, transcripts can arrive after the reply, one provider |
| Hybrid (`modalities=["text"]` + TTS) | Realtime understanding with scripted, controllable speech | Two models to operate; not every provider supports text-only |

Realtime models bring their own server-side turn detection (semantic or server VAD with `TurnDetection(type="semantic_vad", ...)`). To use LiveKit's turn detector with one, disable the built-in detection and add a separate STT.

## Startup Modes

```bash
python agent.py start                    # production: INFO logs (JSON), drains on SIGTERM, health server on :8081
lk agent dev agent.py                    # development: debug logs, reload on file changes, random dev deployment id
lk agent console agent.py --text         # talk to the agent in the terminal (no room, no server)
python agent.py connect --room my-room   # run one job in an existing room
python -m livekit.agents download-files  # fetch plugin model files
```

| Mode | Behaviour |
|------|-----------|
| `start` | Connects to the server named by `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (or `--url`, `--api-key`, `--api-secret`). On `SIGINT`/`SIGTERM` stops taking jobs and waits for active ones up to `drain_timeout` |
| `dev` | `lk agent dev` (the script command `python agent.py dev` is deprecated). Hot reload, `--no-reload` to disable, debug logs, no drain, `num_idle_processes=0`, no load limit |
| `console` | `lk agent console`: local mic and speakers, `--text` for text-only (STT and TTS off), `--record` saves audio and a session report, `--list-devices` |
| `connect` | `--room` (created if missing), `--participant-identity`; handy for debugging a single room |

`lk agent dev` runs the project in the current directory (a `pyproject.toml` or `requirements.txt` must exist) and registers the worker under a **deployment** id. By default that is a random `dev-xxxxxxxx`, so dispatch to it with `--deployment <id>` (CLI, API, or `RoomAgentDispatch.deployment` in a token), or start it with `lk agent dev --deployment production` to receive default dispatch. `python agent.py start` registers with an empty deployment and receives default dispatch.

## Agent Server

```python
from livekit import agents
from livekit.agents import AgentServer, JobContext, JobProcess, JobRequest

server = AgentServer(
    num_idle_processes=2,          # warm job processes kept ready
    load_threshold=0.7,            # above this the server stops accepting jobs
    drain_timeout=1800,            # seconds to wait for jobs on SIGTERM
    prometheus_port=9464,          # lk_agents_* metrics
)
server.setup_fnc = prewarm         # runs once per job process before any job (see Prewarm)

@server.rtc_session(agent_name="support", on_request=on_request, on_session_end=on_session_end)
async def entrypoint(ctx: JobContext) -> None: ...

if __name__ == "__main__":
    agents.cli.run_app(server)
```

`@server.rtc_session` registers exactly one entrypoint. `cli.run_app` accepts an `AgentServer` or the older `WorkerOptions(entrypoint_fnc=..., prewarm_fnc=..., agent_name=...)`.

| `AgentServer` argument | Default | Meaning |
|------------------------|---------|---------|
| `load_threshold` | `0.7` (no limit in dev) | The server reports itself unavailable above this load |
| `load_fnc` | Average CPU over about 5 s | Callable returning `0.0` to `1.0` |
| `num_idle_processes` | CPU count rounded up, `0` in dev | Pre-started job processes |
| `drain_timeout` | `3600` s | Wait for active jobs after `SIGTERM`/`SIGINT` |
| `permissions` | Publish, subscribe, data, metadata | `WorkerPermissions(hidden=True, ...)` for an invisible agent |
| `job_executor_type` | Process | One process per job (thread on Windows) |
| `job_memory_warn_mb`, `job_memory_limit_mb` | `1000`, `0` (off) | Warn above, kill above the limit |
| `shutdown_process_timeout` | `10` s | Time a job gets to shut down gracefully |
| `session_end_timeout` | `300` s | Limit for `on_session_end` |
| `initialize_process_timeout` | `10` s | Time `setup_fnc` may take |
| `host`, `port` | all interfaces, `8081` (random in dev) | Health-check HTTP server: `GET /` returns `OK`, `GET /worker` returns JSON status |
| `ws_url`, `api_key`, `api_secret` | `LIVEKIT_URL`, ... | Prefer environment variables |
| `prometheus_port` | off | `/metrics` with `lk_agents_active_job_count`, `lk_agents_worker_load`, `lk_agents_child_process_count`, `lk_agents_proc_initialize_duration_seconds` |
| `http_proxy`, `max_retry`, `multiprocessing_context` | env proxy, `16`, `forkserver` on Linux | Connection and process settings |

`@server.rtc_session(...)` arguments: `agent_name` (turns on explicit dispatch), `type` (`ServerType.ROOM`, one job per room, or `PUBLISHER`, one per publisher), `on_request`, `on_session_end`.

## Jobs

A **job** is one agent assignment: a child process runs your entrypoint with a `JobContext`.

| `JobContext` member | Use |
|---------------------|-----|
| `ctx.room` | The `rtc.Room`; with `AgentSession` the session connects it for you |
| `ctx.job.metadata`, `ctx.job.room.name`, `ctx.job.agent_name` | Dispatch data; metadata is a string up to 512 KiB (use JSON) |
| `ctx.proc.userdata` | Per-process dict filled in `setup_fnc` |
| `await ctx.connect()` | Connect without an `AgentSession` (programmatic participants, custom media) |
| `await ctx.wait_for_participant()` | Wait for a participant (outbound calls) |
| `ctx.add_shutdown_callback(fn)` | Cleanup after the session ends (default 10 s budget) |
| `ctx.shutdown(reason)` / `session.shutdown(drain=True)` | End the job / the session |
| `ctx.delete_room()` | Delete the room, disconnecting everyone |
| `ctx.api` | A `LiveKitAPI` client |
| `ctx.log_context_fields` | Extra fields on every log line of the job |
| `ctx.make_session_report()` | Structured report of the session (use in `on_session_end`) |
| `ctx.add_participant_entrypoint(fn, kind=...)` | Callback per participant |

```python
async def on_request(req: JobRequest) -> None:
    if req.room.name.startswith("blocked-"):
        await req.reject()
    else:
        await req.accept(name="Support bot", identity=f"agent-{req.room.name}", attributes={"role": "support"})


async def on_session_end(ctx: JobContext) -> None:
    report = ctx.make_session_report()                 # chat_history, events, model usage, options
    save(report.to_dict())
```

By default the room closes when the last non-agent participant leaves (after `departure_timeout`, default 20 s), the agent is disconnected and the job shuts down. If an agent drops unexpectedly, the server dispatches a new one to the room after about 15 seconds.

### Dispatch

| Mode | When | How |
|------|------|-----|
| **Automatic** | `agent_name` empty | An agent joins every new room; no metadata |
| **Explicit** (recommended) | `agent_name` set | The agent joins only when dispatched; supports metadata and several agents per project |

```python
from livekit import api

async with api.LiveKitAPI() as lk:                                         # LIVEKIT_URL / KEY / SECRET from the environment
    d = await lk.agent_dispatch.create_dispatch(
        api.CreateAgentDispatchRequest(agent_name="support", room="support-1", metadata='{"user_id":"12345"}')
    )
    print(await lk.agent_dispatch.list_dispatch("support-1"))
    await lk.agent_dispatch.delete_dispatch(d.id, "support-1")
```

```bash
lk dispatch create --agent-name support --room support-1 --metadata '{"user_id":"12345"}'
lk token create --identity caller --room support-1 --agent support --job-metadata '{"user_id":"12345"}' --join
```

A token can carry the dispatch (`with_room_config(api.RoomConfiguration(agents=[api.RoomAgentDispatch(agent_name="support", metadata=...)]))`, see [01](./01-server-rooms-tokens.md#access-tokens)); it applies only when the token creates the room. SIP dispatch rules carry `room_config.agents` (see [04](./04-telephony-egress-production.md#sip)). The server assigns a dispatch in under 150 ms; the first available worker below its load threshold accepts, otherwise the job goes to another worker.

### Prewarm

```python
from livekit.plugins import silero

def prewarm(proc: JobProcess) -> None:
    proc.userdata["vad"] = silero.VAD.load()

server.setup_fnc = prewarm

@server.rtc_session(agent_name="support")
async def entrypoint(ctx: JobContext) -> None:
    session = AgentSession(vad=ctx.proc.userdata["vad"])       # model already in memory
```

Load models in `setup_fnc`, not in the entrypoint; a job process starts from the warm pool, so the first user turn does not wait for model loading.

## Names from Older Tutorials

| Old | Current |
|-----|---------|
| `WorkerOptions(entrypoint_fnc=..., prewarm_fnc=...)` | `AgentServer()` + `@server.rtc_session` + `server.setup_fnc` |
| `RoomInputOptions`, `RoomOutputOptions` | `room_io.RoomOptions` |
| `AgentSession(turn_detection=..., min_endpointing_delay=..., allow_interruptions=...)` | `turn_handling=TurnHandlingOptions(...)` |
| `python agent.py dev`, `console` | `lk agent dev`, `lk agent console` |
| `python agent.py download-files` | `python -m livekit.agents download-files` |

## Quick Rules

1. **One `AgentSession` per job**, created in the entrypoint; put reusable objects (VAD, LLM clients) in `setup_fnc`.
2. **Set `agent_name`** and dispatch explicitly; remember the deployment id when you use `lk agent dev`.
3. **Pin turn detection** (`inference.TurnDetector(version="v1-mini")`, `"vad"` or `"stt"`) and interruption `mode: "vad"` on your own infrastructure.
4. **Tune with `TurnHandlingOptions`**: lower `min_delay` for speed, raise it to stop cut-offs; keep `preemptive_tts` off until latency demands it.
5. **Use text-only sessions** (`audio_input=False, audio_output=False`) for chat clients and for tests.
6. **Handle `on_request`** when you must reject jobs (capacity, tenancy) and use `on_session_end` for reports.
7. **Give workers time to drain**: `drain_timeout` and the orchestrator's grace period must exceed your longest call.

---
## See also
- [Digital Garden: Knowledge Base](../../index.md)
- [LiveKit — Open-Source WebRTC Server and Agents Framework](./index.md)
- [LiveKit — Server, Rooms & Tokens](./01-server-rooms-tokens.md)
- [Pipecat — Open-Source Framework for Voice Agents](../pipecat/index.md)
- [Agentic AI Architecture](../../agentic-ai-architecture/index.md)
