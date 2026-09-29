---
date: 2026-09-27
tags:
  - python
  - libraries
  - guardrails
  - llm
  - security
  - pytest
  - testing
---

# Guardrails AI — Testing Guardrails

## What to Test

| Level | Question | Tooling | LLM calls |
|-------|----------|---------|-----------|
| Wiring | Right validators on the right target with the right `on_fail`? | `guard.get_validators(...)` | None |
| Unit | Does each guard pass/fix/block known strings? | `guard.validate()` / `parse()` | None |
| Quality | What are the false-positive and false-negative rates? | Labelled datasets, metrics | None (except LLM-judge validators) |
| Flow | Does reask recover? Is the LLM skipped when input is blocked? | Fake `llm_api` or LiteLLM `mock_response` | Mocked |
| Integration | Does the real model + guard behave in production-like conditions? | Real models, marker `llm` | Real, nightly |
| Adversarial | Can attackers get past the guard? | Red-team datasets and scanners | Real |

## Project Layout

```text
app/guards.py              # guard factories: build_support_guard(), build_triage_guard()
tests/conftest.py          # fixtures, metrics collection off
tests/test_guards.py       # unit + flow tests
tests/data/pii_cases.jsonl # labelled regression samples
tests/test_quality.py      # FP/FN rates, CI thresholds
```

Build guards in **factory functions** — each test gets a fresh `Guard` with empty history.

```python
# app/guards.py
from typing import Literal

from pydantic import BaseModel, Field

from guardrails import Guard, OnFailAction
from guardrails_ai.secrets_present import SecretsPresent
from guardrails_ai.valid_choices import ValidChoices
from guardrails_ai.valid_length import ValidLength


def build_support_guard() -> Guard:
    return (
        Guard(name="support-bot")
        .use(SecretsPresent(on_fail=OnFailAction.EXCEPTION), ValidLength(max=4000, on_fail="exception"), on="messages")
        .use(SecretsPresent(on_fail=OnFailAction.FIX))
    )


class Triage(BaseModel):
    label: str = Field(validators=[ValidChoices(choices=["bug", "feature", "question"], on_fail="reask")])
    priority: Literal["low", "medium", "high"]


def build_triage_guard() -> Guard:
    return Guard.for_pydantic(Triage)
```

```python
# tests/conftest.py
import pytest

from app.guards import build_support_guard, build_triage_guard


@pytest.fixture
def support_guard():
    guard = build_support_guard()
    guard.configure(allow_metrics_collection=False)     # no anonymous telemetry from CI
    return guard


@pytest.fixture
def triage_guard():
    guard = build_triage_guard()
    guard.configure(allow_metrics_collection=False)
    return guard
```

## Unit Tests Without an LLM

All tests on this page were run with `guardrails-ai` 0.11.0 and pytest.

```python
def test_clean_answer_passes_unchanged(support_guard):
    outcome = support_guard.validate("Go to Settings -> Security -> Reset 2FA.")
    assert outcome.validation_passed
    assert outcome.validated_output == outcome.raw_llm_output
    assert outcome.validation_summaries == []


def test_secret_in_answer_is_masked(support_guard):
    outcome = support_guard.validate("Use AKIAIOSFODNN7EXAMPLE to call the API.")
    assert outcome.validation_passed                                   # fix => "passed" ...
    assert "AKIAIOSFODNN7EXAMPLE" not in outcome.validated_output
    assert [s.validator_name for s in outcome.validation_summaries] == ["SecretsPresent"]   # ... but reported


def test_guard_wiring(support_guard):
    assert {type(v).__name__ for v in support_guard.get_validators("messages")} == {"SecretsPresent", "ValidLength"}
    assert [type(v).__name__ for v in support_guard.get_validators("output")] == ["SecretsPresent"]


def test_triage_schema(triage_guard):
    ok = triage_guard.parse('{"label": "bug", "priority": "high"}')
    bad = triage_guard.parse('{"label": "urgent", "priority": "high"}', num_reasks=0)
    assert ok.validated_output == {"label": "bug", "priority": "high"}
    assert not bad.validation_passed and bad.validated_output is None
```

Custom validators can also be tested directly: `NoPromptLeak(canary="zx").validate("zx", {})` returns a `FailResult` with `fix_value` and `metadata` ([04](./04-custom-validators.md)).

## Parametrized Positive / Negative Cases

```python
import pytest

CASES = [
    pytest.param("Your order ships tomorrow.", False, id="plain"),
    pytest.param("Contact support@example.com for help.", False, id="email-is-not-a-secret"),
    pytest.param("aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", True, id="aws-secret"),
    pytest.param("token: ghp_1234567890abcdefghijklmnopqrstuvwxyzAB", True, id="github-token"),
]


@pytest.mark.parametrize(("text", "has_secret"), CASES)
def test_secret_detection(support_guard, text, has_secret):
    assert bool(support_guard.validate(text).validation_summaries) is has_secret
```

Always include **negatives that look dangerous** (emails, UUIDs, order ids, code snippets) — they are where false positives come from.

## Measuring False Positive / False Negative Rates

```python
import json
from pathlib import Path

from app.guards import build_support_guard

MAX_FNR = 0.02      # missed secrets: security budget
MAX_FPR = 0.05      # blocked clean answers: UX budget


def test_secret_guard_rates():
    guard = build_support_guard()
    tp = fp = fn = tn = 0
    for line in Path("tests/data/secrets_cases.jsonl").read_text().splitlines():
        case = json.loads(line)                               # {"text": "...", "label": true}
        flagged = bool(guard.validate(case["text"]).validation_summaries)
        tp += flagged and case["label"]
        fp += flagged and not case["label"]
        fn += (not flagged) and case["label"]
        tn += (not flagged) and not case["label"]
    fnr, fpr = fn / max(tp + fn, 1), fp / max(fp + tn, 1)
    print(f"TP={tp} FP={fp} FN={fn} TN={tn} FNR={fnr:.3f} FPR={fpr:.3f}")
    assert fnr <= MAX_FNR, f"missed secrets: {fnr:.1%}"
    assert fpr <= MAX_FPR, f"over-blocking: {fpr:.1%}"
```

