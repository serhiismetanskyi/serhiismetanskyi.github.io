---
date: 2026-07-24
tags:
  - test-automation
  - architecture
  - ci-cd
---

# Configuration Management

## Environment Config

Tests run against multiple environments: dev, staging, production.
Config must be environment-aware without code changes between runs.

### Config Model

```python
from pydantic import BaseModel, field_validator
from pydantic_settings import BaseSettings


class EnvConfig(BaseSettings):
    base_url: str
    api_token: str
    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str = "testdb"
    timeout_seconds: int = 30
    environment: str = "dev"

    model_config = {"env_file": ".env", "env_prefix": "TEST_"}

    @field_validator("base_url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        if not v.startswith(("http://", "https://")):
            raise ValueError(f"base_url must start with http:// or https://, got: {v}")
        return v.rstrip("/")
```

### YAML per Environment

```yaml
# config/environments/staging.yaml
base_url: "https://api.staging.example.com"
timeout_seconds: 30
db_host: "${DB_HOST}"
db_name: "staging_testdb"
environment: "staging"
```

```python
import os
import yaml
import re


def load_env_config(env: str = "dev") -> EnvConfig:
    config_path = f"config/environments/{env}.yaml"
    with open(config_path) as f:
        raw = f.read()

    # Expand ${VAR} references
    expanded = re.sub(
        r"\$\{(\w+)\}",
        lambda m: os.environ.get(m.group(1), m.group(0)),
        raw,
    )
    data = yaml.safe_load(expanded)
    return EnvConfig(**data)
```

```python
# conftest.py
import pytest
import os


@pytest.fixture(scope="session")
def env_config() -> EnvConfig:
    env = os.environ.get("TEST_ENV", "dev")
    return load_env_config(env)
```

Run against staging:
```bash
TEST_ENV=staging uv run pytest -m smoke
```

---

## Secrets Management

Never commit secrets. Not in YAML, not in `.env`, not in conftest.

| Secret | Storage |
|--------|---------|
| API tokens | CI secrets (GitHub Secrets, Vault) |
| DB passwords | Environment variables only |
| OAuth credentials | CI environment, `.env.local` (gitignored) |
| TLS certificates | Secret store, mounted in CI |

```bash
# .gitignore
.env
.env.local
config/secrets/
```

```python
# Fail fast if required secret is missing
import os


def require_env(key: str) -> str:
    value = os.environ.get(key)
    if not value:
        raise EnvironmentError(
            f"Required environment variable '{key}' is not set. "
            f"Check your .env file or CI secrets configuration."
        )
    return value
```

---

## Feature Flags

Test behaviour changes when feature flags are on or off.
Tests must be explicit about the flag state they require.

```python
import pytest


@pytest.fixture
def feature_flags(env_config) -> dict:
    return {
        "new_checkout_flow": env_config.environment != "prod",
        "experimental_search": False,
    }


@pytest.mark.skipif(
    condition=True,
    reason="new_checkout_flow flag is disabled in this environment",
)
def test_new_checkout_flow_completes(page, feature_flags):
    if not feature_flags["new_checkout_flow"]:
        pytest.skip("new_checkout_flow disabled")
    ...
```

---

## Config Validation at Startup

Validate config before any test runs. Fail immediately with a clear message.

```python
# conftest.py
def pytest_sessionstart(session) -> None:
    import logging
    log = logging.getLogger("conftest")

    try:
        config = load_env_config(os.environ.get("TEST_ENV", "dev"))
        log.info("Config loaded: env=%s base_url=%s", config.environment, config.base_url)
    except Exception as exc:
        raise SystemExit(f"Framework config error: {exc}") from exc
```

A misconfigured environment produces one clear error, not 500 mysterious failures.
