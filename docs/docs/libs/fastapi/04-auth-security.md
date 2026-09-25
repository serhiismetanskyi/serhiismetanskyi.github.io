---
date: 2026-09-12
tags:
  - python
  - libraries
  - fastapi
  - api
  - security
---

# FastAPI — Auth & Security

## OAuth2 Password Flow

```python
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm

app = FastAPI()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")


@app.post("/auth/token")
async def login(form: OAuth2PasswordRequestForm = Depends()):
    user = authenticate_user(form.username, form.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    token = create_access_token(data={"sub": user.email})
    return {"access_token": token, "token_type": "bearer"}


@app.get("/me")
async def get_me(token: str = Depends(oauth2_scheme)):
    return decode_token(token)
```

`OAuth2PasswordBearer` extracts the token from `Authorization: Bearer <token>` header.
Helper functions like `authenticate_user()` and `decode_token()` are placeholders in this snippet.

---

## JWT Token Management

```python
from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt
from pydantic import BaseModel

SECRET_KEY = "your-secret-key-from-env"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30


class TokenData(BaseModel):
    sub: str
    exp: datetime


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(UTC) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> TokenData:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return TokenData(**payload)
    except JWTError as err:
        raise HTTPException(status_code=401, detail="Invalid token") from err
```

| JWT Field | Purpose |
|-----------|---------|
| `sub` | Subject — user ID or email |
| `exp` | Expiration timestamp |
| `iss` | Issuer (optional, multi-service) |
| `aud` | Audience (optional, multi-service) |

---

## Password Hashing

```python
from passlib.context import CryptContext

# Prefer Argon2id for new systems; keep bcrypt only for legacy compatibility.
pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)
```

---

## Current User Dependency

```python
from fastapi import Depends, HTTPException, status


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    token_data = decode_access_token(token)
    result = await db.execute(select(User).where(User.email == token_data.sub))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
```

---

## Role-Based Access Control

```python
import enum

from fastapi import Depends, HTTPException, status


class Role(str, enum.Enum):
    ADMIN = "admin"
    EDITOR = "editor"
    VIEWER = "viewer"


def require_role(*allowed: Role):
    async def check(user: User = Depends(get_current_user)):
        if user.role not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
        return user
    return check


@app.get("/admin", dependencies=[Depends(require_role(Role.ADMIN))])
async def admin_only():
    return {"section": "admin"}
```

---

## API Key Authentication

```python
from fastapi import Depends, HTTPException, Security
from fastapi.security import APIKeyHeader

api_key_header = APIKeyHeader(name="X-API-Key")


async def verify_api_key(api_key: str = Security(api_key_header)):
    if api_key not in VALID_API_KEYS:
        raise HTTPException(status_code=403, detail="Invalid API key")
    return api_key
```

---

## Refresh Tokens

```python
REFRESH_TOKEN_EXPIRE_DAYS = 7


def create_refresh_token(data: dict) -> str:
    payload = data | {"type": "refresh"}
    return create_access_token(
        data=payload,
        expires_delta=timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    )


@app.post("/auth/refresh")
async def refresh(refresh_token: str):
    token_data = decode_access_token(refresh_token)
    if getattr(token_data, "type", None) != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    return {"access_token": create_access_token(data={"sub": token_data.sub})}
```

Production note: rotate refresh tokens on every use, store only hashed refresh tokens server-side, and revoke the whole token family on reuse detection.

| Token | Lifetime | Storage |
|-------|----------|---------|
| Access | 15–30 min | Memory / header |
| Refresh | 7–30 days | HttpOnly cookie / secure storage |

---

## Security Checklist

| Practice | Why |
|----------|-----|
| Use HTTPS everywhere | Tokens are plaintext in transit |
| Short-lived access tokens | Limit blast radius of stolen tokens |
| Validate `exp`, `iss`, `aud` | Prevent token reuse across services |
| Hash passwords with bcrypt | Timing-attack resistant, auto-salted |
| Store secrets in env vars | Never hardcode keys in source |
| Rate-limit auth endpoints | Prevent brute-force attacks |
| Log failed auth attempts | Detect attacks early |