| Metric | Meaning for a guard | Who cares |
|--------|---------------------|-----------|
| False negative rate | Attacks / leaks that got through | Security, compliance |
| False positive rate | Legitimate users blocked or answers mangled | Product, support |
| Precision / recall per category | E.g. PII: phone numbers vs names | Tuning thresholds and entities |
| Latency p95 per validator | Cost of the check | SRE |

- Threshold-based validators (`ToxicLanguage`, `DetectJailbreak`): sweep the threshold on the dataset and pick it from the curve, not from the default.
- Datasets: real (anonymized) traffic + synthetic edge cases + known attacks; label with two reviewers for ambiguous items.
- Store the last run's rates as a baseline; fail CI on regression beyond a tolerance, not only on absolute thresholds.

## Regression Suites

| Suite | Content | Source |
|-------|---------|--------|
| `jailbreaks.jsonl` | DAN-style prompts, role-play, encoding tricks (base64, leetspeak), multilingual variants | Public jailbreak sets, red-team findings |
| `pii.jsonl` | Emails, phones, IBANs, addresses in many formats and languages; look-alikes (order ids, versions) | Faker + production incidents |
| `injections_indirect.jsonl` | Instructions hidden in RAG documents and tool results | Red team, bug bounty |
| `off_topic.jsonl` | Requests outside the bot's scope | Support logs |

Every production incident or red-team finding becomes a new labelled row — the suite only grows.

## Flow Tests with a Mocked LLM

A fake `llm_api` gives full control over the reply sequence:

```python
import pytest
from guardrails.errors import ValidationError


def test_reask_recovers(triage_guard):
    replies = iter(['{"label": "urgent", "priority": "high"}', '{"label": "bug", "priority": "high"}'])
    sent = []

    def fake_llm(*, messages, **kwargs):
        sent.append(messages)
        return next(replies)

    outcome = triage_guard(llm_api=fake_llm, messages=[{"role": "user", "content": "Checkout crashes"}], num_reasks=1)

    assert outcome.validation_passed and outcome.validated_output["label"] == "bug"
    assert len(triage_guard.history.last.iterations) == 2
    assert "urgent" in sent[1][-1]["content"]                 # reask prompt quotes the bad value


def test_input_block_skips_llm(support_guard):
    calls = []
    with pytest.raises(ValidationError):
        support_guard(llm_api=lambda *, messages, **kw: calls.append(1) or "ok",
                      messages=[{"role": "user", "content": "my key AKIAIOSFODNN7EXAMPLE"}])
    assert calls == []                                        # blocked before the model
```

When the guard calls a model string, LiteLLM's `mock_response` passes through (see [LiteLLM testing](../litellm/05-observability-testing.md)):

```python
def test_reask_exhausted(triage_guard):
    outcome = triage_guard(
        model="anthropic/claude-haiku-4-5",
        messages=[{"role": "user", "content": "Label this"}],
        mock_response='{"label": "urgent", "priority": "high"}',   # every attempt returns the same bad value
        num_reasks=1,
    )
    assert not outcome.validation_passed
    assert len(triage_guard.history.last.iterations) == 2          # original + 1 reask, then stop
```

`mock_response` also works with `stream=True` — useful to assert that a secret split across chunks is still masked.

## CI Gates

| Stage | Runs | Gate |
|-------|------|------|
| Every PR | Wiring + unit + flow tests (no network) | 100% pass, < 1 min |
| Every PR touching guards/validators | Quality suite on local validators | FNR/FPR within thresholds and baseline tolerance |
| Nightly (`pytest -m llm`) | Real models + guards, LLM-judge validators | Block/fix rates stable; cost cap |
| Weekly / before release | Red-team scan | No new critical bypasses |

- Bake ML models into the CI image or cache the model directory — do not download on every run.
- Run with `guardrails configure --disable-metrics --disable-remote-inferencing --token ""` (non-interactive) or `allow_metrics_collection=False`.
- Pin validator package versions: a model update inside a validator is a behaviour change that must pass the quality gate.

## Red-Team Loop

```mermaid
flowchart LR
    A[Generate attacks<br/>DeepEval RedTeamer, datasets] --> B[Run app + guards]
    B --> C{Bypassed?}
    C -->|yes| D[Label + add to regression suite]
    D --> E[Tune guard / add validator /<br/>fix architecture]
    E --> B
    C -->|no| F[Track FPR on clean traffic]
```

- Scan the **whole app** (prompt + guards + tools), not the guard in isolation — see [Red Teaming](../../llm-evaluation/02_testing/09_red_teaming.md).
- A bypass is not always a guard bug: often the fix is fewer tool permissions or no secrets in context.
- Retest old bypasses on every model upgrade — a new model changes what gets through.

---
## See also
- [Guardrails AI — Input & Output Guards for LLMs](./index.md)
- [LiteLLM — Observability & Testing](../litellm/05-observability-testing.md)
- [OWASP LLM Security Testing Checklist](../../owasp-llm-security/02-owasp-llm-security-testing-checklist.md)
- [LLM Evaluation — Red Teaming](../../llm-evaluation/02_testing/09_red_teaming.md)
- [Pytest](../pytest/index.md)
