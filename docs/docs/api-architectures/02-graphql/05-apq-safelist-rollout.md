---
date: 2026-06-04
tags:
  - api
  - architecture
  - graphql
---

# GraphQL: APQ and Safelisting Rollout

This document adds a practical production rollout model for persisted operations.

## APQ vs Safelisting

| Topic | APQ (Automatic Persisted Queries) | Safelisting (Registered Queries) |
|---|---|---|
| Registration time | Runtime | Build/CI time |
| Main goal | Smaller payloads, better latency | Security and operation control |
| Unknown query behavior | Can be accepted and cached | Rejected by policy |
| Best use | Performance optimization | Production hardening |

## Recommended rollout stages

### Stage 1: Audit mode
- Log all operation names and hashes.
- Allow unknown operations, but mark them as `unknown_operation=true`.
- Build a baseline list of real client operations.

### Stage 2: Soft enforcement
- Require operation name for every request.
- Alert on unknown hashes, but still allow.
- Block introspection in production for non-admin traffic.

### Stage 3: Strict enforcement
- Accept only registered query hashes.
- Reject unknown operations with clear error code.
- Allow emergency bypass only for trusted internal clients.

## API gateway policy

- Validate `sha256Hash` for every persisted operation request.
- Enforce max depth and max complexity even for safelisted operations.
- Track per-operation error rate and latency.
- Disable dynamic query text in internet-facing production traffic.

## Example rejection response

```json
{
  "errors": [
    {
      "message": "Operation is not registered",
      "extensions": {
        "code": "PERSISTED_QUERY_NOT_FOUND",
        "operation_name": "GetUserDashboard"
      }
    }
  ]
}
```

## CI/CD controls

- Generate persisted query list in CI from frontend repositories.
- Run schema compatibility checks before publishing a new query list.
- Block deploy if new query list contains unknown operations for target graph.
- Roll out query list and client release together (or list first, then client).
