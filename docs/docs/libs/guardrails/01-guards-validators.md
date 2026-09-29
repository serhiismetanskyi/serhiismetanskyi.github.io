---
date: 2026-09-27
tags:
  - python
  - libraries
  - guardrails
  - llm
  - security
---

# Guardrails AI — Guards & Validators

## Core Objects

| Object | Role |
|--------|------|
| `Guard` / `AsyncGuard` | Container of validators; runs them on input, output or JSON paths; optionally calls the LLM |
| `Validator` | One check (regex, PII, toxicity, custom); returns `PassResult` or `FailResult` |
| `OnFailAction` | What to do when a validator fails: `exception`, `fix`, `reask`, `filter`, `refrain`, `noop`, `fix_reask`, `custom` |
| `ValidationOutcome` | Result of one guard run: raw output, validated output, pass flag, summaries, error |
| `guard.history` | In-memory stack of `Call` objects with iterations, validator logs, tokens |

## Building a Guard

```python
from guardrails import Guard, OnFailAction
from guardrails_ai.regex_match import RegexMatch
from guardrails_ai.valid_length import ValidLength

ticket_id_guard = Guard(name="ticket-id").use(
    RegexMatch(regex=r"TCK-\d{5}", on_fail=OnFailAction.EXCEPTION),   # several validators in one call
    ValidLength(min=9, max=9, on_fail="exception"),                     # on_fail also accepts strings
)
```

- `use(*validators, on="output")` — pass one or many validators; `validators=[...]` keyword works too. `use_many()` from 0.4.x is gone.
- `on` is `"output"` (default), `"messages"` (input validation, see [03](./03-input-output-safety.md)) or a JSON path like `"$.summary"` for structured output.
- Calling `use()` again with the **same `on`** replaces the validators for that target — chain different targets, or pass all validators in one call.
- `guard.get_validators("output")` returns what is attached — handy in tests.
- Default `on_fail` when omitted is `exception`.

## `validate()` vs Calling the Guard

| | `guard.validate(text)` / `guard.parse(text)` | `guard(model=..., messages=[...])` |
|---|---|---|
| LLM call | None — validates a string you already have | Guard calls the LLM through LiteLLM, then validates |
| Reask | Not possible (no model) | Up to `num_reasks` extra calls |
| Input validators (`on="messages"`) | Not run | Run before the LLM call |
| Good for | Unit tests, validating output from any SDK, post-processing | End-to-end guarded calls |

```python
# 1. Validate output produced elsewhere (any SDK, cached answers, test fixtures)
outcome = ticket_id_guard.validate("TCK-12345")

# 2. Let the guard call the model — any LiteLLM model string works
outcome = ticket_id_guard(
    model="openai/gpt-4o-mini",
    messages=[{"role": "user", "content": "Extract the ticket id from: ${email}"}],
    prompt_params={"email": "Hi, re TCK-40213 — still broken"},   # ${var} templating
    num_reasks=1,
    temperature=0,                                                   # extra kwargs go to litellm.completion
)

# 3. Bring your own client: any callable(*, messages, **kwargs) -> str
def call_internal_llm(*, messages, **kwargs) -> str:     # keyword-only `messages` is recommended
    return internal_client.chat(messages)["text"]

outcome = ticket_id_guard(llm_api=call_internal_llm, messages=[{"role": "user", "content": "..."}])
```

`prompt=` / `instructions=` / `msg_history=` arguments from 0.5 were replaced by `messages=` (OpenAI chat format).

## `ValidationOutcome`

| Field | Meaning |
|-------|---------|
| `validation_passed` | `True` if the final output is acceptable (after fixes) |
| `validated_output` | Output after `fix` / `filter`; `None` after `filter` or `refrain` on the whole value |
| `raw_llm_output` | Exactly what the model (or `validate()`) received |
| `validation_summaries` | One entry per **failed** validator: `validator_name`, `validator_status`, `property_path`, `failure_reason`, `error_spans` |
| `reask` | The pending `ReAsk` when reasks were exhausted or impossible |
| `error` | Error message when the run crashed (bad JSON, LLM error) |
| `call_id` | Links to `guard.history` |

