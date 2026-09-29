---
date: 2026-08-25
tags:
  - jenkins
  - ci-cd
---

# Patterns & Best Practices

Real-world patterns, security guidelines, performance tips, and complete pipeline templates.

---

## Topics

| Page | What You Will Learn |
|------|-------------------|
| [**Security & Performance**](01-security-performance.md) | Credential safety, resource limits, caching, optimization |
| [**Real-World Templates**](02-real-world-templates.md) | Complete Jenkinsfile examples for Python, Docker, and multi-service projects |

---

## Quick Reference

### Do

- Keep Jenkinsfiles **short** (under 100 lines ideally)
- Use **Shared Libraries** for reusable logic
- Use **Docker agents** for clean builds
- Set **timeouts** on every pipeline
- Use **credentials()** for all secrets

### Do Not

- Do not put business logic in Groovy — use shell scripts
- Do not hardcode secrets — use Jenkins Credentials
- Do not run unlimited parallel stages — respect agent capacity
- Do not skip `post { cleanup { } }` — clean up after builds

---
## See also
- [Digital Garden: Knowledge Base](../../index.md)
- [CI/CD](../../ci-cd-approaches/index.md)
- [Code Quality & CI/CD](../../python-guide/05-quality-cicd/index.md)
- [Docker & Docker Compose — Overview](../../tools/docker/index.md)
- [Git — Overview](../../tools/git/index.md)
- [Jenkins Pipeline Guide](../index.md)
