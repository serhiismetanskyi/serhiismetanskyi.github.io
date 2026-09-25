---
date: 2026-07-26
tags:
  - robot-framework
  - test-automation
---

# Keywords & Variables

## Built-in keywords (BuiltIn)

The **BuiltIn** library is always available. Common keywords:

| Keyword | Typical use |
|---------|-------------|
| `Log`, `Log Many` | Debug and structured console/log output |
| `Should Be Equal`, `Should Contain`, `Should Be True` | Assertions |
| `Run Keyword If`, `Run Keyword Unless` | Legacy branching (prefer `IF` in RF 5+) |
| `Wait Until Keyword Succeeds` | Poll until a keyword passes or timeout |
| `Sleep` | Last resort; prefer explicit waits in UI/API libs |
| `Set Suite/Test/Global Variable` | Dynamic assignment (see also `VAR` in RF 7+) |

```robotframework
*** Test Cases ***
BuiltIn Examples
    Wait Until Keyword Succeeds    5s    250ms    Should Be Equal    ${1}    ${1}
    Should Contain    Robot Framework    Robot
```

## User-defined keywords

Define reusable steps under `*** Keywords ***` in `.robot` or `.resource` files.

**Naming:** use **business-readable**, **action-oriented** phrases: `Login With Valid Credentials`, not `DoStuff`.

```robotframework
*** Keywords ***
Login With Valid Credentials
    [Arguments]    ${username}    ${password}
    Create Session    api    ${BASE_URL}
    ${payload}=    Create Dictionary    user=${username}    pass=${password}
    ${resp}=    POST On Session    api    /login    json=${payload}
    Should Be Equal As Integers    ${resp.status_code}    200
```

## Keyword arguments

| Style | Example |
|-------|---------|
| Positional | `Keyword    a    b` |
| Named | `Keyword    named_arg=value` |
| Defaults | `[Arguments]    ${x}    ${y}=default` |
| Embedded | `User "${name}" Has Role "${role}"` → name and role in keyword name |

## Return values

Assign the result with `${var}=    Keyword    args...`.

```robotframework
*** Keywords ***
Compute Total
    [Arguments]    ${a}    ${b}
    ${sum}=    Evaluate    int(${a}) + int(${b})
    RETURN    ${sum}

*** Test Cases ***
Use Return
    ${t}=    Compute Total    2    3
    Should Be Equal As Integers    ${t}    5
```

(`RETURN` is modern; older suites may use `[Return]` in keyword settings.)

## Variable types

| Syntax | Meaning |
|--------|---------|
| `${name}` | Scalar (string-like) |
| `@{name}` | List |
| `&{name}` | Dictionary (mapping) |

```robotframework
*** Variables ***
@{IDS}        1    2    3
&{USER}       name=Ada    role=admin

*** Test Cases ***
Expand List
    FOR    ${id}    IN    @{IDS}
        Log    id=${id}
    END
```

## Variable sources

| Source | Notes |
|--------|------|
| `*** Variables ***` | Versioned defaults in suite/resource |
| Variable files | `Variables    myvars.py` or `vars.yaml` (YAML with RF YAML support) |
| CLI | `robot --variable ENV:staging tests` |
| Dynamic | `VAR`, `Set Test Variable`, etc. |

## Scopes

| Scope | Visibility |
|-------|------------|
| Local | Inside one keyword (default for `VAR` without `scope=`) |
| Test | Visible for remainder of current test |
| Suite | All tests in current suite file |
| Global | Entire execution (use sparingly) |

```robotframework
VAR    ${x}    one    scope=TEST
VAR    ${y}    two    scope=SUITE
```

## Built-in variables

| Variable | Meaning |
|----------|---------|
| `${CURDIR}` | Directory of the current file |
| `${EXECDIR}` | Where execution was started |
| `${TEMPDIR}` | Temp directory for this run |
| `${/}` | Path separator |
| `${OUTPUT_DIR}` | Where report/log/output go |
| `${TEST_NAME}` / `${SUITE_NAME}` | Current test / suite |

Use `${CURDIR}` when importing `Resource` or `Variables` with relative paths.

## Secret variables (Robot Framework 7.4+)

Secrets **hide values in logs and output files**; they are **not encryption**. Values cannot be plain literals in data; use **environment variables** or existing secrets (see RF 7.4 release notes).

**`VAR`** uses the same **`${name: Secret}`** form as the Variables section:

```robotframework
*** Test Cases ***
Call API With Token
    VAR    ${token: Secret}    %{API_TOKEN}
    Some Keyword    ${token}
```

CLI example (value may appear in shell history—prefer env indirection in CI):

```text
robot --variable "TOKEN: Secret:$API_TOKEN" tests
```

Access from Python libraries uses `robot.api.types.Secret` and often `.value` where appropriate—keep exposure out of Robot logs.
