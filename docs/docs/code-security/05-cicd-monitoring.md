---
date: 2026-06-30
tags:
  - security
  - appsec
  - observability
  - ci-cd
---

# CI/CD & Monitoring

A compromised CI/CD pipeline can **exfiltrate every secret** and **deploy backdoored code** to production. Pipeline security is as critical as application security.

---

## CI/CD Pipeline Hardening
### Least-Privilege Permissions

| Stage | Allowed Permissions |
|-------|-------------------|
| **Build** | Read source, write artifacts |
| **Test** | Read source, read artifacts, no network |
| **Deploy (staging)** | Push to staging only |
| **Deploy (production)** | Push to production, requires approval |

Build agents must **never** have production credentials unless running a deployment job.

### Pin Third-Party Actions to SHA

```yaml
# BAD — vulnerable to tag hijacking
- uses: actions/checkout@v4
- uses: docker/build-push-action@latest

# GOOD — pinned to specific commit SHA
- uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11  # v4.1.1
- uses: docker/build-push-action@4a13e500e55cf31b7a5d59a38ab2040ab0f42f56  # v5.1.0
```

### Pipeline Code Review

Changes to CI/CD configuration must go through the **same review process** as application code:

- `Jenkinsfile`
- `.github/workflows/*.yml`
- `.gitlab-ci.yml`
- `Dockerfile`
- `docker-compose.yml`

### Merge Protections

| Protection | Purpose |
|------------|---------|
| At least 1 approval required | Peer review |
| All CI checks pass | Automated quality gates |
| Branch protection on `main` | No direct pushes |
| CODEOWNERS for CI configs | Security team review |

---

## Secrets in CI/CD

### Never Expose in Logs

```yaml
# Audit: search build logs for leaked patterns
# GitHub Actions masks secrets automatically, but custom scripts may leak

- name: Deploy
  run: |
    # BAD — echo prints secret to logs
    echo "Deploying with key: $API_KEY"

    # GOOD — no secret in output
    deploy --quiet
  env:
    API_KEY: ${{ secrets.API_KEY }}
```

### Use OIDC Instead of Static Credentials

```yaml
# Modern approach — OIDC token exchange (no static secrets)
permissions:
  id-token: write
  contents: read

steps:
  - uses: aws-actions/configure-aws-credentials@e3dd6a429d7300a6fbeceff7e9f4e7f17b7f5f62
    with:
      role-to-assume: arn:aws:iam::123456789:role/deploy-role
      aws-region: us-east-1
```

---

## Container Security

### Image Scanning

```yaml
# GitHub Actions — Trivy image scan
- name: Scan container image
  uses: aquasecurity/trivy-action@9baf4a7292e4f2c4e478f2cb7161c0a1a8f5fa8c
  with:
    image-ref: myapp:${{ github.sha }}
    severity: CRITICAL,HIGH
    exit-code: 1
```

### Minimal Base Images

```dockerfile
# Multi-stage build — no build tools in production
FROM python:3.13-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM gcr.io/distroless/python3-debian12
COPY --from=builder /usr/local/lib/python3.13/site-packages /usr/local/lib/python3.13/site-packages
COPY . /app
WORKDIR /app
CMD ["main.py"]
```

### Artifact Signing

```bash
# Sign container images with Cosign
cosign sign --key cosign.key myregistry/myapp:v1.0.0

# Verify before deployment
cosign verify --key cosign.pub myregistry/myapp:v1.0.0
```

---

## DAST (Dynamic Application Security Testing)

DAST scanners test **running applications** — they catch runtime issues that SAST misses.

| Tool | Free | Best For |
|------|------|----------|
| **ZAP (OWASP)** | Yes (OSS) | Full-featured web scanner |
| **Nuclei** | Yes (OSS) | Template-based, fast |

```yaml
# Run ZAP against staging
- name: OWASP ZAP Scan
  uses: zaproxy/action-full-scan@f1f2369e8abfabf0fbd9f8f9bd7d4b7f85c80a6b
  with:
    target: https://staging.myapp.com
    rules_file_name: .zap/rules.tsv
```

## Provenance & Policy Gates

Signature is not enough; verify artifact provenance before deploy.

```bash
# Generate and verify provenance attestation
cosign attest --predicate provenance.json --type slsaprovenance myregistry/myapp:v1.0.0
cosign verify-attestation --type slsaprovenance myregistry/myapp:v1.0.0
```

Recommended deploy gate:

- Require valid Cosign signature
- Require valid SLSA/in-toto provenance attestation
- Enforce policy-as-code (Kyverno/OPA/Conftest) before admission

---

## Logging & Monitoring

### What to Log

| Event | Log Level | Required Fields |
|-------|-----------|----------------|
| Login success/failure | INFO/WARN | user_id, source_ip, timestamp |
| MFA challenge | INFO | user_id, method, result |
| Authorization failure | WARN | user_id, resource, action |
| Input validation rejection | WARN | endpoint, validation_error |
| Admin actions | INFO | admin_id, action, target |
| Rate limit triggered | WARN | source_ip, endpoint |

### Alerting Rules

| Alert | Trigger | Action |
|-------|---------|--------|
| Brute-force login | 10+ failed attempts in 5 min | Block IP, notify team |
| Unusual API traffic | 5x normal request rate | Investigate, scale if legit |
| Privilege escalation | Non-admin accessing admin endpoints | Block, alert immediately |
| Dependency CVE critical | New critical CVE in SBOM | Patch within 7 days |

---

## Incident Response Plan

| Step | Action | Owner |
|------|--------|-------|
| 1. **Detect** | Automated alerting triggers | Monitoring system |
| 2. **Contain** | Isolate affected service, revoke credentials | On-call engineer |
| 3. **Investigate** | Review logs, determine blast radius | Security team |
| 4. **Remediate** | Fix vulnerability, deploy patch | Dev team |
| 5. **Communicate** | Notify affected users if data exposed | Management |
| 6. **Post-mortem** | Blameless review, prevent recurrence | All stakeholders |
