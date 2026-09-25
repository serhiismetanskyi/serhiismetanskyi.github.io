---
date: 2026-08-10
tags:
  - performance
  - load-testing
  - locust
---

# Test Design in Locust

## Scenario Design

Design tests around **business flows**, not individual endpoints.

| Approach | Problem |
|----------|---------|
| Test `GET /products` in a loop | No realistic session, no auth, no think time |
| Test the full browse → add → checkout flow | Reflects real load on the whole stack |

A single business transaction touches multiple services, triggers DB queries,
hits caches, sends events. Testing flows reveals systemic bottlenecks.

---

## Data Parameterization

Using the same data for every user is unrealistic and corrupts results.
Databases cache hot rows. Real traffic is spread across many IDs.

### CSV-based unique users

```python
import csv
from locust import HttpUser, task, between


def load_users(path: str) -> list[dict[str, str]]:
    with open(path) as f:
        return list(csv.DictReader(f))


USER_DATA = load_users("test_users.csv")


class ApiUser(HttpUser):
    wait_time = between(1, 3)

    def on_start(self) -> None:
        idx = self.environment.runner.user_count % len(USER_DATA)
        self.user = USER_DATA[idx]

    @task
    def get_profile(self) -> None:
        self.client.get(f"/users/{self.user['id']}")
```

---

## Authentication

### Token reuse (recommended)

Authenticate once in `on_start`, reuse the token for all subsequent requests.
This avoids hammering the auth service on every request and reflects real client behavior.

```python
class AuthenticatedUser(HttpUser):
    wait_time = between(1, 2)

    def on_start(self) -> None:
        resp = self.client.post("/auth/token", json={
            "username": "test@example.com",
            "password": "password123",
        })
        token = resp.json()["access_token"]
        self.client.headers.update({"Authorization": f"Bearer {token}"})

    @task
    def fetch_data(self) -> None:
        self.client.get("/data")
```

---

## State Handling

### Cookies

`HttpUser` uses a `requests.Session` internally — cookies are stored and sent automatically.
No manual handling needed for standard cookie-based auth.

### Custom headers per session

Set headers once on the session:

```python
self.client.headers["X-Tenant-ID"] = "tenant-42"
self.client.headers["Accept-Language"] = "uk"
```

### Sharing state across tasks

Store state as instance attributes on the user:

```python
class OrderUser(HttpUser):
    order_id: int | None = None

    @task
    def create_order(self) -> None:
        resp = self.client.post("/orders", json={"item": "widget"})
        self.order_id = resp.json()["id"]

    @task
    def check_order(self) -> None:
        if self.order_id:
            self.client.get(f"/orders/{self.order_id}")
```

---

## Failure Handling

By default, Locust marks any non-2xx response as a failure.
For expected non-2xx (e.g., 404 on a search with no results), suppress:

```python
with self.client.get("/search?q=xyz", catch_response=True) as resp:
    if resp.status_code == 404:
        resp.success()
    elif resp.elapsed.total_seconds() > 2:
        resp.failure("Too slow")
```
