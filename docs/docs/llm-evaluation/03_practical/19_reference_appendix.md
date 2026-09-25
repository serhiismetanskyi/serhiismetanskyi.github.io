---
date: 2026-08-08
tags:
  - llm
  - evaluation
  - deepeval
  - rag
---

# DeepEval Guide — Part 19: Reference Appendix

## DeepTeam Migration (Red Teaming)

Red teaming moved to dedicated package **DeepTeam** (`pip install deepteam`).
Works inside `deepeval`'s ecosystem (custom models, metrics).

```python
from deepteam import red_team
from deepteam.vulnerabilities import Bias
from deepteam.attacks import PromptInjection
from deepteam.attacks.multi_turn import LinearJailbreaking

def model_callback(input: str) -> str:
    return f"I'm sorry but I can't answer this: {input}"

risk = red_team(
    model_callback=model_callback,
    vulnerabilities=[Bias(types=["race"])],
    attacks=[PromptInjection(), LinearJailbreaking()],
)
```

---

## Red Teaming Vulnerability Classes

All classes live in `deepteam.vulnerabilities`. Each accepts `types` list.

| Class | Purpose | Example Types |
|-------|---------|---------------|
| `Bias` | Identify/mitigate biases | `"race"`, `"gender"`, `"religion"` |
| `Toxicity` | Resist harmful/offensive content | `"race"`, `"disability"` |
| `Misinformation` | Avoid false/misleading content | `"factual error"` |
| `PIILeakage` | Resist disclosing personal info | `"direct pii disclosure"` |
| `Robustness` | Resist malicious inputs/hijacking | `"hijacking"` |
| `UnauthorizedAccess` | Resist security exploits | `"rbac"` |
| `PersonalSafety` | Avoid jeopardizing individual safety | `"copyright violations"` |
| `ExcessiveAgency` | Stay within intended scope | `"functionality"` |
| `IllegalActivity` | Resist promoting unlawful actions | `"violent crime"` |
| `IntellectualProperty` | Avoid IP infringement | `"copyright violations"` |
| `PromptLeakage` | Resist revealing system prompt | `"secrets and credentials"` |
| `Competition` | Avoid disclosing competitive info | `"race"` |
| `GraphicContent` | Resist explicit material | `"sexual content"` |

---

## Arena Test Cases (Full Reference)

An `ArenaTestCase` compares N contestants to pick the best output.
Works with `ArenaGEval` metric only.

```python
from deepeval.test_case import ArenaTestCase, LLMTestCase, Contestant

c1 = Contestant(
    name="GPT-4", hyperparameters={"model": "gpt-4"},
    test_case=LLMTestCase(input="Capital of France?", actual_output="Paris"),
)
c2 = Contestant(
    name="Claude-4", hyperparameters={"model": "claude-4"},
    test_case=LLMTestCase(input="Capital of France?",
                          actual_output="Paris is the capital of France."),
)
test_case = ArenaTestCase(contestants=[c1, c2])
```

**Rules:** all `input`/`expected_output` must match across contestants.
`Contestant` params: `name` (str), `test_case` (LLMTestCase), `hyperparameters` (dict, optional).

### Images in Arena

```python
from deepeval.test_case import MLLMImage

shoes = MLLMImage(url="./shoes.png", local=True)
contestant = Contestant(
    name="GPT-4V",
    test_case=LLMTestCase(input=f"What's here? {shoes}", actual_output="Red shoes"),
)
```

### Running Arena Evaluation

```python
from deepeval import compare
from deepeval.metrics import ArenaGEval
from deepeval.test_case import LLMTestCaseParams

arena = ArenaGEval(
    name="Friendly",
    criteria="Choose the friendlier contestant",
    evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT],
)
results = compare(test_cases=[test_case], metric=arena)
gpt4_wins = results.get("GPT-4", 0)
claude_wins = results.get("Claude-4", 0)
# results is a dict[str, int]: {"GPT-4": 1, "Claude-4": 0}
```

Arena masks names and randomizes order. No pass/fail — only win counts.

---

## Data Privacy & Telemetry

**Telemetry opt-out** — DeepEval tracks basic usage (eval count, metric type)
via Sentry. No PII collected. To disable:

```bash
export DEEPEVAL_TELEMETRY_OPT_OUT=1
```

**Error reporting (opt-in)** — off by default:

```bash
export ERROR_REPORTING=1
```

**Confident AI storage** — data in private AWS cloud. Only your org has access.
VIP plan available for enhanced compliance: [confident-ai.com/pricing](https://confident-ai.com/pricing).

---

## Troubleshooting

### TLS / SSL Errors

If uploads fail with `SSLCertVerificationError`:

```bash
curl -v https://api.confident-ai.com/                  # 1. check curl
unset REQUESTS_CA_BUNDLE SSL_CERT_FILE SSL_CERT_DIR     # 2. check python
python -c "import requests; print(requests.get('https://api.confident-ai.com').status_code)"
```

### Logging

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

| Variable | Purpose |
|----------|---------|
| `LOG_LEVEL` | Global log level (`DEBUG`, `INFO`) |
| `DEEPEVAL_VERBOSE_MODE` | Extra warnings/diagnostics |
| `DEEPEVAL_LOG_STACK_TRACES` | Stack traces in retry logs |

### Timeout Tuning

```bash
export DEEPEVAL_PER_TASK_TIMEOUT_SECONDS_OVERRIDE=600
export DEEPEVAL_PER_ATTEMPT_TIMEOUT_SECONDS_OVERRIDE=120
export DEEPEVAL_RETRY_MAX_ATTEMPTS=2
```

See also: `DEEPEVAL_TASK_GATHER_BUFFER_SECONDS_OVERRIDE`,
`DEEPEVAL_RETRY_INITIAL_SECONDS`, `DEEPEVAL_RETRY_EXP_BASE`.

### Dotenv Loading

Loads `.env` at import. Priority: `.env` → `.env.{APP_ENV}` → `.env.local`.

```bash
DEEPEVAL_DISABLE_DOTENV=1 pytest -q     # skip dotenv
ENV_DIR_PATH=/path/to/project pytest -q  # custom dir
```

### Reset / Persist Settings

```python
from deepeval.config.settings import reset_settings, get_settings

reset_settings(reload_dotenv=True)

settings = get_settings()
with settings.edit(save="dotenv"):
    settings.DEEPEVAL_VERBOSE_MODE = True
```

---

## Miscellaneous

Opt-in to version update warnings:

```bash
export DEEPEVAL_UPDATE_WARNING_OPT_IN=1
```

### Sources

- [DeepTeam Docs](https://trydeepteam.com/docs/red-teaming-introduction)
- [Arena Test Cases](https://deepeval.com/docs/evaluation-arena-test-cases)
- [Data Privacy](https://deepeval.com/docs/data-privacy)
- [Troubleshooting](https://deepeval.com/docs/troubleshooting)
