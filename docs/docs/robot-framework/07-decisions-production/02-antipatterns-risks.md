---
date: 2026-08-02
tags:
  - robot-framework
  - test-automation
---

# Anti-Patterns, Risks & Limitations

Robot Framework rewards discipline: scenarios stay declarative, complexity moves to keywords and libraries. This page maps common mistakes to fixes and sets expectations on what Robot is—and is not—optimized for.

## Critical anti-patterns

| Anti-Pattern | Symptom | Fix |
|--------------|---------|-----|
| Tests with logic | `IF`/`ELSE` in test cases | Move branching to keywords or Python helpers |
| Hardcoded data | Breaks on env/tenant change | Variable files, `*** Variables ***`, CI matrix args |
| Direct API calls in tests | Duplication, no single place to fix auth/headers | Service-layer keywords or library |
| No abstraction | Thousand-line `.robot` files | Layered resources + domain keywords |
| UI-heavy testing | Slow, flaky suite | API-first; reserve UI for critical paths |
| Huge keywords | 50+ line keywords | Split into sub-keywords; return data, don’t hide state |
| Mixed responsibilities | One keyword sets up, acts, asserts | Single responsibility per keyword |
| Sleep-based waits | Random flakes and wasted time | Explicit waits (`Wait Until ...`, library-specific waits) |

### Before and after: logic in the wrong layer

**Anti-pattern (logic in the test body):**

```robot
*** Test Cases ***
Fragile Login Check
    ${status}=    Run Keyword And Return Status    Page Should Contain    Welcome
    IF    ${status}
        Log    ok
    ELSE
        Fail    not welcomed
    END
```

**Better (decision inside a keyword):**

```robot
*** Keywords ***
User Should See Post Login Shell
    Wait Until Page Contains Element    id=app-shell    timeout=10s
    Page Should Contain    Welcome

*** Test Cases ***
Login Shows Shell
    Login With Valid Credentials    ${USER}    ${PASS}
    User Should See Post Login Shell
```

### Service layer sketch

```robot
*** Keywords ***
Create User Via API
    [Arguments]    ${payload}
    ${resp}=    POST On Session    service    /users    json=${payload}
    Should Be Equal As Integers    ${resp.status_code}    201
    ${body}=    Set Variable    ${resp.json()}
    RETURN    ${body}[id]
```

## Risks and limitations

| Risk / limitation | Impact | Typical response |
|-------------------|--------|------------------|
| Verbose syntax | New developers resist adoption | Pair with thin Python libraries; document patterns |
| Ignored architecture | Suite becomes unmaintainable | Enforce layers in review; lint/naming conventions |
| UI flakiness | Browser timing, environment variance | Fewer UI tests; stable waits; isolated data |
| Limited performance testing | Robot is not a load generator | Run Locust/k6 separately; link artifacts to same release |
| Custom library learning curve | Teams stuck in `.robot` only | Template library; code review support; training |

## Risk mitigation strategies

| Risk area | Mitigation | Owner |
|-----------|------------|-------|
| Flakiness | Tag quarantine (`wip`, `unstable`), retry only in CI with caps, root-cause timeouts | QA + Dev |
| Slow CI | Pabot, tag subsets on PR, nightly full | Platform |
| Secret leakage | No secrets in repo; inject via env in libraries | Security |
| Environment drift | Documented `dev.yaml` / `staging.yaml` variable files | SRE |
| Unclear failures | Rich `Fail` messages; log request/response in libraries (redact PII) | Feature team |

### Explicit wait instead of sleep

```robot
# Avoid
Sleep    3s

# Prefer (SeleniumLibrary-style example; adapt to your library)
Wait Until Element Is Visible    ${SUBMIT_BUTTON}    timeout=10s
Click Element    ${SUBMIT_BUTTON}
```

## Summary

Robot stays maintainable when **tests read like examples**, **keywords encode how**, and **libraries encode hard things**. Reserve UI and full-stack paths for what cheaper layers cannot prove—and offload load testing to dedicated tools.
