---
date: 2026-07-01
tags:
  - security
  - owasp
  - api
---

# OWASP API Advanced Controls

Deeper controls that go beyond the per-risk baseline in [01](./01-owasp-api-recommendations.md): token flows, webhooks, gateway responsibilities, tenant isolation, file uploads, caching, incident response, and tooling. Each section ends with **How to test** — checks you can add to the [testing checklist](./02-owasp-api-testing-checklist.md).

---

## OAuth 2.0 / OIDC Flows

Follow the OAuth 2.0 Security Best Current Practice (RFC 9700) and the OAuth 2.1 draft: fewer flows, stricter defaults.

| Client type | Flow | Notes |
|---|---|---|
| SPA, mobile, desktop | Authorization Code + **PKCE** | No client secret; PKCE (`S256`) is mandatory |
| Server-side web app | Authorization Code + PKCE + client secret | PKCE recommended even for confidential clients |
| Service-to-service | Client Credentials | Prefer `private_key_jwt` or mTLS over shared secrets |
| Service acting for a user | Token Exchange (RFC 8693) | Downscoped token per hop, never forward the user's original token |
| Implicit, Password (ROPC) | **Do not use** | Removed in OAuth 2.1 |

**Token rules**

- **Validate every JWT fully** — signature with a pinned algorithm list (never accept `alg: none` or switch RS256 → HS256), `iss`, `aud`, `exp`, `nbf`, and `azp` when present (RFC 8725).
- **Audience per API** — a token for `orders-api` must be rejected by `payments-api`. Use resource indicators (RFC 8707) to request audience-restricted tokens.
- **Short-lived access tokens** (5–15 min); **refresh token rotation** with reuse detection — reuse of an old refresh token revokes the whole family.
- **Sender-constrained tokens** for high-value APIs: DPoP (RFC 9449) or mTLS-bound tokens (RFC 8705), so a stolen token cannot be replayed from another client.
- **Scopes are coarse, authorization is fine-grained** — `orders:read` lets the client call the endpoint; object-level checks (BOLA) still run on every request.
- **Exact redirect URI matching** — no wildcards, no open redirects on the redirect target; validate `state` and OIDC `nonce`.
- **ID tokens are for the client**, not for calling APIs. APIs accept access tokens only.

**How to test**

- **[P0]** Replay an access token issued for another audience → `401`.
- **[P0]** Send tokens with `alg: none`, an HS256 signature made with the public key, expired `exp`, future `nbf` → all rejected.
- **[P0]** Authorization request without `code_challenge` for a public client → rejected by the authorization server.
- **[P1]** Use a rotated refresh token twice → second use fails and the token family is revoked.
- **[P1]** Change one character of the registered `redirect_uri` → authorization server refuses.

---

## Webhooks

Webhooks turn your API into a client (outgoing) and expose an unauthenticated endpoint (incoming). Both directions need controls.

### Receiving webhooks

- **Verify the signature** over the raw body — HMAC-SHA256 with a per-endpoint secret, or asymmetric signatures. Compare in constant time.
- **Reject old or future timestamps** (e.g. more than 5 minutes skew) to block replay.
- **Deduplicate by event ID** — providers retry; handlers must be idempotent.
- **Acknowledge fast, process async** — return `2xx` after storing the event, do the work in a queue.
- **Treat the payload as untrusted** — validate the schema; for sensitive actions, re-fetch the object from the provider's API instead of trusting fields in the event.

```python
import hashlib
import hmac
import time

TOLERANCE = 300  # seconds


def verify_webhook(secret: bytes, body: bytes, event_id: str, timestamp: str, signature: str) -> None:
    """Standard Webhooks style: sign "{id}.{timestamp}.{body}" with HMAC-SHA256."""
    if abs(time.time() - int(timestamp)) > TOLERANCE:
        raise PermissionError("timestamp outside tolerance")
    signed = f"{event_id}.{timestamp}.".encode() + body
    expected = hmac.new(secret, signed, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise PermissionError("bad signature")
    if seen_event(event_id):            # e.g. Redis SET NX with TTL > retry window
        raise LookupError("duplicate event")
```

### Sending webhooks

- **SSRF protection for customer-supplied URLs** — resolve the host and block private, loopback, link-local and metadata ranges (`10.0.0.0/8`, `127.0.0.0/8`, `169.254.169.254`, `::1`, …) at connect time, not only at registration (DNS rebinding). Send from an egress proxy with an allowlist of ports (443).
- **Sign every delivery** and include an event ID and timestamp; support secret rotation with two active secrets.
- **No redirects**, strict timeouts, response size limits; retries with exponential backoff and a dead-letter queue.
- **Minimal payloads** — send IDs and event types; let the receiver fetch details with its own credentials.

**How to test**

