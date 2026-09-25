---
date: 2026-09-04
tags:
  - tools
  - docker
---

# Docker — Docker Compose

## Compose File Structure

`compose.yaml` (preferred name since Compose v2; `version` field is deprecated):

```yaml
services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    ports:
      - "8000:8000"
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 10s
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 512M

  db:
    image: postgres:17-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: myapp
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U myapp"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  pgdata:

secrets:
  db_password:
    file: ./secrets/db_password.txt
```

> `deploy.*` support is platform/implementation dependent. For local Docker Engine, use and verify it carefully with `docker compose config` and runtime checks (`docker stats`).
## Essential Commands

```bash
docker compose up -d                            # Start all services detached
docker compose up -d --build                    # Rebuild images before starting
docker compose up -d api                        # Start specific service + deps
docker compose down                             # Stop and remove containers/networks
docker compose down -v                          # Also remove volumes (data loss!)
docker compose down --rmi all                   # Also remove images

docker compose ps                               # Service status
docker compose logs -f                          # Follow all logs
docker compose logs -f api                      # Follow specific service
docker compose logs --since 5m api              # Recent logs

docker compose exec api /bin/sh                 # Shell into running service
docker compose run --rm api python manage.py migrate  # One-off command

docker compose restart api                      # Restart single service
docker compose stop                             # Stop without removing
docker compose pull                             # Pull latest images
docker compose config                           # Validate and print resolved config
```

## Profiles — Conditional Services

Assign `profiles: [debug]` to optional services; they start only when explicitly activated:

```bash
docker compose up -d                            # Only services without profiles
docker compose --profile debug up -d            # Include debug-profiled services
docker compose --profile debug --profile monitoring up -d  # Multiple profiles
```

## Multiple Compose Files (Overrides)

```
compose.yaml              ← base
compose.override.yaml     ← dev overrides (auto-loaded)
compose.production.yaml   ← production overrides
compose.test.yaml         ← test overrides
```

```yaml
# compose.yaml (base)
services:
  api:
    build: .
    restart: unless-stopped

# compose.override.yaml (dev — auto-loaded)
services:
  api:
    volumes:
      - .:/app
    environment:
      - DEBUG=true
    ports:
      - "8000:8000"

# compose.production.yaml
services:
  api:
    image: registry.io/myapp:latest
    environment:
      - DEBUG=false
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: "2.0"
          memory: 1G
```

```bash
docker compose up -d                                          # base + override (dev)
docker compose -f compose.yaml -f compose.production.yaml up -d  # base + prod
```

## depends_on Conditions

| Condition | Meaning |
|-----------|---------|
| `service_started` | Container started (default) |
| `service_healthy` | Healthcheck passes |
| `service_completed_successfully` | Container exits with code 0 |

```yaml
services:
  api:
    build: .
    depends_on:
      db:
        condition: service_healthy
      migrations:
        condition: service_completed_successfully

  migrations:
    build: .                                    # image or build required
    command: ["python", "manage.py", "migrate"]
    depends_on:
      db:
        condition: service_healthy
```

## Watch Mode (Live Reload)

```yaml
services:
  api:
    build: .
    develop:
      watch:
        - action: sync
          path: ./src
          target: /app/src
        - action: rebuild
          path: package.json
```

```bash
docker compose watch                           # Start with file-sync hot reload
```

| Action | Behavior |
|--------|----------|
| `sync` | File changes synced into container (no rebuild) |
| `rebuild` | Container rebuilt on file change |
| `sync+restart` | Sync files and restart container process |

## Environment Variables

Priority (highest → lowest): CLI `-e` → shell env → `.env` file → `env_file` → `environment` → Dockerfile `ENV`.

```yaml
services:
  api:
    env_file: [.env, .env.local]
    environment:
      LOG_LEVEL: info
      DB_HOST: db
```
