---
date: 2026-09-27
tags:
  - python
  - libraries
  - guardrails
  - llm
  - security
---

# Guardrails AI — Input & Output Safety

## Input vs Output Validation

| | Input (`on="messages"`) | Output (`on="output"`, default) |
|---|---|---|
| Runs | Before the LLM call, on the chat messages | After the LLM answers |
| Typical checks | Jailbreak / injection attempts, PII and secrets from users, length limits, off-topic requests | PII leaks, toxicity, competitor mentions, secrets, schema, grounding |
| Typical `on_fail` | `exception` (block) or `fix` (redact before sending) | `fix`, `reask`, `filter`, `refrain` |
| Saves money | Yes — blocked input never reaches the model | No — the call already happened |

```python
from guardrails import Guard
from guardrails.errors import ValidationError
from guardrails_ai.secrets_present import SecretsPresent
from guardrails_ai.valid_length import ValidLength
from guardrails_ai.valid_choices import ValidChoices

guard = (
    Guard(name="support-bot")
    .use(SecretsPresent(on_fail="exception"), ValidLength(max=4000, on_fail="exception"), on="messages")
    .use(ValidChoices(choices=["bug", "feature", "question"], on_fail="reask"))           # on="output"
)


def answer(user_text: str) -> str:
    try:
        outcome = guard(model="anthropic/claude-haiku-4-5",
                        messages=[{"role": "user", "content": user_text}])
    except ValidationError:
        return "Please remove credentials from your message."     # the LLM was never called
    return outcome.validated_output


answer("my key is AKIAIOSFODNN7EXAMPLE, why 500?")                  # blocked by the input guard
```

With `SecretsPresent(on_fail="fix")` on input, the model receives `my key is ********, why 500?` — verified. Input validators run only when the guard calls the LLM; `validate()` / `parse()` check the output only. The older `on="prompt"` / `on="msg_history"` targets were merged into `on="messages"`.

## Common Validators

Install each as `uv add guardrails-ai-<package>`, import from `guardrails_ai.<module>`.

