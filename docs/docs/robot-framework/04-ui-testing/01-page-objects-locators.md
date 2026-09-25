---
date: 2026-07-29
tags:
  - robot-framework
  - test-automation
  - ui-testing
---

# Page Object Pattern & Locators

In Robot Framework, the common “page object” shape is a **`.resource` file**: locators live in **variables**, interactions in **keywords**. Tests stay thin and call stable, intent-named keywords.

## Why resources, not classes

| Approach | Typical use in RF | Maintenance |
|----------|-------------------|-------------|
| **`.resource` + variables** | One file per page/area; import in tests | Change selector in one place |
| Python page classes | Possible via libraries | Heavier; mix RF and code ownership |
| Locators inlined in tests | Quick spikes | Duplication and brittle suites |

**Convention:** `pages/login_page.resource` defines `${LOGIN_USER}`, `Login With Credentials`, etc. Suites do `Resource    pages/login_page.resource` and never repeat raw selectors.

## Locator priority (use in this order)

1. **`data-testid` / `data-test`** — agreed with devs; survives restyling.
2. **`id`** — stable if not generated per session.
3. **CSS** — good for structure; avoid over-long chains.
4. **XPath** — last resort (fragile with DOM refactors).

**Centralize** every selector in the `*** Variables ***` section (or a dedicated variables file imported via `Variables`). **Separate** “what to find” (variables) from “what to do” (keywords).

## SeleniumLibrary vs Browser (Playwright)

| Aspect | SeleniumLibrary | Browser library |
|--------|-----------------|-----------------|
| Driver | WebDriver (browser drivers) | Playwright |
| Default timing | Often needs explicit waits | **Auto-wait** on actions/assertions |
| Network | Possible via browser APIs; more setup | **Request/response hooks**, routing |
| Browsers | Per-driver install | Chromium, Firefox, WebKit via Playwright |
| Multi-context | Windows/tabs via WebDriver | Strong **context** / **page** model |
| When to pick | Existing Selenium estate, strict WebDriver need | New UI suites, stability, modern apps |

Browser library reduces “wait soup” but you still model **clear page keywords** and **stable selectors**.

## Example: login page resource

`pages/login_page.resource` (SeleniumLibrary style; swap library keywords for Browser if needed):

```robot
*** Settings ***
Library    SeleniumLibrary

*** Variables ***
${LOGIN_URL}       https://app.example/login
${LOC_USER}        css:[data-testid="login-username"]
${LOC_PASS}        css:[data-testid="login-password"]
${LOC_SUBMIT}      css:[data-testid="login-submit"]
${LOC_ERR}         css:[data-testid="login-error"]

*** Keywords ***
Open Login Page
    Go To    ${LOGIN_URL}
    Wait Until Element Is Visible    ${LOC_SUBMIT}

Input Credentials
    [Arguments]    ${username}    ${password}
    Wait Until Element Is Visible    ${LOC_USER}
    Clear Element Text    ${LOC_USER}
    Input Text    ${LOC_USER}    ${username}
    Input Text    ${LOC_PASS}    ${password}

Submit Login
    Click Element    ${LOC_SUBMIT}

Login With Credentials
    [Arguments]    ${username}    ${password}
    Open Login Page
    Input Credentials    ${username}    ${password}
    Submit Login

Error Should Be Visible
    Wait Until Element Is Visible    ${LOC_ERR}
```

## Example: test using page keywords

```robot
*** Settings ***
Resource    pages/login_page.resource
Suite Setup       Open Browser    ${BASE_URL}    chrome
Suite Teardown    Close Browser

*** Variables ***
${BASE_URL}    https://app.example

*** Test Cases ***
Valid User Can Open Login And Submit
    Login With Credentials    ${VALID_USER}    ${VALID_PASS}
    Location Should Contain    /dashboard
```

## Composition for flows

Import several page resources and **compose** keywords for journeys (e.g. `Login With Credentials` then `Open Settings From Header` from `header.resource`). Keep each keyword **single-purpose**; orchestrate sequences in tests or a thin `flows.resource`.

## Checklist

| Practice | Do |
|----------|-----|
| Locators | Variables only; `data-testid` first |
| Keywords | Name by user intent, not widget IDs |
| Tests | No raw `Click` on CSS/XPath if a page keyword exists |
| Files | One primary `.resource` per page or major component |
