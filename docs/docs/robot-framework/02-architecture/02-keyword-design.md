---
date: 2026-07-27
tags:
  - robot-framework
  - test-automation
---

# Keyword Design Principles

Well-designed keywords make suites **readable by product owners** and **cheap to refactor** when the UI or API changes. Treat keywords like a **domain-specific language**: small verbs and phrases, composed upward.

## Single responsibility

One keyword = **one user-observable action** or **one coherent technical step** (not both in the same keyword).

```robot
*** Keywords ***
# Good: one idea
Submit Login Form
    Click Button    ${LOGIN_BUTTON}
    Wait Until Page Contains Element    ${DASHBOARD}

# Avoid: mixes navigation, data entry, and assertion
Do Everything For Login And Check Dashboard
    Go To    ${URL}
    Input Text    id=user    ${U}
    # ... many more steps ...
```

## Business-readable naming

Prefer **intent** over **implementation**.

| Prefer | Avoid |
| ------ | ----- |
| `Create User With Email` | `setup_user_data_and_post` |
| `Order Should Show Status` | `check_td_3_text` |
| `Sign In As Admin` | `login_flow_v2` |

Use **Title Case With Spaces** for RF keywords; reserve `snake_case` for Python.

## Keyword size

Target **about ten steps or fewer** per keyword. If a keyword grows longer:

1. Extract **sub-keywords** by sub-goal (e.g. `Fill Registration Form`, `Submit Registration`).
2. Push **repeated technical sequences** to low-level keywords or Python.

## Keyword types and composition

| Type | Audience | Examples |
| ---- | -------- | -------- |
| **High-level (business)** | PO, QA, BA | `Register New Customer`, `Invoice Should Be Paid` |
| **Low-level (technical)** | Automation engineers | `Click Save Button`, `GET JSON From` `/api/orders/${id}` |

**Composition rule**: high-level keywords call low-level ones; tests call high-level first, and only dip into low-level when a scenario truly needs it.

### Layered example

**Test** (what):

```robot
*** Test Cases ***
Customer Can Register
    Register New Customer    email=${EMAIL}    name=Ada Lovelace
    Customer Should Exist In Admin    ${EMAIL}
```

**Business keyword** (how at feature level):

```robot
*** Keywords ***
Register New Customer
    [Arguments]    ${email}    ${name}
    Open Registration Page
    Fill Registration Form    ${email}    ${name}
    Submit Registration Form
```

**Technical keywords** (how at UI/protocol level):

```robot
*** Keywords ***
Fill Registration Form
    [Arguments]    ${email}    ${name}
    Input Text    id=email    ${email}
    Input Text    id=name    ${name}
```

## Anti-patterns

| Anti-pattern | Problem | Fix |
| ------------ | ------- | --- |
| Huge “god” keywords | Hard to reuse, unclear failures | Split by goal; use resources per feature |
| Mixed responsibilities | Same keyword fills forms and checks DB | Separate UI vs API/assertion keywords |
| Hardcoded emails, IDs, URLs in keywords | Flaky parallel runs, env drift | Pass arguments; load defaults from variables |
| Copy-paste across suites | Drift and double maintenance | Move to shared resource |

## Embedded arguments

Embedded arguments keep phrasing natural while parameterizing behavior.

```robot
*** Keywords ***
User "${name}" Should Be Active
    [Arguments]    ${name}
    ${row}=    Get User Row    ${name}
    Should Be Equal    ${row}[status]    active

*** Test Cases ***
Status Check
    User "ada@example.com" Should Be Active
```

Match the **literal fragments** in the keyword name carefully; avoid overly generic patterns that collide.

## Documentation and tags

Use metadata for discoverability, ownership, and filtering in CI.

```robot
*** Keywords ***
Submit Order With Idempotency Key
    [Documentation]    Posts checkout; relies on API v2 idempotency header.
    ...                Fails fast if cart is empty.
    [Tags]    api    checkout    smoke
    ${headers}=    Build Idempotency Headers    ${KEY}
    POST On Session    checkout    /orders    json=${PAYLOAD}    headers=${headers}
```

Run subsets: `robot --include smoke tests/checkout/`.

## Good vs bad names (summary)

| Bad | Good |
| --- | ---- |
| `test1` | `Guest Checkout Completes With Receipt` |
| `do_api` | `Create Order Via Api` |
| `handle_stuff` | `Cancel Pending Subscription` |
| `click_and_wait_old` | `Open Account Settings` |
