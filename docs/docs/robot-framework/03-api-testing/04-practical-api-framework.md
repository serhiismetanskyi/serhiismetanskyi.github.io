---
date: 2026-07-29
tags:
  - robot-framework
  - test-automation
  - api-testing
---

# Practical — Full API Framework

Compact but real end-to-end framework example using `Robot Framework + RequestsLibrary + Python libraries`.

For progressive learning, start with [API Testing — Step by Step](03-api-step-by-step.md).

## Structure

```text
api-tests/
├── pyproject.toml
├── libraries/
│   ├── ApiClient.py
│   ├── UserService.py
│   └── SchemaValidator.py
├── resources/
│   ├── common.resource
│   └── user_keywords.resource
├── schemas/
│   └── user_schema.json
└── tests/users/user_crud.robot
```

## `pyproject.toml`

```toml
[project]
name = "api-tests"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
  "robotframework>=7.0",
  "robotframework-requests>=0.9.7",
  "jsonschema>=4.20",
]
```

## Python libraries

### `libraries/ApiClient.py`

```python
import logging
from robot.api.deco import keyword, library
from robot.libraries.BuiltIn import BuiltIn

logger = logging.getLogger(__name__)

@library(scope="SUITE")
class ApiClient:
    def _req(self):
        return BuiltIn().get_library_instance("RequestsLibrary")

    @keyword("Open API Session")
    def open_session(self, alias: str, url: str, token: str = "") -> None:
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        logger.info("Open session '%s' -> %s", alias, url)
        self._req().create_session(alias, url, headers=headers)

    @keyword("API GET")
    def get(self, alias: str, path: str, status: int = 200):
        return self._req().get_on_session(alias, path, expected_status=status)

    @keyword("API POST")
    def post(self, alias: str, path: str, payload: dict, status: int = 201):
        return self._req().post_on_session(alias, path, json=payload, expected_status=status)
```

### `libraries/UserService.py`

```python
import logging
import uuid
from robot.api.deco import keyword, library
from robot.libraries.BuiltIn import BuiltIn

logger = logging.getLogger(__name__)

@library(scope="SUITE")
class UserService:
    def _client(self):
        return BuiltIn().get_library_instance("ApiClient")

    @keyword("Create User Via API")
    def create_user(self, name: str = "") -> dict:
        name = name or f"user-{uuid.uuid4().hex[:8]}"
        payload = {"name": name, "username": name, "email": f"{name}@test.example"}
        logger.info("Create user: %s", name)
        return self._client().post("api", "/users", payload).json()

    @keyword("Get User By ID")
    def get_user(self, user_id: int) -> dict:
        return self._client().get("api", f"/users/{user_id}").json()
```

### `libraries/SchemaValidator.py`

```python
import json
from pathlib import Path
from jsonschema import Draft202012Validator
from robot.api.deco import keyword, library

@library(scope="GLOBAL")
class SchemaValidator:
    @keyword("Validate JSON Against Schema File")
    def validate(self, body_text: str, schema_path: str) -> None:
        schema = json.loads(Path(schema_path).read_text())
        Draft202012Validator(schema).validate(json.loads(body_text))
```

## Resources

### `resources/common.resource`

```robot
*** Settings ***
Library    RequestsLibrary
Library    ../libraries/ApiClient.py
Library    ../libraries/UserService.py
Library    ../libraries/SchemaValidator.py

*** Variables ***
${BASE_URL}       https://jsonplaceholder.typicode.com
${SCHEMA_DIR}     ${CURDIR}/../schemas

*** Keywords ***
Initialize API Session
    Open API Session    api    ${BASE_URL}
```

### `resources/user_keywords.resource`

```robot
*** Settings ***
Resource    common.resource

*** Keywords ***
Create User And Validate
    [Arguments]    ${name}=Alice
    ${user}=    Create User Via API    ${name}
    Should Not Be Empty    ${user}[id]
    RETURN    ${user}

Get User And Validate Schema
    [Arguments]    ${user_id}
    ${resp}=    API GET    api    /users/${user_id}
    Validate JSON Against Schema File    ${resp.text}    ${SCHEMA_DIR}/user_schema.json
    RETURN    ${resp.json()}
```

## Test suite

### `tests/users/user_crud.robot`

```robot
*** Settings ***
Resource         ../../resources/user_keywords.resource
Suite Setup      Initialize API Session
Default Tags     api    crud

*** Test Cases ***
Create User
    [Tags]    smoke
    ${user}=    Create User And Validate    Alice
    Should Be Equal    ${user}[name]    Alice

Get User
    ${user}=    Get User And Validate Schema    1
    Should Be Equal As Integers    ${user}[id]    1
```

## Run

```bash
uv run robot --outputdir results --include smoke tests/
uv run robot --outputdir results --loglevel DEBUG tests/
uv run pabot --processes 4 --outputdir results tests/
```

## Flow

```text
tests -> user_keywords.resource -> UserService.py -> ApiClient.py -> RequestsLibrary
```
