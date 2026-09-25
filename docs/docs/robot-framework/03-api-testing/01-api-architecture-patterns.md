---
date: 2026-07-28
tags:
  - robot-framework
  - test-automation
  - api-testing
---

# API Testing Architecture & Patterns

Treat API automation as **three layers**. Tests call the **service layer**; services orchestrate **API client** calls; **validators** own assertions and schema checks.

## Layered model

```text
Test Cases  →  Service Layer (business flows)
                    ↓
              API Client Layer (HTTP only)
                    ↓
              Response Validator (status, body, schema, headers)
```

| Layer | Responsibility | Robot home |
|-------|----------------|------------|
| **API Client** | URLs, methods, sessions, auth headers, raw `GET`/`POST` | Custom library or resource wrapping RequestsLibrary |
| **Service** | Named flows: “register user”, “place order” | `.robot` or resource keywords composing client + validator |
| **Validator** | Status, JSON paths, schema, timing | Shared keywords / Python library |

## API Client Layer

Encapsulate every HTTP call. **Do not** scatter `POST On Session` across test cases.

**Example — Python library** (`ApiClientLibrary.py`) wrapping RequestsLibrary-style behavior:

```python
from robot.libraries.BuiltIn import BuiltIn


class ApiClientLibrary:
    """Thin wrapper: sessions and verbs only; no business assertions."""

    def __init__(self) -> None:
        self._builtin = BuiltIn()
        self._requests = self._builtin.get_library_instance("RequestsLibrary")

    def open_api_session(self, alias: str, url: str, headers: dict | None = None) -> None:
        self._requests.create_session(alias, url, headers=headers or {})

    def post_json(self, alias: str, path: str, payload: dict) -> object:
        return self._requests.post_on_session(alias, path, json=payload)
```

In Robot, tests import `Library    ApiClientLibrary` and call only `Open Api Session`, `Post Json`, etc.

## Service Layer

Express **business operations** as keywords that combine calls and return handles or parsed data.

```robot
*** Settings ***
Resource    ../clients/api_client.resource
Resource    ../validators/http_validators.resource

*** Keywords ***
Create User And Expect Success
    [Arguments]    ${email}    ${password}
    ${payload}=    Build User Payload    ${email}    ${password}
    ${resp}=    Post Json    api    /users    ${payload}
    Validate Created User Response    ${resp}
    ${body}=    Set Variable    ${resp.json()}
    RETURN    ${body}
```

## Response Validator

Centralize assertions. One keyword can enforce status, required JSON fields, and schema.

```robot
*** Keywords ***
Validate Created User Response
    [Arguments]    ${response}
    Status Should Be    201    ${response}
    Dictionary Should Contain Key    ${response.json()}    id
    Validate Json Against Schema    ${response.text}    ${SCHEMA_USER}
```

## RequestsLibrary basics

| Concern | Pattern | Notes |
|---------|---------|--------|
| Session | `Create Session`, `GET On Session`, `POST On Session`, … | Reuse cookies, default headers, base URL |
| Sessionless (RF-Requests 0.9.7+) | `GET`, `POST`, `PUT`, `DELETE` with full URL | Good for smoke checks; less reuse |
| Status | `expected_status=` (on `GET` / `GET On Session`, etc.) or `Status Should Be` | Avoid silent passes on 4xx/5xx |

```robot
*** Settings ***
Library    RequestsLibrary

*** Test Cases ***
Example Session Flow
    Create Session    api    https://api.example.com    headers=${DEFAULT_HEADERS}
    ${r}=    GET On Session    api    /health    expected_status=200
```

## Request design

| Technique | Purpose |
|-----------|---------|
| **Request builders** | Keywords or Python helpers that merge base headers, trace IDs, and auth |
| **Dynamic payloads** | Timestamps, UUIDs, faker data — avoid fixed emails in suites |
| **Shared token** | Suite/setup keyword logs in once; stores token in a suite variable or session |

## Rules (non-negotiable)

1. **NEVER** assert raw JSON inline in test cases — use validator keywords or schema.
2. **ALWAYS** go through the service layer for flows — not “call `/users` then `/profiles`” in the test body.
3. **TEST** business flows (journey outcomes), not isolated endpoints as the primary artifact.

Following these rules keeps failures readable, reduces duplication, and lets you swap HTTP libraries behind the client layer without rewriting scenarios.
