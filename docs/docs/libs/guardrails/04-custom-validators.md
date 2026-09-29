---
date: 2026-09-27
tags:
  - python
  - libraries
  - guardrails
  - llm
  - security
---

# Guardrails AI — Custom Validators

## Anatomy of a Validator

| Piece | Purpose |
|-------|---------|
| `@register_validator(name="org/name", data_type="string")` | Registers the class under a unique id (used in serialization, server, traces) |
| `Validator` subclass | Base class: handles `on_fail`, streaming, local/remote inference |
| `__init__(..., on_fail=None, **kwargs)` → `super().__init__(on_fail=on_fail, **args)` | Pass your arguments to `super()` so they are serialized (`guard.to_dict()`, server config) |
| `validate(value, metadata) -> ValidationResult` | The check itself |
| `PassResult()` | Value is fine |
| `FailResult(error_message=..., fix_value=..., error_spans=[...], metadata={...})` | Failure, optional repair, character spans, extra data |

`data_type` is one of the registered types (`"string"`, `"list"`, `"integer"`, `"float"`, `"object"`, … or `"all"`). Namespace the name (`qa/…`, `acme/…`) — ids must not clash with installed packages.

## Class-Based Validator

System-prompt leakage check ([LLM07](../../owasp-llm-security/01-owasp-llm-security-guide.md#llm07-system-prompt-leakage)) with a canary token:

```python
from typing import Any, Callable, Dict, Optional

from guardrails import Guard
from guardrails.validator_base import (
    ErrorSpan, FailResult, PassResult, ValidationResult, Validator, register_validator,
)


@register_validator(name="qa/no-prompt-leak", data_type="string")
class NoPromptLeak(Validator):
    """Fails when the answer contains the canary token or long fragments of the system prompt."""

    def __init__(self, canary: str, system_prompt: str = "", min_fragment: int = 40,
                 on_fail: Optional[Callable] = None, **kwargs):
        super().__init__(on_fail=on_fail, canary=canary, system_prompt=system_prompt,
                         min_fragment=min_fragment, **kwargs)
        self._canary = canary
        step = min_fragment // 2
        self._fragments = [system_prompt[i:i + min_fragment]
                           for i in range(0, max(len(system_prompt) - min_fragment, 0) + 1, step)]

    def validate(self, value: Any, metadata: Dict[str, Any]) -> ValidationResult:
        hits = [self._canary] if self._canary in value else []
        hits += [f for f in self._fragments if f and f in value]
        if not hits:
            return PassResult()
        start = value.find(hits[0])
        return FailResult(
            error_message="Answer reveals the system prompt.",
            fix_value="I can't share my configuration.",
            error_spans=[ErrorSpan(start=start, end=start + len(hits[0]), reason="prompt leak")],
            metadata={"hits": len(hits)},
        )


guard = Guard().use(NoPromptLeak(canary="zx-7f3a", system_prompt=SYSTEM_PROMPT, on_fail="fix"))
guard.validate("Sure! My instructions say: Canary: zx-7f3a").validated_output
# -> "I can't share my configuration."
```

!!! warning "Validator arguments are not secret"
    Everything passed to `super().__init__` appears in `guard.to_dict()`, is sent to a Guardrails server, and is recorded as `validator.init.*` span attributes in traces. Pass references (a prompt id, a vault key) instead of secrets or full sensitive prompts.

## Function-Based Validator

For simple rules a function with exactly two arguments is enough — it is turned into a `Validator` class:

```python
@register_validator(name="qa/no-apology", data_type="string")
def no_apology(value: str, metadata: dict) -> ValidationResult:
    if "sorry" in value.lower():
        return FailResult(error_message="Answer must not apologise.",
                          fix_value=value.replace("Sorry, ", ""))
    return PassResult()


guard = Guard().use(no_apology(on_fail="fix"))
guard.validate("Sorry, the export is limited to 10k rows.").validated_output
# -> "the export is limited to 10k rows."
```

## Per-Call Metadata

`metadata` carries request-specific context: tenant limits, retrieved chunks, user locale.

```python
@register_validator(name="qa/max-words", data_type="string")
class MaxWords(Validator):
    def validate(self, value, metadata):
        limit = metadata.get("max_words", 50)
        words = len(value.split())
        return PassResult() if words <= limit else FailResult(error_message=f"{words} words > {limit}")


guard = Guard().use(MaxWords(on_fail="exception"))
guard.validate(answer, metadata={"max_words": 30})                          # validate()
guard(model="openai/gpt-4o-mini", messages=msgs, metadata={"max_words": 30})  # LLM call
```

Fail loudly (`raise ValueError`) when required metadata is missing — a silent `PassResult` hides misconfiguration.

## LLM-as-Judge Validator

Useful for grounding, tone, policy — anything regex cannot express ([LLM09](../../owasp-llm-security/01-owasp-llm-security-guide.md#llm09-misinformation)).

```python
import json

import litellm


@register_validator(name="qa/llm-judge-grounded", data_type="string")
class GroundedJudge(Validator):
    def __init__(self, model: str = "anthropic/claude-haiku-4-5", threshold: int = 4,
                 on_fail: Optional[Callable] = None, **kwargs):
        super().__init__(on_fail=on_fail, model=model, threshold=threshold, **kwargs)
        self._model, self._threshold = model, threshold

    def validate(self, value: Any, metadata: Dict[str, Any]) -> ValidationResult:
        context = metadata.get("context")
        if not context:
            raise ValueError("GroundedJudge needs metadata['context']")
        response = litellm.completion(
            model=self._model,
            temperature=0,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": 'Rate 1-5 how well ANSWER is supported by CONTEXT. '
                                              'Reply JSON {"score": int, "reason": str}.'},
                {"role": "user", "content": f"CONTEXT:\n{context}\n\nANSWER:\n{value}"},
            ],
            **metadata.get("judge_kwargs", {}),      # tests inject {"mock_response": ...}
        )
        verdict = json.loads(response.choices[0].message.content)
        if verdict["score"] >= self._threshold:
            return PassResult()
        return FailResult(error_message=f"Grounding score {verdict['score']} < {self._threshold}: {verdict['reason']}",
                          metadata={"score": verdict["score"]})
```

- Use a cheaper/faster model than the generator, `temperature=0`, JSON output.
- The judge has its own false-positive/false-negative rate — calibrate it on labelled data ([06](./06-testing.md)).
- Handle judge errors explicitly (timeout, bad JSON): decide fail-open or fail-closed ([05](./05-server-production.md)).
- Consider running expensive judges with `on_fail="noop"` on a traffic sample for monitoring rather than inline.

## ML Validators: Local and Remote Inference

For model-backed checks follow the built-in pattern: implement `_inference_local` and `_inference_remote`, call `self._inference(value)` in `_validate`. The base class picks the path from `use_local=True` or `validation_endpoint="https://…"`. Load the model once in `__init__` only when `self.use_local` is true.

Streaming: the default chunking accumulates text until a sentence boundary. Override `_chunking_function(self, chunk) -> list[str]` if your check needs larger units (paragraphs) or can run on every token.

## Sharing and Versioning

| Practice | Why |
|----------|-----|
| Package org validators as a normal Python package (`acme-guardrails-validators`), import like `guardrails_ai.*` packages | One install for all services; the Hub CLI (`guardrails hub create-validator`, `submit`) is deprecated |
| Semantic versioning; bump **major** when a change makes the validator stricter | Stricter = more blocked traffic = a behavioural breaking change |
| Keep a labelled dataset and FP/FN thresholds next to each validator | A version bump must not silently change quality |
| Changelog entry per model/threshold change | Explains block-rate shifts in dashboards |
| Record the validator version in traces/metadata | Correlate incidents with releases |
| Pin exact versions of validators and their models in the lockfile | Upstream model updates change results without code changes |

---
## See also
- [Guardrails AI — Input & Output Guards for LLMs](./index.md)
- [Guardrails AI — Guards & Validators](./01-guards-validators.md)
- [Guardrails AI — Testing Guardrails](./06-testing.md)
- [LLM Evaluation — Custom Metrics](../../llm-evaluation/02_testing/11_custom_metrics.md)
