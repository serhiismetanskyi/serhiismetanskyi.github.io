---
date: 2026-07-24
tags:
  - test-automation
  - architecture
---

# Reliability & Flakiness

## What Is a Flaky Test

A test that sometimes passes and sometimes fails with no code change.
Flakiness destroys trust. Teams that see random failures start ignoring failures.
A red build that nobody investigates is worse than no CI at all.

---

## Root Causes

| Cause | Description |
|-------|-------------|
| Async timing | Test proceeds before async operation completes |
| Shared mutable state | One test modifies data another test depends on |
| External dependencies | Third-party API times out or returns unexpected data |
| Race conditions | Parallel tests compete for the same resource |
| Hardcoded timestamps | Test expects exact time that differs across runs |
| Non-deterministic ordering | Test passes only when run after another test |
| OS / network variability | CI machine slower than dev; timeouts too tight |

---

## Solutions by Cause

### Async Timing → Explicit Waits

```python
# Bad — guessing with sleep
import time
time.sleep(2)
assert api_client.orders.get(order_id)["status"] == "PROCESSED"

# Good — poll until condition or timeout
import time


def wait_for_order_status(
    api_client,
    order_id: str,
    expected: str,
    timeout: float = 10.0,
    interval: float = 0.5,
) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        status = api_client.orders.get(order_id)["status"]
        if status == expected:
            return
        time.sleep(interval)
    raise TimeoutError(
        f"Order {order_id} status never reached '{expected}' within {timeout}s"
    )
```

### Shared State → Test Isolation

Every test creates its own data. No test reads data written by another test.
Use builders with UUID-based defaults (see `03-test-data`).

### External Dependencies → Mocking

Isolate tests from unstable third parties using mocks or contract tests.
Do not call real payment gateways or email services in automated tests.

### Hardcoded Timestamps → Frozen Time

```python
from freezegun import freeze_time


@freeze_time("2026-01-15 12:00:00")
def test_token_expires_after_24_hours(token_service):
    token = token_service.create(user_id="user-123")
    assert token_service.is_expired(token) is False

    # Advance time 25 hours
    with freeze_time("2026-01-16 13:00:00"):
        assert token_service.is_expired(token) is True
```

---

## Quarantine Pattern

When a test is identified as flaky but cannot be fixed immediately:

```python
@pytest.mark.xfail(
    reason="Flaky: race condition in order processing, tracked in ISSUE-4521",
    strict=False,
)
def test_order_processed_within_5s(api_client, verified_user):
    ...
```

`strict=False` — test is quarantined: pass or fail, CI stays green.
`strict=True` — test must fail; use to track tests expected to fail (known bugs).

Quarantined tests must be tracked in a ticket. Not a permanent state.

---

## Flakiness Risk Register

| ID | Test | Cause | Status |
|----|------|-------|--------|
| FL-001 | `test_order_processed_within_5s` | Async race condition | Quarantined, ISSUE-4521 |
| FL-002 | `test_email_sent_after_signup` | External SMTP timing | Mocked, resolved |
| FL-003 | `test_checkout_redirect` | Slow CI animation | Explicit wait added |

Track flakiness systematically. A flaky test costs more in wasted investigation
than the time it would take to fix.

---

## Flakiness Detection in CI

```yaml
# GitHub Actions — rerun on failure to detect flakiness
- name: Run tests with flakiness detection
  run: |
    uv run pytest -n auto --reruns=2 --reruns-delay=1 \
      --report-log=test-results/log.json
```

A test that passes on rerun was flaky. Mark it, investigate, fix it.

---

## Stability Metrics

Track these per week:

| Metric | Formula | Target |
|--------|---------|--------|
| Flakiness rate | flaky_failures / total_runs | < 1% |
| Mean time to detect | time from merge to failure detection | < 10 min |
| False positive rate | reruns that pass / total reruns | < 0.5% |
