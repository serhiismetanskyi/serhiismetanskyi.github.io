---
date: 2026-07-31
tags:
  - robot-framework
  - test-automation
---

# Error Handling & Retry Patterns

Robot Framework 5 introduced native **`TRY` / `EXCEPT` / `FINALLY` / `ELSE`** blocks inside keywords and tests. Together with built-in wrappers and `Wait Until Keyword Succeeds`, you can express recovery without scattering one-off workarounds.

## `TRY` / `EXCEPT` (RF 5+)

Handle a failure, then continue with a fallback path:

```robotframework
*** Keywords ***
Click With Recovery
    [Arguments]    ${locator}
    TRY
        Click Element    ${locator}
    EXCEPT
        Log    Element not found, retrying...    WARN
        Wait Until Element Is Visible    ${locator}    timeout=10s
        Click Element    ${locator}
    END
```

Narrow `EXCEPT` with message types or patterns when you want different handling for `AssertionError` vs timeout failures (see the User Guide for `EXCEPT` variants).

## Run Keyword And Ignore Error / Run Keyword And Expect Error

| Keyword | Behavior |
|---------|----------|
| `Run Keyword And Ignore Error` | Runs keyword; returns status + return value or error; **does not fail** the test. |
| `Run Keyword And Expect Error` | Fails the test unless the **expected** error message matches. |

Use **Ignore Error** for optional cleanup (close dialog if present). Use **Expect Error** for negative tests and contract checks.

## Wait Until Keyword Succeeds

Retries a keyword until it passes or **timeout** elapses:

| Argument | Role |
|----------|------|
| `timeout` | Maximum wall time (e.g. `30 s`). |
| `retry_interval` | Pause between attempts (e.g. `500 ms`). |
| `name` | Keyword to run. |
| `*args` | Arguments passed to that keyword. |

**Retry API call** (pseudo-keyword names):

```robotframework
Wait Until Keyword Succeeds    20s    1s    GET And Expect 200    /health
```

**Retry UI action**:

```robotframework
Wait Until Keyword Succeeds    15s    500ms    Click Element    ${SUBMIT}
```

Prefer explicit timeouts on the inner keyword where possible so failures stay diagnosable.

## Retry patterns (when to use what)

| Pattern | Use case |
|---------|----------|
| `Wait Until Keyword Succeeds` | Flaky I/O, eventual consistency, animations, load balancers. |
| `TRY` / `EXCEPT` | Alternate flows, logging context, controlled recovery. |
| `Run Keyword And Ignore Error` | Best-effort teardown steps, optional UI paths. |
| `Run Keyword If` | Branch on flags or previous assignment without failing. |

## Fail fast: stop on critical failures

| Mechanism | Use |
|-----------|-----|
| `Fatal Error` | Stops entire execution immediately (use sparingly—for unrecoverable environment faults). |
| `[Tags]    robot:exit-on-failure` | Fail-fast behavior for tagged tests/suites per [Robot’s reserved tags](https://robotframework.org/robotframework/latest/RobotFrameworkUserGuide.html#test-case-tags). |

Reserve fail-fast for **smoke gates** where continuing would corrupt data or waste cluster time.

## Custom retry in a Python library

Keep Robot syntax thin; implement bounded retries in Python with logging:

```python
import logging
import time
from typing import Callable, TypeVar

logger = logging.getLogger(__name__)
T = TypeVar("T")


def retry_call(
    fn: Callable[[], T],
    *,
    attempts: int = 5,
    delay_s: float = 0.5,
    label: str = "operation",
) -> T:
    last_exc: Exception | None = None
    for i in range(1, attempts + 1):
        try:
            logger.debug("retry_call attempt=%s/%s label=%s", i, attempts, label)
            return fn()
        except Exception as exc:  # noqa: BLE001 — boundary for automation retry
            last_exc = exc
            logger.warning("retry_call failed attempt=%s label=%s err=%s", i, label, exc)
            time.sleep(delay_s)
    assert last_exc is not None
    raise last_exc
```

Expose a thin keyword `Call With Retry` that wraps API clients or file operations.

## Logging on failures

- Use `Log    ${message}    level=WARN` inside `EXCEPT` with **locator, URL, user id (non-PII), and attempt count**.
- Capture screenshots or traces in **teardown** when a test fails (`Run Keyword If Test Failed` + library keywords).
- Keep retry logs at **DEBUG** in CI when diagnosing flakiness without flooding default reports.
