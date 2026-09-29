---
date: 2026-06-29
tags:
  - security
  - appsec
---

# Code Analysis & Secure Review

Static analysis catches vulnerabilities **before code reaches production**. Combined with security-focused code review, it prevents the most common attack vectors: injection, XSS, and insecure data handling.

---

## SAST (Static Application Security Testing)

SAST tools analyze source code for security flaws without executing it.

| Tool | Languages | Free | Best For |
|------|-----------|------|----------|
| **Semgrep** | 30+ languages | OSS rules | Custom rules, fast scans |
| **SonarQube** | 30+ languages | Community | Quality + security combined |
| **Snyk Code** | 10+ languages | Free tier | IDE integration |
| **Bandit** | Python only | Yes (OSS) | Python-specific checks |
| **ESLint Security** | JavaScript/TS | Yes (OSS) | JS/TS-specific checks |
| **gosec** | Go only | Yes (OSS) | Go-specific checks |

### CI Integration

```yaml
# GitHub Actions — Semgrep
name: SAST
on: [pull_request]

jobs:
  semgrep:
    runs-on: ubuntu-latest
    container:
      image: semgrep/semgrep
    steps:
      - uses: actions/checkout@v4
      - run: semgrep scan --config auto --error --json --output results.json
```

```yaml
# Python — Bandit
- name: Bandit Security Scan
  run: |
    uv add --dev bandit
    uv run bandit -r src/ -f json -o bandit-results.json
```

!!! tip "Tune false positives below 20%"
    Review SAST findings monthly. Disable or adjust rules that consistently flag false positives. A noisy scanner gets ignored by developers.

---

## Injection Prevention

### SQL Injection

```python
# BAD — string interpolation in SQL
query = f"SELECT * FROM users WHERE id = {user_id}"

# GOOD — parameterized query
query = "SELECT * FROM users WHERE id = %s"
cursor.execute(query, (user_id,))

# GOOD — ORM (SQLAlchemy)
user = session.query(User).filter(User.id == user_id).first()
```

### OS Command Injection

```python
import subprocess

# BAD — shell=True with user input
subprocess.run(f"convert {filename} output.png", shell=True)

# GOOD — list args, no shell
subprocess.run(["convert", filename, "output.png"], check=True)
```

### NoSQL Injection (MongoDB)

```python
# BAD — unsanitized query
db.users.find({"username": request.json["username"]})

# GOOD — validate input type first
from pydantic import BaseModel

class LoginRequest(BaseModel):
    username: str  # Pydantic rejects non-string values
```

### LDAP / Expression Language Injection

Always use framework-provided escaping functions. Never build LDAP filters or EL expressions via string concatenation.

---

## Input Validation

Validate **all** external input at trust boundaries: user forms, API payloads, file uploads, URL parameters, headers.

```python
from pydantic import BaseModel, Field, field_validator
import re

class CreateUserRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(max_length=254)
    age: int = Field(ge=0, le=150)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
        if not re.match(pattern, v):
            raise ValueError("Invalid email format")
        return v.lower()

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if re.search(r"[<>&\"']", v):
            raise ValueError("Name contains forbidden characters")
        return v.strip()
```

!!! warning "Client-side validation is for UX only"
    Server-side validation is **mandatory**. Client-side checks prevent nothing — attackers bypass them trivially.

---

## XSS (Cross-Site Scripting) Prevention

### Templates (Jinja2)

```python
import nh3
from jinja2 import Environment, select_autoescape
from markupsafe import Markup

env = Environment(autoescape=select_autoescape(["html", "xml"]))
template = env.from_string("<div>{{ content }}</div>")

# BAD — marks user input as safe HTML → XSS vector
bad = env.from_string("<div>{{ content | safe }}</div>").render(content=user_content)

# GOOD — sanitize with nh3 if HTML rendering is required
good = template.render(content=Markup(nh3.clean(user_content)))

# BEST — render as text (autoescape escapes <, >, &, quotes)
best = template.render(content=user_content)
```

See also: [Jinja — Filters, Escaping & Security](../libs/jinja/03-customization-security.md) (autoescape, `Markup`, SSTI, sandbox).

### URL Validation

```python
from urllib.parse import urlparse


def is_valid_url(url: str) -> bool:
    """Allow only http(s) URLs with a host — blocks javascript:, data:, file: and similar."""
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    return parsed.scheme in {"https", "http"} and bool(parsed.netloc)
```

### Output Encoding

Use your framework's built-in encoding. Never concatenate user input into HTML, SQL, or shell commands.

---

## Secure Code Review Checklist

High-risk PRs (auth, data handling, crypto) require a security-focused reviewer.

| Check | What to Look For |
|-------|-----------------|
| **Secrets** | No hardcoded keys, tokens, passwords |
| **Input validation** | All user input validated server-side |
| **SQL/NoSQL queries** | Parameterized, no string interpolation |
| **Shell commands** | No `shell=True` with user input |
| **File operations** | Path traversal protection (`resolve()` + prefix check) |
| **HTML rendering** | No `dangerouslySetInnerHTML` with user data |
| **Error handling** | No stack traces or internal details in responses |
| **Auth checks** | Every endpoint verifies authentication + authorization |
| **Data exposure** | API returns only needed fields, no over-fetching |
| **Logging** | Sensitive data (passwords, tokens) never logged |
| **Crypto** | Modern algorithms (AES-256, Argon2id), no MD5/SHA-1 |
| **Dependencies** | New deps are reviewed for known vulnerabilities |
