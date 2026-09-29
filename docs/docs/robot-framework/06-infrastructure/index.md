---
date: 2026-07-31
tags:
  - robot-framework
  - test-automation
  - ci-cd
---

# Robot Framework — Infrastructure

Practical patterns for **configuration**, **observability of test runs**, and **CI/CD**. These topics keep suites portable, safe to run in shared pipelines, and easy to debug when they fail.

## Topics in this section

| Page | What you will use it for |
|------|---------------------------|
| [Configuration & secrets](01-configuration-secrets.md) | Per-environment settings, variable files, env-based secrets, RF 7.4+ `Secret` variables, and keeping credentials out of Git. |
| [Logging, debugging & reporting](02-logging-reporting.md) | Log levels, API traceability, HTML reports, Allure/JUnit, and merging runs with `rebot`. |
| [CI/CD integration](03-ci-cd-integration.md) | Fast feedback vs full regression, GitHub Actions, `pabot`, artifacts, tags, and Dockerized runs. |

Start with **configuration** so every environment reads the same tests but different targets; then wire **logging and reports** so failures are actionable; finally shape **pipelines** around smoke, API, and nightly depth.

---
## See also
- [Digital Garden: Knowledge Base](../../index.md)
- [Test Automation Framework](../../test-automation-framework/index.md)
- [Testing Pyramid](../../testing-pyramid/index.md)
- [QA & Testing Methodology](../../qa-methodology/index.md)
- [Automation](../../python-guide/04-automation/index.md)
- [Robot Framework — Complete Guide](../index.md)
