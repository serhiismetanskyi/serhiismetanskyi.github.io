---
date: 2026-10-19 12:00:00
tags:
  - python
  - libraries
  - pipecat
  - voice-ai
---

# Pipecat — Pipelines, Frames & Processors

The three building blocks of every Pipecat app: **frames** (data), **frame processors** (behavior) and the **pipeline** that connects them, plus the **worker** and **runner** that execute it. Examples were run on pipecat-ai 1.13.0.

## Frames

A frame is a small typed object that moves through the pipeline. The class tells the framework how to schedule it:

| Kind | Scheduling | Examples |
|------|-----------|----------|
| `SystemFrame` | High priority, ordered with other system frames, **not discarded by interruptions** | `InputAudioRawFrame`, `UserStartedSpeakingFrame`, `InterruptionFrame`, `ErrorFrame`, `CancelFrame` |
| `DataFrame` | Queued, processed in order | `OutputAudioRawFrame`, `TextFrame`, `TranscriptionFrame`, `LLMTextFrame`, `AggregatedTextFrame`, `TTSTextFrame` |
| `ControlFrame` | Queued, processed in order | `EndFrame`, `TTSStartedFrame`, `LLMFullResponseStartFrame` |

Frames keep their order within each lane (system, and non-system), even across a `ParallelPipeline`. Since 1.12.0 every frame also has an `interruptible` attribute, which defaults to `False` for subclasses of `UninterruptibleFrame`.

How one user turn looks as frames:

```text
transport.input()  → InputAudioRawFrame ...           (microphone)
VAD / aggregator   → UserStartedSpeakingFrame, UserStoppedSpeakingFrame
STT                → TranscriptionFrame("Where is my order?")
user aggregator    → LLMContextFrame                  (context + new user message)
LLM                → LLMFullResponseStartFrame, LLMTextFrame("Your "), LLMTextFrame("order "), ..., LLMFullResponseEndFrame
TTS                → TTSStartedFrame, TTSTextFrame, OutputAudioRawFrame ...
transport.output() → audio to the client
```

### Direction

`push_frame(frame, direction)` sends a frame `FrameDirection.DOWNSTREAM` (towards the user, the default) or `FrameDirection.UPSTREAM` (towards the input). Errors and "please stop" signals travel upstream; everything else goes downstream.

## Frame Processors

A processor subclasses `FrameProcessor`, looks at each frame, and **pushes it on**:

```python
from pipecat.frames.frames import TextFrame
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor


class Redactor(FrameProcessor):
    """Masks digits in text before it reaches TTS."""

    async def process_frame(self, frame, direction: FrameDirection):
        await super().process_frame(frame, direction)          # 1. always first
        if isinstance(frame, TextFrame):
            frame = TextFrame(text="".join("*" if c.isdigit() else c for c in frame.text))
        await self.push_frame(frame, direction)                # 2. always push every frame
```

| Rule | Why |
|------|-----|
| `super().__init__()` in your `__init__` | Sets up queues and lifecycle |
| `await super().process_frame(...)` first | The base class handles `StartFrame`, `EndFrame`, `InterruptionFrame`; skipping it breaks startup and shutdown |
| **Push every frame** (even ones you do not use) | A swallowed frame can stall everything behind you; including `StartFrame` and `EndFrame` |
| Use `isinstance` to select frames | Frames of many types pass through one processor |
| Do I/O in `setup()` and `cleanup()` | `async def setup(self, setup: FrameProcessorSetup)` runs before any frame; call `await super().setup(setup)`. Read sample rates from `setup.audio_in_sample_rate` / `audio_out_sample_rate`, not from `StartFrame` (deprecated since 1.8.0) |
| `pause_processing_all_frames_until(...)` | Holds incoming frames until a condition resolves; always give it a `timeout` |

A processor can also **generate** frames out of band (a greeting, a hold message): `await self.push_frame(TTSSpeakFrame("One moment please."))`.

### Built-in helpers

