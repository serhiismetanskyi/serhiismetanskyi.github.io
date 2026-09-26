---
date: 2026-07-02
tags:
  - security
  - owasp
  - llm
---

# OWASP LLM Security Guide (2026)

Reference baseline: **OWASP Top 10 for LLM Applications (2026)** from OWASP GenAI Security Project.

## Why LLM Security Is Different

LLM applications combine classic app risks with probabilistic model behavior. Real incidents often come from prompt manipulation, unsafe tool execution, or insecure retrieval paths rather than only network exploits.

## OWASP LLM Top 10 (2026)

1. **LLM01 Prompt Injection**
2. **LLM02 Sensitive Information Disclosure**
3. **LLM03 Supply Chain**
4. **LLM04 Data and Model Poisoning**
5. **LLM05 Improper Output Handling**
6. **LLM06 Excessive Agency**
7. **LLM07 System Prompt Leakage**
8. **LLM08 Vector and Embedding Weaknesses**
9. **LLM09 Misinformation**
10. **LLM10 Unbounded Consumption**

## Priority Risks First (Implementation Order)

1. `LLM01` Prompt Injection
2. `LLM05` Improper Output Handling
3. `LLM06` Excessive Agency
4. `LLM02` Sensitive Information Disclosure
5. `LLM10` Unbounded Consumption

This order protects the highest-impact kill chains first: manipulate model -> force bad output -> execute privileged actions.

## Risk-by-Risk Guidance

## LLM01: Prompt Injection

**What it is:** attacker input alters model behavior and bypasses instruction intent.

**Attack paths:**
- direct input manipulation in chat, including jailbreak roleplay and best-of-N retries,
- indirect injection via RAG documents, links, files, and tool responses,
- obfuscated or multimodal instructions.

**Controls:**
- Separate trusted system policy from untrusted user and retrieved content.
- Add policy classifiers for input and output.
- Restrict model to explicit allowed tasks.
- Require human-in-the-loop for high-risk actions.
- Treat model output as untrusted data.

## LLM02: Sensitive Information Disclosure

**What it is:** model reveals secrets, PII, tenant data, or internal architecture details.

**Controls:**
- Minimize prompt context; include only required data.
- Redact secrets and PII before prompt assembly.
- Disable raw prompt/response logging by default.
- Enforce retrieval authorization by user and tenant.
- Add output DLP checks before returning responses.

## LLM03: Supply Chain

**What it is:** compromised models, datasets, plugins, connectors, or dependencies.

**Controls:**
- Maintain signed artifact provenance for models and prompts.
- Pin model and dependency versions.
- Review third-party tools/connectors before enablement.
- Continuously scan dependencies and container images.

## LLM04: Data and Model Poisoning

**What it is:** poisoned training, fine-tuning, or embedding data alters behavior.

**Controls:**
- Gate data ingestion with quality and integrity checks.
- Keep trusted data zones separate from user-contributed corpora.
- Add anomaly detection for embedding outliers.
- Use periodic benchmark regression tests for safety and quality drift.

## LLM05: Improper Output Handling

**What it is:** downstream systems execute or render model output unsafely.

**Examples:** model-generated shell commands, SQL, HTML, templates, or API calls used without validation.
Also includes Markdown-based data exfiltration payloads (image/link callbacks, hidden tracking URLs, and unsafe render targets).

**Controls:**
- Never execute raw output directly.
- Validate output against strict schemas.
- Context-aware escaping/sanitization (HTML, Markdown, SQL, shell).
- Render Markdown in safe mode; block remote image fetches, `javascript:`/`data:` URIs, and credentialed callback links.
- Deny dangerous commands/URLs/functions via allowlist-first policy.

## LLM06: Excessive Agency

**What it is:** model has too much autonomy and can trigger irreversible actions.

