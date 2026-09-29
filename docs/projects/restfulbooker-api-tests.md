---
template: project.html
hide:
  - navigation   # the post-style sidebar (project.html) replaces the menu, as on blog posts
title: Restful-Booker API Tests
description: API test suite for Restful-Booker built with pytest and requests — the full booking lifecycle from auth to deletion, with ordered, dependent tests.
tags:
  - api-testing
  - requests
  - pytest
---

# Restful-Booker API Tests

An API test suite for [Restful-Booker](https://restful-booker.herokuapp.com/), a free RESTful API by Mark Winteringham for practicing API test automation. It is built with pytest and requests, and its 9 tests walk through the complete booking lifecycle, from creation to deletion, with every HTTP call logged.

## What's Covered

- **Health check** — ping endpoint
- **Authentication** — token creation
- **Create and get booking** — create a new booking and retrieve it by ID
- **Update booking** — full and partial update
- **Search bookings** — search by name and dates
- **Delete booking** — delete, then a negative check for 404 after deletion

## How It's Built

- **Dependency-based orchestration** — `pytest-dependency` markers enforce the order: auth, create, get, update, partial update, search, delete, verify deletion.
- **API client pattern** — all endpoints are wrapped in a `RestfulBookerAPI` class, with HTTP methods abstracted in `HTTPMethods`.
- **Response validation helpers** — utilities for status codes, JSON structure and field values.
- **Dual logging** — requests and responses are logged at the HTTP client level to files and to the pytest-html report.
- **Error handling** — descriptive errors, a 30-second timeout for all requests and JSON parsing errors with a response preview.
- **Dynamic test data** — Faker generates names, prices, booking dates, additional needs and deposit status.

## Tech Stack

- `pytest` — testing framework
- `requests` — HTTP client library
- `pytest-html` — HTML reports with logs
- `pytest-dependency` — test dependency management
- `faker` — test data generation
- `python-dotenv` — environment configuration
- `uv` — Python package manager
- `ruff` — linter and formatter

## Running It

Install dependencies, then run the tests with or without an HTML report:

```bash
make install
make test
make test-html
```

<div class="page-actions" markdown>

[:material-arrow-left: All projects](index.md){ .md-button }
[:fontawesome-brands-github: View on GitHub](https://github.com/serhiismetanskyi/restfulbooker-api-tests){ .md-button .md-button--primary target=_blank }

</div>
