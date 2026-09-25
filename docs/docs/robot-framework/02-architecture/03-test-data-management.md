---
date: 2026-07-28
tags:
  - robot-framework
  - test-automation
---

# Test Data Management

Reliable RF suites use **isolated**, **repeatable** data. Combine patterns from test engineering (builders, factories, fixtures) with Robot’s variables, templates, and external files so parallel runs and CI stay green.

## Patterns

| Pattern | Role in RF |
| ------- | ---------- |
| **Test Data Builder** | Python (or keywords) assemble valid payloads stepwise; defaults + overrides per test |
| **Factory** | Central function creates users/orders with sane randomness; hides API details |
| **Fixtures** | `Suite Setup` / `Test Setup` create entities; **teardown** deletes or archives them |

## Avoid hardcoding; prefer dynamic data

| Instead of | Use |
| ---------- | --- |
| Fixed email `user1@test.com` | `user_${uuid}@example.invalid` or timestamp suffix |
| Shared “magic” SKU | Factory with catalog lookup or generated SKU |
| One global dict mutated by tests | Fresh dict/list per test or deep copy |

## Uniqueness and isolation

- **Unique per test**: suffix with `time.time()`, `uuid4`, or monotonic counter from a small Python helper.
- **No shared mutable state** between tests: avoid module-level lists/maps in libraries unless read-only or guarded; prefer setup-created entities and teardown cleanup.

## Variable files for environments

Robot loads variables from **Python** or **YAML** (and other formats per version/docs). Keep **environment-specific** URLs, feature flags, and credentials references (not secrets in git) in `config/` and select via CLI.

```bash
robot -V config/staging.yaml tests/
```

**`config/staging.yaml`**

```yaml
BASE_URL: https://staging.example.com
API_TIMEOUT: 30s
```

## Data-driven testing with `[Template]`

Repeat the same keyword with different rows; keeps assertions consistent.

```robot
*** Settings ***
Library    Collections

*** Test Cases ***
Discount Rules
    [Template]    Apply Discount And Expect Total
    100    10%    90
    50     20%    40
    0      10%    0

*** Keywords ***
Apply Discount And Expect Total
    [Arguments]    ${subtotal}    ${pct}    ${expected}
    ${actual}=    Calculate Total With Discount    ${subtotal}    ${pct}
    Should Be Equal As Numbers    ${actual}    ${expected}
```

Suite-level `Test Template` applies when many cases share one template keyword.

## External data (CSV, JSON, YAML)

| Format | Typical use |
| ------ | ----------- |
| CSV | Large tabular cases from spreadsheets |
| JSON / YAML | Structured payloads, nested configs |
| `.robot` tables | Small inline matrices next to the test |

Load in Python libraries and return lists/dicts to keywords, or use community libraries for CSV-driven execution where appropriate.

## Cleanup: create → test → teardown

| Phase | Responsibility |
| ----- | -------------- |
| **Setup** | Create accounts, seed DB via API, obtain tokens |
| **Test** | Assume resources exist; avoid “maybe from last run” state |
| **Teardown** | Delete or deactivate; tolerate missing resources (idempotent delete) |

Use `Test Teardown` for per-test cleanup; `Suite Teardown` for expensive shared fixtures.

## Example: Python variable file (dynamic data)

**`data/runtime_vars.py`**

```python
import uuid
from datetime import datetime, timezone

RUN_ID = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
UNIQUE_EMAIL = f"rf_{RUN_ID}_{uuid.uuid4().hex[:8]}@test.invalid"
```

```bash
robot -V data/runtime_vars.py tests/
```

## Best practices (summary)

| Practice | Rationale |
| -------- | --------- |
| Generate unique keys per run | Prevents collisions in shared staging |
| Keep secrets out of repos | Use CI secrets + env vars |
| Teardown is idempotent | Retries and failures still leave clean state |
| One source of truth for payloads | Builders/factories instead of copy-paste |
| Document data assumptions | `[Documentation]` on template keywords |
