---
date: 2026-08-22
tags:
  - jenkins
  - ci-cd
---

# Jenkins Pipeline Guide

A practical guide to writing Jenkinsfiles — from basic syntax to production-ready pipelines.

---

## What You Will Learn

| Section | Topics |
|---------|--------|
| [**Fundamentals**](01-fundamentals/index.md) | What is a Jenkinsfile, declarative vs scripted, pipeline concepts |
| [**Declarative Syntax**](02-declarative-syntax/index.md) | `pipeline`, `agent`, `stages`, `steps`, `post`, `environment`, `options` |
| [**Advanced Features**](03-advanced-features/index.md) | Parameters, credentials, `when` conditions, parallel stages, shared libraries |
| [**Patterns & Best Practices**](04-patterns-best-practices/index.md) | Project structure, security, performance, real-world templates |

---

## Key Principles

- Use **Declarative Pipeline** as your default choice
- Keep Jenkinsfiles **short and readable** — move logic to shell scripts
- Store Jenkinsfiles **in the repository** (Pipeline as Code)
- Use **Shared Libraries** when pipelines grow beyond 3+ projects
- Treat pipeline code with the **same quality standards** as application code

---
## See also
- [Digital Garden: Knowledge Base](../index.md)
- [CI/CD](../ci-cd-approaches/index.md)
- [Code Quality & CI/CD](../python-guide/05-quality-cicd/index.md)
- [Docker & Docker Compose — Overview](../tools/docker/index.md)
- [Git — Overview](../tools/git/index.md)

