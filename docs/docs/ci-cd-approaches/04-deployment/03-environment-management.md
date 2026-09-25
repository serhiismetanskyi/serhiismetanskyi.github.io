---
date: 2026-08-29
tags:
  - ci-cd
  - devops
  - deployment
---

# Environment Management

## Environment Model

Most systems use three tiers. The artifact is promoted unchanged between them.

```
Developer → [Dev] → [Staging] → [Production]
              ↑          ↑            ↑
           Frequent   Mirrors      Real users
           deploys    production   Traffic
```

| Environment | Purpose | Who Deploys |
|-------------|---------|------------|
| Dev / local | Developer testing | Developer |
| Staging | Integration testing, pre-prod validation | CI on merge |
| Production | Real users | CI after gates pass |

---

## Environment Configuration

Configuration varies by environment. Code does not.

### The Twelve-Factor App Rule

One codebase, all config from environment variables:

```python
import os
from pydantic_settings import BaseSettings


class Config(BaseSettings):
    db_host: str
    db_port: int = 5432
    db_name: str
    api_key: str
    log_level: str = "INFO"
    environment: str = "dev"

    model_config = {"env_file": ".env"}


config = Config()
```

No environment-specific code paths. No `if env == "prod"` in application logic.

### Per-Environment Config Files (CI)

```yaml
# config/staging.yaml
base_url: "https://api.staging.example.com"
db_host: "${DB_HOST}"
log_level: "INFO"

# config/production.yaml
base_url: "https://api.example.com"
db_host: "${DB_HOST}"
log_level: "WARNING"
```

---

## Secrets Management

Secrets are never in code, never in config files that are committed.

| Method | Use Case |
|--------|---------|
| CI/CD secret variables | API keys, tokens used by pipeline |
| HashiCorp Vault | Dynamic secrets, database credentials |
| AWS Secrets Manager | AWS-native workloads |
| Kubernetes Secrets | Credentials injected into pods |
| `.env` (gitignored) | Local developer environment only |


```yaml
# GitHub Actions — secrets injected as env vars
- name: Deploy
  run: ./deploy.sh
  env:
    DB_PASSWORD: ${{ secrets.PROD_DB_PASSWORD }}
    API_KEY: ${{ secrets.PROD_API_KEY }}
```


### What Never to Commit

```bash
# .gitignore — enforce these globally
.env
.env.local
.env.production
*.key
*.pem
secrets/
```

Use `git-secrets` or `detect-secrets` as a pre-commit hook and CI check:


```yaml
- name: Check for secrets
  uses: trufflesecurity/trufflehog@main
  with:
    path: ./
    base: ${{ github.event.repository.default_branch }}
    head: HEAD
```


---

## Environment Parity

Staging must mirror production. Differences cause "works on staging, broken in prod".

| Property | Staging | Production |
|----------|---------|-----------|
| Same Docker image | ✓ | ✓ |
| Same DB version | ✓ | ✓ |
| Same Kubernetes version | ✓ | ✓ |
| Same infrastructure config | ✓ | ✓ (different sizes) |
| Same secrets structure | ✓ | ✓ (different values) |

Only acceptable differences: hardware size (smaller in staging) and traffic volume.

---

## Environment Drift

Environment drift = staging diverges from production over time.

**Causes:**
- Manual changes applied to production but not to staging IaC
- Hot fixes deployed to production, not rolled back into the main branch
- Different dependency versions

**Prevention:**
- All infrastructure changes go through IaC (no manual kubectl apply in production)
- Staging deploys happen on every merge to main — always fresh
- Drift detection: `terraform plan` with zero diff as a nightly check

```yaml
# Nightly drift detection
- name: Detect infrastructure drift
  run: |
    terraform plan -detailed-exitcode
    # exit code 2 = changes detected = drift
```
