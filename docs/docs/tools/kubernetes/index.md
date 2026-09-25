---
date: 2026-09-08
tags:
  - tools
  - kubernetes
---

# Kubernetes (K8s) — Overview

## What Is Kubernetes

Kubernetes is an open-source container orchestration platform that automates deploying, scaling, and managing containerized applications. Originally developed by Google and now maintained by the CNCF, it is the industry standard for production container management — 84% of enterprises run K8s in production (CNCF 2025).

```
Container Images ──► Kubernetes Cluster ──► Managed Pods (auto-healing, scaling)
```

| Concept | Description |
|---------|-------------|
| **Cluster** | A set of nodes (machines) that run containerized applications |
| **Node** | A worker machine (physical or VM) that runs Pods |
| **Pod** | Smallest deployable unit — one or more containers sharing network/storage |
| **Deployment** | Declarative desired state for Pods — handles scaling, updates, rollbacks |
| **Service** | Stable network endpoint that routes traffic to a set of Pods |
| **Namespace** | Virtual cluster within a physical cluster for resource isolation |

## Kubernetes vs Docker Compose

| Aspect | Docker Compose | Kubernetes |
|--------|---------------|------------|
| Scope | Single host | Multi-node cluster |
| Scaling | Manual `scale` flag | Auto-scaling (HPA, VPA) |
| Self-healing | Restart policy only | Pod replacement, rescheduling |
| Networking | Single bridge network | Cluster-wide CNI, Services, Ingress |
| Config mgmt | `.env` files | ConfigMaps, Secrets (base64; enable encryption at rest) |
| Rolling updates | Recreate only | Rolling, canary, blue-green |
| Production use | Dev/test environments | Production-grade orchestration |

## Architecture

```
┌─────────────── Control Plane ───────────────┐
│  kube-apiserver  ←→  etcd (state store)     │
│  kube-scheduler  ←→  controller-manager     │
│  cloud-controller-manager (optional)        │
└─────────────────────────────────────────────┘
           │ API calls
┌──────────┼──────────────────────────────────┐
│    Worker Node 1         Worker Node 2      │
│  ┌─────────────┐      ┌─────────────┐      │
│  │  kubelet     │      │  kubelet     │     │
│  │  kube-proxy  │      │  kube-proxy  │     │
│  │  ┌────┐┌────┐│     │  ┌────┐┌────┐│     │
│  │  │Pod1││Pod2││     │  │Pod3││Pod4││     │
│  │  └────┘└────┘│      │  └────┘└────┘│     │
│  └─────────────┘      └─────────────┘      │
└─────────────────────────────────────────────┘
```

### Control Plane Components

| Component | Role |
|-----------|------|
| **kube-apiserver** | REST API front-end; all components communicate through it |
| **etcd** | Distributed key-value store holding all cluster state |
| **kube-scheduler** | Assigns Pods to Nodes based on resources, affinity, taints |
| **controller-manager** | Runs controllers (Deployment, ReplicaSet, Node, Job) |

### Node Components

| Component | Role |
|-----------|------|
| **kubelet** | Agent on each node; ensures containers match Pod spec |
| **kube-proxy** | Network proxy implementing Service routing rules |
| **Container runtime** | containerd or CRI-O (Docker deprecated since v1.24) |

## Section Map

| File | Topics |
|------|--------|
| [01 — kubectl Fundamentals](01-kubectl-fundamentals.md) | Commands, contexts, namespaces, output formats, aliases |
| [02 — Workloads & Scheduling](02-workloads-scheduling.md) | Pods, Deployments, StatefulSets, DaemonSets, Jobs, CronJobs |
| [03 — Services & Networking](03-services-networking.md) | ClusterIP, NodePort, LoadBalancer, Ingress, NetworkPolicies |
| [04 — Configuration & Storage](04-config-storage.md) | ConfigMaps, Secrets, PVs, PVCs, StorageClasses |
| [05 — Helm & Deployment Strategies](05-helm-deployments.md) | Helm charts, Kustomize, rolling update, canary, blue-green |
| [06 — Security & Observability](06-security-observability.md) | RBAC, Pod Security, Prometheus, Grafana, EFK, debugging |

## Quick Reference

### Cluster Info

| Task | Command |
|------|---------|
| Cluster info | `kubectl cluster-info` |
| List nodes | `kubectl get nodes -o wide` |
| All resources | `kubectl get all -A` |
| API resources | `kubectl api-resources` |

### Pod Lifecycle

| Task | Command |
|------|---------|
| List pods | `kubectl get pods -o wide` |
| Pod details | `kubectl describe pod <name>` |
| Pod logs | `kubectl logs <pod> -f --tail=100` |
| Shell into pod | `kubectl exec -it <pod> -- /bin/sh` |
| Delete pod | `kubectl delete pod <name>` |

### Deployments

| Task | Command |
|------|---------|
| Create | `kubectl apply -f deployment.yaml` |
| Scale | `kubectl scale deploy/<name> --replicas=3` |
| Rollout status | `kubectl rollout status deploy/<name>` |
| Rollback | `kubectl rollout undo deploy/<name>` |
| History | `kubectl rollout history deploy/<name>` |

### Debugging

| Task | Command |
|------|---------|
| Events (sorted) | `kubectl get events --sort-by='.lastTimestamp'` |
| Resource usage | `kubectl top pods -A` |
| Debug pod | `kubectl debug -it <pod> --image=busybox` |
| Port forward | `kubectl port-forward pod/<pod> 8080:80` |
| Test DNS | `kubectl run tmp --rm -it --image=busybox -- nslookup <svc>` |

---
## See also
- [Tools — Practical Reference Guides](../index.md)
- [Docker & Docker Compose](../docker/index.md)
- [CI/CD Approaches](../../ci-cd-approaches/index.md)
- [Test Automation Framework](../../test-automation-framework/index.md)
