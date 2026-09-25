---
date: 2026-08-28
tags:
  - ci-cd
  - devops
  - deployment
---

# Deployment Strategies

## Recreate (Big Bang)

Stop everything. Deploy new version. Start everything.

```
v1 running
    ↓ stop all
    ↓ deploy v2
    ↓ start all
v2 running
```

**Downtime:** yes — gap between stop and start.
**Risk:** high — if v2 is broken, service is down until rollback.
**Use case:** dev environments, internal tools where downtime is acceptable.

---

## Rolling Deployment

Replace instances one at a time (or in small batches).
At any moment, old and new versions run simultaneously.

```
[v1][v1][v1][v1]
[v2][v1][v1][v1]  ← first batch updated
[v2][v2][v1][v1]  ← second batch
[v2][v2][v2][v2]  ← complete
```

**Downtime:** none.
**Risk:** medium — brief period with mixed versions in production.
**Requirement:** API must be backwards compatible during transition.

```yaml
# Kubernetes rolling update
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0  # never reduce capacity
```

---

## Blue-Green Deployment

Two identical environments: blue (current) and green (new).
Switch traffic from blue to green atomically.

```
Traffic → [Blue v1] (live)   [Green v2] (idle)
                ↓ deploy to green
Traffic → [Blue v1] (idle)   [Green v2] (new)
                ↓ switch load balancer
Traffic →                    [Green v2] (live)
```

**Downtime:** none — switch is instantaneous.
**Rollback:** instant — redirect traffic back to blue.
**Cost:** requires double infrastructure capacity.
**Use case:** production deploys requiring zero-downtime and instant rollback.

---

## Canary Deployment

Route a small percentage of traffic to the new version. Gradually increase.

```
100% → v1
 95% → v1,  5% → v2  (canary phase)
 80% → v1, 20% → v2  (expanding)
  0% → v1, 100% → v2 (complete)
```

**Risk:** only a fraction of users hit the new version. Impact of bugs is limited.
**Requirement:** good monitoring and automated rollback trigger on error rate spike.

```yaml
# Kubernetes with Argo Rollouts
spec:
  strategy:
    canary:
      steps:
        - setWeight: 5
        - pause: {duration: 5m}
        - setWeight: 20
        - pause: {duration: 10m}
        - setWeight: 100
      analysis:
        templates:
          - templateName: error-rate
        args:
          - name: max-error-rate
            value: "1"
```

---

## Feature Flags

Decouple deployment from feature release.
Code ships to production with the feature disabled. Enable via flag — no deploy.

```
Deploy: feature code merged, flag=OFF → production (feature invisible to users)
Release: flag=ON → feature live (no deploy needed)
```

```python
from feature_flags import flags

def create_order(user_id: str, items: list) -> dict:
    if flags.is_enabled("new_checkout_flow", user_id=user_id):
        return new_checkout_service.create(user_id, items)
    return legacy_checkout_service.create(user_id, items)
```

Benefits:
- Instant rollback: flip flag off, feature disabled in milliseconds
- Gradual rollout: enable for 5% → 20% → 100% of users
- A/B testing: measure metrics between flag-on and flag-off cohorts
- Kill switches: disable expensive features under load

---

## Deployment Strategy Selection Guide

| Situation | Strategy |
|-----------|---------|
| Dev / internal tools | Recreate |
| Standard production service | Rolling |
| Zero-downtime required, instant rollback | Blue-Green |
| High risk change, need gradual exposure | Canary |
| Decouple feature release from deploy | Feature Flags |
| All of the above at scale | Canary + Feature Flags |
