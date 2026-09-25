---
date: 2026-07-31
tags:
  - robot-framework
  - test-automation
---

# Setup, Teardown & Test Organization

Setup and teardown keywords define **lifecycle boundaries**: what must be true before work starts, and what must run to release resources **even when the test fails**. Robot runs teardown in a **finally**-like manner so you can trust cleanup code.

## Setup / teardown levels

| Level | Setting | Runs when |
|-------|---------|-----------|
| **Suite** | `Suite Setup` / `Suite Teardown` | Once before / after **all tests** in the suite file. |
| **Test** | `Test Setup` / `Test Teardown` | Before / after **each test case** in that suite. |
| **Keyword** | `[Setup]` / `[Teardown]` on a user keyword | Around **that keyword’s** execution (nested scopes possible). |

**Suite** scope is ideal for expensive one-time work (start browser once). **Test** scope is ideal for **resetting** state so cases do not depend on order.

## Teardown always runs

If the test body fails, **test teardown** still executes. Put **close browser**, **logout**, **delete temp rows**, and **release locks** here—not only at the end of the happy path.

## Common use cases

| Concern | Typical placement |
|---------|-------------------|
| Environment / feature flags | `Suite Setup` |
| Open browser, base URL | `Suite Setup`; `Suite Teardown` closes |
| Per-test data seed | `Test Setup` |
| API auth token per test | `Test Setup` or dedicated keyword with `[Setup]` |
| Screenshots on failure | `Test Teardown` + `Run Keyword If Test Failed` |

## Example: suite-level browser management

```robotframework
*** Settings ***
Library           Browser
Suite Setup       Open Browser Context
Suite Teardown    Close Browser    ALL

*** Keywords ***
Open Browser Context
    New Browser    chromium    headless=${HEADLESS}
    New Context
    New Page       ${BASE_URL}/login
```

## Example: test-level data cleanup

```robotframework
*** Settings ***
Test Teardown     Run Keywords    Run Keyword If Test Failed    Take Screenshot    AND    Delete Test User    ${TEST_USER_ID}

*** Keywords ***
Delete Test User
    [Arguments]    ${user_id}
    API Delete User    ${user_id}
```

## Test organization

| Practice | Detail |
|----------|--------|
| **Tags** | Examples: `smoke`, `regression`, `critical`, `api`, `ui`. |
| **Selective runs** | `robot --include smoke` / `--exclude slow` (same tags work under `pabot`). |
| **Suite layout** | One directory or file per **feature/domain**; avoid mega-files. |
| **Naming** | Test names read as behavior: `Login Fails With Invalid Password`. |

## Useful `robot` CLI options

| Option | Purpose |
|--------|---------|
| `--outputdir DIR` | Separate artifacts per job or matrix cell. |
| `--log log.html` | HTML log path. |
| `--report report.html` | HTML report path. |
| `--variable NAME:value` | Override `${NAME}` without editing files (secrets via CI, not committed). |

## Example: full local run

```bash
robot \
  --outputdir results/smoke \
  --log results/smoke/log.html \
  --report results/smoke/report.html \
  --variable ENV:staging \
  --include smoke \
  tests/
```

Use the same structure in CI; only the `ENV` and credentials injection mechanism change.
