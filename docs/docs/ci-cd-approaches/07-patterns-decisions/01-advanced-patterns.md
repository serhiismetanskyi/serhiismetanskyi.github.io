---
date: 2026-08-31
tags:
  - ci-cd
  - devops
---

# Advanced CI/CD Patterns

## GitOps

Git is the **single source of truth** for both application code and infrastructure state.
Every change to production is a git commit. Every rollback is a git revert.

```
Developer → PR → Merge to main
                    ↓
               Git repo (desired state)
                    ↓
               GitOps controller (Argo CD / Flux)
                    ↓ reconciles continuously
               Kubernetes cluster (actual state)
```

### Key Principle

The cluster state is never modified directly. Only git is modified.
The controller ensures the cluster converges to what git says.

```yaml
# Argo CD Application — declarative sync
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: api-service
spec:
  source:
    repoURL: https://github.com/org/infra
    path: k8s/api-service/production
    targetRevision: main
  destination:
    server: https://kubernetes.default.svc
    namespace: production
  syncPolicy:
    automated:
      prune: true      # delete resources removed from git
      selfHeal: true   # revert manual kubectl changes
```

### Benefits

- Full audit trail: every production change is a git commit with author and PR
- Instant rollback: `git revert` + push
- Drift detection: controller continuously compares git vs cluster, alerts on diff

---

## Trunk-Based Development

All developers commit to `main` (trunk) directly or via short-lived branches (< 1 day).
No long-lived feature branches.

```
main ─────────────────────────────────────────► (always deployable)
      │    │    │    │
      PR1  PR2  PR3  PR4  (each merged within hours, not weeks)
```

### Why It Works

Long-lived branches diverge. Merging them creates big-bang integration that CI cannot verify continuously.
Short-lived branches merge before divergence accumulates.

### Requirements

- Feature flags for unfinished features (code ships, feature is hidden)
- Strong test coverage (trunk must always be green)
- Fast CI (< 10 min — so merging frequently is not painful)

---

## Feature Toggles (Feature Flags)

Decouple deployment from feature release.
Feature is deployed but disabled. Released when the business is ready.

```python
from feature_flags import client as ff


def process_order(order_id: str, user_id: str) -> dict:
    if ff.is_enabled("new_payment_flow", user_id=user_id):
        return new_payment_processor.process(order_id)
    return legacy_payment_processor.process(order_id)
```

### Toggle Types

| Type | Example | Lifetime |
|------|---------|---------|
| Release toggle | New checkout flow | Days to weeks — remove after rollout |
| Experiment toggle | A/B test on button colour | Weeks — remove after analysis |
| Ops toggle | Circuit breaker for feature | Permanent — kill switch |
| Permission toggle | Beta access for certain users | Indefinite |

### Toggle Hygiene

Toggles accumulate technical debt. Clean up after each use.

```python
# Bad — toggle left in code months after rollout
if ff.is_enabled("new_checkout_v2"):  # this shipped 6 months ago
    ...

# Good — add cleanup ticket immediately on release
# TODO: remove new_checkout_v2 toggle by 2026-04-15
```

---

## Environment Promotion Model

```
dev ──► staging ──► production
 ↑          ↑           ↑
Auto      Auto        Manual
(on commit) (on merge) (after smoke pass)
```

Each promotion runs its own verification. An artifact that passes staging
is the exact same artifact that goes to production — no rebuilds.

---

## Monorepo Pipelines

In a monorepo, run pipelines only for services that changed:

```yaml
# Use path filters to trigger per-service pipelines
on:
  push:
    paths:
      - 'services/orders/**'

# Or use a task runner for dependency-aware execution
- run: uv run nox -s test -- --changed-since=main
```

Each service has its own version, its own artifact, its own deployment.
The monorepo is a code organisation choice, not a deployment constraint.
