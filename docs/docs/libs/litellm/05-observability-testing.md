---
date: 2026-09-27
tags:
  - python
  - libraries
  - litellm
  - llm
  - pytest
  - testing
---

# LiteLLM — Observability & Testing

## Built-in Callbacks

One line sends every call (input, output, tokens, cost, latency, errors) to an observability backend.

```python
import litellm

litellm.callbacks = ["otel"]                          # OpenTelemetry spans
litellm.success_callback = ["langfuse"]               # success only
litellm.failure_callback = ["sentry"]                 # failures only
```

| Callback | Backend | Configure with |
|----------|---------|----------------|
| `otel` | Any OTLP backend (Tempo, Jaeger, Phoenix, Honeycomb) | `OTEL_EXPORTER`, `OTEL_ENDPOINT`, `OTEL_HEADERS` |
| `langfuse` | Langfuse | `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` |
| `arize_phoenix` | Arize Phoenix | `PHOENIX_COLLECTOR_ENDPOINT` |
| `mlflow`, `wandb`, `helicone`, `lunary`, `braintrust`, `datadog` | Their platforms | Provider-specific env vars |
| `prometheus` | Prometheus `/metrics` (proxy) | `callbacks: ["prometheus"]` in config |

Pass context with `metadata` — it shows up in traces and logs:

```python
completion(
    model="fast",
    messages=messages,
    metadata={"feature": "ticket-triage", "test_run_id": "nightly-42", "trace_user_id": "qa-bot"},
)
```

## OpenTelemetry

```bash
export OTEL_EXPORTER=otlp_grpc
export OTEL_ENDPOINT=http://localhost:4317
export OTEL_SERVICE_NAME=triage-service
```

```python
litellm.callbacks = ["otel"]
```

Each call becomes a span with GenAI attributes (`gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, cost). When your app already has an active span (e.g. from FastAPI auto-instrumentation), the LLM span is attached to the same trace — the whole request, including the model call, is visible in one place. See [OpenTelemetry](../opentelemetry/index.md) for the Collector and backend setup.

## Custom Logger

```python
from litellm.integrations.custom_logger import CustomLogger


class CostMetrics(CustomLogger):
    def log_success_event(self, kwargs, response_obj, start_time, end_time):
        slo = kwargs["standard_logging_object"]
        metrics.llm_cost.add(slo["response_cost"], {"model": slo["model"]})
        metrics.llm_latency.record((end_time - start_time).total_seconds(), {"model": slo["model"]})

    def log_failure_event(self, kwargs, response_obj, start_time, end_time):
        metrics.llm_errors.add(1, {"model": kwargs.get("model"), "error": type(kwargs.get("exception")).__name__})

    async def async_log_success_event(self, kwargs, response_obj, start_time, end_time):
        self.log_success_event(kwargs, response_obj, start_time, end_time)


litellm.callbacks = [CostMetrics()]
```

`standard_logging_object` is a stable, typed payload: model, provider, tokens, cost, latency, cache hit, metadata, error info. Prefer it to digging through raw `kwargs`.

Other hooks: `log_pre_api_call` (before the request), `async_log_failure_event`, and in the proxy `async_pre_call_hook` / `async_post_call_success_hook` for modifying or rejecting requests.

## Debugging

```bash
LITELLM_LOG=DEBUG python app.py             # full request/response translation logs
```

```python
response._hidden_params["api_base"]          # which endpoint was called
response._hidden_params["response_cost"]
response._hidden_params["additional_headers"]  # provider rate-limit headers
```

!!! warning "Logs contain prompts"
    Debug logs and most callbacks record full prompts and completions. Turn off message logging (`litellm.turn_off_message_logging = True`) for sensitive data, or redact in a custom logger.

## Unit Tests with `mock_response`

`mock_response` returns a fake completion in the normal response format — no network, no keys, no cost.

```python
from litellm import completion

from app.triage import triage_ticket          # calls litellm.completion inside


def test_triage_parses_label(monkeypatch):
    import app.triage as mod

    def fake_completion(**kwargs):
        return completion(**kwargs, mock_response='{"label": "bug", "priority": "high"}')

    monkeypatch.setattr(mod, "completion", fake_completion)

    result = triage_ticket("Checkout crashes on Safari")
    assert result.label == "bug"
    assert result.priority == "high"
```

Error paths — `mock_response` also accepts an exception:

```python
import litellm
import pytest


def test_rate_limit_is_surfaced(monkeypatch):
    import app.triage as mod

    error = litellm.RateLimitError(message="slow down", llm_provider="anthropic", model="claude-sonnet-5")
    monkeypatch.setattr(mod, "completion", lambda **kw: completion(**kw, mock_response=error))

    with pytest.raises(litellm.RateLimitError):
        triage_ticket("anything")
```

A cleaner design: inject the model call (a `Router` or a small `LLMClient` wrapper) into your code, and pass a Router whose deployments set `mock_response` in `litellm_params` in tests.

```python
test_router = Router(model_list=[
    {"model_name": "fast", "litellm_params": {"model": "openai/gpt-4o-mini", "mock_response": '{"label": "bug"}'}},
])
```

## Testing Tool Calls

```python
from litellm import ModelResponse


def fake_tool_call_response(**kwargs) -> ModelResponse:
    return ModelResponse(choices=[{
        "message": {
            "role": "assistant",
            "content": None,
            "tool_calls": [{
                "id": "call_1",
                "type": "function",
                "function": {"name": "get_order_status", "arguments": '{"order_id": "ord-42"}'},
            }],
        },
        "finish_reason": "tool_calls",
    }])
```

Feed a scripted sequence (tool call, then final answer) to test the agent loop from [02](./02-tools-structured-output.md) deterministically: step limit, argument validation, tool errors.

## Integration Tests Against Real Models

```python
import os

import pytest

pytestmark = [
    pytest.mark.llm,                                                  # run with: pytest -m llm
    pytest.mark.skipif(not os.getenv("ANTHROPIC_API_KEY"), reason="no API key"),
]


def test_triage_real_model():
    result = triage_ticket("Login button does nothing after the last release")
    assert result.label in {"bug", "feature", "question"}
```

- Keep them in a separate marker; run nightly or on demand, not on every commit.
- Use a cheap model, `temperature=0`, a small `max_tokens`, and `litellm.max_budget` as a safety net.
- Assert on structure and allowed values, not exact wording.
- Point them at the proxy with a dedicated virtual key — spend is tracked and capped per suite.

## LiteLLM in LLM Evaluation

Evaluation frameworks often use LiteLLM under the hood or accept it as a model backend — one config lets the same suite evaluate several providers:

```python
MODELS = ["anthropic/claude-sonnet-5", "openai/gpt-4o-mini", "gemini/gemini-2.5-flash"]


@pytest.mark.parametrize("model", MODELS)
def test_answer_relevancy(model, golden_case):
    answer = completion(model=model, messages=golden_case.messages, temperature=0).choices[0].message.content
    score = relevancy_metric(golden_case.question, answer)       # DeepEval / custom judge
    assert score >= 0.8, f"{model}: {score}"
```

Combine with a disk or Redis cache ([03](./03-router-reliability.md)) so reruns only pay for changed cases.

---
## See also
- [LiteLLM — One API for 100+ LLM Providers](./index.md)
- [OpenTelemetry — Testing with OpenTelemetry](../opentelemetry/06-testing.md)
- [LLM Evaluation](../../llm-evaluation/index.md)
- [Pytest](../pytest/index.md)