It unpacks like a tuple: `raw, validated, *rest = guard(...)`.

!!! warning "`validation_passed` is not \"nothing failed\""
    With `on_fail="fix"` the outcome reports `validation_passed=True` and the fixed value, while `validation_summaries` still lists the failure. Assert on both in tests and alert on summaries in production.

## `on_fail` Actions

Behaviour verified on `guard.validate()` with `ValidLength(max=10)` and a 27-character string:

| Action | Result | Use when |
|--------|--------|----------|
| `exception` | Raises `guardrails.errors.ValidationError` | Input validation, hard policy (secrets, jailbreak), API should return 4xx |
| `fix` | Passes with the validator's `fix_value` (`"This answe"`) | Deterministic repair: redact PII/secrets, truncate, normalize |
| `reask` | Sends the error back to the LLM and validates the new answer | Format/content errors the model can correct (wrong label, bad JSON) |
| `fix_reask` | Applies the fix, re-validates, reasks only if still failing | Cheap fix first, LLM as fallback |
| `filter` | `validated_output=None` for that value; in JSON the field is dropped | Optional fields, list items that may be removed |
| `refrain` | Whole output becomes `None`, `validation_passed=False` | Return a canned "cannot answer" instead of partial data |
| `noop` | Output unchanged, `validation_passed=False`, failure logged | Shadow mode while measuring false-positive rate |
| `custom` | Your function `(value, fail_result) -> new_value` | Replace with a template, log to a SIEM, redact differently |

```python
from guardrails_ai.secrets_present import SecretsPresent


def mask_and_flag(value: str, fail_result) -> str:
    security_log.warning("secret in answer: %s", fail_result.error_message)
    return "The answer contained credentials and was withheld."


guard = Guard().use(SecretsPresent(on_fail=mask_and_flag))     # a callable => OnFailAction.CUSTOM
```

Not every validator implements a `fix_value` — check its `FailResult` before relying on `fix`.

## History and Logs

```python
guard = Guard(name="triage", history_max_length=50)   # history is in memory; bound it in long-lived processes
...
call = guard.history.last
call.status                      # "pass" | "fail" | "error"
call.tokens_consumed             # prompt + completion tokens over all iterations
len(call.iterations)             # 1 + number of reasks
for log in call.iterations.last.validator_logs:
    print(log.registered_name, log.validation_result.outcome,
          log.value_before_validation, log.value_after_validation,
          (log.end_time - log.start_time).total_seconds())
print(call.tree)                 # rich tree: messages, raw output, validation per step
guard.error_spans_in_output()    # character spans that failed in the last output
```

## Async Guard

```python
from guardrails import AsyncGuard

guard = AsyncGuard().use(ValidLength(min=1, max=500, on_fail="fix"))

outcome = await guard.validate(answer)
outcome = await guard(model="anthropic/claude-haiku-4-5", messages=messages)
```

Same API as `Guard`; validators run concurrently where possible. Use it inside FastAPI handlers and async test suites.

## Streaming Validation

```python
guard = Guard().use(SecretsPresent(on_fail="fix"))

for chunk in guard(model="openai/gpt-4o-mini", messages=messages, stream=True):
    send_to_client(chunk.validated_output)    # each chunk is a ValidationOutcome
```

- Validators buffer text until their chunking function says a unit is complete (usually a sentence), then validate and emit it — the user sees fixed text, never the raw secret.
- Verified with a mocked stream: `"Here you go. The key is AKIA…. Bye."` arrived as `["Here you go.", " The key is ********.", " Bye."]`.
- `reask` is not practical while streaming (text is already sent) — use `fix`, `filter` or `exception` there.
- `AsyncGuard` streams with `async for chunk in await guard(..., stream=True)`.

---
## See also
- [Guardrails AI — Input & Output Guards for LLMs](./index.md)
- [Guardrails AI — Structured Output](./02-structured-output.md)
- [Guardrails AI — Custom Validators](./04-custom-validators.md)
- [LiteLLM — Completion & Providers](../litellm/01-completion-providers.md)
