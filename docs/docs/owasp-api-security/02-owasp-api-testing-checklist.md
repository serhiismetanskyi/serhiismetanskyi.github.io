---
date: 2026-07-01
tags:
  - security
  - owasp
  - api
---

# OWASP API Security Testing Checklist

Use this checklist for pre-release validation and periodic regression security testing.
Priority labels: **[P0]** = must-pass release gate, **[P1]** = high value, **[P2]** = recommended.

---

## A. Access Control and Authorization

- **[P0]** BOLA — authenticate as user A, request user B's objects by swapping `id` / `uuid` in URL, body, and headers. Expect `403` or `404`, never `200` with another user's data.
- **[P0]** BFLA — call every admin-only endpoint with a regular-user token. Expect `403`. Also try changing HTTP method (GET → DELETE) on restricted routes.
- **[P0]** Property-level — send a PUT/PATCH that includes fields the role must not change (`role`, `is_admin`, `balance`). Verify the server ignores or rejects them.
- **[P1]** Multi-tenant isolation — in multi-tenant setups, verify Tenant A cannot access Tenant B data via any endpoint.
- **[P1]** Authorization denial responses return `403` with a generic message. No internal details, object existence hints, or stack traces.

**How to test:** use two test accounts with different roles. Replay each request switching the auth token. Automate with Burp Suite, Postman collection runner, or a custom pytest suite that iterates an endpoint × role matrix.

---

## B. Authentication and Session Security

- **[P0]** Enumerate all endpoints and confirm none bypass authentication when protection is required.
- **[P0]** Submit JWTs with tampered claims (`aud`, `exp` in the past, `alg: none`). Expect rejection.
- **[P0]** After logout or token revocation, replay the old token. Expect `401`.
- **[P1]** Trigger brute-force attempts on login (e.g., 20 wrong passwords in 10 s). Verify lockout, `429`, or CAPTCHA activates.
- **[P2]** Verify refresh tokens are bound to device/IP and cannot be reused after rotation.

**How to test:** craft JWTs manually with `jwt.io` or `python-jose`. Use `curl` or Postman to replay tokens and verify server-side denylist behavior.

---

## C. Input, Content Types, and Parsing

- **[P0]** Send payloads that violate the schema: wrong type, extra fields, missing required fields, boundary values. Expect `400`.
- **[P0]** Send oversized payloads exceeding the configured limit. Expect `413`.
- **[P1]** Send requests with wrong `Content-Type` (e.g., `text/xml` to a JSON-only endpoint). Expect `415`.
- **[P1]** Send requests with an unsupported `Accept` header. Expect `406`.
- **[P1]** Test for injection via JSON keys, XML external entities (XXE), and template expressions. Expect safe handling or rejection.

**How to test:** create a Postman/Newman collection with negative-case test data. For XXE, use OWASP payloads against any endpoint that accepts XML.

---

## D. Resource and Abuse Protection

- **[P0]** Verify rate limits fire: send requests above the configured threshold and confirm `429` with `Retry-After`.
- **[P1]** Send `page_size=999999` or equivalent. Verify the server caps it and does not return unbounded data.
- **[P1]** For GraphQL: send a deeply nested or high-complexity query. Verify the server rejects or truncates it.
- **[P2]** Simulate a traffic burst and confirm legitimate requests are still served within acceptable latency.

**How to test:** use `ab`, `wrk`, `k6`, or `locust` for load-based checks. Verify response codes and headers programmatically.

---

## E. Business Flow Abuse

- **[P0]** Try to skip workflow steps (e.g., call `/confirm` without calling `/pay`). Expect rejection with clear error.
- **[P1]** Submit the same POST twice with the same idempotency key. Verify only one side-effect occurs.
- **[P1]** Replay a previous valid request with the same nonce / timestamp. Expect `409` or `422`.
- **[P2]** Automate a sensitive flow at high speed (mass signup, mass checkout). Verify throttling or CAPTCHA triggers.

**How to test:** script a sequence of API calls and deliberately reorder or repeat them. Assert on status codes and database state.

---

## F. SSRF and Outbound Integrations

- **[P0]** If any endpoint accepts a URL parameter, supply `http://169.254.169.254/latest/meta-data/` (cloud metadata) and internal IPs (`10.0.0.1`, `127.0.0.1`). Expect rejection.
- **[P1]** Supply a URL that redirects to an internal host. Verify the server blocks the final destination.
- **[P1]** Validate that all responses from third-party APIs are schema-checked and sanitized before internal use.

