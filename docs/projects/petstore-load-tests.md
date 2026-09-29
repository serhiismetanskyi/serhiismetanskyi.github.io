---
template: project.html
hide:
  - navigation   # the post-style sidebar (project.html) replaces the menu, as on blog posts
title: PetStore Load Tests
description: Locust load test suite for the Swagger PetStore API — pet, user and order scenarios with Faker data, HTML and CSV reports.
tags:
  - load-testing
  - locust
  - requests
---

# PetStore Load Tests

A load test suite for the [PetStore API](https://petstore.swagger.io), a REST API for pet store testing scenarios. It is built with Locust and Faker and runs pet, user and order scenarios, with request logs on every run and optional HTML and CSV reports.

## What's Covered

- **Pets** — CRUD operations
- **Users** — user management
- **Orders** — order processing

## How It's Built

- **Locust task model** — `HttpUser` for concurrent users, `TaskSet` for grouping tasks, `SequentialTaskSet` for ordered flows (create, update, get, delete) and `@task` for frequency and order.
- **Data layer** — generators for pets (with categories and tags), users and orders.
- **Unique test data** — Faker plus custom generators; pet IDs are based on timestamps.
- **Task-level logging** — every request and response is logged to `logs/` with the task name and result.
- **Load profile in `config.yml`** — users, spawn rate, headless mode and run time (defaults: 12 users, 15s).
- **Reports on demand** — HTML and CSV reports only with `make test-html`; logs are always written.

## Tech Stack

- `locust` — load testing framework
- `requests` — HTTP client
- `faker` — test data generation
- `uv` — Python package manager

## Running It

Install dependencies, then run the load tests with or without reports:

```bash
make install
make test
make test-html
```

<div class="page-actions" markdown>

[:material-arrow-left: All projects](index.md){ .md-button }
[:fontawesome-brands-github: View on GitHub](https://github.com/serhiismetanskyi/petstore-load-tests){ .md-button .md-button--primary target=_blank }

</div>
