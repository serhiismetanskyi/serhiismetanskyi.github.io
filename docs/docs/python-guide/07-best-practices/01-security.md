---
date: 2026-08-21
tags:
  - python
  - security
---

# Security

Security in Python means protecting secrets, validating input, and following safe coding practices.

---

## Never Store Secrets in Code

Secrets include: API keys, passwords, tokens, database connection strings.

```python
# BAD — secret in code
API_KEY = "sk-abc123secret456"

# GOOD — secret from environment
import os

API_KEY = os.environ["API_KEY"]
```

---

## Use Environment Variables

### Setting Variables

```bash
# In terminal
export API_KEY="sk-abc123secret456"
export DB_HOST="localhost"
```

### Reading Variables in Python

```python
import os

api_key = os.environ.get("API_KEY", "")
db_host = os.environ.get("DB_HOST", "localhost")

if not api_key:
    raise ValueError("API_KEY environment variable is required")
```

### Using .env Files

```bash
# .env file (NEVER commit to Git!)
API_KEY=sk-abc123secret456
DB_HOST=localhost
DB_PORT=5432
```

```python
# Use pydantic-settings to load .env
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    api_key: str
    db_host: str = "localhost"
    db_port: int = 5432

    model_config = {"env_file": ".env"}

settings = Settings()
```

!!! warning "Add .env to .gitignore"
    Never commit `.env` files to Git. They contain real secrets.

---

## Validate All External Input

Never trust data from users, APIs, or files:

```python
from pydantic import BaseModel, field_validator

class UserInput(BaseModel):
    name: str
    email: str
    age: int

    @field_validator("age")
    @classmethod
    def validate_age(cls, v: int) -> int:
        if v < 0 or v > 150:
            raise ValueError("Age must be between 0 and 150")
        return v

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if "@" not in v:
            raise ValueError("Invalid email address")
        return v
```

---

## Dependency Security

### Keep Dependencies Updated

```bash
uv lock --upgrade
```

### Check for Known Vulnerabilities

```bash
uv add --dev pip-audit
uv run pip-audit
```

---

## Safe File Handling

```python
from pathlib import Path

def read_config(file_path: str) -> str:
    path = Path(file_path).resolve()

    # Prevent path traversal attacks
    allowed_dir = Path("/app/config").resolve()
    if not str(path).startswith(str(allowed_dir)):
        raise ValueError("Access denied: path outside allowed directory")

    return path.read_text(encoding="utf-8")
```

---

## Security Checklist

| Check | How |
|-------|-----|
| No secrets in code | Grep for API keys, passwords |
| .env in .gitignore | Check `.gitignore` file |
| Input validated | Use Pydantic models |
| Dependencies scanned | Run `pip-audit` |
| No SQL injection | Use parameterized queries |
| HTTPS only | Check all URLs start with `https://` |
| Errors do not leak data | Check error messages |

---

## Best Practices

- **Never** hardcode secrets — use environment variables
- **Always** validate external input (API data, user input, file content)
- Use **Pydantic** for data validation
- Use **`pydantic-settings`** for configuration management
- **Add `.env`** to `.gitignore`
- **Audit** dependencies for known vulnerabilities regularly
- Follow **least privilege** — give minimum permissions needed
- **Log** security events (failed logins, invalid tokens)
