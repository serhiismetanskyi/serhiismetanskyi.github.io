---
template: project.html
hide:
  - navigation   # the post-style sidebar (project.html) replaces the menu, as on blog posts
title: ServeRest API Tests
description: API test suite for the ServeRest e-commerce REST API built with pytest and requests — users, products, carts and login with full HTTP logging.
tags:
  - api-testing
  - requests
  - pytest
---

# ServeRest API Tests

An API test suite for [ServeRest](https://serverest.dev), a REST API for e-commerce testing scenarios. It is built with pytest, requests and assertpy and covers the main API scenarios with 16 tests, logging every HTTP request and response to files and to the HTML report.

## What's Covered

- **Users** — 5 tests: CRUD operations
- **Products** — 5 tests: CRUD with admin authorization
- **Carts** — 5 tests: create, get, checkout, delete
- **Login** — 1 test: authentication

## How It's Built

- **Services layer** — one API client class per endpoint group (users, products, carts, login).
- **Fixture-based test data** — fixtures create users, log them in and store tokens, create products and carts, and share state between tests.
- **Logging at the HTTP client level** — a wrapper over requests logs every request and response automatically.
- **Data-driven approach** — test data is generated with Faker and saved to JSON for reuse; the number of test objects is configurable via environment variables.
- **Soft assertions** — assertpy `soft_assertions()` checks several conditions in one test without stopping on the first failure.
- **Business logic helper** — a calculator module for cart calculations.

## Tech Stack

- `pytest` — testing framework
- `requests` — HTTP client
- `assertpy` — fluent assertions
- `faker` — test data generation
- `pytest-html` — HTML reports with logs
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
[:fontawesome-brands-github: View on GitHub](https://github.com/serhiismetanskyi/serverest-api-tests){ .md-button .md-button--primary target=_blank }

</div>