| Class | Use |
|-------|-----|
| `ParallelPipeline` | Runs branches that each receive all upstream frames; pair with `FunctionFilter` / `FrameFilter` to route (for example one branch per language) |
| `FrameFilter`, `FunctionFilter` | Pass only selected frames |
| Producer / consumer processors | Move frames between pipelines |
| `LLMTextProcessor` | Aggregate LLM text into `AggregatedTextFrame`s (sentences) before TTS |

## The Pipeline

```python
from pipecat.pipeline.pipeline import Pipeline

pipeline = Pipeline(
    [
        transport.input(),
        stt,
        context_aggregator.user(),
        llm,
        tts,
        transport.output(),
        context_aggregator.assistant(),
    ]
)
```

`Pipeline` links the processors in sequence. A pipeline is itself a processor, so pipelines nest.

## Worker and Runner

A `PipelineWorker` executes a pipeline; a `WorkerRunner` starts workers and handles shutdown and signals.

```python
from pipecat.pipeline.runner import WorkerRunner
from pipecat.pipeline.worker import PipelineParams, PipelineWorker

worker = PipelineWorker(
    pipeline,
    name="assistant",
    params=PipelineParams(enable_metrics=True, enable_usage_metrics=True),
    observers=[...],
)
runner = WorkerRunner(handle_sigint=runner_args.handle_sigint)
await runner.add_workers(worker)
await runner.run()                      # blocks until the session ends
```

`runner.run()` returns when the pipeline ends normally (an `EndFrame` reached the end), `runner.cancel()` is called, a signal arrives (with `handle_sigint=True`), or an unhandled error occurs.

!!! note "Older names"
    `PipelineTask` and `PipelineRunner` are deprecated aliases of `PipelineWorker` and `WorkerRunner`. Constructing a `PipelineTask` prints ``PipelineTask is deprecated since 1.3.0 and will be removed in 2.0.0. Use PipelineWorker``.

### `PipelineParams`

Verified defaults in 1.13.0:

| Parameter | Default | Meaning |
|-----------|---------|---------|
| `audio_in_sample_rate` | 16000 | Input audio rate |
| `audio_out_sample_rate` | 24000 | Output audio rate |
| `enable_metrics` | `False` | TTFB and processing-time metrics per service |
| `enable_usage_metrics` | `False` | Token and character usage |
| `enable_heartbeats` | `False` | Periodic heartbeat frames for stall detection (`heartbeats_period_secs=1.0`, `heartbeats_monitor_secs=10.0`) |
| `report_only_initial_ttfb` | `False` | Report only the first TTFB |
| `start_metadata` | `{}` | Free-form metadata put on the `StartFrame` |

### `PipelineWorker` options worth knowing

| Option | Default | Meaning |
|--------|---------|---------|
| `name` | none | Shows in logs, traces and function-call params |
| `observers` | none | Frame observers: latency, logging, metrics |
| `idle_timeout_secs` | 300 | Cancel the pipeline after this long without activity |
| `cancel_on_idle_timeout` | `True` | Disable for pipelines that wait quietly |
| `idle_timeout_frames` | `BotSpeakingFrame`, `InterimTranscriptionFrame`, `TranscriptionFrame`, `UserSpeakingFrame`, `UserStartedSpeakingFrame` | Frames that count as activity |
| `enable_rtvi` | auto | RTVI processor and observer, so Pipecat clients can talk to the bot |
| `enable_tracing` | `False` | OpenTelemetry tracing (see [03](./03-transports-runner-production.md)) |
| `enable_turn_tracking` | `True` | Turn tracking for latency and traces |
| `cancel_timeout_secs`, `start_timeout_secs`, `setup_timeout_secs` | 20.0 | Timeouts for shutdown and startup |

## Starting, Ending and Cancelling

