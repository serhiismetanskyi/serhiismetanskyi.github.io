---
date: 2026-07-26
tags:
  - robot-framework
  - test-automation
---

# Core Syntax & Test Structure

## What is Robot Framework?

Robot Framework is **open-source**, **keyword-driven**, and **Python-centric**: libraries expose **keywords**; tests call them in tabular plain text. **Robot Framework 7.x** continues the pipe-separated, readable format and adds practical language features: native **`VAR`**, improved scoping, and (from **7.4**) **secret variables** for safer logging. Execution, reporting, and tagging stay first-class, which suits API, UI, and hybrid automation in CI.

## Suite sections

| Section | Role |
|---------|------|
| `*** Settings ***` | Suite metadata, imports (`Library`, `Resource`, `Variables`), suite/task setup & teardown |
| `*** Variables ***` | Default data (`${scalar}`, `@{list}`, `&{dict}`) |
| `*** Test Cases ***` or `*** Tasks ***` | Executable examples (tests or RPA-style tasks) |
| `*** Keywords ***` | User-defined keywords for this file |

**`.robot` files** usually contain a runnable suite (tests or tasks). **`.resource` files** hold shared keywords and variables; they are imported with `Resource`, not run alone.

## Minimal suite example

```robotframework
*** Settings ***
Documentation     Smoke checks for login API
Library           RequestsLibrary
Resource          ../resources/common.resource
Suite Setup       Log    Starting suite    INFO
Suite Teardown    Log    Suite finished    INFO

*** Variables ***
${BASE_URL}       https://api.example.com

*** Test Cases ***
Health Endpoint Returns 200
    ${resp}=    GET    ${BASE_URL}/health
    Should Be Equal As Integers    ${resp.status_code}    200
```

## Setup, teardown, and test structure

Use **suite** setup/teardown once per file; **test** setup/teardown around each test. `Test Teardown` runs even if the test fails (good for cleanup).

```robotframework
*** Settings ***
Suite Setup       Prepare Test Data
Suite Teardown    Release Test Data
Test Setup        Open Context
Test Teardown     Close Context

*** Keywords ***
Prepare Test Data
    Log    seed data    DEBUG

Release Test Data
    Log    cleanup      DEBUG

Open Context
    Log    per-test start    DEBUG

Close Context
    Log    per-test end      DEBUG
```

## Data-driven tests with `[Template]`

`[Template]` runs one keyword multiple times with different arguments—compact data-driven suites.

```robotframework
*** Keywords ***
Add And Expect
    [Arguments]    ${a}    ${b}    ${expected}
    ${sum}=    Evaluate    int(${a}) + int(${b})
    Should Be Equal As Integers    ${sum}    ${expected}

*** Test Cases ***
Sum Two Numbers
    [Documentation]    Validates addition for several pairs
    [Template]    Add And Expect
    1    2    3
    0    0    0
    4    6    10
```

For more steps per row, use a dedicated template keyword that wraps the workflow.

## Tags and documentation

```robotframework
*** Test Cases ***
Login With Valid User
    [Documentation]    Ensures happy-path login works
    [Tags]    smoke    auth    api
    # steps...
```

Run subsets: `robot --include smoke path/to/tests`.

## Control structures (RF 5+)

**FOR** with `END`:

```robotframework
*** Test Cases ***
Iterate Items
    FOR    ${item}    IN    one    two    three
        Log    ${item}
    END
```

**IF / ELSE IF / ELSE**:

```robotframework
*** Test Cases ***
Branching Example
    IF    '${ENV}' == 'prod'
        Log    strict mode
    ELSE
        Log    relaxed mode
    END
```

**TRY / EXCEPT / FINALLY** (RF 7.0+ `FINALLY` support—use `FINALLY` when you need guaranteed cleanup):

```robotframework
*** Test Cases ***
Handle Failure
    TRY
        Should Be Equal    ${1}    ${2}
    EXCEPT    AS    ${err}
        Log    failed: ${err}    WARN
    END
```

**WHILE**:

```robotframework
*** Test Cases ***
Poll Until Ready
    ${n}=    Set Variable    ${0}
    WHILE    ${n} < ${5}
        ${n}=    Evaluate    ${n} + 1
        Log    attempt ${n}
    END
```

## Native `VAR` (Robot Framework 7.0+)

`VAR` creates variables inside tests and keywords without `Set Variable`; supports **scope** (`TEST`, `SUITE`, `GLOBAL`).

```robotframework
*** Test Cases ***
Scoped Variables
    VAR    ${local}    hello
    VAR    ${suite_wide}    shared    scope=SUITE
    Should Be Equal    ${local}    hello
```

Prefer `VAR` for new suites where your RF version is 7+; it keeps intent clear and aligns with current documentation.

## Practical checklist

| Topic | Tip |
|-------|-----|
| Resources vs libraries | Put **vocabulary** (keywords) in `.resource`; put **code** in Python libraries |
| Teardown | Use `Test Teardown` for must-run cleanup (sessions, temp files) |
| Tags | Align tag names with CI jobs (`smoke`, `regression`, `not_ready`) |
| Templates | Use `[Template]` when steps are identical and only inputs change |