| Risk | Package → class | Engine | Notes |
|------|-----------------|--------|-------|
| PII | `detect-pii` → <code>DetectPII(pii&#95;entities="pii" &#124; "spi" &#124; [...])</code> | Microsoft Presidio (spaCy) | `fix` = anonymized text (`<EMAIL_ADDRESS>`) |
| PII (NER model) | `guardrails-pii` → `GuardrailsPII(entities=[...])` | GLiNER + Presidio | Better recall on names/addresses, heavier |
| Secrets | `secrets-present` → `SecretsPresent()` | detect-secrets patterns | `fix` masks with `********`; no model |
| Toxicity | `toxic-language` → `ToxicLanguage(threshold=0.5, validation_method="sentence")` | Detoxify model | Sentence mode drops only toxic sentences on `fix` |
| Jailbreak | `detect-jailbreak` → `DetectJailbreak(threshold=0.81)` | Local classifier + embeddings | Input only; tune threshold on your traffic |
| Unusual prompt | `unusual-prompt` → `UnusualPrompt(llm_callable="openai/gpt-4o-mini")` | LLM judge | Extra LLM call per request |
| Competitors | `competitor-check` → `CompetitorCheck(competitors=[...])` | Exact match + spaCy NER | `fix` removes sentences naming competitors |
| Off-topic | `restrict-to-topic` → `RestrictToTopic(valid_topics=[...], invalid_topics=[...])` (module `restricttotopic`) | Zero-shot classifier and/or LLM | `disable_llm=True` or `disable_classifier=True` to pick one |
| Hallucination vs sources | `provenance-llm` → `ProvenanceLLM(validation_method="sentence", llm_callable=...)` | Retrieval + LLM check | Needs `metadata={"sources": [...]}` |
| Format | `regex-match`, `valid-length`, `valid-choices`, `two-words` | Pure Python | Fast, deterministic, have `fix` |
| XSS / scripts | `web-sanitization` → `WebSanitization()` | Pattern scan | Output going to a browser |

Browse the full catalog at `guardrailsai.com/hub`; package names follow the Hub id with dashes (`detect_pii` → `guardrails-ai-detect-pii`). Constructor arguments above are taken from the packages' source; ML validators were not executed while writing this page.

```python
from guardrails_ai.detect_pii import DetectPII
from guardrails_ai.toxic_language import ToxicLanguage
from guardrails_ai.competitor_check import CompetitorCheck

output_guard = Guard(name="support-answer").use(
    DetectPII(pii_entities=["EMAIL_ADDRESS", "PHONE_NUMBER", "CREDIT_CARD"], on_fail="fix"),
    ToxicLanguage(threshold=0.5, validation_method="sentence", on_fail="fix"),
    CompetitorCheck(competitors=["Acme Cloud", "Globex"], on_fail="fix"),
)
```

Per-call context goes through `metadata` — the same guard serves many tenants:

```python
from guardrails_ai.provenance_llm import ProvenanceLLM

rag_guard = Guard(name="docs-rag").use(
    ProvenanceLLM(validation_method="sentence", llm_callable="openai/gpt-4o-mini", on_fail="fix"),
)
outcome = rag_guard.validate(answer, metadata={"sources": [chunk.text for chunk in retrieved_chunks]})
```

## Local vs Remote Inference

ML validators (PII, toxicity, jailbreak, competitors, topics) load models. Since 0.11 there is **no hosted inference from Guardrails** (shut down 2026-08-25).

| Option | How | Trade-off |
|--------|-----|-----------|
| Local (default) | `DetectPII(use_local=True)`; run `python -m guardrails_ai.<module>.post_install` to download models | No network; adds RAM, cold start, CPU/GPU per request |
| Own endpoint | `ToxicLanguage(validation_endpoint="http://toxic.internal:8000/validate")` | Shared GPU, horizontal scaling; network hop, one more service to run |

- Bake models into the Docker image (run `post_install` at build time) — first-request downloads kill latency and fail in locked-down networks.
- NLTK tokenizer data (`punkt_tab`) is required by sentence-based validators; `pip install` does not download it — `post_install` or `nltk.download("punkt_tab")` does.
- `guardrails configure --disable-remote-inferencing` keeps the default local.

## Latency and Cost

| Validator type | Typical cost per call | Examples |
|----------------|----------------------|----------|
| Rules | Sub-millisecond | Regex, length, choices, secrets patterns |
| Small local model | Tens of ms on CPU, more on long text | Presidio PII, toxicity, jailbreak classifier |
| Zero-shot / large NER | Hundreds of ms on CPU | `RestrictToTopic` classifier, spaCy transformer (`en_core_web_trf`) |
| LLM-based | An extra LLM call (latency + tokens) | `UnusualPrompt`, `ProvenanceLLM`, `LLMCritic`, custom judges |
| `reask` | A full extra generation per round | Any validator with `on_fail="reask"` |

Order of thumb: cheap deterministic checks first with `exception`, ML checks next, LLM judges only where the risk justifies them — or asynchronously on a sample for monitoring.

## Defense in Depth

!!! danger "Guardrails do not solve prompt injection"
    Jailbreak classifiers catch known patterns and paraphrases of them; attackers adapt faster. Indirect injection through RAG documents, tool results and emails often looks like normal text. Treat input guards as *noise reduction*, not a security boundary.

| Layer | Control |
|-------|---------|
| Architecture | Least-privilege tools, no secrets in prompts, separate trusted/untrusted content |
| Gateway | Auth, rate limits, budgets, org-wide filters (LiteLLM / provider guardrails) |
| Guard (this library) | Input screening, output redaction, schema and business rules |
| Execution | Validate tool arguments, human approval for irreversible actions |
| Monitoring | Traces of every guard decision, alerts on block-rate changes, red-team regression suite |

---
## See also
- [Guardrails AI — Input & Output Guards for LLMs](./index.md)
- [Guardrails AI — Custom Validators](./04-custom-validators.md)
- [Guardrails AI — Testing Guardrails](./06-testing.md)
- [OWASP LLM Security Guide](../../owasp-llm-security/01-owasp-llm-security-guide.md)
- [OWASP LLM Security Testing Checklist](../../owasp-llm-security/02-owasp-llm-security-testing-checklist.md)
