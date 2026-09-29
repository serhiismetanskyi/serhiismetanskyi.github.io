---
date: 2026-09-27
tags:
  - python
  - libraries
  - litellm
  - llm
---

# LiteLLM — Router & Reliability

## Retries, Timeouts, Fallbacks per Call

```python
response = completion(
    model="anthropic/claude-sonnet-5",
    messages=messages,
    timeout=30,
    num_retries=3,                                  # exponential backoff on retryable errors
    fallbacks=["openai/gpt-4o-mini", "gemini/gemini-2.5-flash"],
)
print(response.model)                               # which model actually answered
```

Fallbacks are tried in order after the primary model has exhausted its retries. Use a **different provider** as the first fallback — outages and rate limits are usually provider-wide.

## Router

`Router` manages a pool of deployments behind logical model names: load balancing, retries, cooldowns and fallbacks in one place.

```python
import os

from litellm import Router

model_list = [
    # two deployments behind one name -> load balanced
    {
        "model_name": "smart",
        "litellm_params": {
            "model": "azure/gpt-4o-eu",
            "api_key": os.environ["AZURE_EU_KEY"],
            "api_base": "https://eu.openai.azure.com",
            "api_version": "2024-10-21",
            "rpm": 600,
        },
    },
    {
        "model_name": "smart",
        "litellm_params": {"model": "openai/gpt-4o", "api_key": os.environ["OPENAI_API_KEY"], "rpm": 500},
    },
    {"model_name": "smart-backup", "litellm_params": {"model": "anthropic/claude-sonnet-5"}},
    {"model_name": "fast", "litellm_params": {"model": "anthropic/claude-haiku-4-5"}},
    {"model_name": "long-context", "litellm_params": {"model": "gemini/gemini-2.5-pro"}},
]

router = Router(
    model_list=model_list,
    routing_strategy="simple-shuffle",             # weighted by rpm/tpm/weight
    num_retries=2,
    timeout=60,
    allowed_fails=3,                               # failures per minute before cooldown
    cooldown_time=30,                              # seconds a failing deployment is skipped
    fallbacks=[{"smart": ["smart-backup"]}],
    context_window_fallbacks=[{"smart": ["long-context"]}],
)

response = router.completion(model="smart", messages=messages)
response = await router.acompletion(model="fast", messages=messages)
```

Application code only knows `smart` / `fast`. Swapping vendors becomes a config change.

## Routing Strategies

| Strategy | Picks | Use |
|----------|-------|-----|
| `simple-shuffle` (default) | Random, weighted by `rpm` / `tpm` / `weight` | Most setups; no extra state |
| `least-busy` | Deployment with fewest in-flight requests | Uneven request sizes |
| `latency-based-routing` | Lowest recent latency | Latency-sensitive UX |
| `usage-based-routing-v2` | Most remaining TPM/RPM headroom | Tight provider quotas; needs Redis with several instances |
| `cost-based-routing` | Cheapest healthy deployment | Batch jobs, evals |

With several app instances pass `redis_host`, `redis_port`, `redis_password` to `Router` so cooldowns and usage counters are shared.

## Fallback Types

| Setting | Triggered by |
|---------|--------------|
| `fallbacks` | Any error after retries (rate limit, timeout, 5xx) |
| `context_window_fallbacks` | `ContextWindowExceededError` |
| `content_policy_fallbacks` | `ContentPolicyViolationError` |
| `default_fallbacks` | Fallback for every model group without its own entry |

Test fallback wiring without breaking anything:

```python
router.completion(model="smart", messages=messages, mock_testing_fallbacks=True)
```

## Caching

```python
import litellm
from litellm.caching.caching import Cache

litellm.cache = Cache(type="redis", host="localhost", port=6379, ttl=3600)   # or Cache() for in-memory

r1 = completion(model="openai/gpt-4o-mini", messages=messages, caching=True)
r2 = completion(model="openai/gpt-4o-mini", messages=messages, caching=True)   # served from cache
print(r2._hidden_params.get("cache_hit"))                                      # True
```

| Cache type | Notes |
|------------|-------|
| `local` | In-process dict — scripts, tests |
| `redis` | Shared across processes and instances |
| `redis-semantic` / `qdrant-semantic` | Hit on semantically similar prompts (embedding similarity threshold) |
| `s3`, `disk` | Cheap persistent cache for eval reruns |

Per-call control: `cache={"no-cache": True}` (skip read), `cache={"no-store": True}` (skip write), `cache={"ttl": 600}`.

!!! tip "Caching in eval pipelines"
    A disk or Redis cache makes reruns of an evaluation suite nearly free when only the scoring code changes. Include the model version and prompt template in the cache key (they are part of the request anyway) — and never cache when you are measuring non-determinism.

## Cost Tracking

```python
from litellm import completion_cost

response = completion(model="anthropic/claude-sonnet-5", messages=messages)

cost = response._hidden_params["response_cost"]          # USD, computed by LiteLLM
cost = completion_cost(completion_response=response)     # same, explicit
```

- Prices come from LiteLLM's model map; custom or self-hosted models can be priced with `input_cost_per_token` / `output_cost_per_token` in `litellm_params`.
- Cached tokens, reasoning tokens and batch discounts are accounted for where the provider reports them.

## Budgets in the SDK

```python
import litellm

litellm.max_budget = 5.0          # USD for this process; raises BudgetExceededError when exceeded

try:
    run_eval_suite()
except litellm.BudgetExceededError as exc:
    log.error("eval stopped: %s", exc)
```

For per-user, per-team or per-key budgets use the proxy ([04 Proxy](./04-proxy-gateway.md)).

## Rate Limiting Your Own Calls

```python
import asyncio

sem = asyncio.Semaphore(8)      # at most 8 concurrent requests

async def ask(prompt: str) -> str:
    async with sem:
        r = await router.acompletion(model="fast", messages=[{"role": "user", "content": prompt}])
        return r.choices[0].message.content
```

The router's `rpm` / `tpm` settings steer traffic between deployments; a semaphore protects the whole pool from your own bursts.

## Reliability Checklist

- [ ] `timeout` set on every call or on the Router
- [ ] Retries only on retryable errors (LiteLLM does this by default)
- [ ] At least one cross-provider fallback per critical model group
- [ ] Context window fallback for user-provided long inputs
- [ ] Shared Redis for cooldowns when running more than one instance
- [ ] Cost logged per request, budget alarms configured
- [ ] Fallback path tested (`mock_testing_fallbacks=True`)

---
## See also
- [LiteLLM — One API for 100+ LLM Providers](./index.md)
- [LiteLLM — Proxy (AI Gateway)](./04-proxy-gateway.md)
- [Client–Server: Reliability](../../client-server-architecture/06-reliability-security-observability/01-reliability.md)
