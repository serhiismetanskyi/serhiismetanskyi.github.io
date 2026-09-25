---
date: 2026-09-04
tags:
  - tools
  - docker
---

# Docker — Debugging & Troubleshooting

## Container Won't Start


```bash
docker logs myapp                                # Check startup errors
docker logs --tail 50 myapp                      # Last 50 lines
docker inspect myapp --format '{{.State.ExitCode}}'   # Exit code
docker inspect myapp --format '{{.State.Error}}'       # Error message
docker inspect myapp --format '{{json .State}}' | jq   # Full state
```


| Exit Code | Meaning |
|-----------|---------|
| 0 | Normal exit |
| 1 | Application error |
| 137 | OOM killed (SIGKILL) or `docker kill` |
| 139 | Segfault (SIGSEGV) |
| 143 | Graceful shutdown (SIGTERM) |

### OOM Diagnosis


```bash
docker inspect myapp --format '{{.State.OOMKilled}}'   # true = out of memory
docker stats --no-stream myapp                          # Check memory usage
# Fix: increase memory limit in compose deploy.resources.limits.memory
```


## Network Debugging

### DNS & Connectivity

```bash
docker compose exec api nslookup db                    # DNS resolution
docker compose exec api ping -c 3 db                   # ICMP connectivity
docker compose exec api curl -v http://db:5432         # TCP connectivity
docker compose exec api nc -zv db 5432                 # Port check (netcat)
docker compose exec api timeout 5 bash -c 'cat < /dev/tcp/db/5432'  # Alt port check
```

### Network Inspection


```bash
docker network ls                                      # List networks
docker network inspect mynet                           # Subnet, gateway, containers

# Show IP of every container on a network
docker network inspect mynet \
  --format '{{range .Containers}}{{.Name}}: {{.IPv4Address}}{{"\n"}}{{end}}'

# Check which networks a container belongs to
docker inspect myapp --format '{{json .NetworkSettings.Networks}}' | jq
```


### Netshoot Debug Container

When the application container has no shell or networking tools:

```bash
# Attach to same network
docker run --rm -it --network mynet nicolaka/netshoot

# Attach to container's network namespace directly
docker run --rm -it --network container:myapp nicolaka/netshoot

# Inside netshoot — full toolkit available:
# ping, curl, dig, nslookup, traceroute, tcpdump, ss, ip, iftop
```

## Log Analysis

```bash
docker logs -f myapp                                   # Follow live
docker logs --since 2026-03-31T10:00:00 myapp          # Since timestamp (RFC3339)
docker logs --since 30m myapp                           # Last 30 minutes
docker logs -f myapp 2>&1 | grep -i error              # Filter errors
docker logs -f myapp 2>&1 | grep -i -E "error|warn"    # Errors + warnings

# Compose: all services
docker compose logs -f
docker compose logs -f --since 10m api db
```

### Log File Location


```bash
# Find log file path
docker inspect myapp --format '{{.LogPath}}'

# Check log file size
ls -lh $(docker inspect myapp --format '{{.LogPath}}')

# Truncate logs (emergency — stops log collection temporarily)
truncate -s 0 $(docker inspect myapp --format '{{.LogPath}}')
```


## Filesystem & Process Debugging

```bash
docker exec -it myapp /bin/sh                          # Shell into container
docker exec -it myapp ls -la /app                      # List files
docker exec -it myapp cat /etc/os-release              # Check base OS
docker exec -it myapp env                              # Environment variables

docker top myapp                                       # Processes (from host)
docker exec myapp ps aux                               # Processes (from container)

docker diff myapp                                      # Filesystem changes vs image
# A = added, C = changed, D = deleted
```

## Resource Issues


```bash
docker stats                                           # Live CPU / memory / IO
docker stats --no-stream --format \
  "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}"

docker system df                                       # Disk usage by type
docker system df -v                                    # Per-image/container breakdown

# Disk full? Clean up:
docker system prune -a --volumes                       # Remove everything unused
docker image prune -a                                  # Remove unused images
docker volume prune                                    # Remove unused volumes
docker builder prune                                   # Clear build cache
```


## Compose-Specific Debugging


```bash
docker compose config                                  # Validate and show resolved YAML
docker compose config --services                       # List service names
docker compose ps                                      # Service status + ports
docker compose top                                     # Processes across all services

# Recreate specific service (picks up config changes)
docker compose up -d --force-recreate api

# Rebuild and restart
docker compose up -d --build api

# Check why a service keeps restarting
docker compose logs --tail 20 api
docker inspect $(docker compose ps -q api) --format '{{.RestartCount}}'
```


## Build & Health Debugging


```bash
docker build --progress=plain -t myapp .               # Verbose build output
docker build --target builder -t myapp:builder .       # Build specific stage
docker history myapp:latest                            # Layer history
docker run --rm -it myapp:builder /bin/sh              # Enter build stage
docker builder prune -a                                # Clear build cache

docker inspect myapp --format '{{json .State.Health}}' | jq  # Health status
docker exec myapp curl -f http://localhost:8000/health       # Manual check
```


## Troubleshooting Decision Tree

```
Container won't start?
├── Check: docker logs myapp
├── Exit 137? → OOM → increase memory limit
├── Exit 1? → App error → check logs for stack trace
└── Permission denied? → Check USER + volume ownership

Can't connect to service?
├── docker compose ps → is it running?
├── nslookup <service> → DNS resolves?
├── nc -zv <host> <port> → port open?
├── docker network inspect → same network?
└── Check firewall / security groups

Performance issues?
├── docker stats → CPU/memory usage
├── docker system df → disk pressure
├── docker logs → error loops / retries
└── docker top myapp → runaway processes

Build slow?
├── Layer caching → deps before source code
├── .dockerignore → exclude unnecessary files
├── BuildKit → DOCKER_BUILDKIT=1
└── Cache mounts → --mount=type=cache
```
