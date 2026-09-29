---
date: 2026-09-27
tags:
  - python
  - libraries
  - litellm
  - llm
---

# LiteLLM — Completion & Providers

## Model Names

The model string is `<provider>/<model>`. The provider prefix selects the adapter, auth and endpoint.

| Provider | Model string | Credentials (env) |
|----------|--------------|-------------------|
| OpenAI | `openai/gpt-4o-mini` | `OPENAI_API_KEY` |
| Anthropic | `anthropic/claude-sonnet-5` | `ANTHROPIC_API_KEY` |
| Google AI Studio | `gemini/gemini-2.5-flash` | `GEMINI_API_KEY` |
| Vertex AI | `vertex_ai/gemini-2.5-pro` | ADC / `VERTEXAI_PROJECT`, `VERTEXAI_LOCATION` |
| AWS Bedrock | `bedrock/<model-id>` | AWS credentials chain, `AWS_REGION_NAME` |
| Azure OpenAI | `azure/<deployment-name>` | `AZURE_API_KEY`, `AZURE_API_BASE`, `AZURE_API_VERSION` |
| Ollama (local) | `ollama/llama3.2` | `api_base="http://localhost:11434"` |
| Any OpenAI-compatible server (vLLM, LM Studio) | `openai/<model>` + `api_base=...` | `api_key` if required |

Credentials can also be passed per call: `completion(..., api_key=..., api_base=...)`.

## Completion

```python
from litellm import completion

response = completion(
    model="anthropic/claude-sonnet-5",
    messages=[
        {"role": "system", "content": "You are a senior QA engineer. Answer briefly."},
        {"role": "user", "content": "How do I test idempotency of POST /payments?"},
    ],
    temperature=0.2,
    max_tokens=500,
    timeout=30,          # seconds
    num_retries=2,       # retries on rate limits, timeouts, 5xx
)

message = response.choices[0].message
print(message.content)
print(response.usage.prompt_tokens, response.usage.completion_tokens)
print(response.choices[0].finish_reason)      # "stop", "length", "tool_calls"
```

LiteLLM translates OpenAI-style input to each provider: Anthropic `system` becomes the top-level system prompt, `max_tokens` is mapped, roles are adapted.

## Common Parameters

| Param | Notes |
|-------|-------|
| `temperature`, `top_p`, `max_tokens`, `stop`, `seed` | Mapped to provider equivalents where they exist |
| `tools`, `tool_choice` | OpenAI format for all providers ([02](./02-tools-structured-output.md)) |
| `response_format` | JSON mode / JSON schema / Pydantic model |
| `timeout`, `num_retries` | Reliability basics |
| `fallbacks` | List of models to try if this one fails ([03](./03-router-reliability.md)) |
| `metadata` | Free-form dict passed to callbacks and logs |
| `reasoning_effort` | `"low"` / `"medium"` / `"high"` — mapped to thinking/reasoning settings of models that support it |
| Provider-specific extras | Passed through as-is: e.g. `top_k` for Anthropic |

## Unsupported Parameters

Not every provider supports every param. By default LiteLLM raises `UnsupportedParamsError`.

```python
import litellm

litellm.drop_params = True                          # global: silently drop unsupported params
completion(model="ollama/llama3.2", messages=m, seed=42, drop_params=True)   # or per call
```

Check support up front:

```python
from litellm import get_supported_openai_params, supports_function_calling, supports_vision

get_supported_openai_params(model="anthropic/claude-sonnet-5")
supports_function_calling(model="ollama/llama3.2")
supports_vision(model="openai/gpt-4o-mini")
```

## Streaming

```python
response = completion(model="openai/gpt-4o-mini", messages=messages, stream=True)

chunks = []
for chunk in response:
    chunks.append(chunk)
    print(chunk.choices[0].delta.content or "", end="", flush=True)

# Rebuild a full response (content + usage) from the chunks
full = litellm.stream_chunk_builder(chunks, messages=messages)
print(full.usage.total_tokens)
```

Add `stream_options={"include_usage": True}` to get usage in the last chunk from providers that support it.

## Async

```python
import asyncio
from litellm import acompletion

async def classify(texts: list[str]) -> list[str]:
    tasks = [
        acompletion(
            model="anthropic/claude-haiku-4-5",
            messages=[{"role": "user", "content": f"Label as bug/feature/question: {t}"}],
            max_tokens=5,
        )
        for t in texts
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return [r.choices[0].message.content if not isinstance(r, Exception) else "error" for r in results]
```

Limit concurrency with `asyncio.Semaphore` — providers enforce RPM/TPM limits per key. Async streaming: `async for chunk in await acompletion(..., stream=True)`.

## Embeddings

```python
from litellm import embedding

result = embedding(model="openai/text-embedding-3-small", input=["login fails", "cannot sign in"])
vectors = [item["embedding"] for item in result.data]
```

Also available: `image_generation`, `transcription`, `speech`, `rerank` — same prefix convention.

## Exceptions

All provider errors are mapped to OpenAI-compatible exception types, so one `except` block works for every provider.

| Exception | Status | Retry? |
|-----------|--------|--------|
| `litellm.AuthenticationError` | 401 | No — fix the key |
| `litellm.PermissionDeniedError` | 403 | No |
| `litellm.NotFoundError` | 404 | No — wrong model name |
| `litellm.BadRequestError` | 400 | No |
| `litellm.ContextWindowExceededError` | 400 | No — trim input or use a bigger model |
| `litellm.ContentPolicyViolationError` | 400 | No |
| `litellm.RateLimitError` | 429 | Yes, with backoff |
| `litellm.Timeout` | 408 | Yes |
| `litellm.APIConnectionError` | 500 | Yes |
| `litellm.ServiceUnavailableError` | 503 | Yes |
| `litellm.InternalServerError` | 500 | Yes |

```python
import litellm

try:
    response = completion(model=model, messages=messages, timeout=30)
except litellm.ContextWindowExceededError:
    response = completion(model=model, messages=truncate(messages), timeout=30)
except litellm.RateLimitError as exc:
    log.warning("rate limited by %s: %s", exc.llm_provider, exc.message)
    raise
```

Each exception has `status_code`, `message`, `llm_provider` and `model`.

## Tokens and Model Info

```python
from litellm import get_model_info, token_counter

token_counter(model="openai/gpt-4o-mini", messages=messages)     # prompt tokens before sending
info = get_model_info("anthropic/claude-sonnet-5")
info["max_input_tokens"], info["input_cost_per_token"], info["output_cost_per_token"]
```

Model metadata and prices come from LiteLLM's bundled model map, updated with each release.

---
## See also
- [LiteLLM — One API for 100+ LLM Providers](./index.md)
- [LiteLLM — Tools & Structured Output](./02-tools-structured-output.md)
- [LiteLLM — Router & Reliability](./03-router-reliability.md)
