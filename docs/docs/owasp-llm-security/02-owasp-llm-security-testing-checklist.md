---
date: 2026-07-02
tags:
  - security
  - owasp
  - llm
---

# OWASP LLM Security Testing Checklist (2026)

Use this checklist for pre-release validation and periodic regression testing.
Priority labels: **[P0]** must-pass gate, **[P1]** high priority, **[P2]** recommended.

## A. Prompt Injection (LLM01)

- **[P0]** Direct injection tests: prompts like "ignore previous instructions" cannot bypass policy.
- **[P0]** Indirect injection tests: malicious instructions inside RAG docs/files do not alter protected behavior.
- **[P0]** Jailbreak resilience tests: roleplay, policy-conflict framing, and best-of-N retries fail to bypass controls.
- **[P1]** Obfuscation tests: encoded/multilingual payloads are detected or safely handled.
- **[P1]** High-risk actions require explicit approval even if model requests them.

**How to test:** run curated attack prompt sets against each critical workflow and compare policy decision logs.

## B. Sensitive Data Leakage (LLM02, LLM07)

- **[P0]** Model does not disclose secrets, API keys, credentials, or internal prompts.
- **[P0]** Retrieval access control is enforced by user and tenant.
- **[P1]** Logs and traces do not store raw sensitive values.
- **[P1]** Prompt leakage attempts trigger refusal patterns and alerts.

**How to test:** attempt extraction attacks for system prompt, hidden instructions, and data from other users/tenants.

## C. Output Handling Safety (LLM05)

- **[P0]** No raw model output is executed directly in shell/SQL/template contexts.
- **[P0]** Structured outputs are validated against strict schema before use.
- **[P1]** Context-aware sanitization is enforced for HTML/Markdown/SQL/shell output.
- **[P1]** Markdown exfil tests: rendered output cannot trigger remote data callbacks via images/links.
- **[P1]** Dangerous commands, URLs, and function names are blocked by allowlist policy.

**How to test:** fuzz output parsing boundaries and inject payloads that target each downstream executor.

## D. Agent and Tool Security (LLM06)

- **[P0]** Unauthorized tool invocation is denied.
- **[P0]** Least privilege is enforced for model identities and API tokens.
- **[P0]** SSRF tests: browsing/fetch tools cannot access localhost, link-local, RFC1918, or metadata IP ranges.
- **[P1]** Sensitive tools require step-up approval and audit logging.
- **[P1]** Transaction limits and dry-run protections are active.

**How to test:** replay tool calls with modified parameters and lower-privilege identities; verify denial and logs.

## E. RAG and Embedding Security (LLM08, LLM04)

- **[P0]** Document-level ACLs are enforced during retrieval.
- **[P0]** Cross-tenant retrieval leakage is prevented.
- **[P1]** Ingestion pipeline rejects malformed or untrusted metadata.
- **[P1]** Poisoned document simulations are detected before impacting responses.

**How to test:** ingest controlled malicious chunks and verify index isolation, retrieval filtering, and response grounding checks.

## F. Supply Chain and Integrity (LLM03)

- **[P0]** Model, prompt, and dependency versions are pinned and tracked.
- **[P1]** Artifact provenance/signature checks are verified in build pipeline.
- **[P1]** Third-party connectors/plugins pass security review before enablement.
- **[P2]** Container and dependency scans run on every merge request.

**How to test:** tamper with dependency or model version in a test branch and verify pipeline blocking.

## G. Misinformation and Trust (LLM09)

- **[P1]** High-impact answers require citations or evidence references.
- **[P1]** Uncertain answers trigger abstain/escalation behavior.
- **[P2]** Critical domains route to human review.
- **[P2]** Factuality metrics are tracked and trend-reviewed per release.

**How to test:** use benchmark Q&A sets with known answers and evaluate hallucination/grounding rate.

## H. Cost and Availability Abuse (LLM10)

- **[P0]** Token/request budgets per user/session/tenant are enforced.
- **[P0]** Agent loop iteration caps and timeout limits are enforced.
- **[P1]** Concurrency limits prevent denial-of-wallet and degraded service.
- **[P1]** Cost anomaly alerts trigger throttling or fail-safe behavior.

**How to test:** simulate long prompts, chain loops, and concurrent bursts; verify throttling and stable response times.

## I. CI/CD and Runtime Guardrails

- **[P0]** LLM security tests run on every merge request.
- **[P0]** High/Critical findings block release automatically.
- **[P1]** Threat model is updated for each new tool, memory, or retrieval source.
- **[P1]** Incident runbooks (kill-switch, key rotation, rollback) are available and tested.

## J. Memory, AuthZ, and Sandboxing

- **[P0]** Memory is isolated per user/tenant/session and cross-user retrieval is blocked.
- **[P1]** Memory TTL and deletion workflows are validated in runtime tests.
- **[P0]** Role-based authorization blocks prompt-driven privilege escalation for tools and retrieval.
- **[P1]** Code/tool execution is confined to sandboxed environments with restricted network/filesystem access.

**How to test:** run cross-tenant memory retrieval attempts, role-switch tool calls, and malicious code execution probes in staging.

## K. Red Teaming and Compliance Validation

- **[P1]** Red-team exercises cover prompt injection, leakage, RAG poisoning, and tool abuse.
- **[P1]** Privacy checks validate PII redaction, retention limits, and deletion requests.
- **[P2]** Infrastructure checks validate secrets handling, API hardening, and network segmentation.

**How to test:** execute quarterly adversarial simulations and map findings to remediation SLAs.

## Exit Criteria (Release Gate)

Release is allowed only when:

1. All **[P0]** items are passed.
2. No unresolved High/Critical issues remain in **[P1]**.
3. Remaining Medium issues have owner, due date, and remediation plan.
