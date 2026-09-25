---
date: 2026-06-13
tags:
  - architecture
  - networking
  - reliability
  - security
  - observability
---

# Security

Security is defense in depth. Multiple layers. No single layer is sufficient alone.

## 13.1 Authentication

### JWT (JSON Web Token)
- Stateless. Server validates signature without DB lookup.
- Short-lived access token (15 min) + long-lived refresh token (7 days).
- **Store access token in memory** (not in cookies or persistent storage on the client).
  - Why: persistent client storage is readable by any script on the page — XSS attack can steal it.
  - Tradeoff: in-memory token is lost on page refresh. Mitigate with a silent refresh
    before expiry using the HttpOnly refresh token cookie.
- Store refresh token in HttpOnly, Secure, SameSite=Strict cookie.
  - HttpOnly: client-side scripts cannot read it — safe from XSS.
  - SameSite=Strict: not sent on cross-site requests — safe from CSRF.
- Always verify: signature, expiration, algorithm (reject `"alg": "none"`).

### OAuth2
- Authorization framework for third-party access.
- Flows: Authorization Code + PKCE (web/mobile), Client Credentials (service-to-service).
- Access token scopes define what the token can do.

### mTLS (Mutual TLS)
- Both client and server present certificates.
- Used for service-to-service authentication in internal networks.
- Most secure option for internal microservices.
- Service mesh (Istio, Linkerd) provides mTLS automatically.

## 13.2 Network Security

### TLS
- All traffic encrypted in transit.
- Use TLS 1.2+ minimum. Disable TLS 1.0, 1.1.
- Set HSTS header: `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
- Certificate rotation: automate with Let's Encrypt / cert-manager.

### Firewall
- Allow only necessary ports (80, 443 externally; internal ports only from known sources).
- Network ACLs and security groups in cloud.
- No direct internet access for databases — only through application tier.

## 13.3 API Security

### Rate limiting
- Limit requests per client (API key, user ID, IP).
- Protect against brute force, credential stuffing, scraping.
- Return `429 Too Many Requests` with `Retry-After`.

### Input validation
- Validate all input on server. Never trust client data.
- Allowlist expected fields (reject unknown fields).
- Validate types, lengths, formats, enums.
- Parameterized queries for SQL. Never string concatenation.

## 13.4 Edge Security

### WAF
- Blocks SQL injection, XSS, path traversal at network level.
- Deploy at CDN edge (Cloudflare WAF, AWS WAF) for broadest coverage.
- Start in monitoring mode, tune rules, then enable blocking mode.

### DDoS Protection
- Volumetric DDoS (network layer): handled by CDN/ISP scrubbing centers.
- Application-layer DDoS (L7): rate limiting + WAF behavioral analysis.
- Cloud providers (Cloudflare, AWS Shield) provide managed DDoS protection.

### CORS
- Restrict `Access-Control-Allow-Origin` to known domains. Never `*` in production with credentials.
- Limit allowed methods and headers.
