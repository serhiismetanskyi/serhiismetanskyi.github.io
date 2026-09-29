---
date: 2026-09-27
tags:
  - python
  - libraries
  - guardrails
  - llm
  - security
---

# Guardrails AI — Server & Production

## Library or Server?

| | In-process library | Guardrails server (`guardrails-api`) |
|---|---|---|
| Runs | Inside your Python service | Separate FastAPI service (default `:8000`) |
| Clients | Python only | Any language: REST `/validate` or any OpenAI SDK via `base_url` |
| ML models | Loaded in every service replica | Loaded once per server replica |
| Guard definitions | In app code | Central `config.py`, versioned and deployed separately |
| Good for | One service, test suites, notebooks | Many services, polyglot stacks, platform team owns policies |

## Config File

`config.py` is a normal Python module; every module-level `Guard` / `AsyncGuard` becomes an endpoint.

```python
# config.py
from guardrails import Guard, OnFailAction
from guardrails_ai.secrets_present import SecretsPresent
from guardrails_ai.valid_choices import ValidChoices

triage_guard = Guard(id="ticket-label", name="ticket-label").use(
    ValidChoices(choices=["bug", "feature", "question"], on_fail=OnFailAction.EXCEPTION),
)

support_guard = Guard(id="support-bot", name="support-bot").use(
    SecretsPresent(on_fail=OnFailAction.FIX),
)
```

!!! note "Set `id` explicitly"
    Without a database the server looks guards up by **`id`** in the URL (`/guards/{id}/…`). `Guard(name=...)` alone gets a random UUID id, and `/guards/ticket-label/validate` returns 404 (verified with `guardrails-api` 0.4.4). Use the same value for `id` and `name`.

`guardrails create --validators=... --guard-name=...` can generate a starter `config.py`, but it installs validators through the deprecated Hub flow and writes `from guardrails.hub import ...` — writing the file by hand is simpler now.

## Start and Call

```bash
uv add guardrails-api                     # otherwise `guardrails start` installs it on first run
guardrails start --config config.py --port 8000 --env .env
curl localhost:8000/health-check          # {"status":200,"message":"Ok"}
```

| Endpoint | Use |
|----------|-----|
| `GET /guards`, `GET /guards/{id}` | List / inspect loaded guards and validators |
| `POST /guards/{id}/validate` | Validate `llm_output`, or let the guard call the LLM with `messages` + `model` |
| `POST /guards/{id}/openai/v1/chat/completions` | OpenAI-compatible proxy: LLM call (via LiteLLM) + validation |
| `GET /health-check` | Liveness probe |
| `GET /docs` | FastAPI OpenAPI UI |

Validate an existing answer — verified responses:

```bash
curl -s -X POST localhost:8000/guards/ticket-label/validate \
  -H 'content-type: application/json' -d '{"llm_output": "bug"}'
# {"callId":"...","rawLlmOutput":"bug","validationSummaries":[],"validatedOutput":"bug","validationPassed":true,...}

curl -s -X POST localhost:8000/guards/ticket-label/validate \
  -H 'content-type: application/json' -d '{"llm_output": "urgent"}'
# HTTP 400 {"detail":"Validation failed for field with errors: Value urgent is not in choices [...]"}
```

Request fields are snake_case (`llm_output`, `num_reasks`, `prompt_params`, `metadata`); responses are camelCase. `on_fail="exception"` maps to **HTTP 400**; `fix` returns 200 with the fixed `validatedOutput` and the failure in `validationSummaries`.

### OpenAI SDK as the Client

```python
from openai import OpenAI

client = OpenAI(base_url="http://guardrails:8000/guards/support-bot/openai/v1", api_key="unused")

response = client.chat.completions.create(
    model="anthropic/claude-haiku-4-5",          # passed to LiteLLM on the server
    messages=[{"role": "user", "content": "How do I reset 2FA?"}],
)
print(response.choices[0].message.content)       # validated (fixed) text
print(response.model_extra["guardrails"])        # ValidationOutcome: validation_passed, summaries, ...
```

- The server calls the provider with keys from **its own environment** (`--env .env`) — provider keys stay in one place.
- The OpenAI route runs with `num_reasks=0` — no reask loop; use `fix`, `filter`, `exception`.
- Streaming (`stream=True`) is supported and validated chunk by chunk.

### Python Client in Server Mode

```python
import os

from guardrails import Guard, settings

os.environ["GUARDRAILS_BASE_URL"] = "http://guardrails:8000"
settings.use_server = True

guard = Guard(id="ticket-label", name="ticket-label")    # same id as in config.py
guard.validate("feature")                                 # executed remotely
```

## Docker

```dockerfile
FROM python:3.13-slim
WORKDIR /app
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev                            # guardrails-ai, guardrails-api, validators pinned
# ML validators: download models at build time, not on the first request
RUN uv run python -m guardrails_ai.detect_pii.post_install
COPY config.py middleware.py ./
ENV GR_CONFIG_FILE_PATH=/app/config.py PORT=8000
EXPOSE 8000
CMD ["uv", "run", "uvicorn", "--factory", "guardrails_api.app:create_app", \
     "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--timeout-keep-alive", "90"]
```

