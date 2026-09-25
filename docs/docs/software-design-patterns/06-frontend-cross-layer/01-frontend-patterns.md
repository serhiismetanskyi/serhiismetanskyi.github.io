---
date: 2026-06-20
tags:
  - design-patterns
  - architecture
---

# View Layer Patterns

Patterns for building the user-facing layer in a Python-centric stack.

## Template-Based Architecture

The view is built from small, reusable templates. Each template owns its markup and display logic.

**Principles:**

- **Single responsibility:** one job per template or partial.
- **Reusability:** partials do not depend on one fixed page.
- **Composability:** big pages are assembled from small includes.

**Modular template levels (Jinja2 / Django):**

1. **Partials** — `_button.html`, `_input.html`.
2. **Components** — `_search_bar.html` (input + button).
3. **Sections** — `_header.html` (logo + nav + search).
4. **Layouts** — `base.html` skeleton with `{% block content %}`.
5. **Pages** — extend layout, fill blocks with real content.

## Controller / Template Split

Separate data fetching from rendering:

| Layer | Role | Example |
|-------|------|---------|
| Template | Render HTML; data comes from context | `user_card.html` |
| Controller / View | Load data, prepare context, pick template | `UserListView` |

```python
from fastapi import Request
from fastapi.templating import Jinja2Templates

templates = Jinja2Templates(directory="templates")


def user_card_context(user_id: str) -> dict[str, object]:
    user = user_service.get(user_id)
    return {"name": user.name, "email": user.email}


async def user_page(request: Request, user_id: str):
    ctx = user_card_context(user_id)
    return templates.TemplateResponse("user_card.html", {"request": request, **ctx})
```

## Reusable Service Layer

Move stateful logic into reusable services. No need for deep class trees.

```python
from functools import lru_cache

from pydantic import BaseModel


class UserProfile(BaseModel):
    name: str
    email: str


class UserService:
    def __init__(self, client: HttpClient) -> None:
        self._client = client

    async def get_profile(self, user_id: str) -> UserProfile:
        data = await self._client.get(f"/users/{user_id}")
        return UserProfile.model_validate(data)


@lru_cache
def get_user_service() -> UserService:
    return UserService(client=get_http_client())
```

## State Management (Server-Side)

| State kind | Typical tool | Rule |
|------------|--------------|------|
| Session state | Redis, signed cookies | Keep per-user UI preferences and auth tokens. |
| Application state | In-memory / Redis | Shared flags, feature toggles. |
| URL state | Query params | Filters, page number, sort key. |
| Cached API data | Redis, `lru_cache` | TTL-based caching with invalidation on mutation. |

**Anti-pattern:** storing all user state in the DB for every request. Use tiered caching instead.

## BFF Integration

The BFF (Backend for Frontend) answers one question: "What does this screen need?"

- **No over-fetching:** response fields match the view.
- **No under-fetching:** avoid many small calls for one screen.
- **UI-ready values:** dates, money, and labels formatted for display.

```python
def get_order_summary(order_id: str) -> dict[str, object]:
    order = order_service.get(order_id)
    return {
        "id": order.id,
        "label": f"Order #{order.short_id}",
        "total_display": format_money(order.total, order.currency),
    }
```

## Short Summary

Use modular templates, split controller from template, reuse logic with service classes, manage state server-side with Redis / caching, and let the BFF serve view-shaped JSON.
