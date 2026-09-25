---
date: 2026-07-29
tags:
  - robot-framework
  - test-automation
  - api-testing
---

# API Testing — Step by Step

Progressive examples: from a single test to a proper layered architecture.

## Architecture (goal)

```text
tests → keywords → services → http
```

Tests are clean. Logic is extracted. Easy to scale.

---

## Level 1 — Simple API test

Minimal working test. Good for learning, **not** for real projects.

```robot
*** Settings ***
Library    RequestsLibrary

*** Variables ***
${BASE_URL}    https://jsonplaceholder.typicode.com

*** Test Cases ***
Create Post
    Create Session    api    ${BASE_URL}
    ${body}=    Create Dictionary    title=RF Test    body=Hello    userId=1
    ${resp}=    POST On Session    api    /posts    json=${body}
    Should Be Equal As Integers    ${resp.status_code}    201

Get Single Post
    Create Session    api    ${BASE_URL}
    ${resp}=    GET On Session    api    /posts/1
    Should Be Equal As Integers    ${resp.status_code}    200
```

Problems: duplicated `Create Session`, assertions mixed with calls, no reuse.

---

## Level 2 — JSON response validation

Check response body, not only status code.

```robot
*** Test Cases ***
Create Post And Verify Body
    Create Session    api    ${BASE_URL}
    ${body}=    Create Dictionary    title=RF Test    body=Example    userId=1
    ${resp}=    POST On Session    api    /posts    json=${body}
    Should Be Equal As Integers    ${resp.status_code}    201

    ${json}=    Set Variable    ${resp.json()}
    Dictionary Should Contain Key    ${json}    id
    Should Be Equal    ${json}[title]    RF Test
    Should Be Equal    ${json}[body]     Example
```

Better: we validate the body. Still: logic and transport mixed in one place.

---

## Level 3 — Extract keywords (proper separation)

### `resources/post_keywords.resource`

```robot
*** Settings ***
Library    RequestsLibrary

*** Variables ***
${BASE_URL}    https://jsonplaceholder.typicode.com

*** Keywords ***
Open API
    Create Session    api    ${BASE_URL}

Create Post
    [Arguments]    ${title}    ${body_text}    ${user_id}=1
    ${payload}=    Create Dictionary    title=${title}    body=${body_text}    userId=${user_id}
    ${resp}=    POST On Session    api    /posts    json=${payload}
    RETURN    ${resp}

Get Post By ID
    [Arguments]    ${post_id}
    ${resp}=    GET On Session    api    /posts/${post_id}
    RETURN    ${resp}

Response Status Should Be
    [Arguments]    ${resp}    ${expected}
    Should Be Equal As Integers    ${resp.status_code}    ${expected}

Response Should Contain Field
    [Arguments]    ${resp}    ${field}
    Dictionary Should Contain Key    ${resp.json()}    ${field}
```

### `tests/post_tests.robot`

```robot
*** Settings ***
Resource       ../resources/post_keywords.resource
Suite Setup    Open API
Default Tags   api

*** Test Cases ***
Create Post Returns 201
    [Tags]    smoke
    ${resp}=    Create Post    RF Title    RF Body
    Response Status Should Be    ${resp}    201
    Response Should Contain Field    ${resp}    id

Get Post Returns Correct Data
    ${resp}=    Get Post By ID    1
    Response Status Should Be    ${resp}    200
    Should Be Equal    ${resp.json()}[id]    ${1}

Create Post With Custom User
    ${resp}=    Create Post    Custom    Text    user_id=5
    Response Status Should Be    ${resp}    201
    Should Be Equal    ${resp.json()}[userId]    ${5}
```

Now: test is clean, logic is extracted, easy to scale.

---

## Level 4 — Data-driven with `[Template]`

One keyword, multiple data rows. Ideal for auth / validation / boundary tests.

```robot
*** Settings ***
Resource       ../resources/post_keywords.resource
Suite Setup    Open API
Default Tags   api    data-driven

*** Test Cases ***
Create Post Matrix
    [Template]    Create Post And Expect Status
    A title     Body one     201
    ${EMPTY}    Body two     201
    Title 3     ${EMPTY}     201

*** Keywords ***
Create Post And Expect Status
    [Arguments]    ${title}    ${body_text}    ${expected_status}
    ${payload}=    Create Dictionary    title=${title}    body=${body_text}    userId=1
    ${resp}=    POST On Session    api    /posts    json=${payload}
    ...    expected_status=${expected_status}
    Log    Create post status: ${resp.status_code}    INFO
```

Each row is a separate test iteration in the report. No duplication.

---

## Level 5 — Full framework

When projects grow (10+ endpoints, multiple services), add Python libraries and a service layer. See [Practical — Full API Framework](04-practical-api-framework.md) for the complete project with:

- `ApiClient.py` — HTTP transport
- `UserService.py` — business operations
- `SchemaValidator.py` — JSON Schema
- Resource files + test files
- `pyproject.toml` + run commands

## Summary

| Level | What changes | When to use |
|-------|-------------|-------------|
| 1 | Inline everything | Learning, spikes |
| 2 | + JSON validation | Quick checks |
| 3 | + Keywords in `.resource` | Real projects (minimum) |
| 4 | + `[Template]` data-driven | Auth, boundary, matrix tests |
| 5 | + Python libs + service layer | Enterprise, multi-team |
