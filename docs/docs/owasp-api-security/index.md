---
date: 2026-06-30
tags:
  - security
  - owasp
  - api
---

# OWASP API Security

Practical knowledge-base section focused on **OWASP API Security Top 10 (2023)** — actionable recommendations, advanced controls, and a release-gate testing checklist.

## Structure

| File | Topics |
|---|---|
| [01 OWASP API Recommendations](./01-owasp-api-recommendations.md) | Security baseline, per-risk controls (API1–API10) with examples, operational hardening, CI/CD gates |
| [02 OWASP API Testing Checklist](./02-owasp-api-testing-checklist.md) | Prioritized checklist (P0/P1/P2) with how-to-test guidance, tool references, and release criteria |
| [03 OWASP API Advanced Controls](./03-owasp-api-advanced-controls.md) | OAuth2/OIDC, webhooks, API gateway, multi-tenancy, file uploads, caching, incident response, tooling |

## What to Start With

1. Read `01` and compare baseline + per-risk controls with your current API architecture.
2. Use `02` as a pre-release gate and for periodic regression security testing.
3. Review `03` for deeper topics: OAuth2 flows, webhook hardening, gateway patterns, and incident playbook.
4. Prioritize `API1` (BOLA), `API2` (Broken Auth), `API5` (BFLA), and `API10` (Unsafe Consumption) first.

---
## See also
- [Digital Garden: Knowledge Base](../index.md)
- [API Architectures](../api-architectures/index.md)
- [API Testing](../test-automation-framework/04-api-testing/index.md)
- [Automation](../python-guide/04-automation/index.md)
- [QA & Testing Methodology](../qa-methodology/index.md)
