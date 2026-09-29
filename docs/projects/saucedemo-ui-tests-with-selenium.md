---
template: project.html
hide:
  - navigation   # the post-style sidebar (project.html) replaces the menu, as on blog posts
title: SauceDemo UI Tests with Selenium
description: UI test suite for the SauceDemo e-commerce site built with Selenium and pytest — Page Object Model, Faker test data, HTML reports and Docker.
tags:
  - ui-testing
  - selenium
  - pytest
---

# SauceDemo UI Tests with Selenium

A UI test suite for [SauceDemo](https://www.saucedemo.com), a sample e-commerce website by SauceLabs for practicing test automation. It is built with Selenium WebDriver and pytest and covers the main e-commerce scenarios with 28+ tests, step-by-step logs and HTML reports.

## What's Covered

- **Login** — 7 tests: valid/invalid credentials, locked user, logout, error handling
- **Inventory** — 7 tests: sorting, filtering, product selection
- **Product** — 2 tests: navigation, add to cart
- **Cart** — 3 tests: add/remove items, continue shopping
- **Checkout** — 4 tests: form validation, cancel, complete flow
- **Overview** — 3 tests: order review, cancel, finish
- **Order** — 2 tests: confirmation page, back to products

## How It's Built

- **Page Object Model** — one class per page, reusable actions in a base page, locators kept separately in `locators/page_locators.py`.
- **Fixture-based setup** — pytest fixtures provide the Chrome WebDriver, page objects, a Faker data generator and automatic test logging.
- **Base test class** — every test class inherits from `BaseTest`, which injects the `pages` and `data` fixtures.
- **Dual logging** — detailed file logs in `logs/` with expected vs actual values for assertions, plus logs embedded in the pytest-html report.
- **Browser configuration** — Chrome with password popups and automation detection disabled, headless and UI modes, tuned for CI/CD and Docker.

## Tech Stack

- `pytest` — testing framework
- `selenium` — browser automation
- `webdriver-manager` — automatic ChromeDriver management
- `faker` — test data generation
- `pytest-html` — HTML reports with logs
- `python-dotenv` — environment configuration
- `uv` — Python package manager
- `ruff` — linter and formatter

## Running It

Install dependencies, then run the tests headless or with an HTML report:

```bash
make install
make test
make test-html
```

<div class="page-actions" markdown>

[:material-arrow-left: All projects](index.md){ .md-button }
[:fontawesome-brands-github: View on GitHub](https://github.com/serhiismetanskyi/saucedemo-ui-tests-with-selenium){ .md-button .md-button--primary target=_blank }

</div>
