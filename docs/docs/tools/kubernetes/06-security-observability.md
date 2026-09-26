---
date: 2026-09-09
tags:
  - tools
  - kubernetes
  - security
  - observability
---

# Security & Observability

## RBAC (Role-Based Access Control)

RBAC controls who can do what in the cluster. Two scopes: namespace-level (Role) and cluster-level (ClusterRole).

### Role + RoleBinding (Namespace-scoped)

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  namespace: dev
rules:
  - apiGroups: [""]
    resources: ["pods", "pods/log"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: read-pods
  namespace: dev
subjects:
  - kind: ServiceAccount
    name: ci-bot
    namespace: dev
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```

Use `ClusterRole` + `ClusterRoleBinding` for cluster-wide access (e.g., namespace management, node monitoring).

### RBAC Best Practices

| Practice | Why |
|----------|-----|
| Least privilege | Grant minimum permissions needed |
| Namespace-scoped first | Use Role before ClusterRole |
| ServiceAccounts per workload | Not the default SA |
| Audit regularly | `kubectl auth can-i --list --as=system:serviceaccount:dev:ci-bot` |

---

## Pod Security

### SecurityContext

```yaml
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    fsGroup: 1000
  containers:
    - name: app
      securityContext:
        readOnlyRootFilesystem: true
        allowPrivilegeEscalation: false
        capabilities:
          drop: ["ALL"]
```

### Pod Security Standards (PSS)

Replace deprecated PodSecurityPolicies. Three levels enforced per namespace:

| Level | Description |
|-------|-------------|
| **Privileged** | No restrictions |
| **Baseline** | Prevents known privilege escalations |
| **Restricted** | Hardened, best practice (recommended for production) |

```bash
kubectl label namespace production \
  pod-security.kubernetes.io/enforce=restricted \
  pod-security.kubernetes.io/warn=restricted
```

---

## Resource Quotas and Limits

### Namespace Quotas

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: compute-quota
  namespace: dev
spec:
  hard:
    requests.cpu: "4"
    requests.memory: 8Gi
    limits.cpu: "8"
    limits.memory: 16Gi
    pods: "20"
```

### LimitRange (Per-Pod Defaults)

Use `LimitRange` to set default `requests`/`limits` for containers that don't specify them. Prevents runaway pods.

---

## Observability Stack

### Metrics: Prometheus + Grafana

```bash
# Install via Helm (kube-prometheus-stack)
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install monitoring prometheus-community/kube-prometheus-stack -n monitoring --create-namespace
```

Provides: Prometheus (metrics collection), Grafana (dashboards), Alertmanager (alerts), Node Exporter, kube-state-metrics.

| Component | Purpose |
|-----------|---------|
| **Prometheus** | Scrapes metrics from pods/nodes via `/metrics` endpoints |
| **Grafana** | Visualization dashboards, alerting |
| **Alertmanager** | Routes alerts to Slack, PagerDuty, email |
| **kube-state-metrics** | Cluster state → Prometheus metrics |

### Logging: EFK Stack

```bash
# Fluent Bit (DaemonSet — log collector)
helm repo add fluent https://fluent.github.io/helm-charts
helm install fluent-bit fluent/fluent-bit -n logging --create-namespace

# Elasticsearch + Kibana
helm repo add elastic https://helm.elastic.co
helm install elasticsearch elastic/elasticsearch -n logging
helm install kibana elastic/kibana -n logging
```

| Component | Role |
|-----------|------|
| **Fluent Bit** | Lightweight log collector (DaemonSet on every node) |
| **Elasticsearch** | Log storage and full-text search |
| **Kibana** | Log visualization and debugging UI |

### Health Checks

`kubectl top` requires `metrics-server` installed in the cluster.

```bash
kubectl top nodes                          # node CPU/memory
kubectl top pods -A --sort-by=memory       # pod resource usage
kubectl get events --sort-by='.lastTimestamp' -A  # cluster events
```

---

## Debugging Checklist

| Symptom | First Commands |
|---------|---------------|
| Pod `Pending` | `kubectl describe pod <p>` → check events, resources, taints |
| Pod `CrashLoopBackOff` | `kubectl logs <p> --previous` → check exit code |
| Pod `ImagePullBackOff` | Check image name, registry auth, `imagePullSecrets` |
| Service no endpoints | `kubectl get endpoints <svc>` → labels mismatch? |
| High latency | `kubectl top pods`, check resource limits, HPA status |
| OOMKilled | Increase `limits.memory` or optimize app memory usage |

### Debug Commands

```bash
kubectl describe pod <name>               # events, conditions, mounts
kubectl logs <pod> -f --tail=200          # follow logs
kubectl logs <pod> -c <container>         # multi-container pod
kubectl logs <pod> --previous             # previous crash
kubectl exec -it <pod> -- /bin/sh         # shell access
kubectl debug -it <pod> --image=busybox   # ephemeral debug container
kubectl debug node/<node> -it --image=busybox  # node-level debug
kubectl get events -A --sort-by='.lastTimestamp' | tail -20
```

---

---

## See also
- [Kubernetes Overview](index.md)
- [Configuration & Storage](04-config-storage.md)
- [Docker Security & Production](../docker/05-security-production.md)
- [OWASP API Security](../../owasp-api-security/index.md)