**Controls:**
- Least privilege for model identities and API tokens.
- Read-only and write tools separated by default; enforce deny-by-default outbound egress with destination allowlists.
- Multi-step confirmation for critical actions.
- Per-action limits, dry-run mode, and rollback options.
- Full audit trail for each tool call.

## LLM07: System Prompt Leakage

**What it is:** attackers extract hidden instructions, policies, or internal metadata.

**Controls:**
- Keep system prompts minimal and non-sensitive.
- Store secrets in secure backends, never in prompt text.
- Add leakage detection patterns and policy refusal behavior.
- Rotate sensitive instruction templates when exposure is suspected.

## LLM08: Vector and Embedding Weaknesses

**What it is:** RAG retrieval abuse, cross-tenant leakage, embedding attacks, and poisoned chunks.

**Controls:**
- Enforce document-level ACLs in retrieval layer.
- Segment vector indexes by tenant or sensitivity class.
- Validate ingestion metadata and source trust.
- Add retrieval relevance and grounding checks before answer generation.

## LLM09: Misinformation

**What it is:** confident but false or biased outputs trigger bad business decisions.

**Controls:**
- Require citations for high-impact responses.
- Use confidence thresholds and abstain behavior.
- Route critical domains (legal, medical, finance) to human review.
- Track factuality metrics in regression tests.

## LLM10: Unbounded Consumption

**What it is:** abuse of token usage, request loops, or expensive tool paths causing cost and availability impact.

**Controls:**
- Token and request budgets per user/session/tenant.
- Max iteration limits for agent loops.
- Strict timeout and concurrency limits.
- Budget alerts and auto-throttle policies.

## Secure Architecture Blueprint

1. **Policy Enforcement Layer**: centralized checks for input/output/action authorization.
2. **Tool Gateway**: one controlled entrypoint with allowlists and argument validators.
3. **RAG Security Layer**: ACL-aware retrieval, ingestion validation, poisoning defenses.
4. **Observability Layer**: traces for prompts, retrieved chunks, tool calls, denials.
5. **Incident Controls**: kill-switch for tools/models, emergency policies, key rotation.

## CI/CD Security Gates

- Run automated LLM abuse tests on every merge request.
- Block release on unresolved High/Critical findings for injection, leakage, and unsafe actions.
- Require threat-model update when adding tool, connector, memory, or retrieval source.
- Require rollback runbook and explicit owner for high-impact agent capabilities.

## Operational Metrics to Track

- Prompt injection detection rate.
- Unsafe output block rate.
- Unauthorized tool call attempts.
- Data leakage incidents per release.
- Token/cost spikes and throttling events.

## Team Operating Rules

- Fail safely: if policy checks fail, deny action.
- Keep deterministic code controls authoritative over model intent.
- No direct privileged production action without explicit approval path.
- Every new LLM feature ships with negative abuse tests.

## Additional Controls from Engineering Plan

- **Memory security:** isolate memory by user/tenant/session, enforce TTL, encrypt stored memory, and filter sensitive fields before persistence.
- **Authentication and authorization:** require strong user identity, role-aware retrieval/tool scopes, and deny cross-role action escalation.
- **Sandboxing:** execute generated code or risky tools only in isolated runtimes with network and filesystem restrictions.
- **Compliance and privacy:** map controls to GDPR/PII policies, enforce retention limits, and maintain data-subject deletion paths.
- **Infrastructure security:** protect APIs with mTLS/TLS, strong secret management, and network segmentation for model, vector DB, and tool backends.
- **Failure modes:** explicitly track hallucination, unsafe output, and tool misuse as incident classes with runbooks.
- **Anti-patterns to avoid:** blind trust in model output, no monitoring, no rate limits, and unrestricted agent permissions.
- **Real-world scenarios:** include prompt injection, poisoned RAG documents, and unauthorized tool execution in test catalogs.
- **Defense in depth:** combine input filtering, context isolation, output validation, and runtime monitoring.
- **Staff-level heuristics:** assume adversarial input, validate all boundaries, and default to least privilege everywhere.
