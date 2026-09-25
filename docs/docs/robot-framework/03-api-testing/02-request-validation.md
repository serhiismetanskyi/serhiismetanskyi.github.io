---
date: 2026-07-28
tags:
  - robot-framework
  - test-automation
  - api-testing
---

# Request Design & Validation Strategy

Use a **consistent validation ladder** so API suites stay maintainable and failures point to the real defect (transport, contract, or behavior).

## Validation levels

| Level | What to check | Example |
|-------|----------------|---------|
| Status code | HTTP status | `200`, `201`, `404` |
| Response body | Key fields and values | `user['name'] == "Alice"` |
| JSON Schema | Structure, types, required keys | Draft 2020-12 schema for `User` |
| Headers | `Content-Type`, caching, security headers | `application/json; charset=utf-8` |
| Performance | Latency budget | Elapsed time `< 500 ms` (soft or hard gate) |

## JSON Schema validation (Python library)

Keep schemas in `schemas/` and validate from a small custom library so Robot stays readable.

```python
# SchemaValidator.py
import json
import logging
from jsonschema import Draft202012Validator

logger = logging.getLogger(__name__)


class SchemaValidator:
    def validate_json_string(self, body: str, schema: dict) -> None:
        logger.debug("Validating JSON body against schema keys=%s", list(schema.keys()))
        instance = json.loads(body)
        Draft202012Validator(schema).validate(instance)
```

```robot
*** Settings ***
Library    SchemaValidator.py

*** Keywords ***
Validate Json Against Schema
    [Arguments]    ${body_text}    ${schema_dict}
    Validate Json String    ${body_text}    ${schema_dict}
```

## Centralized validation keywords

| Keyword responsibility | Example |
|------------------------|---------|
| Happy-path contract | `Response Should Match User Contract` |
| Error envelope | `Error Response Should Be RFC7807` |
| Header policy | `Security Headers Should Be Present` |

```robot
*** Keywords ***
Assert Ok Json
    [Arguments]    ${response}
    Status Should Be    200    ${response}
    Should Contain    ${response.headers}[content-type]    application/json
    Validate Json Against Schema    ${response.text}    ${SCHEMA_LIST}
```

## Data handling

- **Builders/factories**: keywords like `Build Order Payload` that accept only business inputs.
- **Unique data**: `${uuid}=    Evaluate    str(__import__('uuid').uuid4())` or dedicated helper.
- **Avoid hardcoding** in `*** Test Cases ***`: push literals into variables, CSV, or factory keywords.

## Auth testing patterns

| Scenario | Expectation |
|----------|-------------|
| Valid token | `200` / normal body |
| Invalid token | `401` and stable error shape |
| Expired token | `401` (or `403` per product rules) |
| Missing `Authorization` | `401` |

```robot
Unauthorized List Fails
    Create Session    api    ${BASE_URL}
    ${r}=    GET On Session    api    /private/items    expected_status=401
    Validate Error Envelope    ${r}
```

## Error response testing

Cover **4xx** (client) and representative **5xx** (server or simulated faults). Assert **machine-readable** fields (`code`, `detail`) rather than free-text paragraphs.

## API security testing basics

| Area | Idea |
|------|------|
| Input validation | Oversized payloads, type confusion, injection strings in JSON fields |
| Rate limiting | Burst requests; expect `429` when policy applies |
| Transport | HTTPS-only in real envs; optional certificate pinning tests |

## Example: layered suite outline

```robot
*** Settings ***
Library    Collections
Resource   ../../resources/services/user_service.resource
Resource   ../../resources/validators/api_validators.resource

*** Variables ***
${BASE_URL}    %{API_BASE_URL}

*** Test Cases ***
User Registration Flow
    ${user}=    Register New User Via Service
    Profile Should Exist For User    ${user}[id]

Invalid Login Is Rejected
    Attempt Login With Bad Password    expected_status=401
```

## Best practices summary

| Practice | Rationale |
|----------|-----------|
| Schema + selective field checks | Catches structural drift and wrong business values |
| One validator per error family | Readable failures, DRY assertions |
| Flow-level tests | Mirrors user/system behavior, not URL inventory |
| Measure latency at service boundary | Stable timing vs. UI noise |

Together with [Architecture & Patterns](01-api-architecture-patterns.md), this yields suites that scale across teams and environments without turning test files into HTTP scripts.
