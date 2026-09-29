---
date: 2026-06-30
tags:
  - security
  - appsec
---

# Security Audit Checklist

A **40-point** checklist for auditing code security. Run the full audit **quarterly**. Between audits, automated scanning handles continuous checks.

---

## How to Use

For each item mark: **Pass** (implemented and verified), **Fail** (not implemented), or **N/A** (not applicable to your stack).

Items marked **Fail** need a remediation owner and deadline:

- **Critical** gaps (secrets, auth, injection) — fix within **7 days**
- **High** gaps (headers, CORS, session) — fix within **30 days**
- **Medium** gaps (logging, monitoring, docs) — fix within **90 days**

Track evidence for each check (CI run URL, scan artifact, policy result, config screenshot).

---

## 1. Secrets Management (6 items)

| # | Check | Severity | How to Verify |
|---|-------|----------|--------------|
| 1 | No hardcoded secrets in source code | Critical | <code>rg -n "sk&#95;live&#95;&#124;sk-proj-&#124;password&#92;s&#42;=" -t code</code> |
| 2 | `.env` files in `.gitignore` | Critical | Check `.gitignore`, run `git log --all -- .env*` |
| 3 | No secrets in client-side env vars | Critical | <code>rg "VITE&#95;.&#42;SECRET&#124;NEXT&#95;PUBLIC&#95;.&#42;KEY" .env&#42;</code> |
| 4 | Pre-commit secret scanning enabled | High | Check `.pre-commit-config.yaml` for Gitleaks/TruffleHog |
| 5 | Production secrets in a secrets manager | High | Verify Vault/AWS SM/Doppler config |
| 6 | No secrets in Docker image layers | High | `docker history <image>` — check for embedded secrets |

---

## 2. Dependency Security (6 items)

| # | Check | Severity | How to Verify |
|---|-------|----------|--------------|
| 7 | SCA scan runs on every build | Critical | Check CI pipeline for Trivy/Grype/Snyk step |
| 8 | Critical CVEs block deployment | Critical | Verify CI fails on CRITICAL severity findings |
| 9 | Lock files committed to Git | High | Check for `uv.lock` / `package-lock.json` / `go.sum` |
| 10 | Dependencies updated within last 30 days | High | Check Dependabot/Renovate PR activity |
| 11 | No unused dependencies | Medium | Run `deptry .` (Python) or `npx depcheck` (Node) |
| 12 | License compliance checked | Medium | Run `pip-licenses` or `license-checker` |

---

## 3. Code Analysis (6 items)

| # | Check | Severity | How to Verify |
|---|-------|----------|--------------|
| 13 | SAST runs on every pull request | Critical | Check CI for Semgrep/SonarQube/Bandit |
| 14 | No SQL string interpolation | Critical | <code>rg "f&#92;".&#42;SELECT&#124;f&#92;".&#42;INSERT&#124;f&#92;".&#42;UPDATE" -t py</code> |
| 15 | No `shell=True` with user input | Critical | `rg "shell=True" -t py` — review each usage |
| 16 | All user input validated server-side | High | Review API endpoints for Pydantic/Zod schemas |
| 17 | No `dangerouslySetInnerHTML` with user data | High | `rg "dangerouslySetInnerHTML" -t tsx -t jsx` |
| 18 | Output encoding for all rendered data | High | Verify framework auto-escaping is enabled |

---

## 4. Authentication & Authorization (7 items)

| # | Check | Severity | How to Verify |
|---|-------|----------|--------------|
| 19 | Passwords hashed with Argon2id/bcrypt | Critical | Review auth code for hash algorithm |
| 20 | Every API endpoint requires auth | Critical | Audit route definitions for missing middleware |
| 21 | Auth conditions are not inverted | Critical | Review `if session` vs `if not session` guards |
| 22 | DB queries scoped to authenticated user | Critical | Check for IDOR — queries include `user_id` filter |
| 23 | Role checks enforced server-side | High | Verify admin endpoints check `role` from session |
| 24 | Session cookies have secure attributes | High | Check for `httpOnly`, `secure`, `sameSite` flags |
| 25 | Failed logins are rate-limited | High | Verify rate limiter on `/login`, `/register`, `/reset` |

---

## 5. Configuration & Headers (6 items)

