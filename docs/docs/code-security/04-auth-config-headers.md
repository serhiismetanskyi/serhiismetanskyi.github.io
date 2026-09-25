---
date: 2026-06-30
tags:
  - security
  - appsec
---

# Auth, Config & Security Headers

**Broken Access Control** is the **#1 OWASP Top 10** risk — found in **94% of applications**. Authentication flaws, misconfigured CORS, and missing security headers are silent vulnerabilities that make exploitation trivial.

---

## Authentication

### Password Storage

| Algorithm | Status | Notes |
|-----------|--------|-------|
| **Argon2id** | Recommended | Memory-hard, best resistance to GPU attacks |
| **bcrypt** | Good | Proven, widely supported |
| **scrypt** | Good | Memory-hard alternative |
| MD5, SHA-1, SHA-256 | **Never use** | Too fast, no salt, trivially crackable |

```python
# Python — Argon2id
from argon2 import PasswordHasher

ph = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4)
hashed = ph.hash("user_password")
ph.verify(hashed, "user_password")  # raises on mismatch
```

### Session Security

| Requirement | Value |
|-------------|-------|
| Token entropy | Minimum **128 bits** |
| Absolute timeout | 24 hours |
| Idle timeout | 30 minutes (sensitive apps) |
| Cookie flags | `httpOnly`, `secure`, `sameSite=Lax` |

### JWT Best Practices

| Check | Reason |
|-------|--------|
| Verify signature | Prevents token forgery |
| Check `iss` and `aud` claims | Prevents cross-service token reuse |
| Enforce expiration (`exp`) | Limits exposure window |
| Reject `alg: none` | Prevents signature bypass |
| Use short-lived access tokens (15 min) | Limits impact of stolen tokens |
| Implement refresh token rotation | Detects token theft |

---

## Authorization

### Server-Side Enforcement

```python
# BAD — relying on UI to hide admin features
@app.get("/admin/users")
async def list_users():
    return db.get_all_users()

# GOOD — server-side role check
@app.get("/admin/users")
async def list_users(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    return db.get_all_users()
```

### IDOR (Insecure Direct Object Reference)

```python
# BAD — trusts user-supplied ID
@app.get("/documents/{doc_id}")
async def get_document(doc_id: int):
    return db.get_document(doc_id)

# GOOD — scoped to authenticated user
@app.get("/documents/{doc_id}")
async def get_document(
    doc_id: int,
    current_user: User = Depends(get_current_user),
):
    doc = db.get_document(doc_id)
    if doc.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Not found")
    return doc
```

### Auth Guard Inversion Check

```python
# WRONG — inverted condition (found in 31% of AI-generated apps)
if session:
    return RedirectResponse("/login")

# CORRECT
if not session:
    return RedirectResponse("/login")
```

---

## CORS Configuration

```python
# BAD — allows any origin
app.add_middleware(CORSMiddleware, allow_origins=["*"])

# GOOD — specific origins only
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://myapp.com", "https://staging.myapp.com"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
```

!!! danger "Never use `Access-Control-Allow-Origin: *` for authenticated endpoints"
    Wildcard CORS allows **any website** to make authenticated requests to your API.

---

## Security Headers

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Force HTTPS for 1 year |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'` | Prevent XSS, inline scripts |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME type sniffing |
| `X-Frame-Options` | `DENY` | Prevent clickjacking |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Control referrer leakage |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Disable unused browser APIs |

```python
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=()"
        return response
```

Test headers at [securityheaders.com](https://securityheaders.com).

---

## Rate Limiting

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| Login / Registration / Password Reset | 5-10 requests | 15 minutes |
| General API (authenticated) | 100 requests | 15 minutes |
| General API (unauthenticated) | 30 requests | 15 minutes |
| File uploads | 10 requests | 1 hour |

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@app.post("/login")
@limiter.limit("5/15minutes")
async def login(request: Request):
    ...
```

---

## Error Handling

```python
# BAD — leaks internal details
@app.exception_handler(Exception)
async def error_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={"error": str(exc), "traceback": traceback.format_exc()},
    )

# GOOD — generic error in production
@app.exception_handler(Exception)
async def error_handler(request, exc):
    logger.exception("Unhandled error", extra={"path": request.url.path})
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error"},
    )
```

!!! warning "Never expose in error responses"
    Stack traces, file paths, database table names, SQL queries, internal IP addresses, library versions.