- **[P0]** Send a valid webhook with one byte of the body changed → rejected.
- **[P0]** Replay a captured webhook after the tolerance window → rejected; replay within the window with the same event ID → processed once.
- **[P0]** Register `http://169.254.169.254/latest/meta-data/`, `http://localhost:8080`, and a DNS name that resolves to `127.0.0.1` as webhook URLs → registration or delivery blocked.
- **[P1]** Webhook target returns a `302` to an internal host → redirect not followed.

---

## API Gateway Patterns

A gateway enforces cross-cutting controls consistently, but it is a **first line**, not the only line.

| Control | At the gateway | Still in the service |
|---|---|---|
| TLS termination, HSTS | Yes | mTLS between gateway and services |
| Authentication (token validation) | Yes — signature, `exp`, `aud` | Re-validate or trust a signed internal identity header |
| Authorization | Coarse: route + scope | **Object- and property-level checks** |
| Rate limiting, quotas | Per key / user / IP / route | Business-flow limits (e.g. 3 password resets per hour) |
| Request size, content type, schema | Yes — reject early | Full validation of business rules |
| Inventory | Only published routes are reachable | Unpublished endpoints are not exposed on any interface |
| Logging | Access logs with request IDs | Security events with user and object IDs |

**Rules**

- **Deny by default** — unknown routes return `404`; `/internal`, `/admin`, `/actuator`, `/debug` are never routed publicly.
- **Strip and re-set identity headers** (`X-User-Id`, `X-Forwarded-For`, `X-Tenant-Id`) at the edge, so clients cannot inject them.
- **Services must not be reachable around the gateway** — network policies or mTLS ensure only the gateway can call them.
- **Keep the gateway config in Git** and review it like code; diff the published route list against the API inventory on every release (API9).

**How to test**

- **[P0]** Send `X-User-Id: <admin id>` or `X-Tenant-Id: <other tenant>` from the client → header ignored or stripped.
- **[P0]** Call a service directly (bypassing the gateway) from outside its network → connection refused.
- **[P1]** Request undocumented paths (`/actuator/env`, `/swagger.json` in prod, `/v1/` when `v2` is current) → `404`.

---

## Multi-Tenancy

Cross-tenant data leaks are BOLA at scale: one missed filter exposes every customer.

- **Derive the tenant from the token**, never from the URL, body or a header the client controls.
- **Enforce isolation in one place** — a repository layer or ORM scope that always adds `tenant_id`, plus **database Row-Level Security** as a safety net.
- **Include the tenant in every cache key, object storage path, search index filter and queue message.**
- **Per-tenant rate limits and quotas** so one tenant cannot exhaust shared capacity.
- **Tenant-aware logs and metrics** — every security event carries `tenant_id`.
- **Background jobs and exports** run with an explicit tenant context; a job without one fails closed.

```sql
-- PostgreSQL Row-Level Security as a second layer behind application checks
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON orders
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
-- the app sets it per transaction: SET LOCAL app.tenant_id = '<tenant from token>'
```

**How to test**

- **[P0]** Matrix test: for every endpoint that takes an object ID, call it with Tenant B's token and Tenant A's object IDs → `404`.
- **[P0]** List and search endpoints with Tenant B's token never return Tenant A records (seed both tenants with distinctive data).
- **[P1]** Exports, reports and webhooks contain only the requesting tenant's data.

```python
import pytest

ENDPOINTS = ["/orders/{id}", "/invoices/{id}", "/files/{id}"]


@pytest.mark.parametrize("path", ENDPOINTS)
def test_tenant_b_cannot_read_tenant_a_objects(api, tenant_a_objects, tenant_b_token, path):
    obj_id = tenant_a_objects[path]
    response = api.get(path.format(id=obj_id), headers={"Authorization": f"Bearer {tenant_b_token}"})
    assert response.status_code == 404, response.text
```

---

## File Uploads

- **Allowlist file types** by extension **and** by content sniffing (magic bytes); never trust the client `Content-Type`.
- **Size limits** at the gateway and in the service; limit the number of files per request and total per user.
- **Generate storage names** (UUIDs); never use the client filename in paths — blocks path traversal (`../../etc/passwd`).
- **Store outside the web root**, in object storage, and serve through signed, short-lived URLs with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.
- **Scan for malware** before files become available; quarantine until scanned.
- **Neutralize active content** — strip metadata from images, re-encode images, disallow SVG/HTML or serve them from a separate sandbox domain.
- **Archives and documents** — protect against zip bombs (limit uncompressed size and entry count), XXE in DOCX/XLSX/SVG parsers.
- **Direct-to-storage uploads** (pre-signed PUT): restrict content type, size and key prefix in the signature, then validate after upload before use.

**How to test**

- **[P0]** Upload `shell.php` renamed to `avatar.jpg`, a polyglot file, and an SVG with `<script>` → rejected or safely served as a download.
- **[P0]** Filename `../../app/config.py` → stored under a generated name, no traversal.
- **[P1]** Upload above the size limit → `413`; a zip bomb (small archive, huge content) → rejected.
- **[P1]** Access another user's file by its URL or ID → `403`/`404`; signed URLs expire.

