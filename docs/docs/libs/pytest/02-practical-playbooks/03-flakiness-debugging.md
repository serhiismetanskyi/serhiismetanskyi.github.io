---
date: 2026-09-21
tags:
  - python
  - libraries
  - pytest
  - testing
---

# Pytest Playbook — Flakiness Debugging

Workflow for tests that pass locally but fail randomly in CI.

## Common Causes

| Cause | Symptom |
|-------|---------|
| Shared mutable state | Passes alone, fails with other tests |
| Time-dependent logic | Fails around midnight or timezone boundaries |
| Network dependency | Timeout or DNS failure in CI |
| Order dependency | Fails only with specific seed |
| Environment drift | Locale, timezone, OS differ from local |

## Fast Triage Commands

```bash
# re-run only last failed test with full output
pytest --lf -x -vv
# show slowest 20 tests — often a clue for race conditions
pytest --durations=20
# run with short traceback for quick scan
pytest --maxfail=1 --tb=short
```

## Detect Order Dependency

```bash
# run with two different random seeds
pytest --randomly-seed=42
pytest --randomly-seed=99
```

If one seed fails and another passes — tests have hidden coupling.

## Isolation Checklist

- No module-level mutable state (global dicts, class variables).
- No writes to shared temp paths (use `tmp_path` fixture).
- No reliance on test execution order.
- No real network calls in unit tests.
- No real time in assertions (use `freezegun`).

## Stabilize Async Tests

```python
import asyncio
import time


async def wait_until(predicate, timeout: float = 2.0, step: float = 0.05):
    """Poll predicate instead of arbitrary sleep."""
    start = time.monotonic()
    while time.monotonic() - start < timeout:
        if predicate():
            return True
        await asyncio.sleep(step)
    raise TimeoutError(f"Condition not met within {timeout}s")
```

Rules:
- Await explicit conditions, not arbitrary sleeps.
- Close background tasks in fixture teardown.
- Set `asyncio_mode = "auto"` to avoid missing markers.

## CI-Specific Safeguards

- Run `-n auto` only after tests are isolation-safe.
- Run nightly with randomized order (`pytest-randomly`).
- Fail on warnings: `filterwarnings = ["error"]`.
- Keep retry plugins as temporary mitigation only.

## Debug Evidence to Capture

- Random seed value (`--randomly-seed`).
- Failed test node ID (full path).
- Log snippets (`caplog` output).
- Environment: `python -V`, OS, TZ.
- Exact repro command.

## Remediation Strategy

1. Reproduce locally with same seed and env.
2. Minimize test to smallest failing case.
3. Fix root cause (state leak, race, network call).
4. Add regression test.
5. Remove temporary rerun workaround.
