---
date: 2026-08-01
tags:
  - robot-framework
  - test-automation
  - ci-cd
---

# Configuration & Secrets Management

Keep **what changes per environment** (URLs, feature flags, timeouts) and **what must never appear in Git** (tokens, passwords) out of test logic. Robot Framework gives you several levers; combine them so local, staging, and production-like runs stay predictable.

## Environment configuration patterns

### Separate files per environment

Store **non-secret** defaults in small YAML files per tier. Tests and resources only reference abstract names such as `${BASE_URL}` or `${API_TIMEOUT}`.

```text
config/
├── dev.yaml
├── staging.yaml
└── prod.yaml
```

Example `config/dev.yaml` (no secrets here):

```yaml
base_url: https://api.dev.example.com
api_timeout: 30s
```

### YAML via `--variablefile` (Python loader)

Robot’s built-in `--variablefile` loads a **Python** module. A common pattern is that module reading YAML and exposing variables:

```bash
pip install pyyaml
robot --variablefile config/load_env.py tests/
```

```python
# config/load_env.py — picks tier from ENV or CLI (requires PyYAML)
import os
import pathlib

import yaml

_TIER = os.environ.get("TEST_ENV", "dev")
_PATH = pathlib.Path(__file__).parent / f"{_TIER}.yaml"
with _PATH.open(encoding="utf-8") as handle:
    _CFG = yaml.safe_load(handle)

BASE_URL = _CFG["base_url"]
API_TIMEOUT = _CFG["api_timeout"]
```

### Dynamic Python variable files

Use Python variable files when you need **computed** values (clock skew buffers, dynamic hostnames from service discovery, or merging CLI overrides with files).

### CLI `--variable` for overrides

Ad-hoc and CI overrides without editing files:

```bash
robot --variable BASE_URL:https://api.staging.example.com tests/
```

Combine with your loader so file defaults exist, but **pipeline or developer** can override a single key.

## No hardcoded environment data in tests

| Avoid in `.robot` / keywords | Prefer |
|------------------------------|--------|
| Literal URLs, realms, tenant IDs | `${BASE_URL}`, `${TENANT_ID}` from config |
| User passwords, API keys | Env + `Secret` type (RF 7.4+) or library APIs |
| “Works only on my machine” paths | `pathlib` / `${EXECDIR}` / artifacts dir from env |

## Secrets management

### Environment variables

Inject secrets in the shell or CI (never commit `.env` with real values). Reference them in Robot with `%{VAR_NAME}`.

### Version control

| Do | Don’t |
|----|--------|
| Commit **structure** (`config/*.yaml.example`) | Commit real `prod.yaml` with secrets |
| Document required env vars in README | Store tokens in test data “temporarily” |
| Use `.gitignore` for local override files | Push “fix” branches with pasted keys |

### Secret variables in Robot Framework 7.4+

RF 7.4 introduces variables that **hide values in logs and report files** (they are **not** encryption). Values must come from existing secrets, env, or safe combinations—not from literals in the file.

```robot
*** Variables ***
${API_TOKEN: Secret}    %{API_TOKEN}
```

Equivalent `VAR` syntax in the body (same name pattern: `${NAME: Secret}`):

```robot
*** Test Cases ***
Example
    VAR    ${TOKEN: Secret}    %{API_TOKEN}
    My Login Keyword    ${TOKEN}
```

CLI (shell expands env before Robot sees it):

```bash
export API_TOKEN="…"
robot tests/
```

Libraries can type-hint `Secret` from `robot.api.types` so only secret-carrying arguments are accepted.

### CI/CD secret injection

| Platform | Typical pattern |
|----------|-----------------|
| GitHub Actions | Repository or environment **secrets** → `env:` on the job step |
| GitLab CI | Masked **CI/CD variables** |
| Jenkins | Credentials binding to env vars |

Always pass the **name** of the variable into Robot; never echo secret values in build logs.

## Best practices

| Practice | Why it helps |
|----------|----------------|
| One **tier** selector (`TEST_ENV`, `ROBOT_ENV`) | Single code path; fewer “wrong file” mistakes |
| **YAML for data**, **Python for logic** | Clear split; easier review |
| **Secret** type for tokens/passwords | Reduces accidental leakage in `log.html` |
| Example configs **without** real values | Onboarding without security incidents |
| Fail fast if required env is missing | Clear error instead of vague connection failures |

## See also

- [Logging, debugging & reporting](02-logging-reporting.md) — avoid logging secrets even when debugging.
- [CI/CD integration](03-ci-cd-integration.md) — wiring env and secrets in pipelines.
