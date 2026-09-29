---
date: 2026-09-27
tags:
  - python
  - libraries
  - litellm
  - llm
---

# LiteLLM — One API for 100+ LLM Providers

Python SDK and AI gateway that calls OpenAI, Anthropic, Gemini, Bedrock, Azure, Ollama and many more through one OpenAI-compatible interface — with retries, fallbacks, load balancing, caching and cost tracking.

## Installation

```bash
uv add litellm                       # Python SDK
uv tool install 'litellm[proxy]'     # AI gateway (proxy server) as a CLI tool
```

## Section Map

| File | Topics |
|------|--------|
| [01 Completion & Providers](./01-completion-providers.md) | `completion`, model prefixes, params, streaming, async, embeddings, exceptions |
| [02 Tools & Structured Output](./02-tools-structured-output.md) | Function calling, tool loop, JSON schema, Pydantic responses, vision |
| [03 Router & Reliability](./03-router-reliability.md) | Retries, fallbacks, Router, load balancing, caching, cost and budgets |
| [04 Proxy (AI Gateway)](./04-proxy-gateway.md) | `config.yaml`, virtual keys, budgets, Docker, OpenAI SDK as the client |
| [05 Observability & Testing](./05-observability-testing.md) | Callbacks, OpenTelemetry, custom loggers, `mock_response`, pytest patterns |

## SDK or Proxy?

| | Python SDK | Proxy (AI Gateway) |
|---|---|---|
| Runs | Inside your Python process | Separate service (`:4000`) |
| Clients | Python only | Any language, any OpenAI-compatible SDK |
| Keys | Provider keys in every app | Provider keys only in the gateway; apps get virtual keys |
| Budgets, rate limits per team | Manual | Built-in (needs Postgres) |
| Good for | Scripts, one service, test suites, evals | Platform teams, many services, central spend control |

## Minimal Example

```python
from litellm import completion

# ANTHROPIC_API_KEY / OPENAI_API_KEY are read from the environment
messages = [{"role": "user", "content": "Give me three edge cases for a login form."}]

for model in ["anthropic/claude-sonnet-5", "openai/gpt-4o-mini", "ollama/llama3.2"]:
    response = completion(model=model, messages=messages, max_tokens=300)
    print(model, response.choices[0].message.content)
```

The response has the OpenAI shape for every provider: `choices[0].message`, `usage`, `model`, `id`.

## Quick Commands

| Command | Use |
|---------|-----|
| `litellm --model anthropic/claude-sonnet-5` | Start a proxy for one model on `:4000` |
| `litellm --config config.yaml` | Start a proxy from a config |
| `litellm --config config.yaml --detailed_debug` | Proxy with verbose request logs |
| `LITELLM_LOG=DEBUG python app.py` | SDK debug logging |
| `curl localhost:4000/health/liveliness` | Proxy liveness probe |

## Quick Rules

1. **Always use the provider prefix** (`anthropic/`, `openai/`, `bedrock/`) — it removes guessing and routing surprises.
2. **Set `timeout` and `num_retries` on every call** — defaults are generous and LLM APIs do hang.
3. **Configure fallbacks to another provider**, not only another model of the same provider.
4. **Enable `drop_params`** when one code path serves many providers — unsupported params are dropped instead of raising.
5. **Track cost per call** (`response._hidden_params["response_cost"]`) and send it to your metrics.
6. **Use `mock_response` in unit tests** — no network, no keys, no spend.
7. **Pin the exact version** in the lockfile — the gateway holds all provider keys, which makes it a high-value supply-chain target.
8. **Centralize keys in the proxy** once more than one service calls LLMs.

---
## See also
- [Digital Garden: Knowledge Base](../../index.md)
- [LangChain](../langchain/index.md)
- [OpenTelemetry](../opentelemetry/index.md)
- [LLM Evaluation](../../llm-evaluation/index.md)
- [Python Libraries](../index.md)
