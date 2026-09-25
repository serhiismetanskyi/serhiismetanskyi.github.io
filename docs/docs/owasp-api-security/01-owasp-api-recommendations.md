---
date: 2026-07-01
tags:
  - security
  - owasp
  - api
---

# OWASP API Security: Recommendations and Best Practices

Reference: **OWASP API Security Top 10 (2023)** · OWASP REST Security Cheat Sheet.

## Security Baseline for Every API

1. **HTTPS only** — disable plain HTTP on all environments, enable HSTS with a long `max-age`, and automate certificate rotation. Protect internal service-to-service traffic as well.
2. **Strong authentication** — use a centralized Identity Provider (IdP) with short-lived access tokens. Validate every JWT claim (`iss`, `aud`, `exp`, `nbf`) on every request. Support explicit token revocation for logout and incident response.
3. **Deny by default** — all endpoints are closed unless explicitly opened. Grant the minimum scope, role, and resource access required for each consumer.
4. **Input and schema validation** — enforce strict JSON Schema (or equivalent) for every request body, query, and path parameter. Reject unknown fields, oversized payloads (`413`), and unsupported content types (`415`).
5. **Rate limits and quotas** — apply per-client, per-endpoint, and per-business-flow limits. Return `429 Too Many Requests` with a `Retry-After` header when exceeded.
6. **Audit logging** — log authentication failures, authorization denials, token validation errors, rate-limit hits, and sensitive data changes. Sanitize log payloads to prevent log injection and secret leakage.
7. **API inventory** — maintain a living catalog of every endpoint, its version, owner, authentication model, and data classification. Review inventory on every release.

---

## API1: Broken Object Level Authorization (BOLA)

**What it is:** the API does not verify that the requesting user owns or is allowed to access the object identified by `id`, `uuid`, or another key in the request.

**Why it matters:** BOLA is the most exploited API vulnerability — over 40 % of findings in API pentests. Attackers simply swap IDs in the URL or body to access other users' data.

**Example:** `GET /api/orders/1042` returns the order even though it belongs to a different user. The server only checked "is the caller authenticated?" but not "does this order belong to the caller?"

**Prevention:**
- Always filter database queries by both object ID **and** the current user/tenant context.
- Use random, unpredictable identifiers (UUIDs) instead of sequential integers.
- Write negative tests: authenticate as user A, request user B's resource, and expect `403` or `404`.

---

## API2: Broken Authentication

**What it is:** weaknesses in login, token issuance, or session management that let attackers impersonate legitimate users.

**Prevention:**
- Protect login and token endpoints with strict rate limits (e.g., 5 attempts per minute) and account lockout or CAPTCHA after repeated failures.
- Require MFA for admin accounts and sensitive operations (password change, fund transfer).
- Keep access tokens short-lived (minutes), refresh tokens longer but bound to device/IP, and maintain a server-side denylist for revoked tokens.
- Reject unsigned or weakly signed JWTs; never trust the `alg` header alone — verify against server-side configuration.

---

## API3: Broken Object Property Level Authorization

**What it is:** the API exposes more object fields than the caller should see, or allows the caller to write fields they should not control. This category merges "Excessive Data Exposure" and "Mass Assignment" from 2019.

**Example (read):** `GET /api/users/me` returns `{"name":"Jo","role":"admin","ssn":"123-45-6789"}` — the client gets fields it never needs.

**Example (write):** `PUT /api/users/me` with body `{"name":"Jo","role":"admin"}` — the API blindly applies all fields, escalating the user to admin.

**Prevention:**
- Define explicit response schemas that return only needed fields (an allowlist, not a denylist).
- Use an explicit allowlist of writable properties per role. Never bind the raw request body to a data model.
- Enforce property-level authorization on both read and write paths.

---

## API4: Unrestricted Resource Consumption

**What it is:** the API does not limit how many resources (CPU, memory, bandwidth, money) a single request or client can consume.

**Prevention:**
- Enforce maximum `page_size`, `limit`, and `offset` values in pagination.
- Set payload size caps and reject with `413 Payload Too Large`.
- For GraphQL: limit query depth, complexity score, and batch size.
- Add execution timeouts, retry budgets, and circuit breakers for downstream calls.
- Cap spending on paid integrations (SMS, email, ML inference) per client.

---

## API5: Broken Function Level Authorization (BFLA)

**What it is:** the API does not verify that the caller's role is allowed to execute the requested function. Unlike BOLA (wrong object), BFLA means accessing the wrong action entirely.

**Example:** a regular user discovers `DELETE /api/admin/users/42` and the server executes it because it only checks authentication, not role.

**Prevention:**
- Maintain a role → action → resource matrix as the single source of authorization truth.
- Isolate admin routes (separate path prefix, separate gateway, or separate service).
- Automate privilege-escalation tests: for every admin endpoint, call it with a regular-user token and expect `403`.

---

## API6: Unrestricted Access to Sensitive Business Flows

