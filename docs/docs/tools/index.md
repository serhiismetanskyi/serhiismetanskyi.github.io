---
date: 2026-09-03
tags:
  - tools
---

# Tools — Practical Reference Guides

Hands-on command references, configuration patterns, and best practices for the tools a software engineer uses daily.

## Docker & Docker Compose

| Resource | Topics |
|------|--------|
| [Overview](./docker/index.md) | Architecture, lifecycle, ecosystem, when to containerize |
| [Commands & Fundamentals](./docker/01-commands-fundamentals.md) | Image/container lifecycle, exec, logs, inspect, system cleanup |
| [Dockerfile Best Practices](./docker/02-dockerfile-best-practices.md) | Multi-stage builds, layer caching, base images, ARG/ENV, `.dockerignore` |
| [Docker Compose](./docker/03-docker-compose.md) | Service definitions, profiles, overrides, depends_on, healthchecks |
| [Networking & Volumes](./docker/04-networking-volumes.md) | Bridge/host/overlay networks, DNS, named volumes, bind mounts, tmpfs |
| [Security & Production](./docker/05-security-production.md) | Non-root, secrets, resource limits, image scanning, production checklist |
| [Debugging & Troubleshooting](./docker/06-debugging-troubleshooting.md) | Connectivity tests, log analysis, netshoot, compose diagnostics |

## Git

| Resource | Topics |
|------|--------|
| [Overview](./git/index.md) | Object model, three-area workflow, distributed architecture |
| [Commands & Fundamentals](./git/01-commands-fundamentals.md) | Init, add, commit, push, pull, log, diff, tags, cleanup |
| [Branching Strategies](./git/02-branching-strategies.md) | GitHub Flow, Gitflow, Trunk-Based, merge vs rebase vs squash |
| [Commit Conventions](./git/03-commit-conventions.md) | Conventional Commits, message rules, PR best practices, code review |
| [Advanced Workflows](./git/04-advanced-workflows.md) | Interactive rebase, stash, cherry-pick, worktree, submodules |
| [Hooks & Configuration](./git/05-hooks-configuration.md) | Pre-commit framework, native hooks, .gitignore, aliases, global config |
| [Troubleshooting & Recovery](./git/06-troubleshooting-recovery.md) | Undo, reset, reflog, bisect, conflict resolution |

## Linux Terminal

| Resource | Topics |
|------|--------|
| [Overview](./linux-terminal/index.md) | Essential Linux terminal commands for daily user tasks |
| [Navigation & File Operations](./linux-terminal/01-navigation-files.md) | `pwd`, `ls`, `cd`, `mkdir`, `cp`, `mv`, `rm`, `cat`, `nano`, `sudo`, `chmod`, `tar` |
| [Search & Text Processing](./linux-terminal/02-search-text-processing.md) | `find`, `grep`, `rg`, `sort`, `uniq`, `wc`, pipes, redirects |
| [Processes & System Monitoring](./linux-terminal/03-processes-system-monitoring.md) | `ps`, `top`, `kill`, `systemctl`, `journalctl`, `free`, `df` |
| [Network Basics](./linux-terminal/04-network-ssh-downloads.md) | `ip`, `ss`, `ping`, `curl`, `wget`, `ssh`, `scp`, `netstat` (legacy) |
| [Administration & Scripting](./linux-terminal/05-admin-scripting.md) | `apt`, user/group mgmt, `.bashrc`, bash scripting, `cal`, `date` |

## Kubernetes (K8s)

| Resource | Topics |
|------|--------|
| [Overview](./kubernetes/index.md) | Architecture, control plane, nodes, Pods, quick reference |
| [kubectl Fundamentals](./kubernetes/01-kubectl-fundamentals.md) | Commands, contexts, namespaces, output formats, aliases |
| [Workloads & Scheduling](./kubernetes/02-workloads-scheduling.md) | Pods, Deployments, StatefulSets, DaemonSets, Jobs, CronJobs |
| [Services & Networking](./kubernetes/03-services-networking.md) | ClusterIP, NodePort, LoadBalancer, Ingress, NetworkPolicies |
| [Configuration & Storage](./kubernetes/04-config-storage.md) | ConfigMaps, Secrets, PVs, PVCs, StorageClasses |
| [Helm & Deployment Strategies](./kubernetes/05-helm-deployments.md) | Helm charts, Kustomize, rolling update, canary, blue-green |
| [Security & Observability](./kubernetes/06-security-observability.md) | RBAC, Pod Security, Prometheus, Grafana, EFK, debugging |

---
## See also
- [Digital Garden: Knowledge Base](../index.md)
- [CI/CD](../ci-cd-approaches/index.md)
- [Test Automation Framework](../test-automation-framework/index.md)
- [Code Quality & CI/CD](../python-guide/05-quality-cicd/index.md)
- [uv — Fast Python Project Manager](../libs/uv/index.md)

