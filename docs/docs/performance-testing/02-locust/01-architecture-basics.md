---
date: 2026-08-10
tags:
  - performance
  - load-testing
  - locust
---

# Locust — Architecture & Basics

## What Locust Is

Locust is an open-source load testing tool where test scenarios are written in **plain Python**.
No DSLs, no XML configs. A Locust file is a Python script.

---

## Architecture

### Event-Driven Core (gevent)

Locust uses `gevent` — a coroutine-based concurrency library built on greenlets.

- Each simulated user runs in its own **greenlet** (lightweight coroutine)
- Thousands of users can run concurrently on a single machine without threading overhead
- HTTP requests are non-blocking — while one user waits for a response, others proceed

```
Master process
    └── Greenlet: User 1 → request → wait → request
    └── Greenlet: User 2 → request → wait → request
    └── Greenlet: User 3 → request → wait → request
    ... (thousands)
```

---

### Distributed Mode (Master / Worker)

For generating large load beyond a single machine's capacity:

```
Master (coordinates, aggregates metrics)
    ├── Worker 1 (runs N users)
    ├── Worker 2 (runs N users)
    └── Worker 3 (runs N users)
```

Workers receive test configuration from master and report metrics back.
The master aggregates all metrics and exposes the web UI.

---

## Core Concepts

### User

Represents one simulated real user. Each user:
- Has its own session (cookies, headers, state)
- Executes tasks in sequence
- Waits between tasks (think time)

### Task

A single action a user performs — typically one HTTP request or a business flow step.

```python
@task
def view_product(self) -> None:
    self.client.get("/products/42")
```

Tasks can have **weights** to model realistic traffic distribution:

```python
@task(3)  # called 3x more often than weight-1 tasks
def browse(self) -> None:
    self.client.get("/products")

@task(1)
def checkout(self) -> None:
    self.client.post("/orders")
```

### Wait Time

Think time between tasks — simulates real user behavior (reading a page, filling a form).

| Strategy | Usage |
|----------|-------|
| `between(1, 3)` | Random delay between 1–3 seconds |
| `constant(2)` | Fixed 2 second delay |
| `constant_throughput(10)` | Target 10 task executions per second per user |

---

## Minimal Example

```python
from locust import HttpUser, task, between


class ShopUser(HttpUser):
    wait_time = between(1, 3)
    host = "https://example.com"

    @task(3)
    def browse_products(self) -> None:
        self.client.get("/products")

    @task(1)
    def view_cart(self) -> None:
        self.client.get("/cart")
```

Run it:

```bash
locust -f locustfile.py --headless -u 100 -r 10 --run-time 60s
```

| Flag | Meaning |
|------|---------|
| `-u 100` | Spawn 100 total users |
| `-r 10` | Spawn 10 users per second (ramp-up rate) |
| `--run-time 60s` | Stop after 60 seconds |
| `--headless` | No web UI, results in terminal |