- `guardrails start` is a dev server; production uses uvicorn `--factory` (above) or gunicorn with `uvicorn.workers.UvicornWorker` — both documented in `guardrails_api/app.py`.
- Each worker loads its own copy of ML models — size memory as `workers × model RAM`.
- Without `PGHOST` / `DB_URL` guards live in memory from `config.py` (stateless, easy to scale). With Postgres, guards can be created and updated through the API and history is persisted.
- The server ships with CORS `*` and **no authentication** — put it behind a gateway, or add auth in `middleware.py` (any `BaseHTTPMiddleware` subclass there is registered; `--middleware` sets a custom path).

## Observability

Guardrails emits OpenTelemetry spans through the **global tracer provider** — configure OTel before creating guards and the spans flow to your backend (verified with an in-memory exporter):

| Span | Key attributes |
|------|----------------|
| `guard` | `guard.name`, `validation_passed`, `number_of_llm_calls`, `number_of_reasks`, `token_consumption` |
| `step` | `step.index` (one per reask iteration) |
| `call` | `llm.input_messages.*`, `llm.output_messages.*`, `llm.token_count.*` (OpenInference names) |
| `<validator>.validate` | `validator.name`, `validator.on_fail`, `validator.validate.output.outcome`, `validator.validate.output.error_message`, `validator.init.*` |

```python
from guardrails.telemetry import default_otlp_tracer

# Uses OTEL_EXPORTER_OTLP_PROTOCOL / OTEL_EXPORTER_OTLP_ENDPOINT / OTEL_EXPORTER_OTLP_HEADERS;
# without them it prints spans to stderr
default_otlp_tracer("support-bot")
```

- **Phoenix / Langfuse:** register their OTel tracer provider (e.g. Phoenix `register(...)`, Langfuse OTLP endpoint) at startup; attributes follow OpenInference, so LLM calls render as LLM spans. See [Phoenix tracing](../../tools/phoenix/02-tracing-instrumentation.md), [Langfuse tracing](../../tools/langfuse/02-tracing-sdk.md), [OpenTelemetry](../opentelemetry/index.md).
- `openinference-instrumentation-guardrails` targets `guardrails-ai<0.5.1` — not needed and not compatible with current versions.
- Spans contain inputs and outputs (`input.value`, `output.value`) — redact in the Collector for PII-bearing traffic.
- Anonymous usage metrics to Guardrails are **on by default**: `guardrails configure --disable-metrics` or `guard.configure(allow_metrics_collection=False)`.

Metrics worth dashboards: block rate per guard and validator, fix rate, reasks per call, validator latency p95, guard errors (crashes, timeouts).

## Fail-Open vs Fail-Closed

A guard can fail *technically* (model OOM, validator endpoint down, judge timeout) — decide upfront what happens.

| Policy | Behaviour on guard error | Use for |
|--------|-------------------------|---------|
| **Fail-closed** | Block / return a safe fallback | PII and secrets on output, tool-call validation, regulated data, jailbreak screening for agents with tools |
| **Fail-open** | Let the request through, log and alert | Tone, competitor mentions, quality judges, low-risk FAQ bots |

```python
from guardrails.errors import ValidationError


def guarded_answer(messages) -> str:
    try:
        outcome = output_guard(model="anthropic/claude-sonnet-5", messages=messages, num_reasks=1)
    except ValidationError:
        return SAFE_REFUSAL                                  # policy block
    except Exception:                                        # guard/validator infrastructure failure
        metrics.guard_errors.add(1, {"guard": "support-answer"})
        return SAFE_REFUSAL                                  # fail-closed for this guard
    return outcome.validated_output if outcome.validation_passed else SAFE_REFUSAL
```

## Performance

- Order validators cheap → expensive; block early with `exception` on input.
- Prefer `fix` over `reask` in latency-sensitive paths; cap `num_reasks` at 0–2.
- Use `AsyncGuard` in async services; move LLM judges to sampled, asynchronous monitoring.
- Warm up models at startup (run one `validate()` in a readiness hook).
- Bound history in long-running processes: `Guard(history_max_length=...)`.

## Production Checklist

- [ ] `guardrails-ai`, `guardrails-api`, every `guardrails-ai-<validator>` pinned in the lockfile (skip the malicious `0.10.1`)
- [ ] No `guardrails hub install` / `guardrails.hub` imports left; no reliance on hosted inference
- [ ] ML models baked into the image; readiness probe after warm-up
- [ ] Guards defined with explicit `id`; `config.py` reviewed like code
- [ ] Server behind auth (gateway or middleware), CORS restricted
- [ ] Fail-open / fail-closed decided and tested per guard
- [ ] OTel traces with redaction; dashboards for block rate, reasks, latency
- [ ] Anonymous metrics disabled where policy requires
- [ ] FP/FN baselines and a regression suite in CI ([06](./06-testing.md))

---
## See also
- [Guardrails AI — Input & Output Guards for LLMs](./index.md)
- [Guardrails AI — Testing Guardrails](./06-testing.md)
- [LiteLLM — Proxy (AI Gateway)](../litellm/04-proxy-gateway.md)
- [Phoenix](../../tools/phoenix/index.md)
- [Langfuse](../../tools/langfuse/index.md)
- [OpenTelemetry](../opentelemetry/index.md)
- [Docker](../../tools/docker/index.md)
