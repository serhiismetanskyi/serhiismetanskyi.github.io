---
date: 2026-07-30
tags:
  - robot-framework
  - test-automation
  - ui-testing
---

# UI Testing — Step by Step

Progressive path: simple Selenium test -> reusable page keywords -> data-driven -> Browser (Playwright).

## Level 1 — Simple Selenium test

```robot
*** Settings ***
Library    SeleniumLibrary

*** Test Cases ***
Login UI Test
    Open Browser    https://example.com/login    chrome
    Input Text      id=username    admin
    Input Text      id=password    secret123
    Click Button    id=login-btn
    Wait Until Page Contains    Dashboard
    [Teardown]    Close Browser
```

Good for learning, but not scalable.

## Level 2 — Extract page keywords

### `resources/pages/login_page.resource`

```robot
*** Settings ***
Library    SeleniumLibrary

*** Variables ***
${LOC_USER}      id=username
${LOC_PASS}      id=password
${LOC_LOGIN}     id=login-btn
${LOC_ERROR}     css:.login-error

*** Keywords ***
Open Login Page
    [Arguments]    ${url}
    Go To    ${url}
    Wait Until Element Is Visible    ${LOC_LOGIN}

Fill Credentials
    [Arguments]    ${username}    ${password}
    Input Text    ${LOC_USER}    ${username}
    Input Text    ${LOC_PASS}    ${password}

Submit Login
    Click Button    ${LOC_LOGIN}

Login As
    [Arguments]    ${username}    ${password}    ${url}=https://example.com/login
    Open Login Page    ${url}
    Fill Credentials    ${username}    ${password}
    Submit Login

Login Error Should Be Visible
    Wait Until Element Is Visible    ${LOC_ERROR}
```

### `tests/login_tests.robot`

```robot
*** Settings ***
Resource         ../resources/pages/login_page.resource
Suite Setup      Open Browser    about:blank    chrome
Suite Teardown   Close All Browsers

*** Test Cases ***
Valid Login Shows Dashboard
    [Tags]    smoke
    Login As    admin    secret123
    Wait Until Page Contains    Dashboard

Invalid Password Shows Error
    [Tags]    negative
    Login As    admin    wrong
    Login Error Should Be Visible
```

Now tests are cleaner and reusable.

## Level 3 — Data-driven login

```robot
*** Settings ***
Resource         ../resources/pages/login_page.resource
Suite Setup      Open Browser    about:blank    chrome
Suite Teardown   Close All Browsers

*** Test Cases ***
Login With Various Credentials
    [Template]    Login And Expect Result
    admin      secret123    Dashboard
    admin      wrong        Login Error
    ${EMPTY}   ${EMPTY}     Login Error

*** Keywords ***
Login And Expect Result
    [Arguments]    ${user}    ${pass}    ${expected_text}
    Login As    ${user}    ${pass}
    Wait Until Page Contains    ${expected_text}    timeout=5s
```

Best for auth matrices and negative scenarios.

## Level 4 — Browser (Playwright) version

```robot
*** Settings ***
Library    Browser

*** Variables ***
${LOC_USER}      [data-testid="login-username"]
${LOC_PASS}      [data-testid="login-password"]
${LOC_SUBMIT}    [data-testid="login-submit"]
${LOC_ERROR}     [data-testid="login-error"]
${LOC_WELCOME}   [data-testid="welcome-message"]

*** Keywords ***
Login As User
    [Arguments]    ${username}    ${password}    ${url}=https://demo.example.com
    Go To    ${url}/login
    Fill Text    ${LOC_USER}    ${username}
    Fill Text    ${LOC_PASS}    ${password}
    Click    ${LOC_SUBMIT}

Login Should Succeed
    Wait For Elements State    ${LOC_WELCOME}    visible    timeout=5s

Login Error Should Be Visible
    Wait For Elements State    ${LOC_ERROR}    visible    timeout=5s
```

## Level 5 — Full framework

See [Practical — Full UI Framework](04-practical-ui-framework.md):

- page resources (`login`, `dashboard`, `settings`)
- Python helpers (`DataFactory`, `ScreenshotHelper`)
- login + e2e test suites
- run commands for smoke/debug/parallel

## Summary

| Level | What changes | When to use |
|-------|-------------|-------------|
| 1 | Inline Selenium test | Learning |
| 2 | Page keywords in `.resource` | Real projects (minimum) |
| 3 | `[Template]` data-driven | Login matrix, validation |
| 4 | Browser (Playwright) keywords | New projects, less flakiness |
| 5 | Full framework + helpers | Multi-page E2E, teams |