| # | Check | Severity | How to Verify |
|---|-------|----------|--------------|
| 26 | CORS restricted to frontend domain | Critical | <code>rg 'origin.&#42;"&#92;&#42;"&#124;origin.&#42;&#92;&#42;' -t py -t js</code> |
| 27 | HTTPS enforced everywhere (TLS 1.2+) | Critical | Check for HSTS header, mixed content |
| 28 | Security headers set (CSP, X-Frame, etc.) | High | Test at [securityheaders.com](https://securityheaders.com) |
| 29 | Error responses don't leak internals | High | Trigger errors, check for stack traces |
| 30 | File uploads validated (magic bytes, size) | High | Review upload endpoints |
| 31 | Admin interfaces have extra access controls | Medium | Check for IP restrictions, additional auth |

---

## 6. CI/CD Pipeline (5 items)

| # | Check | Severity | How to Verify |
|---|-------|----------|--------------|
| 32 | Pipelines run with least-privilege | High | Review CI/CD service account permissions |
| 33 | Third-party actions pinned to SHA | High | <code>rg "@v[0-9]&#124;@latest" .github/workflows/</code> |
| 34 | Pipeline config changes are code-reviewed | High | Check branch protection rules |
| 35 | Secrets not exposed in CI logs | High | Search recent build logs for secret patterns |
| 36 | Container images scanned before deploy | High | Check CI for Trivy/Grype image scan step |

---

## 7. Monitoring & Response (4 items)

| # | Check | Severity | How to Verify |
|---|-------|----------|--------------|
| 37 | Security events logged centrally | High | Verify auth events, failures logged to SIEM |
| 38 | Alerts on brute-force and anomalies | High | Check alerting rules in monitoring system |
| 39 | Incident response plan documented | Medium | Review IR runbook, check last tabletop date |
| 40 | DAST scans run against staging | Medium | Check for ZAP/Nuclei in CI or scheduled scans |

---

## Extended Supply Chain Controls (recommended)

These controls are strongly recommended for 2026 production environments.

| Check | Severity | How to Verify |
|---|---|---|
| Artifact has signed provenance attestation | High | `cosign verify-attestation --type slsaprovenance <image>` |
| Deploy gate verifies signature + provenance | High | Admission policy/Kyverno rule evidence |
| CI actions pinned to full commit SHA only | High | `rg "@v[0-9]|@latest|@master" .github/workflows/` should return none |
| Trusted registry allowlist enforced | Medium | CI/package manager config only allows approved registries |
| Lockfile integrity enforced in CI | Medium | `uv sync --frozen` / `npm ci` is mandatory in pipeline |
| AI prompt/tool logs are redacted | Medium | Logging policy and sample logs show token masking |

---

## Scoring

| Score | Assessment | Priority Action |
|-------|-----------|----------------|
| **35-40** | Strong security posture | Address remaining gaps, maintain |
| **25-34** | Good foundation with gaps | Close high-risk gaps within 30 days |
| **15-24** | Significant risk exposure | Focus on Secrets + Auth sections first |
| **Below 15** | Immediate action needed | Start with items 1, 7, 13, 19, 20, 26, 27 |

---

## Minimum Tooling Matrix

| Category | Tool | Free/OSS | Purpose |
|----------|------|----------|---------|
| **SAST** | Semgrep / Bandit | Yes | Code vulnerability scanning |
| **SCA** | Trivy / pip-audit | Yes | Dependency vulnerability scanning |
| **Secrets** | Gitleaks / TruffleHog | Yes | Secret leak prevention |
| **DAST** | ZAP / Nuclei | Yes | Runtime vulnerability scanning |
| **Container** | Trivy / Grype | Yes | Image vulnerability scanning |
| **IaC** | Checkov / KICS | Yes | Infrastructure misconfiguration |
| **Headers** | securityheaders.com | Yes | HTTP header verification |
| **Deps update** | Dependabot / Renovate | Yes | Automated dependency PRs |

---

## OWASP ASVS 5.0 Mapping (Quick View)

| Checklist Area | ASVS 5.0 Domain (example) |
|---|---|
| Secrets, config, data protection | V1 + configuration/data protection controls |
| Input validation + encoding | V5 validation/sanitization controls |
| Authentication + sessions | V2 authentication/session controls |
| Authorization + access checks | V3 authorization controls |
| API and token checks | API + token/OAuth controls |
| Logging + error handling | Logging/monitoring controls |

---

## Quick-Start: Security in 1 Hour

If you can only spend 1 hour, do these 5 things:

1. **10 min** — Run `gitleaks detect --source . --verbose` to find leaked secrets
2. **10 min** — Run `trivy fs .` to find vulnerable dependencies
3. **10 min** — Search for `shell=True`, SQL string interpolation, `dangerouslySetInnerHTML`
4. **15 min** — Verify every API endpoint has auth middleware
5. **15 min** — Check CORS config, add `.env` to `.gitignore`, add pre-commit hook

!!! tip "Track your score over time"
    Run the full 40-point audit quarterly. Track your score per audit to measure security program improvement. Aim to gain **5+ points per quarter** until you reach 35+.
