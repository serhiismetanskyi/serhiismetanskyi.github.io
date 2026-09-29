---
date: 2026-07-28
tags:
  - robot-framework
  - test-automation
  - api-testing
---

# Robot Framework — API Testing

This section describes how to structure REST API automation with **Robot Framework** using a clear separation between HTTP mechanics, business operations, and validation.

## Pages in this section

| Topic | File | Summary |
|-------|------|---------|
| Architecture and layering | [API Testing Architecture & Patterns](01-api-architecture-patterns.md) | Client → Service → Validator pattern; RequestsLibrary sessions and sessionless calls; design rules for tests vs. endpoints. |
| Validation and data | [Request Design & Validation Strategy](02-request-validation.md) | Validation levels, JSON Schema, auth and error scenarios, security-oriented checks, and a layered suite example. |
| **Step by step** | [**API Testing — Step by Step**](03-api-step-by-step.md) | Simple test → keywords → data-driven → full architecture. Progressive examples. |
| **Full framework** | [**Practical — Full API Framework**](04-practical-api-framework.md) | Complete project: Python libraries (ApiClient, UserService, SchemaValidator), resource files, CRUD test suite. |

## Prerequisites

- `robotframework` and `robotframework-requests` (RequestsLibrary) installed in your environment.
- Familiarity with [RequestsLibrary](https://marketsquare.github.io/robotframework-requests/doc/RequestsLibrary.html) keywords for sessions and HTTP verbs.

## How to use these notes

1. Read **Architecture & Patterns** first to align folder layout and keywords with the three layers.
2. Apply **Request Design & Validation** when defining payloads, schemas, and negative paths.

Related generic material lives under **QA & Testing → Test Automation Framework → API Testing** for protocol-agnostic guidance; these pages focus on Robot-specific structure and keywords.

---
## See also
- [Digital Garden: Knowledge Base](../../index.md)
- [Test Automation Framework](../../test-automation-framework/index.md)
- [Testing Pyramid](../../testing-pyramid/index.md)
- [QA & Testing Methodology](../../qa-methodology/index.md)
- [Automation](../../python-guide/04-automation/index.md)
- [Robot Framework — Complete Guide](../index.md)
