---
date: 2026-09-03
tags:
  - tools
  - docker
---

# Docker — Commands & Fundamentals

## Image Commands


```bash
docker build -t myapp:1.0 .                          # Build from Dockerfile in current dir
docker build -f Dockerfile.prod -t myapp:prod .       # Build from specific Dockerfile
docker build --no-cache -t myapp:fresh .              # Build without layer cache
docker build --platform linux/amd64 -t myapp .        # Cross-platform build

docker images                                         # List local images
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"

docker tag myapp:1.0 registry.io/myapp:1.0            # Tag for remote registry
docker push registry.io/myapp:1.0                     # Push to registry
docker pull nginx:alpine                              # Pull from registry

docker image inspect myapp:1.0                        # Image metadata (layers, env, cmd)
docker history myapp:1.0                              # Layer-by-layer build history
docker image prune                                    # Remove dangling images
docker image prune -a                                 # Remove all unused images
```


## Container Lifecycle


```bash
docker run -d --name web -p 8080:80 nginx:alpine      # Detached, named, port-mapped
docker run -it --rm ubuntu:24.04 /bin/bash             # Interactive, auto-remove on exit
docker run -d --restart unless-stopped myapp:1.0       # Auto-restart policy
docker run -d -e DB_HOST=localhost -e DB_PORT=5432 myapp  # Environment variables
docker run -d --env-file .env myapp:1.0                # Env from file

docker ps                                              # Running containers
docker ps -a                                           # All containers (incl. stopped)
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

docker stop web                                        # Graceful stop (SIGTERM → SIGKILL)
docker stop -t 30 web                                  # 30s grace period before SIGKILL
docker kill web                                        # Immediate SIGKILL
docker start web                                       # Start stopped container
docker restart web                                     # Stop + start

docker rm web                                          # Remove stopped container
docker rm -f web                                       # Force remove (even running)
docker container prune                                 # Remove all stopped containers
```


## Exec, Logs, Copy

```bash
docker exec -it web /bin/sh                            # Open shell in running container
docker exec web cat /etc/nginx/nginx.conf              # Run single command
docker exec -u root web apt update                     # Run as specific user

docker logs web                                        # All logs
docker logs -f web                                     # Follow (tail -f)
docker logs --since 10m web                            # Last 10 minutes
docker logs --tail 100 web                             # Last 100 lines
docker logs -f --since 5m web 2>&1 | grep ERROR        # Filter recent errors

docker cp web:/app/data.json ./data.json               # Copy from container
docker cp ./config.yaml web:/app/config.yaml           # Copy to container
```

## Inspect & Stats


```bash
docker inspect web                                     # Full container JSON metadata
docker inspect --format '{{.State.Status}}' web        # Single field
docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' web

docker stats                                           # Live resource usage (all)
docker stats web                                       # Single container
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"

docker top web                                         # Processes inside container
docker diff web                                        # Filesystem changes vs image
docker port web                                        # Port mappings
```


## System & Cleanup

```bash
docker system df                                       # Disk usage breakdown
docker system df -v                                    # Detailed per-image/container
docker system prune                                    # Remove stopped + dangling
docker system prune -a --volumes                       # Remove everything unused
docker system info                                     # Engine version, storage driver, etc.

docker volume ls                                       # List volumes
docker volume prune                                    # Remove unused volumes
docker network ls                                      # List networks
docker network prune                                   # Remove unused networks
```

## Registry & Multi-Platform

```bash
docker login registry.io                               # Authenticate
docker logout registry.io                              # Remove credentials

docker buildx create --use --name multiarch            # Create multi-platform builder
docker buildx build --platform linux/amd64,linux/arm64 \
  -t registry.io/myapp:1.0 --push .                   # Multi-arch build + push
docker buildx ls                                       # List builders
docker manifest inspect registry.io/myapp:1.0          # Inspect multi-arch manifest
```
