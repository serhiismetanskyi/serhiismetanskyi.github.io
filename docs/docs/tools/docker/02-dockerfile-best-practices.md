---
date: 2026-09-04
tags:
  - tools
  - docker
---

# Docker — Dockerfile Best Practices

## Multi-Stage Builds

Separate build-time dependencies from the final runtime image. Reduces size by 80–97%.

```dockerfile
# Stage 1: Build — install all deps including build tools
FROM python:3.13-slim AS builder
WORKDIR /app
RUN pip install --no-cache-dir uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --compile-bytecode

# Stage 2: Production — only runtime, no build tools
FROM python:3.13-slim AS production
WORKDIR /app
RUN groupadd -r appgrp && useradd -r -g appgrp appusr
COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app /app
ENV PATH="/app/.venv/bin:$PATH"
USER appusr
CMD ["python", "-m", "myapp"]
```

### Go Distroless Example

```dockerfile
FROM golang:1.23-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -trimpath -o /server ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /server /server
USER nonroot:nonroot
ENTRYPOINT ["/server"]
```

## Layer Caching Strategy

Order instructions from **least to most frequently changing**:

```
1. Base image          (rarely changes)
2. System packages     (weekly)
3. Dependency files    (per feature)
4. Dependencies install
5. Source code         (every commit)  ← cache breaks here
6. Build step
```

```dockerfile
FROM python:3.13-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
```

## Base Image Selection

| Image | Size | Shell | Use Case |
|-------|------|-------|----------|
| `scratch` | 0 MB | No | Static Go/Rust binaries |
| `distroless` | 2–20 MB | No | Production services |
| `alpine` | 5 MB | Yes | When shell needed |
| `*-slim` | 50–80 MB | Yes | When glibc required |
| `ubuntu/debian` | 100+ MB | Yes | Dev, debugging |

**Rule of thumb:** Use `alpine` or `*-slim` for dev/CI, `distroless` or `scratch` for production.

## .dockerignore

Always create `.dockerignore` to exclude unnecessary files from the build context:

```
.git
.gitignore
__pycache__
*.pyc
.env
.env.*
.vscode
.idea
*.md
tests/
docs/
docker-compose*.yml
Dockerfile*
.dockerignore
coverage/
.pytest_cache
.mypy_cache
.ruff_cache
```

## ARG vs ENV

| Directive | Available at | Persists in image | Use for |
|-----------|-------------|-------------------|---------|
| `ARG` | Build time only | No | Build-time config (versions, flags) |
| `ENV` | Build + runtime | Yes | Runtime config (app settings) |

```dockerfile
ARG PYTHON_VERSION=3.13
FROM python:${PYTHON_VERSION}-slim

ARG APP_VERSION=unknown
ENV APP_VERSION=${APP_VERSION}
ENV PYTHONUNBUFFERED=1
```

## RUN Best Practices

```dockerfile
# Combine related commands to reduce layers
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Use cache mounts for package managers (BuildKit)
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt

# Use bind mounts to avoid COPY for build-only files
RUN --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    uv sync --frozen --no-dev
```

## ENTRYPOINT vs CMD

| Directive | Purpose | Overridable |
|-----------|---------|-------------|
| `ENTRYPOINT` | The executable | Only with `--entrypoint` |
| `CMD` | Default arguments | Overridden by `docker run ... args` |

```dockerfile
ENTRYPOINT ["python", "-m", "myapp"]
CMD ["--port", "8000"]
# docker run myapp                  → python -m myapp --port 8000
# docker run myapp --port 9000      → python -m myapp --port 9000
```

**Always use exec form** (`["cmd", "arg"]`), not shell form (`cmd arg`), to ensure proper signal handling.

## HEALTHCHECK

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1
```

## Checklist

- Multi-stage build separates builder from runtime
- Non-root user created and activated with `USER`
- `.dockerignore` excludes irrelevant files
- Dependencies copied and installed before source code
- `HEALTHCHECK` defined
- No secrets in build args or ENV
- Exec form for `ENTRYPOINT`/`CMD`
- Minimal base image for production stage
- `--no-cache-dir` for pip or `uv sync --frozen` for uv
