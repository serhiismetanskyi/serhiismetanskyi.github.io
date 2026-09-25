---
date: 2026-08-10
tags:
  - performance
  - load-testing
  - locust
---

# Load Modeling

## User Behavior Modeling

A load test that only hammers a single endpoint is not realistic.
Real users follow **flows**: they log in, browse, add to cart, pay, log out.

### Realistic Flow Example

```python
from locust import HttpUser, task, between, SequentialTaskSet


class CheckoutFlow(SequentialTaskSet):
    def on_start(self) -> None:
        resp = self.client.post("/auth/login", json={
            "email": "user@example.com",
            "password": "secret",
        })
        self.token = resp.json()["token"]

    @task
    def browse(self) -> None:
        self.client.get("/products", headers={"Authorization": f"Bearer {self.token}"})

    @task
    def add_to_cart(self) -> None:
        self.client.post("/cart", json={"product_id": 1, "qty": 1},
                         headers={"Authorization": f"Bearer {self.token}"})

    @task
    def checkout(self) -> None:
        self.client.post("/orders",
                         headers={"Authorization": f"Bearer {self.token}"})
        self.interrupt()


class ShopUser(HttpUser):
    tasks = [CheckoutFlow]
    wait_time = between(1, 2)
```

`SequentialTaskSet` enforces task order — the user cannot checkout before browsing.

---

## Load Patterns

### Constant Load

Flat number of users for the full test duration. Used for baseline validation.

```
Users: ─────────────────────── (constant)
Time:  0          30s         60s
```

### Ramp-Up

Gradually increase users to find the saturation point without shocking the system.

```
Users:        ___________
             /
            /
Time:  0  ramp  sustained
```

### Spike

Sudden jump and drop. Tests system's ability to handle and recover from bursts.

```
Users:    |
          |
──────────┘└────────────
Time:  0  spike  0
```

### Step Load

Increase users in discrete steps. Each step stabilizes before the next increment.

```
Users:          ___
          _____|
    _____|
___|
Time:  0   step1  step2  step3
```

---

## Think Time

Think time is the delay between a user's actions — simulating reading, scrolling, filling forms.

**Without think time:**
- Unrealistic burst load
- 100 users generate 10,000+ RPS
- Numbers don't reflect production

**With realistic think time:**
- 100 users may generate 50–200 RPS (realistic)
- Matches actual user behavior
- Results are comparable to production monitoring

```python
from locust import between, constant, constant_throughput

wait_time = between(1, 5)            # random: 1–5 seconds
wait_time = constant(2)              # always 2 seconds
wait_time = constant_throughput(2)   # maintain 2 tasks/sec/user
```

Choose `constant_throughput` when you need to **target a specific RPS** regardless
of how long individual requests take.
