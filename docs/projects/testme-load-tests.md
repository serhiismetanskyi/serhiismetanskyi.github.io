---
template: project.html
hide:
  - navigation   # the post-style sidebar (project.html) replaces the menu, as on blog posts
title: TestMe Load Tests
description: Locust load test suite for the TestMe test case management app — CRUD, list and statistics scenarios with HTML and CSV reports.
tags:
  - load-testing
  - locust
  - requests
---

# TestMe Load Tests

A load test suite for the [TestMe](https://github.com/Ypurek/TestMe-TCM) test case management app ([API documentation](https://documenter.getpostman.com/view/2037649/UV5TEe6x)). It is built with Locust and simulates authenticated users working with test cases, lists and statistics, producing HTML and CSV reports alongside detailed request logs.

## What's Covered

- **Test CRUD** — create, get, update and delete test cases in sequence
- **Test lists** — list operations
- **Statistics** — statistics endpoints
- **Authentication** — registered users with login/logout

## How It's Built

- **Locust task model** — `HttpUser` for concurrent users, `TaskSet` for grouping tasks, `SequentialTaskSet` for ordered flows and `@task` for frequency and order.
- **User hierarchy** — an abstract base class for HTTP users and a registered user with login/logout.
- **Data-driven approach** — credentials are loaded from `data/users.csv`; test data uses timestamps to stay unique.
- **Task-level logging** — every request and response is logged to `logs/` with the task name and result.
- **Load profile in `config.yml`** — host, users, spawn rate, headless mode and run time (defaults: 3 users, 15s).

## Tech Stack

- `locust` — load testing framework
- `requests` — HTTP client
- `uv` — Python package manager

## Running It

Install dependencies, then run the load tests:

```bash
make install
make test
```

<div class="page-actions" markdown>

[:material-arrow-left: All projects](index.md){ .md-button }
[:fontawesome-brands-github: View on GitHub](https://github.com/serhiismetanskyi/testme-load-tests){ .md-button .md-button--primary target=_blank }

</div>
