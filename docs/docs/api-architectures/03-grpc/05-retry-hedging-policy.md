---
date: 2026-06-05
tags:
  - api
  - architecture
  - grpc
---

# gRPC: Retry and Hedging Policy

This document adds a clear policy for retry and hedging in production gRPC systems.

## Core rule

Retry and hedging must be enabled only for idempotent operations.
For non-idempotent operations, use application idempotency keys before enabling retries.

## Retry policy (recommended baseline)

- Retry only transient failures: `UNAVAILABLE`, optional `RESOURCE_EXHAUSTED`.
- Use exponential backoff with jitter.
- Set max attempts to prevent retry storms.
- Enforce per-method deadlines.

Example service config:

```json
{
  "methodConfig": [
    {
      "name": [{"service": "user.v1.UserService", "method": "GetUser"}],
      "timeout": "1s",
      "retryPolicy": {
        "maxAttempts": 4,
        "initialBackoff": "0.1s",
        "maxBackoff": "1s",
        "backoffMultiplier": 2,
        "retryableStatusCodes": ["UNAVAILABLE"]
      }
    }
  ]
}
```

## Hedging policy (tail latency control)

Hedging sends parallel attempts and uses the first successful response.
Use only for read calls where duplicate execution is safe.

- Keep `maxAttempts` low (2 or 3).
- Add `hedgingDelay` (for example `30ms`) to avoid immediate fan-out.
- Track backend amplification factor from hedged requests.

## Safety controls

- Enable retry throttling to avoid overload loops.
- Add circuit breaker before dependency calls.
- Disable retry for validation errors and business conflicts.
- Propagate retry attempt number in metadata for observability.

## Observability checklist

- Metrics: retries per method, hedge attempts, success-after-retry ratio.
- Logs: final status + attempt count + deadline.
- Traces: one parent span, child span per attempt.
- Alerts: high retry ratio + rising latency = dependency degradation.
