---
date: 2026-09-08
tags:
  - tools
  - kubernetes
---

# kubectl Fundamentals

## Installation

```bash
# Linux (latest stable)
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl && sudo mv kubectl /usr/local/bin/

# macOS (Homebrew)
brew install kubectl

# Verify
kubectl version --client
```

---

## Contexts and Clusters

kubectl uses `~/.kube/config` (kubeconfig) to connect to clusters. A **context** binds a cluster, user, and namespace.

| Task | Command |
|------|---------|
| List contexts | `kubectl config get-contexts` |
| Current context | `kubectl config current-context` |
| Switch context | `kubectl config use-context <name>` |
| Set namespace | `kubectl config set-context --current --namespace=<ns>` |
| View config | `kubectl config view --minify` |

### Multiple Kubeconfigs

```bash
export KUBECONFIG=~/.kube/config:~/.kube/staging-config
kubectl config get-contexts
```

---

## Namespaces

Namespaces provide resource isolation within a cluster.

| Task | Command |
|------|---------|
| List namespaces | `kubectl get namespaces` |
| Create namespace | `kubectl create namespace staging` |
| Delete namespace | `kubectl delete namespace staging` |
| All pods in namespace | `kubectl get pods -n staging` |
| All pods everywhere | `kubectl get pods -A` |

Default namespaces: `default`, `kube-system` (control plane), `kube-public`, `kube-node-lease`.

---

## Resource Types

| Category | Resources |
|----------|-----------|
| **Workloads** | Pod, Deployment, ReplicaSet, StatefulSet, DaemonSet, Job, CronJob |
| **Networking** | Service, Ingress, NetworkPolicy, EndpointSlice |
| **Config** | ConfigMap, Secret |
| **Storage** | PersistentVolume (PV), PersistentVolumeClaim (PVC), StorageClass |
| **Access** | ServiceAccount, Role, ClusterRole, RoleBinding, ClusterRoleBinding |
| **Scaling** | HorizontalPodAutoscaler (HPA), VerticalPodAutoscaler (VPA) |

Discover all: `kubectl api-resources --sort-by=kind`.

---

## CRUD Operations

### Create / Apply

```bash
kubectl apply -f resource.yaml        # declarative (preferred)
kubectl create -f resource.yaml       # imperative (fails if exists)
kubectl create deploy nginx --image=nginx:1.27 --replicas=3
```

### Read

```bash
kubectl get pods                       # list pods
kubectl get pods -o wide               # with node/IP info
kubectl get pods -o yaml               # full YAML output
kubectl get pods -o json               # JSON output
kubectl get pods -l app=web            # filter by label
kubectl get pods --field-selector=status.phase=Running
kubectl describe pod <name>            # detailed info + events
```

### Update

```bash
kubectl apply -f updated.yaml          # declarative update
kubectl edit deploy/<name>             # edit live resource
kubectl set image deploy/<name> app=nginx:1.28
kubectl patch deploy/<name> -p '{"spec":{"replicas":5}}'
kubectl label pod <name> env=prod      # add label
kubectl annotate pod <name> note="v2"  # add annotation
```

### Delete

```bash
kubectl delete -f resource.yaml
kubectl delete pod <name>
kubectl delete pod <name> --grace-period=0 --force  # immediate
kubectl delete pods -l app=test        # by label
```

---

## Output Formats

| Flag | Output |
|------|--------|
| (default) | Human-readable table |
| `-o wide` | Table with extra columns (node, IP) |
| `-o yaml` | Full YAML definition |
| `-o json` | Full JSON definition |
| `-o name` | Resource names only (e.g. `pod/nginx-abc`) |
| `-o jsonpath='{.items[*].metadata.name}'` | Custom JSONPath extraction |
| `--sort-by=.metadata.creationTimestamp` | Sort by field |

---

## Useful Aliases and Shortcuts

```bash
alias k='kubectl'
alias kgp='kubectl get pods'
alias kgd='kubectl get deploy'
alias kgs='kubectl get svc'
alias kaf='kubectl apply -f'
alias kdf='kubectl delete -f'
alias kdp='kubectl describe pod'
alias kl='kubectl logs -f --tail=100'
alias kx='kubectl exec -it'

# Enable shell completion (bash)
source <(kubectl completion bash)
echo 'source <(kubectl completion bash)' >> ~/.bashrc
complete -o default -F __start_kubectl k
```

---

## Dry Run and Diff

```bash
# Preview what would be created (no actual changes)
kubectl apply -f deploy.yaml --dry-run=client -o yaml

# Server-side dry run (validates against API server)
kubectl apply -f deploy.yaml --dry-run=server

# Show diff between local file and live cluster state
kubectl diff -f deploy.yaml
```

---

---

## See also
- [Kubernetes Overview](index.md)
- [Workloads & Scheduling](02-workloads-scheduling.md)
- [Git Commands & Fundamentals](../git/01-commands-fundamentals.md)
- [Linux Terminal](../linux-terminal/index.md)
