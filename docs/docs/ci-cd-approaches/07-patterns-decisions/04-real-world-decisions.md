---
date: 2026-09-01
tags:
  - ci-cd
  - devops
---

# Real-World Architectures, Heuristics & Decision Factors

## Real-World CI/CD Architectures

### Microservices

Each service has its own independent pipeline.
No service can block another service's deployment.

```
service-a:  PR → CI → deploy → smoke ✓
service-b:  PR → CI → deploy → smoke ✓  (independent, simultaneous)
service-c:  PR → CI → deploy → smoke ✓

After all services deploy:
integration-tests pipeline → contract tests → end-to-end smoke
```

Key challenges:
- **Contract testing** — ensure service A's API change does not break service B
- **Deployment ordering** — when A calls B, deploy B first (or use backwards-compatible deploys)
- **Observability** — distributed tracing to follow requests across services

### Monolith

Single pipeline. All tests run together. Single deploy unit.

```
commit → build → test (unit + integration + e2e) → deploy monolith
```

Simpler, but test suite growth eventually makes it slow.
Mitigation: test sharding, caching, marking slow tests for nightly-only runs.

### Python Web App (FastAPI / Django)

```
commit → lint (ruff + mypy) → test (pytest) → build Docker → deploy
```

Key differences from microservices:
- Single deployable unit (like monolith) but modern framework
- Alembic migrations run as a pre-deploy step
- Static assets served by CDN or whitenoise (Django)


```yaml
# Deploy Python web app to Cloud Run
- name: Deploy to Cloud Run
  uses: google-github-actions/deploy-cloudrun@v2
  with:
    service: api
    image: ${{ env.IMAGE }}
    region: us-central1
```


---

## Engineering Heuristics (Staff Level)

### Keep Pipelines Fast (< 10–15 minutes)

A pipeline that takes longer than 15 minutes will be bypassed.
Developers will find ways to merge without waiting.
Fast pipelines are not a nice-to-have — they are a prerequisite for CI culture.

### Shift Left Testing

The earlier a bug is caught, the cheaper it is to fix.

```
Fix in development:  1x cost
Fix in CI:           3x cost
Fix in staging:      10x cost
Fix in production:   100x cost
```

Unit tests before integration tests. Lint before tests. Type checking before lint.

### Automate Everything

If a step is done manually more than twice, automate it.
Manual steps don't scale, introduce inconsistency, and are forgotten under pressure.

### Fail Fast

Run the cheapest checks first. A lint failure should stop the pipeline in 30 seconds,
not after 10 minutes of tests have run.

```yaml
jobs:
  quick-checks:   # 30 seconds
    - ruff check
    - mypy
  tests:          # only after quick-checks pass
    needs: quick-checks
```

### Use Canary Deployments

A canary that routes 5% of traffic to the new version limits blast radius.
If something is wrong, 5% of users are affected, not 100%.
The cost of canary infrastructure is a fraction of the cost of one major incident.

### Monitor Everything

A deployment without monitoring is hope-based engineering.
Define what "healthy" looks like before deploying, then verify it automatically.

---

## Decision Factors

Choose the depth of CI/CD investment based on:

| Factor | Lower investment | Higher investment |
|--------|-----------------|------------------|
| Team size | 1–3 engineers | 10+ engineers |
| System complexity | Monolith, CRUD | Microservices, real-time |
| Release frequency | Monthly | Multiple per day |
| Risk tolerance | Internal tool | Financial, safety-critical |
| User base | Thousands | Millions |
| Regulatory requirements | None | PCI DSS, SOC2, HIPAA |

### Maturity Stages

| Stage | Description |
|-------|-------------|
| 0 — Manual | Deploy by SSH + manual commands |
| 1 — Basic CI | Automated tests on commit |
| 2 — Automated Deploy | Auto-deploy to staging on merge |
| 3 — Quality Gates | Coverage, security, performance gates |
| 4 — GitOps | Git as source of truth, drift detection |
| 5 — Continuous Deployment | Auto-deploy to production, canary, auto-rollback |

Most teams should target Stage 3. Stage 5 requires a mature monitoring and testing culture.

---

## Tooling Landscape (2026)

| Category | Tools |
|----------|-------|
| CI/CD platforms | GitHub Actions, GitLab CI, Jenkins, CircleCI |
| Container registry | GHCR, ECR, GCR, Docker Hub |
| Orchestration | Kubernetes, ECS, Cloud Run |
| GitOps | Argo CD, Flux |
| IaC | Terraform, OpenTofu, Pulumi, CDK |
| Secret management | HashiCorp Vault, AWS Secrets Manager, Doppler |
| Feature flags | LaunchDarkly, Unleash, Flagsmith |
| Release automation | semantic-release, Release Please |
