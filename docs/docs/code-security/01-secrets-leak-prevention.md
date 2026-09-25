---
date: 2026-06-29
tags:
  - security
  - appsec
---

# Secrets & Leak Prevention

Hardcoded secrets are the **easiest vulnerability** for attackers to exploit and the **most common** in AI-generated code. In 2025 alone, **28.65 million** new secrets were detected in public GitHub commits.

---

## Where Secrets Leak

| Vector | Risk | Mitigation |
|--------|------|------------|
| Hardcoded in source code | Direct access to services | Pre-commit scanning + code review |
| `.env` files committed to Git | Full credential exposure | `.gitignore` + git history scan |
| Client-side env vars (`VITE_`, `NEXT_PUBLIC_`, `REACT_APP_`) | Secrets bundled into JS | Server-side only for sensitive keys |
| Docker image layers | Permanent embedding | Multi-stage builds, never `COPY .env` |
| AI coding agents | Agents read full project dirs including `.env` | Exclude secrets from agent context |
| Logs and crash dumps | Env vars captured in error traces | Sanitize logs, mask secrets |
| Process listings | `ps` and `/proc` expose env vars | Use secrets managers instead |
| Child processes | Inherit all parent env vars | Inject only needed vars |

---

## Detection: Grep Patterns

Run these to find common secret patterns in your codebase:

```bash
# API keys and tokens
rg -n "sk_live_|sk-proj-|sk_test_|SG\.|ghp_|gho_|glpat-" --type-add 'code:*.{py,ts,tsx,js,jsx,go,java,rb}' -t code

# Generic secret patterns
rg -n "password\s*=\s*[\"']|api_key\s*=\s*[\"']|secret\s*=\s*[\"']|token\s*=\s*[\"']" -t code

# AWS credentials
rg -n "AKIA[0-9A-Z]{16}|aws_secret_access_key" -t code

# Bearer tokens in code
rg -n "Bearer\s+[a-zA-Z0-9\-._~+/]+" -t code

# Check if .env was ever committed
git log --all --full-history -- ".env*"

# Check for secrets in client-side env vars
rg -n "VITE_.*SECRET|VITE_.*KEY|NEXT_PUBLIC_.*SECRET|REACT_APP_.*KEY" .env*
```

---

## Pre-Commit Scanning

### Gitleaks (Recommended)

Gitleaks provides **700+ regex patterns** for detecting secrets.

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.21.2
    hooks:
      - id: gitleaks
```

```bash
# Manual full-repo scan (including git history)
gitleaks detect --source . --verbose

# Scan only staged changes
gitleaks protect --staged --verbose
```

### TruffleHog

```bash
# Scan entire repo history
trufflehog git file://. --since-commit HEAD~50 --only-verified

# Scan GitHub org
trufflehog github --org=your-org --only-verified
```

### GitGuardian (CI Integration)

```yaml
# GitHub Actions
- name: GitGuardian Scan
  uses: GitGuardian/ggshield-action@v1
  env:
    GITGUARDIAN_API_KEY: ${{ secrets.GITGUARDIAN_API_KEY }}
```

---

## `.gitignore` Essentials

```gitignore
# Secrets and credentials
.env
.env.*
.env.local
.env.production
*.pem
*.key
*.p12
*.pfx
*.jks

# Terraform state (may contain secrets)
*.tfvars
*.tfstate
*.tfstate.backup

# IDE and tool configs that may contain tokens
.idea/
.vscode/settings.json
```

---

## Why `.env` Files Are Not Enough (2026)

`.env` files provide **no encryption, no access control, no audit trail, and no rotation**.

| Problem | Impact |
|---------|--------|
| AI agents read project dirs | Secrets sent to LLM providers |
| Docker layers embed secrets | `docker history` exposes them |
| No access control | Anyone with file access gets all secrets |
| No audit trail | No record of who accessed what |
| No auto-rotation | Manual process, often skipped |
| Child process inheritance | All spawned processes get all secrets |

### AI/Agent Exfiltration Guardrails

For repositories using coding agents, add explicit controls:

- Redact secrets from prompt/tool logs before persistence
- Deny-by-default tool execution; allowlist only required commands
- Restrict network egress for agent jobs (block unknown domains)
- Exclude secret files (`.env*`, keys) from agent context by policy
- Alert on prompt content that matches secret patterns

### Use Secrets Managers Instead

| Tool | Best For | Free Tier |
|------|----------|-----------|
| **HashiCorp Vault** | Self-hosted, enterprise | Open-source |
| **AWS Secrets Manager** | AWS infrastructure | 30-day trial |
| **Doppler** | Developer-friendly, multi-cloud | Free for 5 users |
| **Infisical** | Open-source, self-hosted | Open-source |
| **1Password CLI** | Small teams | Business plan |

### Integration Pattern

```python
# Instead of os.environ["API_KEY"]
# Use a secrets manager client
import hvac

client = hvac.Client(url="https://vault.example.com:8200")
secret = client.secrets.kv.v2.read_secret_version(path="myapp/config")
api_key = secret["data"]["data"]["api_key"]
```

---

## Incident Response: Leaked Secret

If a secret has been committed:

1. **Rotate immediately** — generate new credentials, revoke old ones
2. **Remove from history** — use `git filter-repo` or BFG Repo-Cleaner
3. **Scan for usage** — check logs for unauthorized access during exposure window
4. **Add pre-commit hook** — prevent future leaks
5. **Update `.gitignore`** — add the file pattern

```bash
# Remove .env from entire git history
git filter-repo --invert-paths --path .env --force

# BFG alternative (faster for large repos)
bfg --delete-files .env
git reflog expire --expire=now --all && git gc --prune=now --aggressive
```

!!! danger "80% of secrets in private repos remain valid at detection"
    Average remediation time is **27 days**. Attackers exploit leaked AWS keys within **5 minutes** of push. Rotate first, clean history second.
