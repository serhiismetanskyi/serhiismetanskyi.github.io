---
date: 2026-09-01
tags:
  - ci-cd
  - devops
---

# Anti-Patterns & Risks

## Anti-Patterns

### Slow Pipelines

A pipeline that takes 45 minutes teaches developers to batch changes.
Batched changes mean larger PRs, harder reviews, and more bugs per merge.

**Root causes:**
- No caching (reinstalling dependencies every run)
- Sequential test execution (no parallelism)
- Unnecessary steps on every trigger
- E2E tests run on every PR

**Fix:** cache dependencies, parallelise tests, use path filters, reserve E2E for pre-deploy.

---

### Manual Steps in the Pipeline

A manual step is a reliability risk and a bottleneck.
It requires a human to be available, introduces inconsistency, and cannot be audited automatically.

```
# Anti-pattern: manual step in otherwise automated pipeline
Deploy to staging → [manual QA sign-off required] → Deploy to production
```

Manual gates are sometimes justified (financial transactions, regulatory compliance).
When they are, make them explicit approvals in the CI system, not out-of-band Slack messages.

```yaml
# GitHub Actions environment with required reviewer
environment:
  name: production
  url: https://api.example.com
# Requires approval from designated reviewer before job runs
```

---

### No Test Automation

Deploying without automated tests means:
- Every deploy is a gamble
- Regressions are caught by users, not CI
- Developers fear touching old code

A CI pipeline without tests is a deployment pipeline, not a CI pipeline.

---

### No Rollback Strategy

Deploying without a rollback plan is acceptable only if you are certain every deploy is perfect.
That certainty does not exist.

**Common excuse:** "We'll just redeploy the fix."
**Reality:** fix takes 30 minutes to develop, test, review, and deploy. Users experience 30 minutes of breakage.

Rollback must be designed before the first production deploy.

---

### Environment Drift

Production differs from staging. Staging differs from dev.

**Symptoms:**
- "Works on staging, broken in production"
- "Works on my machine"
- Different dependency versions per environment

**Fix:** IaC for all environments, pin all versions, deploy the same Docker image everywhere.

---

### Secrets in Code

```python
# Anti-pattern found in real codebases
DB_PASSWORD = "super_secret_password_123"
API_KEY = "sk-live-abc123xyz"
```

Once committed, a secret is permanently compromised — even after deletion from git history.
Git history is replicated to every clone.

**Fix:** use CI secrets, Vault, environment variables. Pre-commit hooks to detect secrets before commit.

---

## Risks & Limitations

### Pipeline Complexity

CI/CD pipelines grow. A pipeline that started as 20 lines of YAML becomes 2000 lines of complex logic.

**Mitigation:**
- Extract reusable actions/templates
- Document non-obvious pipeline logic
- Audit pipeline complexity in tech debt reviews

### Tool Lock-in

Deeply coupling to one CI platform (GitHub Actions syntax, CircleCI orbs) makes migration painful.

**Mitigation:**
- Keep business logic in scripts (`./scripts/deploy.sh`), not inline YAML
- CI YAML only orchestrates, scripts do the work
- Scripts are portable; YAML is platform-specific

### Slow Feedback at Scale

1000 tests × 0.1s = 100s sequential. Fine.
10,000 tests × 0.1s = 1000s sequential. Broken pipeline.

**Mitigation:** invest in parallelism before the suite reaches 5000 tests.

### Deployment Risks

Even with rollback strategies, some failures have lasting effects:
- Sent emails cannot be unsent
- Kafka messages cannot be un-published
- Database migrations that ran cannot be un-run

**Mitigation:**
- Expand-contract migrations
- Idempotent operations
- Outbox pattern for external side effects
- Feature flags to disable before removing

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Flaky test blocks main | High | Medium | Retry + quarantine policy |
| Secret leaked in logs | Low | Critical | Secret masking + audit |
| Slow pipeline kills velocity | Medium | High | Cache + parallelism targets |
| Rollback fails under pressure | Low | Critical | Runbook + drill quarterly |
| Environment drift causes prod bug | Medium | High | IaC + staging parity checks |
| Tool lock-in blocks migration | Low | Medium | Script-first approach |
