---
date: 2026-08-11
tags:
  - performance
  - load-testing
  - locust
---

# Advanced Locust Usage

## Distributed Testing

A single machine can typically simulate 500–5000 users (depends on wait time and request speed).
For larger scale, use distributed mode.

### Start master

```bash
locust -f locustfile.py --master --expect-workers=3
```

### Start workers (on same or different machines)

```bash
locust -f locustfile.py --worker --master-host=192.168.1.10
```

Workers receive user class definitions from master.
Each worker runs a slice of total users. Master aggregates all metrics.

### Docker Compose example

```yaml
services:
  master:
    image: locustio/locust
    ports: ["8089:8089"]
    volumes: [".:/mnt/locust"]
    command: -f /mnt/locust/locustfile.py --master

  worker:
    image: locustio/locust
    volumes: [".:/mnt/locust"]
    command: -f /mnt/locust/locustfile.py --worker --master-host=master
    deploy:
      replicas: 4
```

---

## Custom Metrics

Locust's built-in metrics cover HTTP requests. For custom business KPIs, use events.

```python
import time
from locust import HttpUser, task, between, events


class BusinessUser(HttpUser):
    wait_time = between(1, 2)

    @task
    def place_order(self) -> None:
        start = time.perf_counter()
        resp = self.client.post("/orders", json={"item": "widget"})
        elapsed = (time.perf_counter() - start) * 1000

        events.request.fire(
            request_type="BUSINESS",
            name="place_order_flow",
            response_time=elapsed,
            response_length=len(resp.content),
            exception=None if resp.ok else Exception(resp.status_code),
        )
```

Custom events appear in Locust's metrics table alongside HTTP metrics.

---

## Event Hooks

Locust exposes hooks for setup, teardown, and per-request logic.

### Test initialization

```python
from locust import events
from locust.env import Environment


@events.test_start.add_listener
def on_test_start(environment: Environment, **kwargs: object) -> None:
    print("Test started — warming up caches")


@events.test_stop.add_listener
def on_test_stop(environment: Environment, **kwargs: object) -> None:
    print("Test finished — exporting results")
```

### Per-request logging

```python
@events.request.add_listener
def on_request(
    request_type: str,
    name: str,
    response_time: float,
    response_length: int,
    exception: Exception | None,
    **kwargs: object,
) -> None:
    if exception:
        print(f"FAILURE {name}: {exception}")
    elif response_time > 1000:
        print(f"SLOW {name}: {response_time:.0f}ms")
```

---

## Shape Classes — Programmatic Load Control

For complex load patterns, use `LoadTestShape`:

```python
from locust import LoadTestShape


class StepLoadShape(LoadTestShape):
    stages = [
        {"duration": 60, "users": 10, "spawn_rate": 5},
        {"duration": 120, "users": 50, "spawn_rate": 10},
        {"duration": 180, "users": 100, "spawn_rate": 20},
        {"duration": 240, "users": 200, "spawn_rate": 50},
    ]

    def tick(self) -> tuple[int, float] | None:
        run_time = self.get_run_time()
        for stage in self.stages:
            if run_time < stage["duration"]:
                return stage["users"], stage["spawn_rate"]
        return None
```

`tick()` is called every second. Return `None` to end the test.