**How to test:** use Burp Collaborator or a controlled callback server to detect outbound requests. Supply crafted URLs and monitor whether the server contacts them.

---

## G. Configuration, Inventory, and Observability

- **[P0]** Confirm debug endpoints (`/debug`, `/metrics`, `/actuator`, `/swagger-ui`) are disabled or access-restricted in production.
- **[P1]** Verify API inventory matches the live deployment: no undocumented or deprecated endpoints are reachable.
- **[P1]** Trigger an authorization failure and confirm an audit log entry is created with user ID, endpoint, action, and timestamp.
- **[P2]** Verify error responses never expose stack traces, internal IPs, database names, or framework versions.

**How to test:** scan the live host with `nuclei`, `nikto`, or custom endpoint wordlists. Compare discovered routes with the OpenAPI spec.

---

## H. CI/CD Security Gates

- **[P0]** Security test suite runs on every merge request and blocks merge on failure.
- **[P0]** Dependency and secret scanning are enabled; High/Critical findings block the build.
- **[P1]** DAST or API-specific scanning (e.g., `OWASP ZAP`, `Nuclei`, `42Crunch`) runs against staging before production deploy.
- **[P2]** API inventory diff is generated automatically and attached to the release notes.

---

## I. API Type Coverage, Threat Modeling, and Compliance

- **[P1]** GraphQL tests include depth/complexity limits, batching abuse, and introspection exposure checks.
- **[P1]** gRPC tests validate mTLS/TLS, metadata auth, and method-level authorization behavior.
- **[P1]** WebSocket tests validate handshake auth, `Origin` allowlist enforcement, and per-connection/message limits.
- **[P1]** Threat model exists for critical API flows and is updated when endpoints or auth models change.
- **[P2]** Compliance checks verify PII minimization, retention windows, and deletion/export workflows (GDPR-aligned).

**How to test:** run protocol-specific tests per API type, then verify mitigation traceability from threat model to automated test cases.

---

## J. Failure Modes, Anti-Patterns, and Data Security

- **[P1]** Failure-mode tests cover auth bypass, data leakage, and resource exhaustion scenarios.
- **[P1]** Anti-pattern checks confirm no internal/debug endpoint exposure in production.
- **[P1]** Encryption checks verify TLS in transit and encrypted storage for sensitive data at rest.
- **[P2]** Defense-in-depth review confirms layered controls (auth + validation + rate limit + monitoring).

**How to test:** execute adversarial scenarios in staging and confirm alerts, logs, and runbook actions are triggered.

---

## K. OAuth2, Webhooks, and Gateway

- **[P0]** OAuth2 flows use PKCE (`S256`); implicit grant and ROPC are disabled.
- **[P0]** Webhook endpoints verify HMAC signature and reject payloads older than 5 min.
- **[P1]** API gateway enforces auth, rate limits, and TLS before traffic reaches services.
- **[P1]** Refresh token rotation is active; reuse of old refresh tokens is rejected.

**How to test:** send unsigned webhooks and expired OAuth tokens; verify rejection. Bypass gateway and hit service directly; confirm denial.

---

## L. Uploads, Caching, Keys, and Sessions

- **[P1]** File uploads are validated by content type (magic bytes), size-capped, and malware-scanned.
- **[P1]** `Cache-Control: no-store` is set on all sensitive/authenticated responses.
- **[P1]** API keys are scoped, hashed at rest, and rotated within policy window.
- **[P1]** Concurrent sessions per user are limited; revoked tokens are rejected immediately.

**How to test:** upload malicious files, inspect cache headers, attempt reuse of rotated keys/tokens.

---

## M. Multi-Tenancy, Versioning, and Incident Readiness

- **[P0]** Cross-tenant data access is blocked at query level (Tenant A cannot reach Tenant B data).
- **[P1]** Deprecated API versions return `Sunset` header and are blocked after announced date.
- **[P1]** Monitoring alerts fire on auth failure spikes, error rate, and latency anomalies.
- **[P1]** Incident playbook is tested: token revocation, IP block, and secret rotation work end-to-end.

**How to test:** authenticate as Tenant A, request Tenant B resources. Call sunset endpoints. Trigger alert thresholds in staging and verify runbook steps.

---

## Exit Criteria (Release Gate)

Release is allowed only when:

1. All **[P0]** items across sections A–M are passed.
2. No open High/Critical risks in **[P1]** items.
3. Every remaining Medium risk has an assigned owner and a time-bound remediation plan.