**What it is:** attackers automate legitimate business actions (buying tickets, creating accounts, scraping prices) at a scale that harms the business — without exploiting a traditional bug.

**Prevention:**
- Add per-flow rate limits and velocity rules (e.g., max 3 checkouts per user per minute).
- Use anti-bot controls (device fingerprinting, CAPTCHA) for flows where automated abuse has revenue impact.
- Require idempotency keys for transactional POST operations to block replay.
- Deploy anomaly detection to alert on sudden spikes in checkout, signup, or booking flows.

---

## API7: Server Side Request Forgery (SSRF)

**What it is:** the API accepts a URL from the client and fetches it server-side without validation. Attackers use this to reach internal services, cloud metadata (`http://169.254.169.254`), or private networks.

**Prevention:**
- Maintain an outbound allowlist of hosts, ports, and schemes. Reject everything else.
- Block RFC 1918 ranges (`10.x`, `172.16–31.x`, `192.168.x`), link-local (`169.254.x`), and loopback.
- Resolve and validate the final destination after redirects — attackers chain redirects to bypass initial checks.
- If you must accept arbitrary URLs (webhooks), proxy them through an isolated egress service with no internal network access.

---

## API8: Security Misconfiguration

**What it is:** insecure defaults, missing hardening, exposed debug surfaces, or overly permissive cloud/container settings.

**Prevention:**
- Use secure-by-default infrastructure templates (Terraform modules, Helm charts) that enforce TLS, disable debug, and set restrictive CORS.
- Return generic error messages to clients; never expose stack traces, internal IPs, or SQL errors.
- Scan infrastructure configs and secrets in CI (e.g., `trivy`, `checkov`, `gitleaks`).
- Disable or restrict management endpoints in production to internal networks only.

---

## API9: Improper Inventory Management

**What it is:** undocumented, forgotten, or outdated API versions remain accessible and become soft targets because they lack current security controls.

**Prevention:**
- Keep a central API catalog: route, owner, auth model, data classification, and deprecation date.
- Synchronize OpenAPI contracts with every deployment; fail the build if the contract is stale.
- Actively detect and decommission shadow APIs (never officially registered) and zombie APIs (deprecated but still reachable).

---

## API10: Unsafe Consumption of APIs

**What it is:** the application blindly trusts data received from third-party APIs and applies weaker validation than it does for user input.

**Example:** a payment gateway returns a webhook with a tampered `amount` field. The server saves it without validation, crediting the wrong amount.

**Prevention:**
- Validate and sanitize all third-party responses with the same rigor as user input.
- Set explicit timeouts, retry limits, and circuit breakers for every integration.
- Isolate integrations so that a partner failure or compromise cannot cascade into the core flow.

---

## Operational Hardening

- **HTTP method allowlist:** return `405 Method Not Allowed` for unsupported methods.
- **Content type enforcement:** reject mismatched `Content-Type` / `Accept` with `415` / `406`.
- **Security headers:** set `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, and `Content-Security-Policy: frame-ancestors 'none'` on every response.
- **CORS:** allow only explicitly trusted origins; never use `*` in production.
- **Credentials in URLs:** never place API keys, tokens, or passwords in query strings — use headers or body.

## CI/CD Integration

- Run SAST, dependency scanning, secret scanning, and API-specific security tests on every merge request.
- Block releases on unresolved High / Critical findings.
- Maintain dedicated test suites for authorization (BOLA/BFLA), rate limiting, and business-flow abuse.
- Run DAST or API scanning against staging before production rollout.

## Team Policy

- Every new endpoint ships with security acceptance criteria in the ticket.
- Every critical endpoint has at least one negative authorization test in CI.
- Every release includes an API inventory diff and deprecation notes.

## OWASP Cheat Sheet Essentials

- **OWASP API Top 10:** prioritize server-side authorization, inventory hygiene, and abuse controls as default API security baseline. <https://owasp.org/API-Security/editions/2023/en/0x11-t10/>
- **OWASP REST Cheat Sheet:** enforce HTTPS only, strict methods/content types, safe errors, and security-relevant audit logs. <https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html>
- **OWASP Authorization Cheat Sheet:** deny by default, validate permissions on every request, and test negative authorization paths continuously. <https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html>
- **OWASP GraphQL Cheat Sheet:** constrain query depth/complexity, control batching, and restrict introspection in production. <https://cheatsheetseries.owasp.org/cheatsheets/GraphQL_Cheat_Sheet.html>
- **OWASP gRPC Cheat Sheet:** require TLS/mTLS, use metadata-based auth, and enforce method-level authorization via interceptors. <https://cheatsheetseries.owasp.org/cheatsheets/gRPC_Security_Cheat_Sheet.html>
- **OWASP WebSocket Cheat Sheet:** validate `Origin`, authenticate handshake/session, and apply per-connection/message limits against CSWSH and abuse. <https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html>
