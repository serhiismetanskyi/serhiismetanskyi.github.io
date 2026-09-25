---
date: 2026-08-24
tags:
  - jenkins
  - ci-cd
---

# Advanced Features

This section covers features that make pipelines flexible and powerful: parameters, credentials, conditions, parallel execution, and shared libraries.

---

## Topics

| Page | What You Will Learn |
|------|-------------------|
| [**Parameters & Environment**](01-parameters-environment.md) | Build parameters, environment variables, credentials |
| [**When Conditions & Parallel**](02-when-parallel.md) | Conditional stages, parallel execution, matrix builds |
| [**Shared Libraries**](03-shared-libraries.md) | Reusable pipeline code across projects |

---

## When to Use Advanced Features

- **Parameters** — when users need to customize builds (e.g. target environment)
- **Credentials** — when pipeline needs secrets (API keys, passwords)
- **When conditions** — when stages should run only in specific cases
- **Parallel** — when independent stages can run at the same time
- **Shared Libraries** — when 3+ pipelines share common logic

---
## See also
- [Digital Garden: Knowledge Base](../../index.md)
- [CI/CD](../../ci-cd-approaches/index.md)
- [Code Quality & CI/CD](../../python-guide/05-quality-cicd/index.md)
- [Docker & Docker Compose — Overview](../../tools/docker/index.md)
- [Git — Overview](../../tools/git/index.md)
- [Jenkins Pipeline Guide](../index.md)

