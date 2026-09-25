---
date: 2026-08-01
tags:
  - robot-framework
  - test-automation
  - ci-cd
---

# Logging, Debugging & Reporting

Good infrastructure makes failures **visible**, **traceable**, and **machine-consumable**. Robot Framework’s built-in log and report files cover most teams; add API and UI-specific traces, then plug into CI-friendly formats when needed.

## Built-in logging

### `Log` keyword and levels

Use explicit messages at the right level so `log.html` tells a story.

```robot
*** Settings ***
Library    BuiltIn

*** Test Cases ***
Checkout Flow
    Log    Starting checkout with cart id ${CART_ID}    INFO
    Log    Cookie jar snapshot (debug)    DEBUG
```

| Level | Typical use |
|-------|----------------|
| `TRACE` | Deep framework or library internals |
| `DEBUG` | Payload snippets, selector details |
| `INFO` | Step narrative for reviewers |
| `WARN` | Recoverable oddities |
| `ERROR` | Assertion context before failure |

### `Log To Console`

Stream important milestones to **stdout** (CI console) without duplicating entire keyword traces:

```robot
Log To Console    \n=== API suite: ${SUITE SOURCE} ===
```

### `Set Log Level`

Tune verbosity per suite or keyword when investigating flakiness:

```robot
Set Log Level    DEBUG
```

## Request and response logging (API tests)

With **RequestsLibrary** (or similar), log safe subsets of traffic—never full secret headers.

```robot
${resp}=    GET On Session    mysession    /users/1
Log    status=${resp.status_code}    INFO
Log    ${resp.json()}    DEBUG
```

| Technique | Tip |
|-----------|-----|
| Correlation IDs | Log `${resp.headers}[X-Request-Id]` at `INFO` |
| Bodies | Prefer `DEBUG`; truncate large JSON |
| Auth | Never log `Authorization` or raw tokens |

## Step-level logging in keywords

Wrap domain keywords with **one INFO line in / one INFO line out** so failures point to the right layer:

```robot
*** Keywords ***
Create Order And Expect 201
    [Arguments]    ${payload}
    Log    Creating order    INFO
    ${r}=    POST On Session    api    /orders    json=${payload}
    Should Be Equal As Integers    ${r.status_code}    201
    Log    Order created    INFO
```

## Debugging techniques

| Technique | Command / pattern |
|-----------|-------------------|
| Verbose run | `robot --loglevel DEBUG tests/` |
| UI failure artifact | Capture screenshot in `Teardown` on failure (Selenium/Playwright libraries) |
| Rich HTML fragment | `Log    ${html}    html=True` for formatted dumps (still scrub secrets) |

Example pattern for UI teardown (library-specific calls vary):

```robot
*** Keywords ***
Run Keyword If Test Failed    Capture Page Screenshot    ${OUTPUT_DIR}${/}fail_${TEST NAME}.png
```

## Built-in reports

After a run, Robot emits three primary artifacts (names configurable):

| File | Purpose |
|------|---------|
| `log.html` | Step-by-step timeline, arguments, messages |
| `report.html` | Pass/fail summary, tags, suites |
| `output.xml` | Machine-readable full result model |

```bash
robot --outputdir results --log log.html --report report.html --output output.xml tests/
```

## Advanced reporting

### Allure

Use **robotframework-allure** (or Allure adaptor compatible with your stack) to attach screenshots, request/response excerpts, and history trends.

```bash
robot --listener allure_robotframework tests/
allure serve allure-results/
```

### Custom reports from `output.xml`

Parse XML with your own script or **robot.result** APIs to feed dashboards, Slack summaries, or defect triage tools.

### JUnit XML for CI

Many systems ingest xUnit format:

```bash
robot --xunit results/xunit.xml tests/
```

## Report merging with `rebot`

Combine parallel shards or reruns:

```bash
rebot --name Combined --outputdir merged output/*.xml
```

## Best practices

| Practice | Why |
|----------|-----|
| Default `INFO`, spike with `DEBUG` | Readable logs; deep detail when needed |
| Structured messages (ids, endpoints) | Faster correlation with backend logs |
| Scrub secrets in custom listeners | Secret vars help; libraries can still leak if misused |
| Publish `log.html` + `report.html` as CI artifacts | Review failures without rerunning locally |
| Use `--xunit` or Allure for trends | History beats one-off HTML opens |

## See also

- [Configuration & secrets](01-configuration-secrets.md) — align log policy with secret handling.
- [CI/CD integration](03-ci-cd-integration.md) — artifact upload and parallel merge.
