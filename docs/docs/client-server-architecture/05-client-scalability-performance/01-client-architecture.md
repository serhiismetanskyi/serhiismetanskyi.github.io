---
date: 2026-06-12
tags:
  - architecture
  - networking
  - performance
---

# Client Architecture

## 9.1 Data Fetching

Modern clients separate data fetching from UI rendering. Use a data-fetching
layer, not raw HTTP calls scattered through the code.

### REST calls

- Use a centralized HTTP client (`httpx`, `requests`).
- Define typed request functions per domain.
- Use a cache layer for repeated reads.

```python
import httpx
from pydantic import BaseModel


class User(BaseModel):
    id: str
    name: str


# Centralized HTTP client — not scattered httpx.get() calls
api = httpx.Client(base_url="https://example.com/api/v1", timeout=10.0)


def get_user(user_id: str) -> User:
    response = api.get(f"/users/{user_id}")
    response.raise_for_status()
    return User.model_validate(response.json())
```

### GraphQL queries

- Use `gql` with `httpx` or Strawberry client for GraphQL calls.
- Cache responses server-side (Redis) keyed by query hash.
- Optimistic updates: assume success, update cache immediately, roll back on error.

### gRPC clients

- Generated stubs from `.proto` files.
- Generated stubs from `.proto` files with `grpcio-tools`.
- Used in Python backends, mobile (Swift/Kotlin), and via grpc-web proxy for browsers.

### WebSocket subscriptions

- Connect once on app load.
- Subscribe to channels/topics.
- Update local state/cache on each received event.

---

## 9.2 State Management

Separate server state from UI state:

| Type             | What it is                       | Tools (Python)                |
| ---------------- | -------------------------------- | ----------------------------- |
| Server state     | Data from API, cached on server  | Redis, `lru_cache`, `cachetools` |
| Session state    | Per-user auth, preferences       | Signed cookies, Redis sessions |
| URL state        | Filters, pagination in URL       | Query params parsed by Pydantic |
| Persistent state | Long-lived user settings         | Database (PostgreSQL, SQLite) |

Keep API responses in a cache layer (Redis / in-memory) with TTL-based
invalidation. Do not query the database on every request when the data is
read-heavy.

### Client cache

Cache API responses in memory to avoid redundant requests.

- **TTL:** revalidate after N seconds.
- **Stale-while-revalidate:** show stale data immediately, fetch fresh in
  background.
- **Deduplicate:** if the same query fires twice simultaneously, fire one
  request and share the result.

### Server state sync

After a mutation, invalidate related queries to trigger a refetch:

```
User clicks "Save"
  → PATCH /profile
  → on success → invalidate ["profile", userId]
  → profile query refetches automatically
```

---

## 9.3 Network Optimization

### Request batching

Group multiple related requests into one.

- GraphQL: one query for all needed data.
- REST: `/users/batch?ids=1,2,3` instead of three separate calls.
- Reduces round-trips and total latency.

### Caching layers

| Layer                    | Scope           | Persistence      |
| ------------------------ | --------------- | ---------------- |
| In-memory (`lru_cache`)  | Process lifetime| Lost on restart  |
| Redis                    | Shared / cluster| Across restarts  |
| HTTP cache (CDN / proxy) | Per URL         | Per Cache-Control |

### Debounce and throttle

- **Debounce:** wait N ms after last call before firing. Use for
  search-as-you-type (avoid API call on every keystroke).
- **Throttle:** fire at most once per N ms. Use for scroll events and window
  resize.

```python
import asyncio
from typing import Callable

_debounce_tasks: dict[str, asyncio.Task[None]] = {}


async def debounced_search(query: str, delay: float = 0.3) -> list[dict]:
    """Cancel previous pending search and schedule a new one after delay."""
    if "search" in _debounce_tasks:
        _debounce_tasks["search"].cancel()
    await asyncio.sleep(delay)
    return await user_service.search(query)
```

---

## Key Rules

1. Never call the DB directly from a route handler. Use a service / repository layer.
2. Do not store API data in global variables — use a cache with TTL (Redis, `cachetools`).
3. Invalidate cache after mutations; do not manually patch nested data structures.
4. Debounce user-input-driven search on the server. Throttle event-driven tasks.
5. Keep the number of active WebSocket connections minimal; close on disconnect.
