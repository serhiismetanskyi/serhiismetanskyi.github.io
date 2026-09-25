---
date: 2026-09-08
tags:
  - tools
  - kubernetes
---

# Workloads & Scheduling

## Pod

The smallest deployable unit. A Pod runs one or more containers sharing the same network namespace and storage volumes.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app
  labels:
    app: web
spec:
  containers:
    - name: app
      image: python:3.13-slim
      ports:
        - containerPort: 8000
      resources:
        requests:
          cpu: "100m"
          memory: "128Mi"
        limits:
          cpu: "500m"
          memory: "256Mi"
      livenessProbe:
        httpGet:
          path: /healthz
          port: 8000
        initialDelaySeconds: 10
        periodSeconds: 15
      readinessProbe:
        httpGet:
          path: /ready
          port: 8000
        initialDelaySeconds: 5
        periodSeconds: 10
```

**Always set**: `resources.requests` + `resources.limits`, `livenessProbe`, `readinessProbe`.

---

## Deployment

Manages ReplicaSets and provides declarative updates, scaling, and rollbacks.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: app
          image: myapp:1.2.0
          ports:
            - containerPort: 8000
          resources:
            requests: { cpu: "100m", memory: "128Mi" }
            limits: { cpu: "500m", memory: "256Mi" }
```

| Field | Purpose |
|-------|---------|
| `replicas` | Desired number of Pod copies |
| `strategy.type` | `RollingUpdate` (default) or `Recreate` |
| `maxSurge` | Extra Pods allowed during update |
| `maxUnavailable` | Pods that can be down during update (0 = zero-downtime) |

### Lifecycle Commands

```bash
kubectl apply -f deployment.yaml
kubectl scale deploy/web --replicas=5
kubectl set image deploy/web app=myapp:1.3.0
kubectl rollout status deploy/web
kubectl rollout undo deploy/web               # rollback to previous
kubectl rollout undo deploy/web --to-revision=2
kubectl rollout history deploy/web
```

---

## ReplicaSet

Ensures a specified number of Pod replicas run at any time. Deployments manage ReplicaSets automatically — rarely create them directly.

---

## StatefulSet

For stateful workloads that need stable network identities and persistent storage:

| Feature | Deployment | StatefulSet |
|---------|-----------|-------------|
| Pod names | Random suffix (`web-abc123`) | Ordered index (`db-0`, `db-1`) |
| Scaling | Parallel | Sequential (ordered) |
| Storage | Shared or none | Per-pod PVC (stable across reschedules) |
| DNS | Via Service only | `<pod>.<service>.<ns>.svc.cluster.local` |

Use cases: databases (PostgreSQL, MySQL), message queues (Kafka), distributed caches (Redis Cluster).

Key fields: `serviceName` (headless Service), `volumeClaimTemplates` (per-pod PVC), ordered pod naming (`db-0`, `db-1`, `db-2`).

---

## DaemonSet

Runs one Pod per Node. Use for node-level agents:

| Use Case | Example |
|----------|---------|
| Log collection | Fluent Bit, Fluentd |
| Monitoring | Prometheus Node Exporter |
| Networking | kube-proxy, Cilium, Calico |
| Storage | CSI drivers |

---

## Job and CronJob

**Job** — runs a task to completion. Key fields: `backoffLimit` (retry count), `restartPolicy: Never`.

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migrate
spec:
  backoffLimit: 3
  template:
    spec:
      containers:
        - name: migrate
          image: myapp:1.2.0
          command: ["python", "manage.py", "migrate"]
      restartPolicy: Never
```

**CronJob** — scheduled Jobs. Uses cron syntax: `schedule: "0 2 * * *"` (daily at 2 AM).

---

## Scheduling

### Node Selection

```yaml
spec:
  nodeSelector:
    disktype: ssd
```

### Affinity / Anti-Affinity

Use `podAntiAffinity` with `topologyKey: kubernetes.io/hostname` to spread Pods across nodes for HA. Use `podAffinity` to co-locate related Pods.

### Taints and Tolerations

`kubectl taint nodes node1 gpu=true:NoSchedule` — only Pods with matching toleration can be scheduled on tainted nodes.

---

## See also
- [Kubernetes Overview](index.md)
- [Services & Networking](03-services-networking.md)
- [Configuration & Storage](04-config-storage.md)
