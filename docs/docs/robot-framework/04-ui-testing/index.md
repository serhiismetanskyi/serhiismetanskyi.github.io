---
date: 2026-07-29
tags:
  - robot-framework
  - test-automation
  - ui-testing
---

# Robot Framework — UI Testing

Practical notes for structuring UI automation with Robot Framework: page-level `.resource` files, locator hygiene, and stable waiting. Use this section together with your stack’s official docs ([SeleniumLibrary](https://robotframework.org/SeleniumLibrary/SeleniumLibrary.html), [Browser library](https://marketsquare.github.io/robotframework-browser/Browser.html)).

## Topics in this section

| Topic | What you will learn |
|-------|---------------------|
| [Page Object Pattern & Locators](01-page-objects-locators.md) | Model pages as `.resource` files with variables + keywords; locator priority; SeleniumLibrary vs Browser (Playwright). |
| [Wait Strategies & Flakiness Control](02-wait-strategy-flakiness.md) | Replace fixed sleeps with explicit waits and retries; reduce flakiness; pyramid-friendly UI scope. |
| [**UI Testing — Step by Step**](03-ui-step-by-step.md) | SeleniumLibrary basic → keywords → data-driven → Browser (Playwright). Progressive examples. |
| [**Practical — Full UI Framework**](04-practical-ui-framework.md) | Complete project: Browser (Playwright), page objects, DataFactory, E2E flow. |

## Quick orientation

- **Tests** (`*.robot`) should read like scenarios: import page resources and call **business-level** keywords (`Login With Valid User`), not raw clicks on every line.
- **Pages** are **resource files**, not Python classes: one file per screen or coherent fragment, with a `*** Variables ***` block for selectors and `*** Keywords ***` for actions.

---
## See also
- [Digital Garden: Knowledge Base](../../index.md)
- [Test Automation Framework](../../test-automation-framework/index.md)
- [Testing Pyramid](../../testing-pyramid/index.md)
- [QA & Testing Methodology](../../qa-methodology/index.md)
- [Automation](../../python-guide/04-automation/index.md)
- [Robot Framework — Complete Guide](../index.md)
