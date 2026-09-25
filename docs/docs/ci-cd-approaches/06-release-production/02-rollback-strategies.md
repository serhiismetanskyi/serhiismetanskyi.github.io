---
date: 2026-08-30
tags:
  - ci-cd
  - devops
---

# Rollback Strategies

## Why Rollback Must Be Instant

Every deployment can fail. The question is how quickly you recover.
A rollback plan designed in advance takes 30 seconds.
A rollback improvised during an incident takes 30 minutes.

**Rollback target:** previous known-good version deployed within 2 minutes.

---

## Instant Rollback — Blue-Green

The fastest rollback method. Switch traffic back to the previous environment.

```
Production traffic → [Green v2] (current, broken)
                   ↓ flip load balancer
Production traffic → [Blue v1] (previous, healthy)
```

Switch time: seconds. Zero downtime. No redeployment needed.

```bash
# Kubernetes — patch the service to point to previous deployment
kubectl patch service api-service \
  -p '{"spec":{"selector":{"version":"v1"}}}'
```

---

## Version Rollback — Kubernetes

Kubernetes keeps a deployment history. Roll back to any previous revision:

```bash
# View history
kubectl rollout history deployment/api-service

# Roll back to previous
kubectl rollout undo deployment/api-service

# Roll back to specific revision
kubectl rollout undo deployment/api-service --to-revision=3

# Monitor rollback
kubectl rollout status deployment/api-service
```

### Automated Rollback on Health Failure

```yaml
# Kubernetes with Argo Rollouts — auto-rollback on metric breach
analysis:
  templates:
    - templateName: success-rate
  args:
    - name: service-name
      value: api-service
  successCondition: result[0] >= 0.99
  failureLimit: 3
  # if analysis fails 3 times → automatic rollback to previous version
```

---

## Traffic Switching — Canary Rollback

During a canary deployment, abort and route all traffic back to v1:

```bash
# Argo Rollouts — abort canary
kubectl argo rollouts abort api-service

# Or via CI trigger
kubectl argo rollouts set weight api-service 0
```


```yaml
# GitHub Actions — rollback job triggered by monitoring alert
rollback:
  if: failure()
  needs: deploy-canary
  steps:
    - run: kubectl argo rollouts abort ${{ env.SERVICE }}
    - name: Notify
      run: |
        curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
          -d '{"text":"Rollback triggered for ${{ env.SERVICE }}"}'
```


---

## Database Migration Rollback

Code rollback is easy. Database migration rollback is hard.

### Strategy: Backwards-Compatible Migrations

Never write migrations that break the previous version of the code.
Deploy in two phases:

**Phase 1 — Expand (before code deploy):**
```sql
-- Add new column, keep old one
ALTER TABLE users ADD COLUMN email_v2 VARCHAR(255);
```

**Phase 2 — Contract (after new code is stable):**
```sql
-- Remove old column only when new code is fully deployed and stable
ALTER TABLE users DROP COLUMN email;
ALTER TABLE users RENAME COLUMN email_v2 TO email;
```

Between Phase 1 and Phase 2, both old and new code versions work.

### Never Write Destructive Migrations

```sql
-- Never in a single deploy:
ALTER TABLE users DROP COLUMN email;         -- breaks old code instantly
ALTER TABLE orders RENAME COLUMN total TO amount; -- breaks old code instantly
```

---

## Rollback Decision Matrix

| Situation | Action | Time |
|-----------|--------|------|
| Error rate spike after deploy | Rollback immediately | < 2 min |
| Latency exceeds SLO | Rollback if not fixable in 15 min | < 2 min |
| One non-critical bug | Fix forward with hotfix | < 30 min |
| Data corruption | Rollback + DB restore | 30–60 min |
| Canary showing errors | Abort canary | < 1 min |

---

## Rollback Runbook

Keep this documented and accessible during incidents:

```markdown
## Rollback Runbook — API Service

### Kubernetes rollback (30 seconds)
kubectl rollout undo deployment/api-service -n production
kubectl rollout status deployment/api-service -n production

### Verify health after rollback
curl https://api.example.com/health

### Announce
Post in #incidents: "Rolled back api-service to previous version. Investigating."
```
