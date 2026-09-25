---
date: 2026-06-29
tags:
  - security
  - appsec
---

# Code Security

Practical guide covering **code-level security** — secrets leak prevention, dependency hardening, static analysis, authentication patterns, CI/CD pipeline security, and a comprehensive audit checklist.

Based on **OWASP Top 10 (2026)**, **OWASP ASVS 5.0**, **AppSec 50-Point Audit**, and modern DevSecOps practices.

## Structure

| File | Topics |
|---|---|
| [01 Secrets & Leak Prevention](./01-secrets-leak-prevention.md) | Hardcoded secrets, `.env` risks, pre-commit scanning, secrets managers, AI agent leaks |
| [02 Dependency Security](./02-dependency-security.md) | SCA tools, vulnerability scanning, SBOM, lock files, license compliance, update strategy |
| [03 Code Analysis & Review](./03-code-analysis-review.md) | SAST scanning, secure code review, input validation, injection prevention, output encoding |
| [04 Auth, Config & Headers](./04-auth-config-headers.md) | Authentication, authorization, CORS, security headers, cookies, rate limiting, error handling |
| [05 CI/CD & Monitoring](./05-cicd-monitoring.md) | Pipeline hardening, artifact signing, logging, alerting, incident response, DAST |
| [06 Security Audit Checklist](./06-security-audit-checklist.md) | 40-point checklist, severity scoring, remediation SLAs, ASVS quick mapping, and extended supply-chain controls |

## What to Start With

1. Run through `01` — scan your repo for leaked secrets right now using the grep patterns provided.
2. Use `02` — check your dependencies for known vulnerabilities with SCA tools.
3. Review `03` — set up SAST scanning on every pull request.
4. Apply `04` — verify authentication middleware and security headers.
5. Harden `05` — secure your CI/CD pipeline and set up monitoring.
6. Score with `06` — run the full audit checklist and set remediation deadlines.

---
## See also
- [Digital Garden: Knowledge Base](../index.md)
- [OWASP API Security](../owasp-api-security/index.md)
- [OWASP LLM Security](../owasp-llm-security/index.md)
- [Python Security Best Practices](../python-guide/07-best-practices/01-security.md)
- [CI/CD Security & Observability](../ci-cd-approaches/05-security-observability/index.md)
- [Docker Security & Production](../tools/docker/05-security-production.md)
