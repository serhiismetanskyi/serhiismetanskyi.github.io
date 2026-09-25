---
date: 2026-09-18
tags:
  - python
  - libraries
  - playwright
  - ui-testing
---

# Playwright — API Practical Playbook

Copy-paste recipes for common API testing scenarios with `APIRequestContext`.

## 1) Full CRUD Lifecycle

```python
from playwright.sync_api import APIRequestContext


def test_user_crud_lifecycle(api: APIRequestContext):
    # CREATE
    resp = api.post("/users", data={"name": "Alice", "email": "alice@test.com"})
    assert resp.status == 201
    user_id = resp.json()["id"]

    # READ
    resp = api.get(f"/users/{user_id}")
    assert resp.ok
    assert resp.json()["name"] == "Alice"

    # UPDATE
    resp = api.put(f"/users/{user_id}", data={"name": "Alice Updated", "email": "alice@test.com"})
    assert resp.ok
    assert resp.json()["name"] == "Alice Updated"

    # DELETE
    resp = api.delete(f"/users/{user_id}")
    assert resp.status == 204

    # VERIFY DELETED
    resp = api.get(f"/users/{user_id}")
    assert resp.status == 404
```

## 2) Response Schema Validation

```python
from playwright.sync_api import APIRequestContext


REQUIRED_USER_FIELDS = {"id", "name", "email", "role", "created_at"}


def test_user_response_schema(api: APIRequestContext):
    resp = api.get("/users/1")
    assert resp.ok
    body = resp.json()

    # verify all required fields are present
    missing = REQUIRED_USER_FIELDS - set(body.keys())
    assert not missing, f"Missing fields: {missing}"

    # verify field types
    assert isinstance(body["id"], int)
    assert isinstance(body["name"], str)
    assert isinstance(body["email"], str)


def test_list_response_schema(api: APIRequestContext):
    resp = api.get("/users", params={"page": 1, "per_page": 5})
    assert resp.ok
    body = resp.json()

    # verify list structure
    assert isinstance(body["data"], list)
    assert isinstance(body["total"], int)
    assert len(body["data"]) <= 5
```

## 3) Error Response Validation

```python
from playwright.sync_api import APIRequestContext


def test_not_found_returns_404(api: APIRequestContext):
    resp = api.get("/users/999999")
    assert resp.status == 404
    body = resp.json()
    assert "error" in body or "detail" in body


def test_invalid_payload_returns_422(api: APIRequestContext):
    # missing required "email" field
    resp = api.post("/users", data={"name": "Alice"})
    assert resp.status == 422
    errors = resp.json()
    assert any("email" in str(e).lower() for e in errors.get("detail", []))


def test_duplicate_returns_409(api: APIRequestContext):
    api.post("/users", data={"name": "Bob", "email": "bob@test.com"})
    resp = api.post("/users", data={"name": "Bob2", "email": "bob@test.com"})
    assert resp.status == 409
```

## 4) Headers and Cookies Validation

```python
from playwright.sync_api import APIRequestContext


def test_rate_limit_headers(api: APIRequestContext):
    resp = api.get("/users")
    assert resp.ok
    assert "x-ratelimit-remaining" in resp.headers
    assert int(resp.headers["x-ratelimit-remaining"]) >= 0


def test_set_cookie_on_login(playwright):
    ctx = playwright.request.new_context(base_url="https://api.example.com")
    resp = ctx.post("/auth/login", data={"email": "a@test.com", "password": "secret"})
    assert resp.ok
    cookies = ctx.storage_state()["cookies"]
    assert any(c["name"] == "session" for c in cookies)
    ctx.dispose()
```

## 5) Pagination Testing

```python
from playwright.sync_api import APIRequestContext


def test_pagination_basics(api: APIRequestContext):
    resp = api.get("/users", params={"page": 1, "per_page": 2})
    assert resp.ok
    body = resp.json()
    assert len(body["data"]) <= 2
    assert body["page"] == 1

    # second page returns different data
    resp2 = api.get("/users", params={"page": 2, "per_page": 2})
    body2 = resp2.json()
    ids_page1 = {u["id"] for u in body["data"]}
    ids_page2 = {u["id"] for u in body2["data"]}
    assert ids_page1.isdisjoint(ids_page2), "Pages must not overlap"


def test_empty_page_returns_empty_list(api: APIRequestContext):
    resp = api.get("/users", params={"page": 9999, "per_page": 10})
    assert resp.ok
    assert resp.json()["data"] == []
```

## 6) File Upload via API

```python
from pathlib import Path
from playwright.sync_api import APIRequestContext


def test_upload_avatar(api: APIRequestContext, tmp_path: Path):
    # create a test file
    avatar = tmp_path / "avatar.png"
    avatar.write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)  # minimal PNG header

    resp = api.post("/users/1/avatar", multipart={
        "file": {
            "name": "avatar.png",
            "mimeType": "image/png",
            "buffer": avatar.read_bytes(),
        },
    })
    assert resp.ok
    assert resp.json()["avatar_url"]
```

## 7) Seed via API, Verify in UI

```python
from playwright.sync_api import Page, APIRequestContext, expect


def test_api_created_item_visible_in_ui(api: APIRequestContext, page: Page):
    # seed data through API (fast, reliable)
    resp = api.post("/items", data={"title": "API Item", "status": "active"})
    assert resp.ok
    item_id = resp.json()["id"]

    # verify it appears in the browser
    page.goto("/items")
    expect(page.get_by_role("row").filter(has_text="API Item")).to_be_visible()

    # cleanup
    api.delete(f"/items/{item_id}")
```

## Quick Checklist

- Test the full CRUD cycle — create, read, update, delete, verify deleted.
- Validate response schema — check required fields and types.
- Test error paths — 400, 401, 404, 409, 422.
- Check headers — CORS, rate limits, cache control, cookies.
- Pagination — verify page boundaries, no overlap, empty last page.
- Use `tmp_path` for test files — auto-cleaned.
- Seed data via API before UI tests — faster than UI setup.
