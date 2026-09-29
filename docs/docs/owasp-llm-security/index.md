---
date: 2026-07-01
tags:
  - security
  - owasp
  - llm
---

# OWASP LLM Security

Practical knowledge-base section focused on **OWASP Top 10 for LLM Applications (2026)** — risk guidance, architecture controls, and a release-gate testing checklist.

Explicitly covered attack vectors include jailbreaks, prompt/indirect injection, markdown data exfiltration, SSRF via AI browsing tools, RAG poisoning, sandbox escape/RCE, and multi-modal injection.

## Structure

| File | Topics |
|---|---|
| [01 OWASP LLM Security Guide](./01-owasp-llm-security-guide.md) | LLM01–LLM10 risk guidance, architecture blueprint, CI/CD gates, memory/authz/compliance controls |
| [02 OWASP LLM Security Testing Checklist](./02-owasp-llm-security-testing-checklist.md) | Prioritized checklist (P0/P1/P2) with how-to-test steps, red teaming, and release criteria |

---
## See also
- [Digital Garden: Knowledge Base](../index.md)
- [Agentic AI Architecture](../agentic-ai-architecture/index.md)
- [DeepEval — LLM Testing Guide](../llm-evaluation/index.md)
- [Security Observability](../ci-cd-approaches/05-security-observability/index.md)
- [QA & Testing Methodology](../qa-methodology/index.md)
