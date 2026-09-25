---
date: 2026-09-09
tags:
  - tools
  - kubernetes
---

# Helm & Deployment Strategies

## Helm

Helm is the package manager for Kubernetes. A **chart** is a collection of templates that produce Kubernetes manifests.

### Install Helm

```bash
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
helm version
```

### Core Commands

| Task | Command |
|------|---------|
| Add repo | `helm repo add bitnami https://charts.bitnami.com/bitnami` |
| Update repos | `helm repo update` |
| Search chart | `helm search repo nginx` |
| Install release | `helm install my-app bitnami/nginx -f values.yaml` |
| Upgrade release | `helm upgrade my-app bitnami/nginx -f values.yaml` |
| Install or upgrade | `helm upgrade --install my-app bitnami/nginx -f values.yaml` |
| List releases | `helm list -A` |
| Rollback | `helm rollback my-app 1` |
| Uninstall | `helm uninstall my-app` |
| Show values | `helm show values bitnami/nginx` |
| Template (dry run) | `helm template my-app bitnami/nginx -f values.yaml` |

### Chart Structure

```text
my-chart/
├── Chart.yaml          ← name, version, dependencies
├── values.yaml         ← default configuration values
├── templates/
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── configmap.yaml
│   ├── _helpers.tpl    ← reusable template functions
│   └── NOTES.txt       ← post-install message
└── charts/             ← sub-charts (dependencies)
```

### Custom Values

`values.yaml` contains defaults (replicas, image, resources, ingress). Override per environment:

```bash
helm upgrade --install my-app ./chart -f values.yaml -f values-prod.yaml
```

---

## Kustomize

Built into kubectl — template-free configuration customization using overlays.

### Structure

```text
k8s/
├── base/
│   ├── kustomization.yaml
│   ├── deployment.yaml
│   └── service.yaml
└── overlays/
    ├── dev/
    │   └── kustomization.yaml
    └── prod/
        └── kustomization.yaml
```

### Base kustomization.yaml

```yaml
resources:
  - deployment.yaml
  - service.yaml
commonLabels:
  app: myapp
```

### Prod Overlay

```yaml
resources:
  - ../../base
patches:
  - path: replica-patch.yaml
namespace: production
images:
  - name: myapp
    newTag: "1.2.0"
```

### Apply

```bash
kubectl apply -k k8s/overlays/prod/
kubectl kustomize k8s/overlays/prod/    # preview only
```

### Helm vs Kustomize

| Aspect | Helm | Kustomize |
|--------|------|-----------|
| Approach | Templating (Go templates) | Patching (overlays) |
| Installation | Separate binary | Built into kubectl |
| Package registry | Chart repos (ArtifactHub) | None (git-based) |
| Complexity | Higher (templating logic) | Lower (plain YAML) |
| Best for | Third-party apps, complex charts | Internal apps, env-specific configs |

They can be combined: Helm renders templates, Kustomize applies env overlays.

---

## Deployment Strategies

### Rolling Update (built-in default)

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1          # 1 extra pod during update
    maxUnavailable: 0    # zero-downtime
```

Pods replaced gradually. Automatic rollback via `kubectl rollout undo`.

### Blue-Green

Two full environments (blue = current, green = new). Switch traffic via Service selector:

```bash
# Deploy green alongside blue
kubectl apply -f deployment-green.yaml

# Test green internally, then switch Service
kubectl patch svc web -p '{"spec":{"selector":{"version":"green"}}}'

# Rollback: switch selector back to blue
kubectl patch svc web -p '{"spec":{"selector":{"version":"blue"}}}'
```

| Pros | Cons |
|------|------|
| Instant rollback | 2× resource usage during deploy |
| Full testing before switch | Database migration complexity |

### Canary

Route a small % of traffic to new version, gradually increase:

```yaml
# stable: 9 replicas (v1), canary: 1 replica (v2)
# Both share same Service selector (app: web)
# Traffic split: ~90% stable, ~10% canary
```

For precise traffic splitting, use **Istio VirtualService** or **Argo Rollouts**:

```bash
# Argo Rollouts — advanced canary with analysis
kubectl argo rollouts set-weight my-app 20    # 20% to canary
kubectl argo rollouts promote my-app           # full rollout
```

### Strategy Comparison

| Strategy | Risk | Rollback Speed | Resource Overhead |
|----------|------|----------------|-------------------|
| Rolling Update | Medium | Minutes | +25% during update |
| Blue-Green | Low | Instant | 2× during deploy |
| Canary | Very Low | Fast | +10-20% |

---

## References

- [Helm Documentation](https://helm.sh/docs/)
- [Kustomize Documentation](https://kustomize.io/)
- [Argo Rollouts](https://argoproj.github.io/rollouts/)
- [Kubernetes Deployment Strategies](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#strategy)

---

## See also
- [Kubernetes Overview](index.md)
- [Security & Observability](06-security-observability.md)
- [CI/CD Approaches](../../ci-cd-approaches/index.md)
