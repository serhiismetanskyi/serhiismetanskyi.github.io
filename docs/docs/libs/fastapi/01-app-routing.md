---
date: 2026-09-12
tags:
  - python
  - libraries
  - fastapi
  - api
---

# FastAPI — App & Routing

## App Configuration

```python
from fastapi import FastAPI

app = FastAPI(
    title="My Service",
    version="1.0.0",
    docs_url="/docs",            # None to disable Swagger UI
    redoc_url="/redoc",          # None to disable ReDoc
    openapi_url="/openapi.json", # None to disable schema
    root_path="/api/v1",         # behind reverse proxy
)
```

| Parameter | Purpose |
|-----------|---------|
| `title` | Shown in OpenAPI docs header |
| `root_path` | Prefix when behind Nginx/Traefik |
| `docs_url` | Swagger UI path (`None` = disabled) |
| `openapi_url` | `None` disables all auto-docs |

---

## Path & Query Parameters

```python
from fastapi import FastAPI, Path, Query

app = FastAPI()


@app.get("/users/{user_id}")
async def get_user(user_id: int = Path(gt=0, description="User ID")):
    return {"user_id": user_id}


@app.get("/files/{file_path:path}")
async def read_file(file_path: str):
    return {"path": file_path}


@app.get("/items")
async def list_items(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, le=100),
    search: str | None = Query(default=None, min_length=1),
    tags: list[str] = Query(default=[]),
):
    return {"skip": skip, "limit": limit, "search": search, "tags": tags}
```

| Syntax | Matches |
|--------|---------|
| `{item_id}` | Single path segment |
| `{file_path:path}` | Full remaining path (including `/`) |
| `Path(gt=0, le=1000)` | Numeric constraints |
| `Query(default=None)` | Optional query param |

---

## Request Body & Response Models

```python
from pydantic import BaseModel, EmailStr, Field
from fastapi import FastAPI

app = FastAPI()


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    age: int | None = Field(default=None, ge=0, le=200)


class UserResponse(BaseModel):
    id: int
    name: str
    email: EmailStr

    model_config = {"from_attributes": True}


@app.post("/users", response_model=UserResponse, status_code=201)
async def create_user(user: UserCreate):
    return UserResponse(id=1, name=user.name, email=user.email)
```

| Pattern | Purpose |
|---------|---------|
| `UserCreate` | Input validation (no `id`) |
| `UserResponse` | Output filtering (no `password`) |
| `from_attributes = True` | Read from ORM objects |
| `response_model` | Enforce output schema in docs |

---

## Status Codes & HTTPException

```python
from fastapi import FastAPI, HTTPException, status

app = FastAPI()


@app.get("/items/{item_id}", responses={404: {"description": "Not found"}})
async def get_item(item_id: int):
    if item_id > 100:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Item {item_id} not found",
        )
    return {"item_id": item_id}
```

| Status | Constant | Use |
|--------|----------|-----|
| 200 | `HTTP_200_OK` | Default success |
| 201 | `HTTP_201_CREATED` | Resource created |
| 204 | `HTTP_204_NO_CONTENT` | Deleted, no body |
| 401 | `HTTP_401_UNAUTHORIZED` | Not authenticated |
| 403 | `HTTP_403_FORBIDDEN` | No permission |
| 404 | `HTTP_404_NOT_FOUND` | Resource missing |
| 422 | `HTTP_422_UNPROCESSABLE_ENTITY` | Validation failed (auto) |

---

## APIRouter

```python
from fastapi import APIRouter, FastAPI

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/")
async def list_users():
    return []


@router.get("/{user_id}")
async def get_user(user_id: int):
    return {"user_id": user_id}


app = FastAPI()
app.include_router(router)
```

| Parameter | Purpose |
|-----------|---------|
| `prefix` | URL prefix for all routes |
| `tags` | Group in OpenAPI docs |
| `dependencies` | Shared deps for all routes |

---

## Headers, Cookies, Forms, Files

```python
from fastapi import Cookie, FastAPI, File, Form, Header, UploadFile

app = FastAPI()


@app.get("/info")
async def read_info(
    user_agent: str | None = Header(default=None),
    session_id: str | None = Cookie(default=None),
):
    return {"user_agent": user_agent, "session_id": session_id}


@app.post("/login")
async def login(username: str = Form(), password: str = Form()):
    return {"username": username}


@app.post("/upload")
async def upload(file: UploadFile = File(description="Upload a file")):
    contents = await file.read()
    return {"filename": file.filename, "size": len(contents)}
```

| Source | Extractor | Notes |
|--------|-----------|-------|
| Headers | `Header()` | Auto-converts `X-Request-Id` → `x_request_id` |
| Cookies | `Cookie()` | Read from request cookies |
| Form fields | `Form()` | Requires `python-multipart` |
| Files | `File()` / `UploadFile` | Streaming upload, async `.read()` |
