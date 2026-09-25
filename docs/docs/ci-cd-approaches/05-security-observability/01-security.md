---
date: 2026-08-29
tags:
  - ci-cd
  - devops
  - security
  - observability
---

# Security in CI/CD

## Security Belongs in the Pipeline

Security checks that run only at the end are too late.
Shift left: catch vulnerabilities at the PR stage, not after deploy.

```
PR → [Secret scan] → [Dependency audit] → [SAST] → [Image scan] → Deploy
```

Every stage adds a layer. No single tool catches everything.

---

## Secrets Management

### Vaults

Never store secrets in CI/CD YAML files. Use a secret store.

| Tool | Provider | Best For |
|------|----------|---------|
| GitHub Secrets | GitHub | Simple CI secrets |
| HashiCorp Vault | Any | Dynamic secrets, rotation |
| AWS Secrets Manager | AWS | AWS-native workloads |
| GCP Secret Manager | GCP | GCP-native workloads |
| Kubernetes Secrets | K8s | Pod-level secret injection |


```yaml
# GitHub Secrets — injected as env vars, never printed in logs
- name: Deploy
  run: ./deploy.sh
  env:
    DB_URL: ${{ secrets.PROD_DB_URL }}
    JWT_SECRET: ${{ secrets.JWT_SECRET }}
```


GitHub masks secret values in logs automatically.

### Secret Rotation

Secrets must expire. Static credentials that never rotate are a permanent liability.

- Database passwords: rotate every 90 days
- API keys: rotate on team member departure
- CI tokens: rotate every 30 days for production access
- Use HashiCorp Vault dynamic secrets where possible (TTL-based auto-rotation)

---

## Dependency Scanning

Scan for known CVEs in dependencies. Block on critical severity.

```yaml
- name: Dependency audit
  run: uv run pip-audit --fail-on-vuln --severity critical
```

### Automated Dependency Updates

Use Dependabot or Renovate to auto-create PRs for dependency updates:

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "pip"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5

  - package-ecosystem: "docker"
    directory: "/"
    schedule:
      interval: "weekly"
```

---

## Static Application Security Testing (SAST)

SAST analyses source code for security anti-patterns without running it.

```yaml
- name: SAST with Bandit (Python)
  run: uv run bandit -r src/ -ll -ii

- name: SAST with Semgrep
  uses: returntocorp/semgrep-action@v1
  with:
    config: "p/python p/secrets p/sql-injection"
```

| Tool | Language | Checks |
|------|----------|--------|
| Bandit | Python | Hardcoded passwords, SQL injection, unsafe deserialization |
| Semgrep | Multi | Custom rules, OWASP Top 10 |
| CodeQL | Multi | Deep semantic analysis |

---

## Container Image Scanning

Docker images contain OS packages with their own CVEs.


```yaml
- name: Scan image with Trivy
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: ghcr.io/${{ github.repository }}:${{ github.sha }}
    format: sarif
    output: trivy-results.sarif
    exit-code: '1'
    severity: 'CRITICAL,HIGH'

- name: Upload to GitHub Security tab
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: trivy-results.sarif
```


Scan on every image push. Results appear in GitHub's Security tab.

---

## Supply Chain Security

Verify that the code that built the artifact is the code that was reviewed.


```yaml
# Sign Docker images with Cosign (SLSA compliance)
- name: Sign image
  uses: sigstore/cosign-installer@v3

- name: Cosign sign
  run: |
    cosign sign --yes \
      ghcr.io/${{ github.repository }}:${{ github.sha }}
  env:
    COSIGN_EXPERIMENTAL: 1
```


Consumers verify the signature before deploying:
```bash
cosign verify ghcr.io/org/api:sha-abc1234 \
  --certificate-identity-regexp="https://github.com/org/repo"
```

---

## Minimal Permission Principle in CI

Each job must have the minimum permissions it needs. Nothing more.

```yaml
permissions:
  contents: read         # checkout only
  packages: write        # push to registry
  security-events: write # upload SARIF results
  id-token: write        # OIDC for cloud auth

jobs:
  deploy:
    permissions:
      contents: read
      id-token: write    # only what deploy needs
```

Avoid `permissions: write-all` — it grants unnecessary access to every resource.
