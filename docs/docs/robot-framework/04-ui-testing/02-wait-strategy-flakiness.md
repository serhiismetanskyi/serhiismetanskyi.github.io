---
date: 2026-07-30
tags:
  - robot-framework
  - test-automation
  - ui-testing
---

# Wait Strategies & Flakiness Control

Flaky UI tests usually come from **assumptions about time** (DOM, network, animations). Robot Framework gives you explicit synchronization primitives; modern **Browser** (Playwright) adds **auto-wait** on many keywords—still combine with clear expectations.

## Core principles

| Rule | Rationale |
|------|-----------|
| **Never `Sleep` in tests** | Fixed delays are too short (flaky) or too long (slow). |
| Prefer **explicit waits** | Wait for a **condition** tied to user-visible or functional state. |
| **Browser library**: trust auto-wait, still assert | Actions wait for attach/visible/enabled; verify outcomes explicitly. |
| **SeleniumLibrary**: prefer explicit over implicit | `Set Selenium Implicit Wait` can hide real issues; use targeted `Wait Until …` for clarity. |

## Wait patterns (SeleniumLibrary-oriented)

| Pattern | When to use | Example idea |
|---------|-------------|----------------|
| `Wait Until Element Is Visible` | Element appears after click/XHR | Panel opens after “Save” |
| `Wait Until Page Contains Element` | Known selector eventually in DOM | Lazy list row |
| `Wait Until Page Contains` | Text/label from API renders | Search snippet |
| `Wait Until Keyword Succeeds` | Retry **short** unstable checks | Poll until status badge = Ready |

```robot
Wait Until Element Is Visible    ${LOC_TOAST}    10s
Wait Until Page Contains    Order confirmed
Wait Until Keyword Succeeds    5x    1s    Element Text Should Be    ${LOC_STATUS}    Ready
```

For **Browser** library, prefer built-in keywords (`Wait For Elements State`, `Get Text`, etc.) per your version’s docs; the **idea** is the same: wait for **state**, not seconds.

## Flakiness: causes and responses

| Cause | Symptom | Mitigation |
|-------|---------|------------|
| Dynamic content | Intermittent “not found” | Explicit wait on the **post-condition** element or text |
| Race / ordering | Passes locally, fails in CI | `Wait Until Keyword Succeeds` with sane **timeout** and **interval** |
| Stale element | Exception after find | **Re-query** locator immediately before action |
| CSS animations | Click misses target | Wait for stable state (class removed, `aria-busy=false`, or element visible+stable) |
| Shared data | Order depends on another test | **Isolation**: clean DB/session; unique test users |

## Retry with `Wait Until Keyword Succeeds`

Use for **idempotent** checks (not for one-shot side effects like “pay twice”):

```robot
Wait Until Keyword Succeeds    30s    500ms    Check Export Completed

*** Keywords ***
Check Export Completed
    Page Should Contain Element    css:[data-testid="export-done"]
```

Tune **total time** ≈ worst realistic latency; **interval** avoids hammering the UI.

## Selectors and evidence

| Topic | Guidance |
|-------|----------|
| Selectors | Prefer `data-testid`; avoid long XPath |
| Failure analysis | Capture **screenshot on failure** + logs in CI artifacts |
| Scope | **Minimize UI tests**; cover critical paths in UI, details via **API** tests |

### Screenshot on failure (SeleniumLibrary)

```robot
*** Settings ***
Library    SeleniumLibrary    run_on_failure=Capture Page Screenshot
```

Alternatively, register any keyword (custom path, browser info dump):

```robot
Register Keyword To Run On Failure    Capture Page Screenshot
```

**Browser** library: use its built-in failure artifacts (screenshot/trace) per [Browser library configuration](https://marketsquare.github.io/robotframework-browser/Browser.html#library-import-settings); keep artifacts in CI for triage.

## Best practices summary

| Practice | Recommendation |
|----------|------------------|
| Synchronization | Condition-based waits; no blind `Sleep` |
| Assertions | After wait, assert user-visible outcome |
| Stability | Stable locators + retry only where appropriate |
| Isolation | Fresh login/data per test where possible |
| Portfolio | Thin UI layer on top of API-heavy coverage |

## SeleniumLibrary: implicit wait (use sparingly)

```robot
Set Selenium Implicit Wait    2s
```

Useful as a **safety net**, but **explicit** waits keep failures **local and readable**. Document any global implicit wait as a team decision, not the default fix for every flake.
