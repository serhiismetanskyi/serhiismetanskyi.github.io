---
date: 2026-09-03
tags:
  - tools
  - docker
---

# Docker & Docker Compose — Overview

## What Is Docker

Docker packages applications and their dependencies into lightweight, portable **containers** that run consistently across any environment.

```
Developer Machine ──► Docker Image ──► Container (any host)
```

| Concept | Description |
|---------|-------------|
| **Image** | Read-only template with app code, runtime, libraries, config |
| **Container** | Running instance of an image with its own filesystem and network |
| **Dockerfile** | Text recipe that defines how to build an image |
| **Registry** | Storage for images (Docker Hub, GHCR, ECR, GCR) |
| **Compose** | Tool for defining and running multi-container applications |

## Docker vs Virtual Machines

| Aspect | Container | Virtual Machine |
|--------|-----------|-----------------|
| Isolation | Process-level (shared kernel) | Full OS (hypervisor) |
| Size | MBs (10–200 MB typical) | GBs (2–20 GB) |
| Start time | Seconds | Minutes |
| Overhead | Minimal | Significant |
| Density | Hundreds per host | Tens per host |
| Use case | Microservices, CI/CD, dev envs | Legacy apps, full OS isolation |

## Container Lifecycle

```
Dockerfile ──build──► Image ──run──► Container
                        │                │
                        │            stop / kill
                        │                │
                    push/pull        rm (remove)
                        │
                    Registry
```

| State | Description |
|-------|-------------|
| **Created** | Container exists but has not started |
| **Running** | Process is active |
| **Paused** | Process frozen (SIGSTOP) |
| **Stopped** | Process exited, filesystem preserved |
| **Removed** | Container and its writable layer deleted |

## Docker Architecture

```
CLI (docker) ──REST API──► Docker Daemon (dockerd)
                                │
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
              containerd    BuildKit    Networking
                    │
                    ▼
                  runc (OCI runtime)
```

- **CLI** — user-facing commands
- **Daemon (dockerd)** — manages images, containers, volumes, networks
- **containerd** — container runtime (manages lifecycle)
- **runc** — low-level OCI runtime that spawns the container process
- **BuildKit** — modern build engine (parallel builds, cache mounts)

## When to Containerize

| Good Fit | Poor Fit |
|----------|----------|
| Microservices | GUI desktop apps |
| CI/CD pipelines | Kernel-dependent workloads |
| Dev environment parity | Bare-metal performance (GPU training) |
| Multi-language polyglot stacks | Single static binary with no deps |
| Reproducible test environments | Quick throwaway scripts |

## Section Map

| File | Topics |
|------|--------|
| [01 — Commands & Fundamentals](./01-commands-fundamentals.md) | Image/container lifecycle, exec, logs, inspect, cleanup |
| [02 — Dockerfile Best Practices](./02-dockerfile-best-practices.md) | Multi-stage builds, layer caching, base images, ARG/ENV |
| [03 — Docker Compose](./03-docker-compose.md) | Services, profiles, overrides, healthchecks, compose patterns |
| [04 — Networking & Volumes](./04-networking-volumes.md) | Bridge/host/overlay, DNS, named volumes, bind mounts |
| [05 — Security & Production](./05-security-production.md) | Non-root, secrets, scanning, resource limits, checklist |
| [06 — Debugging & Troubleshooting](./06-debugging-troubleshooting.md) | Connectivity, logs, netshoot, compose diagnostics |

## Cheat Sheet

### Images & Containers ([01](./01-commands-fundamentals.md))

| Task | Command |
|------|---------|
| Build image | `docker build -t name:tag .` |
| Run detached | `docker run -d --name X -p HOST:CTR image` |
| Shell into container | `docker exec -it X /bin/sh` |
| View logs (follow) | `docker logs -f X` |
| Stop container | `docker stop X` |
| Remove container | `docker rm X` |
| List images | `docker images` |
| Inspect metadata | `docker inspect X` |
| Check disk usage | `docker system df` |
| Clean everything | `docker system prune -a --volumes` |

### Compose ([03](./03-docker-compose.md))

| Task | Command |
|------|---------|
| Start services | `docker compose up -d` |
| Stop services | `docker compose down` |
| Stop + remove volumes | `docker compose down -v` |
| Rebuild + start | `docker compose up -d --build` |
| View service logs | `docker compose logs -f service` |
| Run one-off command | `docker compose exec service cmd` |

### Networking & Volumes ([04](./04-networking-volumes.md))

| Task | Command |
|------|---------|
| Create network | `docker network create mynet` |
| List networks | `docker network ls` |
| List volumes | `docker volume ls` |
| Backup volume | `docker run --rm -v name:/data -v $(pwd):/bak alpine tar czf /bak/bak.tar.gz /data` |
| Read-only bind mount | `./conf:/app/conf:ro` |

### Debugging ([06](./06-debugging-troubleshooting.md))

| Task | Command |
|------|---------|
| Check container IP | `docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' X` |
| Test connectivity | `docker run --rm --network=mynet nicolaka/netshoot curl http://svc:port` |
| Container resource stats | `docker stats` |

---
## See also
- [Tools — Practical Reference Guides](../index.md)
- [Kubernetes (K8s)](../kubernetes/index.md)
- [CI/CD](../../ci-cd-approaches/index.md)
- [Test Automation Framework](../../test-automation-framework/index.md)
- [uv — Fast Python Project Manager](../../libs/uv/index.md)