| Action | How | Behavior |
|--------|-----|----------|
| Feed the pipeline from outside | `await worker.queue_frame(frame)` / `queue_frames([...])` | Frames enter at the start of the pipeline |
| Start the bot talking first | `await worker.queue_frame(LLMRunFrame())` | The user aggregator pushes the current context to the LLM |
| **Graceful end** | `await worker.queue_frame(EndFrame())` | Pending frames are processed first, then the pipeline stops |
| **Immediate cancel** | `await worker.cancel()` or `await runner.cancel()` | `CancelFrame` (a SystemFrame) discards pending frames |
| End from inside the pipeline | `await self.push_frame(EndWorkerFrame(), FrameDirection.DOWNSTREAM)` | The pipeline source converts it to `EndFrame` |
| Cancel from inside | push `CancelWorkerFrame` | Converted to `CancelFrame` |

Run on 1.13.0, a pipeline fed `TextFrame("hello")`, `TextFrame("world")`, `EndFrame()` delivered both texts and fired `on_pipeline_started` then `on_pipeline_finished` with an `EndFrame`; cancelling an idle pipeline fired `on_pipeline_finished` with a `CancelFrame`.

```python
@worker.event_handler("on_pipeline_started")
async def on_started(worker, frame): ...

@worker.event_handler("on_pipeline_finished")        # fires for graceful AND cancelled shutdown
async def on_finished(worker, frame):
    save_transcript()                                # do persistence here, not in on_client_disconnected
```

### Max call duration

Idle detection does not cap total length. Use a timer that says goodbye and ends gracefully:

```python
import asyncio

from pipecat.frames.frames import EndFrame, TTSSpeakFrame


async def hang_up_after(worker, seconds: float):
    await asyncio.sleep(seconds)
    await worker.queue_frames([TTSSpeakFrame("I have to go now. Goodbye!"), EndFrame()])
```

## A Complete Minimal Run (No Network)

```python
import asyncio

from pipecat.frames.frames import EndFrame, TextFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import WorkerRunner
from pipecat.pipeline.worker import PipelineWorker
from pipecat.processors.frame_processor import FrameProcessor


class Collect(FrameProcessor):
    def __init__(self):
        super().__init__()
        self.seen = []

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)
        if isinstance(frame, TextFrame):
            self.seen.append(frame.text)
        await self.push_frame(frame, direction)


async def main():
    collector = Collect()
    worker = PipelineWorker(Pipeline([collector]), name="demo", cancel_on_idle_timeout=False)
    runner = WorkerRunner(handle_sigint=False)
    await runner.add_workers(worker)
    await worker.queue_frames([TextFrame("hello"), TextFrame("world"), EndFrame()])
    await runner.run()
    print(collector.seen)        # ['hello', 'world']


asyncio.run(main())
```

## Common Mistakes

| Mistake | Effect | Fix |
|---------|--------|-----|
| Not calling `super().process_frame()` | No `StartFrame` handling, pipeline never starts, or errors on shutdown | Call it first |
| Not pushing a frame you do not handle | Downstream processors starve | `await self.push_frame(frame, direction)` for every frame |
| Doing slow work inside `process_frame` | Blocks the audio path; choppy sound | Offload with `create_task`, or use a service with async I/O |
| Assistant aggregator before `transport.output()` | Context records text the user never heard after an interruption | Place it last, after output |
| Ending the session from inside a processor with a raw `EndFrame` | Not the documented route | Push `EndWorkerFrame` from inside the pipeline; use `worker.queue_frame(EndFrame())` from outside |
| Disabling idle timeout with no max-duration timer | A silent session lives forever | Keep the 300 s default or add a timer |
| Still using `PipelineTask` / `PipelineRunner` | Deprecation warnings, breaks in 2.0 | `PipelineWorker` / `WorkerRunner` |

---
## See also
- [Pipecat — Open-Source Framework for Voice Agents](./index.md)
- [Pipecat — Conversation: Turns, Context & Tools](./02-conversation-turns-tools.md)
- [Pipecat — Testing & Evals](./04-testing-evals.md)
- [aiohttp — Server & WebSockets](../aiohttp/02-server-websockets.md)
