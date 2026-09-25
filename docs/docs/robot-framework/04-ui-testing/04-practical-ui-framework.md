---
date: 2026-07-30
tags:
  - robot-framework
  - test-automation
  - ui-testing
---

# Practical — Full UI Framework

Compact but real end-to-end framework example using `Robot Framework + Browser (Playwright) + Python helpers`.

For progressive learning, start with [UI Testing — Step by Step](03-ui-step-by-step.md).

## Structure

```text
ui-tests/
├── pyproject.toml
├── libraries/
│   ├── DataFactory.py
│   └── ScreenshotHelper.py
├── resources/
│   ├── common.resource
│   └── pages/
│       ├── login_page.resource
│       ├── dashboard_page.resource
│       └── settings_page.resource
└── tests/
    ├── login/login_tests.robot
    └── e2e/user_settings_flow.robot
```

## `pyproject.toml`

```toml
[project]
name = "ui-tests"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
  "robotframework>=7.0",
  "robotframework-browser>=19.0",
  "faker>=30.0",
]
```

Install and bootstrap browsers:

```bash
uv sync
uv run rfbrowser init
```

## Python helpers

### `libraries/DataFactory.py`

```python
import uuid
from faker import Faker
from robot.api.deco import keyword, library

fake = Faker()

@library(scope="GLOBAL")
class DataFactory:
    @keyword("Generate Unique Username")
    def username(self) -> str:
        return f"user-{uuid.uuid4().hex[:8]}"

    @keyword("Generate User Data")
    def user_data(self) -> dict:
        u = self.username()
        return {"name": fake.name(), "username": u, "email": f"{u}@example.com"}
```

### `libraries/ScreenshotHelper.py`

```python
from datetime import datetime, timezone
from robot.api.deco import keyword, library
from robot.libraries.BuiltIn import BuiltIn

@library(scope="SUITE")
class ScreenshotHelper:
    @keyword("Capture Named Screenshot")
    def capture(self, context: str = "failure") -> str:
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        fn = f"results/screenshots/{context}_{ts}.png"
        BuiltIn().get_library_instance("Browser").take_screenshot(filename=fn)
        return fn
```

## Resources

### `resources/common.resource`

```robot
*** Settings ***
Library    Browser
Library    ../libraries/DataFactory.py
Library    ../libraries/ScreenshotHelper.py

*** Variables ***
${APP_URL}         https://demo.example.com
${BROWSER_TYPE}    chromium
${HEADLESS}        ${True}

*** Keywords ***
Open Test Browser
    New Browser    ${BROWSER_TYPE}    headless=${HEADLESS}
    New Context    viewport={'width': 1280, 'height': 720}
    New Page       ${APP_URL}
    Set Browser Timeout    10s

Close Test Browser
    Close Browser    ALL

Capture On Failure
    Capture Named Screenshot    test-failure
```

### `resources/pages/login_page.resource`

```robot
*** Settings ***
Library    Browser

*** Variables ***
${LOC_USER}       [data-testid="login-username"]
${LOC_PASS}       [data-testid="login-password"]
${LOC_SUBMIT}     [data-testid="login-submit"]
${LOC_ERROR}      [data-testid="login-error"]
${LOC_WELCOME}    [data-testid="welcome-message"]

*** Keywords ***
Login As User
    [Arguments]    ${username}    ${password}
    Go To    ${APP_URL}/login
    Fill Text    ${LOC_USER}    ${username}
    Fill Text    ${LOC_PASS}    ${password}
    Click    ${LOC_SUBMIT}

Login Should Succeed
    Wait For Elements State    ${LOC_WELCOME}    visible    timeout=5s

Login Error Should Be Visible
    Wait For Elements State    ${LOC_ERROR}    visible    timeout=5s
```

## Tests

### `tests/login/login_tests.robot`

```robot
*** Settings ***
Resource          ../../resources/common.resource
Resource          ../../resources/pages/login_page.resource
Suite Setup       Open Test Browser
Suite Teardown    Close Test Browser
Test Teardown     Capture On Failure

*** Test Cases ***
Valid Login
    [Tags]    smoke
    Login As User    testuser    secretpass123
    Login Should Succeed

Invalid Password
    [Tags]    negative
    Login As User    testuser    wrong
    Login Error Should Be Visible
```

### `tests/e2e/user_settings_flow.robot`

```robot
*** Settings ***
Resource          ../../resources/common.resource
Resource          ../../resources/pages/login_page.resource
Suite Setup       Open Test Browser
Suite Teardown    Close Test Browser
Test Teardown     Capture On Failure

*** Test Cases ***
User Updates Display Name
    [Tags]    smoke    e2e
    Login As User    testuser    secretpass123
    Login Should Succeed
    ${name}=    Generate Unique Username
    Log    Updated display name: ${name}    INFO
```

## Run

```bash
uv run robot --outputdir results --include smoke tests/
uv run robot --outputdir results --variable HEADLESS:False tests/login/
uv run pabot --processes 4 --outputdir results tests/
```

## Flow

```text
tests -> page resources -> Browser library + Python helpers
```
