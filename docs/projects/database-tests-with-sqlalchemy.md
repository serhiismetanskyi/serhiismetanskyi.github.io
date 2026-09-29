---
template: project.html
hide:
  - navigation   # the post-style sidebar (project.html) replaces the menu, as on blog posts
title: Database Tests with SQLAlchemy
description: Database test suite with pytest, SQLAlchemy and Alembic — Postgres in Docker, automatic migrations, factory-boy data and CRUD tests.
tags:
  - databases
  - sqlalchemy
  - alembic
  - docker
  - pytest
---

# Database Tests with SQLAlchemy

A database test suite powered by pytest, SQLAlchemy, Alembic and Docker. It provisions a Postgres database, runs migrations, seeds test data and executes CRUD tests with detailed logging and HTML reporting, as a reference for DB-focused testing patterns built on fixtures, actions and factories.

## What's Covered

- **CRUD tests** — suites for roles, priorities, statuses, tasks and users
- **Schema** — ORM models that match the Alembic migration schema
- **Test data** — seeded through factory-boy and Faker

## How It's Built

- **Postgres 15 in Docker** — a `postgres` service, plus a `migrate` service that applies Alembic migrations before the tests run.
- **Actions layer** — DB action wrappers in `tests/actions/` act as CRUD helpers for the tests.
- **Factories** — factory-boy models and builders in `tests/factories/`.
- **Fixtures** — `conftest.py` provides sessions and factories; the app uses a scoped SQLAlchemy session.
- **Configuration** — DB host, port, user and password are loaded via `pydantic-settings`.
- **Dual logging** — a log file per run in `logs/`, console output and per-test log snippets in the HTML report.

## Tech Stack

- `pytest` — test runner
- `sqlalchemy` — ORM models and queries
- `alembic` — migrations
- `pydantic` / `pydantic-settings` — data models, validation and configuration
- `factory-boy` + `faker` — data factories
- `pytest-html` — HTML reports
- `uv` — dependency manager
- `ruff` — lint and format
- `docker compose` — reproducible environment

## Running It

Install dependencies, build the images, then run migrations and tests in Docker:

```bash
make install
make build
make docker-test
make docker-test-html
```

<div class="page-actions" markdown>

[:material-arrow-left: All projects](index.md){ .md-button }
[:fontawesome-brands-github: View on GitHub](https://github.com/serhiismetanskyi/database-tests-with-sqlalchemy){ .md-button .md-button--primary target=_blank }

</div>
