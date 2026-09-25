---
date: 2026-08-25
tags:
  - ci-cd
  - devops
---

# CI/CD

Complete technical reference for Continuous Integration, Continuous Delivery, and Continuous Deployment.

## Sections

### 1. [Fundamentals](01-fundamentals/index.md)

| File | Topics |
|------|--------|
| [Concepts & Goals](./01-fundamentals/01-concepts-goals.md) | CI definition, Continuous Delivery vs Deployment, goals, core feedback loop |
| [Pipeline Architecture](./01-fundamentals/02-pipeline-architecture.md) | Stages, pipeline types (monolithic/multi-stage/distributed/event-driven), triggers, pipeline as code |

### 2. [Build & Artifacts](02-build-artifacts/index.md)

| File | Topics |
|------|--------|
| [Build Stage](./02-build-artifacts/01-build-stage.md) | Dependency install, caching strategy, incremental builds, Docker build, reproducibility |
| [Artifact Management](./02-build-artifacts/02-artifact-management.md) | Artifact types, semantic versioning, container registry, image tagging, retention, promotion pattern |

### 3. [Testing](03-testing/index.md)

| File | Topics |
|------|--------|
| [Test Layers & Strategy](./03-testing/01-test-layers-strategy.md) | Unit/integration/API/E2E/contract tests in pipeline, parallel execution, selective execution |
| [Quality Gates](./03-testing/02-quality-gates.md) | Pass rate gate, coverage threshold, performance SLO gate, vulnerability gate, required status checks |

### 4. [Deployment](04-deployment/index.md)

| File | Topics |
|------|--------|
| [Deployment Strategies](./04-deployment/01-deployment-strategies.md) | Recreate, Rolling, Blue-Green, Canary, Feature Flags — with code and decision guide |
| [Infrastructure & IaC](./04-deployment/02-infrastructure-iac.md) | Docker best practices, Kubernetes manifests, Terraform, CloudFormation, IaC in pipeline |
| [Environment Management](./04-deployment/03-environment-management.md) | Dev/Staging/Production model, twelve-factor config, secrets management, environment parity, drift |

### 5. [Security & Observability](05-security-observability/index.md)

| File | Topics |
|------|--------|
| [Security](./05-security-observability/01-security.md) | Secret vaults, rotation, dependency scanning, SAST (Bandit/Semgrep), image scanning (Trivy), supply chain |
| [Observability](./05-security-observability/02-observability.md) | Pipeline logs, pipeline metrics, deployment health monitoring, DORA metrics, notification strategy |
| [Pipeline Performance](./05-security-observability/03-pipeline-performance.md) | Parallelisation, dependency caching, Docker layer cache, path filtering, duration targets |

### 6. [Release & Production](06-release-production/index.md)

| File | Topics |
|------|--------|
| [Release Management](./06-release-production/01-release-management.md) | SemVer, conventional commits + semantic-release, release trains vs on-demand, CHANGELOG |
| [Rollback Strategies](./06-release-production/02-rollback-strategies.md) | Blue-green instant rollback, Kubernetes rollout undo, canary abort, DB migration rollback, runbook |
| [Testing in Production](./06-release-production/03-testing-in-production.md) | Smoke tests, synthetic monitoring, canary validation, post-deploy observability window |

### 7. [Patterns & Decisions](07-patterns-decisions/index.md)

| File | Topics |
|------|--------|
| [Advanced Patterns](./07-patterns-decisions/01-advanced-patterns.md) | GitOps (Argo CD), trunk-based development, feature toggles, environment promotion, monorepo pipelines |
| [Failure Handling](./07-patterns-decisions/02-failure-handling.md) | Retry strategies, pipeline recovery, partial failure, always-run cleanup, incident response |
| [Anti-Patterns & Risks](./07-patterns-decisions/03-antipatterns-risks.md) | Slow pipelines, manual steps, no tests, no rollback, environment drift, secrets in code, risk register |
| [Real-World Decisions](./07-patterns-decisions/04-real-world-decisions.md) | Microservices/monolith/frontend architectures, staff-level heuristics, decision factors, maturity stages |

---

## Quick Navigation

| I need to... | Go to |
|---|---|
| Understand CI vs CD vs continuous deployment | [Concepts & Goals](./01-fundamentals/01-concepts-goals.md) |
| Design a pipeline from scratch | [Pipeline Architecture](./01-fundamentals/02-pipeline-architecture.md) |
| Speed up the build stage | [Build Stage](./02-build-artifacts/01-build-stage.md) |
| Set up Docker image publishing | [Artifact Management](./02-build-artifacts/02-artifact-management.md) |
| Run tests properly in CI | [Test Layers & Strategy](./03-testing/01-test-layers-strategy.md) |
| Block merges on quality issues | [Quality Gates](./03-testing/02-quality-gates.md) |
| Choose a deployment strategy | [Deployment Strategies](./04-deployment/01-deployment-strategies.md) |
| Manage secrets safely | [Security](./05-security-observability/01-security.md) |
| Make pipeline faster | [Pipeline Performance](./05-security-observability/03-pipeline-performance.md) |
| Plan a rollback | [Rollback Strategies](./06-release-production/02-rollback-strategies.md) |
| Monitor after deploy | [Testing in Production](./06-release-production/03-testing-in-production.md) |
| Understand GitOps | [Advanced Patterns](./07-patterns-decisions/01-advanced-patterns.md) |
| Avoid common mistakes | [Anti-Patterns & Risks](./07-patterns-decisions/03-antipatterns-risks.md) |

---
## See also
- [Digital Garden: Knowledge Base](../index.md)
- [Jenkins Pipeline Guide](../jenkins-guide/index.md)
- [Code Quality & CI/CD](../python-guide/05-quality-cicd/index.md)
- [Config CI Decisions](../test-automation-framework/07-config-ci-decisions/index.md)
- [Docker & Docker Compose — Overview](../tools/docker/index.md)
- [Git — Overview](../tools/git/index.md)

