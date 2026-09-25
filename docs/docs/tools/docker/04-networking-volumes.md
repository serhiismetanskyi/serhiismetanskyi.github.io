---
date: 2026-09-04
tags:
  - tools
  - docker
---

# Docker — Networking & Volumes

## Network Drivers

| Driver | Scope | Use Case |
|--------|-------|----------|
| **bridge** | Single host | Default; container-to-container on same host |
| **host** | Single host | Container shares host network stack (no isolation) |
| **none** | Single host | No networking (fully isolated) |
| **overlay** | Multi-host | Swarm / multi-node container communication |
| **macvlan** | Single host | Container appears as physical device on LAN |

## Bridge Networks

```bash
docker network create mynet                          # Create custom bridge
docker run -d --name api --network mynet myapp       # Attach on creation
docker network connect mynet existing-container      # Attach running container
docker network disconnect mynet existing-container   # Detach
```

### Default vs Custom Bridge

| Feature | Default bridge | Custom bridge |
|---------|---------------|---------------|
| DNS resolution | No (IP only) | Yes (by container name) |
| Isolation | All containers share it | Only connected containers |
| Auto-attach | Yes (if no `--network`) | Explicit |

**Always use custom bridge networks** — they provide automatic DNS and better isolation.

## DNS Resolution in Compose

Compose creates a default network; services resolve each other by **service name**:

```yaml
services:
  api:
    environment:
      DB_HOST: db           # resolves to db container IP
      REDIS_HOST: redis

  db:
    image: postgres:17-alpine

  redis:
    image: redis:7-alpine
```

```bash
docker compose exec api nslookup db              # Verify DNS resolution
docker compose exec api ping db                   # Test connectivity
```

## Network Commands


```bash
docker network ls                                    # List networks
docker network inspect mynet                         # Details (connected containers, subnet)
docker network inspect mynet --format '{{range .Containers}}{{.Name}} {{.IPv4Address}}{{"\n"}}{{end}}'
docker network prune                                 # Remove unused networks
```


## Exposing Ports

```yaml
services:
  api:
    ports:
      - "8080:8000"          # host:container — accessible from outside
      - "127.0.0.1:8080:8000"  # bind to localhost only
    expose:
      - "8000"               # internal only (no host mapping)
```

| Directive | Host access | Container-to-container | Notes |
|-----------|-------------|----------------------|-------|
| `ports` | Yes | Yes | Maps host port to container port |
| `expose` | No | Yes (same network) | Documentation only in Compose — does not restrict traffic |

## Volumes — Types

| Type | Managed by | Persistence | Performance | Use Case |
|------|-----------|-------------|-------------|----------|
| **Named volume** | Docker | Survives `rm` | Native | Database data, persistent state |
| **Bind mount** | Host | Host filesystem | Native | Dev: live code reload |
| **tmpfs** | Memory | Lost on stop | Fastest | Secrets, caches, temp files |

## Named Volumes

```yaml
services:
  db:
    image: postgres:17-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:                    # Docker manages location
```

```bash
docker volume ls                                     # List volumes
docker volume inspect pgdata                         # Location, driver, labels
docker volume rm pgdata                              # Delete (data loss!)
docker volume prune                                  # Remove all unused volumes
```

## Bind Mounts

```yaml
services:
  api:
    volumes:
      - ./src:/app/src                    # Read-write
      - ./config.yaml:/app/config.yaml:ro  # Read-only
```

**Dev vs Production rule:**
- **Dev:** Bind mounts for live reload
- **Production:** Named volumes (or baked into image)

## tmpfs Mounts

```yaml
services:
  api:
    tmpfs:
      - /tmp
      - /app/cache:size=100M
```

Stored in RAM — fast, ephemeral, good for caches and secrets at runtime.

## Volume Backup & Restore

```bash
# Backup named volume to tarball
docker run --rm -v pgdata:/data -v $(pwd):/backup alpine \
  tar czf /backup/pgdata-backup.tar.gz -C /data .

# Restore from tarball
docker run --rm -v pgdata:/data -v $(pwd):/backup alpine \
  sh -c "cd /data && tar xzf /backup/pgdata-backup.tar.gz"
```

## Multi-Network Isolation

```yaml
services:
  api:
    networks:
      - frontend
      - backend

  db:
    networks:
      - backend           # Not accessible from frontend

  nginx:
    networks:
      - frontend          # Cannot reach db directly

networks:
  frontend:
  backend:
```

```
nginx ──frontend──► api ──backend──► db
          ✗ nginx cannot reach db directly
```

## Volume Permissions

Common issue: container user cannot write to mounted volume.

```dockerfile
# In Dockerfile
RUN groupadd -r appgrp && useradd -r -g appgrp -u 1000 appusr
RUN mkdir -p /app/data && chown appusr:appgrp /app/data
USER appusr
```

```bash
# Or fix on host
sudo chown -R 1000:1000 ./data
```
