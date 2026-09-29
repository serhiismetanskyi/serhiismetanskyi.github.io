---
template: project.html
hide:
  - navigation   # the post-style sidebar (project.html) replaces the menu, as on blog posts
title: SauceDemo UI Tests with Playwright
description: UI test suite for the SauceDemo e-commerce site built with Playwright and pytest — 34 tests, Page Object Model, HTML reports and Docker.
tags:
  - ui-testing
  - playwright
  - pytest
---

# SauceDemo UI Tests with Playwright

A UI test suite for [SauceDemo](https://www.saucedemo.com), a sample e-commerce website by SauceLabs for practicing test automation. It is built with Playwright and pytest and covers the main shopping flow, from login to order confirmation, with 34 tests, detailed logs and HTML reports.

## What's Covered

- **Login** — 7 tests: valid/invalid credentials, locked user, logout, error handling
- **Inventory** — 8 tests: menu links, purchases, sorting, add to cart
- **Product** — 4 tests: navigation, add to cart, remove from cart
- **Cart** — 3 tests: add/remove items, continue shopping
- **Checkout** — 7 tests: form validation, cancel, complete flow
- **Overview** — 3 tests: order review, cancel, finish
- **Order** — 2 tests: confirmation page, back to products

## How It's Built

- **Page Object Model with inheritance** — `BasePage → LoginPage → InventoryPage → specific pages`, with locators kept separately in `locators/page_locators.py`.
- **Playwright built-in locators** — `get_by_test_id`, `get_by_role`, `get_by_placeholder`, with `data-test` set as the test ID attribute.
- **Rich assertions** — helper methods in the base page plus Playwright `expect` assertions with auto-retry.
- **Fixture-based setup** — pytest fixtures configure the browser and expose page objects and a Faker data generator; a `BaseTest` class injects them into every test class.
- **Dual logging** — step-by-step file logs in `logs/`, console output and logs embedded in the pytest-html report.
- **Docker** — a headless `tests` service for CI/CD and a `tests-ui` service with X11 forwarding for visual debugging.

## Tech Stack

- `pytest` — testing framework
- `playwright` — browser automation
- `pytest-playwright` — Playwright integration for pytest
- `faker` — test data generation
- `pytest-html` — HTML reports with logs
- `python-dotenv` — environment configuration
- `uv` — Python package manager
- `ruff` — linter and formatter

## Running It

Install dependencies and browsers, create `.env`, then run the tests:

```bash
make install
make install-browsers
make env
make test
```

<div class="page-actions" markdown>

[:material-arrow-left: All projects](index.md){ .md-button }
[:fontawesome-brands-github: View on GitHub](https://github.com/serhiismetanskyi/saucedemo-ui-tests-with-playwright){ .md-button .md-button--primary target=_blank }

</div>