---

## Caching

Caches are shared memory between users; a wrong key or header leaks data.

- **Personalized or authenticated responses**: `Cache-Control: private, no-store`. Shared caches (CDN, reverse proxy) must never store them.
- **Cache keys** for shared caches include every input that changes the response — path, relevant query params, `Accept`, tenant, API version. Use `Vary` correctly (`Vary: Authorization` is a sign the response should not be cached publicly at all).
- **Web cache deception** — the CDN must not cache `/account/profile.css` just because of the extension; cache by route rules, not by suffix.
- **Web cache poisoning** — unkeyed headers (`X-Forwarded-Host`, `X-Original-URL`) must not influence the response, or must be part of the key.
- **Application caches** (Redis) — key includes `tenant_id` and the user or permission set; invalidate on permission changes, not only on data changes.
- **Errors are not cached** longer than seconds, and never cache `401`/`403` for a URL shared across users.

**How to test**

- **[P0]** Fetch a personalized endpoint as user A, then as user B through the CDN → B never gets A's body; check `Cache-Control` and `Age`/`X-Cache` headers.
- **[P1]** Request `/api/me/avatar.css` or `/api/me;.js` → not cached, or returns `404`.
- **[P1]** Send `X-Forwarded-Host: evil.example` → no absolute URLs in the response use it; a follow-up clean request is not poisoned.

---

## Incident Response for APIs

Prepare before the incident: the first hour decides the impact.

### Readiness

- **Security logs** — auth failures, authorization denials (`403`), token revocations, rate-limit hits, admin actions, with request ID, user, tenant, client ID, object ID. No secrets or full tokens in logs.
- **Alerts** on spikes: `401`/`403` ratio, requests per token, sequential ID access patterns (BOLA scraping), new client IDs calling sensitive endpoints.
- **Kill switches** — revoke a client ID, a token family, an API key, or disable one endpoint or feature flag without a deploy.
- **Runbooks** with owners and contact paths; rehearse them.

### Playbook

| Phase | Actions |
|---|---|
| **Detect** | Alert fires or report arrives; open an incident channel, assign an incident lead |
| **Contain** | Revoke affected credentials, block client/IP at the gateway, disable the vulnerable endpoint, tighten rate limits |
| **Scope** | Query logs: which tokens, tenants and objects were accessed, since when; preserve evidence |
| **Eradicate** | Fix the root cause, add a regression test that reproduces the exploit, deploy |
| **Recover** | Rotate secrets and signing keys if exposed; restore normal limits gradually |
| **Notify** | Customers and regulators within required timelines (e.g. GDPR: 72 hours for personal data breaches) |
| **Learn** | Blameless post-mortem; update the checklist in [02](./02-owasp-api-testing-checklist.md) and detection rules |

**How to test**

- **[P1]** Game day: revoke a client ID in staging and measure time until all its calls fail.
- **[P1]** Run a BOLA scraping pattern (sequential IDs from one token) in staging → alert fires within the agreed time.
- **[P2]** Verify logs contain enough fields to answer "which objects did token X read yesterday?".

---

## Tooling

| Purpose | Tools |
|---|---|
| Spec linting and contract checks | Spectral (OWASP ruleset), 42Crunch, Schemathesis (property-based fuzzing from OpenAPI) |
| DAST / API scanning | OWASP ZAP (API scan with OpenAPI import), Burp Suite (Autorize for authorization matrices), Nuclei |
| Manual testing | Burp Suite, Postman/Newman, `curl`, `jwt_tool` for token attacks |
| Load and abuse | k6, Locust, `wrk` — rate limits, pagination caps, burst handling |
| SAST and dependencies | Semgrep, CodeQL, Bandit, `pip-audit`, Dependabot / Renovate, Trivy for images |
| Secrets | gitleaks, trufflehog (pre-commit and CI) |
| Runtime and inventory | API gateway analytics, traffic-based discovery to find shadow and zombie APIs |

**Where each runs**

- **Pre-commit** — gitleaks, Semgrep on changed files.
- **Merge request** — spec lint, SAST, dependency audit, unit authorization tests, Schemathesis against a test instance.
- **Staging** — ZAP API scan, authorization matrix suite (roles × endpoints × tenants), rate-limit checks.
- **Production** — gateway analytics, anomaly alerts, periodic inventory diff.

---
## See also
- [OWASP API Security](./index.md)
- [OWASP API Recommendations](./01-owasp-api-recommendations.md)
- [OWASP API Security Testing Checklist](./02-owasp-api-testing-checklist.md)
- [OWASP LLM Security](../owasp-llm-security/index.md)
- [Edge Layer: Reverse Proxy, Forward Proxy, API Gateway, WAF](../client-server-architecture/02-edge-layer/02-reverse-proxy-api-gateway.md)
- [Cross-Cutting: Security and Observability](../api-architectures/05-cross-cutting/01-security-observability.md)
