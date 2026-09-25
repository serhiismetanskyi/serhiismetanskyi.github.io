---
date: 2026-07-27
tags:
  - robot-framework
  - test-automation
---

# Libraries & Extensibility

## Built-in standard libraries

Ship with Robot Framework (Python stdlib-backed). Common ones:

| Library | Purpose |
|---------|---------|
| `BuiltIn` | Control flow helpers, logging, assertions (implicit) |
| `Collections` | List/dict utilities |
| `String` | Text manipulation |
| `OperatingSystem` | Files, paths, process spawning |
| `DateTime` | Dates and times |
| `XML` | XML parsing and validation |

```robotframework
*** Settings ***
Library           Collections
Library           String

*** Test Cases ***
Collections Example
    ${items}=    Create List    a    b
    Append To List    ${items}    c
    Length Should Be    ${items}    3
```

## External libraries (ecosystem)

| Library | Purpose | Install (typical) |
|---------|---------|-------------------|
| `SeleniumLibrary` | Classic browser UI (WebDriver) | `pip install robotframework-seleniumlibrary` |
| `Browser` | Modern UI via Playwright | `pip install robotframework-browser` |
| `RequestsLibrary` | HTTP / REST | `pip install robotframework-requests` |
| `DatabaseLibrary` | DB access | `pip install robotframework-databaselibrary` |
| `SSHLibrary` | Remote shell / SFTP | `pip install robotframework-sshlibrary` |

Verify each project’s PyPI name and version against your Python environment; pin versions in CI.

## Custom Python libraries

| Style | When to use |
|-------|-------------|
| **Static** | Simple module: functions become keywords by name |
| **Dynamic** | `get_keyword_names` + `run_keyword`—meta-programming, RPC-style |
| **Hybrid** | Class-based with attributes for doc-driven behavior |

### Example: static API with `@keyword`

```python
from robot.api.deco import keyword


@keyword("Multiply ${a} By ${b}")
def multiply_by(a: float, b: float) -> float:
    return float(a) * float(b)
```

```robotframework
*** Settings ***
Library    ../libs/math_ops.py

*** Test Cases ***
Use Custom Keyword
    ${p}=    Multiply ${2} By ${3}
    Should Be Equal As Numbers    ${p}    ${6}
```

## Importing in `*** Settings ***`

```robotframework
*** Settings ***
Library           SeleniumLibrary    timeout=10s    run_on_failure=Capture Page Screenshot
Library           Browser    timeout=30s
Resource          keywords/login.resource
Variables         config/stage.yaml
```

- **`Library`** — Python module or class path.
- **`Resource`** — another `.robot` / `.resource` file (keywords and variables).
- **`Variables`** — variable file (Python dict/list, YAML, etc., per setup).

## Remote library interface

**Remote** libraries run keywords on another process or host via XML-RPC—useful for legacy stacks, constrained environments, or sharing one heavy dependency. You start a remote server wrapping a real library, then import `Remote` with the URI.

```robotframework
*** Settings ***
Library           Remote    http://127.0.0.1:8270    WITH NAME    LegacySvc
```

Treat remote calls like network I/O: timeouts, retries, and security (TLS, auth) matter.

## Library scope

Control how **library instances** are reused with `ROBOT_LIBRARY_SCOPE` on the class:

| Scope | Behavior |
|-------|----------|
| `TEST` | New instance per test (default for many libs) |
| `SUITE` | One instance per suite file |
| `GLOBAL` | Single instance for whole run |

```python
class ExampleLib:
    ROBOT_LIBRARY_SCOPE = "SUITE"

    def __init__(self) -> None:
        self._state = 0
```

Use **SUITE** or **GLOBAL** only when expensive setup is safe to share and isolation is still acceptable.

## Quick selection guide

| Need | Direction |
|------|-----------|
| Reusable Robot vocabulary | `.resource` + user keywords |
| Non-trivial logic / I/O | Python library |
| Third-party protocol (HTTP, browser, DB) | Mature Robot library first |
| Cross-language or remote system | Remote library or dedicated service + thin Robot wrapper |
