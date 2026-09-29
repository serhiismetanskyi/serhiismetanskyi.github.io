---
template: project.html
hide:
  - navigation   # the post-style sidebar (project.html) replaces the menu, as on blog posts
title: TestMe API Tests
description: API test suite for the TestMe test case management app built with Playwright APIRequestContext, pytest and Pydantic models.
tags:
  - api-testing
  - playwright
  - pytest
---

# TestMe API Tests

An API test suite for the [TestMe](https://github.com/Ypurek/TestMe-TCM) test case management app ([API documentation](https://documenter.getpostman.com/view/2037649/UV5TEe6x)). It uses Playwright's `APIRequestContext` as the HTTP client together with pytest and Pydantic, and covers authentication, test case management, lists and statistics, with markers for running focused subsets.

## What's Covered

- **Authentication** — login/logout happy path, invalid credentials and edge cases, CSRF token retrieval and reuse
- **Test cases** — create, read, update, delete and PASS/FAIL status changes
- **Workflows** — full CRUD plus status, authorization and error handling
- **Lists and pagination** — list endpoints with and without pagination, page/size combinations and boundaries
- **Statistics** — structure validation, model parsing and consistency checks

## How It's Built

- **Client pattern** — separate `AuthClient`, `TestCasesClient` and `StatsClient`, with shared HTTP logic (headers, CSRF, logging) in `BaseClient`.
- **Pydantic models** — request and response models for test cases, statuses, statistics and errors.
- **Fixtures** — a session-level `APIRequestContext`, authenticated clients and a `created_test_id` fixture that creates and cleans up a test case.
- **Markers** — `smoke`, `regression`, `auth`, `tests`, `stats`, `positive`, `negative`, each with a `make` target.
- **Parallel execution** — `pytest-xdist` via `make test-parallel`.
- **Dual logging** — HTTP requests and responses go to `logs/` and to the pytest-html report.

## Tech Stack

- `pytest` — testing framework
- `playwright` / `pytest-playwright` — HTTP client (`APIRequestContext`) and pytest integration
- `pytest-xdist` — parallel test execution
- `pytest-html` — HTML reports with embedded logs
- `pydantic`, `pydantic-settings` — data models and configuration
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
[:fontawesome-brands-github: View on GitHub](https://github.com/serhiismetanskyi/testme-api-tests){ .md-button .md-button--primary target=_blank }

</div>
