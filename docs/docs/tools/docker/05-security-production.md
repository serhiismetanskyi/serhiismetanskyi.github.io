---
date: 2026-09-04
tags:
  - tools
  - docker
  - security
---

# Docker — Security & Production

## Non-Root Containers

Running as root inside a container = running as root on the host (if the container escapes).

```dockerfile
# Create and switch to non-root user
RUN groupadd -r appgrp && useradd -r -g appgrp -u 1000 appusr
RUN chown -R appusr:appgrp /app
USER appusr
```

```dockerfile
# Alpine variant
RUN addgroup -S appgrp && adduser -S appusr -G appgrp
USER appusr
```

```dockerfile
# Distroless — built-in nonroot user (UID 65532)
FROM gcr.io/distroless/static-debian12:nonroot
USER nonroot:nonroot
```

Verify at runtime:

```bash
docker exec myapp whoami                         # Should NOT print "root"
docker exec myapp id                             # Check UID/GID
```

## Secrets Management

**Never put secrets in:**
- `ENV` or `ARG` in Dockerfile (visible in `docker inspect`)
- Docker image layers
- Git-tracked `.env` files

### Docker Secrets (Compose)

```yaml
services:
  api:
    secrets:
      - db_password
      - api_key
    environment:
      DB_PASSWORD_FILE: /run/secrets/db_password

secrets:
  db_password:
    file: ./secrets/db_password.txt
  api_key:
    environment: API_KEY_VALUE
```

Application reads from `/run/secrets/<name>` (mounted as tmpfs, in-memory only).

### BuildKit Secret Mounts

```dockerfile
# Secret available only during build, never stored in layer
RUN --mount=type=secret,id=pip_conf,target=/root/.config/pip/pip.conf \
    pip install --no-cache-dir -r requirements.txt
```

```bash
docker build --secret id=pip_conf,src=pip.conf -t myapp .
```

## Image Scanning

```bash
docker scout cves myapp:latest                   # Docker Scout (built-in)
docker scout recommendations myapp:latest        # Upgrade suggestions

trivy image myapp:latest                         # Trivy (popular open-source)
trivy image --severity HIGH,CRITICAL myapp:latest

grype myapp:latest                               # Grype (Anchore)
```

Integrate scanning in CI — fail builds on HIGH/CRITICAL vulnerabilities.

## Read-Only Filesystem

```yaml
services:
  api:
    read_only: true
    tmpfs:
      - /tmp
      - /app/cache
```

Container filesystem is immutable; only `/tmp` and `/app/cache` are writable.

## Resource Limits

```yaml
services:
  api:
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 512M
        reservations:
          cpus: "0.25"
          memory: 128M
```

```bash
docker run -d --cpus 1.0 --memory 512m myapp     # CLI equivalent
docker stats --no-stream                          # Verify limits are applied
```

Without limits, a single container can consume all host resources.

## Capabilities & Security Options

```yaml
services:
  api:
    cap_drop:
      - ALL                  # Drop all Linux capabilities
    cap_add:
      - NET_BIND_SERVICE     # Add only what's needed
    security_opt:
      - no-new-privileges:true
```

**Principle of least privilege:** Drop all capabilities, add back only required ones.

## Logging in Production


```yaml
services:
  api:
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "5"
        tag: "{{.Name}}"
```


Without `max-size`, logs grow unbounded and fill disk.

| Driver | Use Case |
|--------|----------|
| `json-file` | Default, local debugging |
| `syslog` | Centralized syslog server |
| `fluentd` | EFK stack |
| `awslogs` | AWS CloudWatch |
| `gcplogs` | GCP Cloud Logging |

## Restart Policies

| Policy | Behavior |
|--------|----------|
| `no` | Never restart (default) |
| `always` | Always restart (survives daemon restarts, even after `docker stop`) |
| `unless-stopped` | Restart unless explicitly stopped; does not restart after `docker stop` |
| `on-failure` | Restart only on non-zero exit code |

```yaml
services:
  api:
    restart: unless-stopped
  worker:
    restart: on-failure:5      # max retries in regular restart policy
```

## Production Checklist

| Area | Check |
|------|-------|
| **User** | Non-root user in Dockerfile |
| **Image** | Minimal base (distroless / alpine / slim) |
| **Secrets** | No secrets in ENV/ARG/layers |
| **Scanning** | CI scans for HIGH/CRITICAL CVEs |
| **Resources** | CPU + memory limits set |
| **Logging** | Log rotation configured (max-size/max-file) |
| **Restart** | `unless-stopped` or `on-failure` |
| **Health** | Healthcheck defined |
| **Filesystem** | `read_only: true` where possible |
| **Capabilities** | `cap_drop: ALL` + minimal `cap_add` |
| **Privileges** | `no-new-privileges: true` |
| **Network** | Custom bridge, multi-network isolation |
| **Tags** | Pinned image versions (no `:latest` in prod) |
