---
date: 2026-09-27
tags:
  - tools
  - observability
  - llm
  - phoenix
---

# Phoenix — Setup & Architecture

Phoenix is one Python process (FastAPI + gRPC) that serves the UI, the REST/GraphQL API and the OTLP collector, backed by SQLite or PostgreSQL.

## Architecture

```mermaid
flowchart LR
  subgraph Clients
    APP["App / agent<br/>OpenInference + OTel SDK"]
    TESTS["pytest suite<br/>phoenix.client + evals"]
    COL["OTel Collector<br/>(optional)"]
  end
  subgraph PX["Phoenix server"]
    HTTP[":6006<br/>UI, REST, GraphQL,<br/>OTLP HTTP /v1/traces"]
    GRPC[":4317<br/>OTLP gRPC"]
    PROM[":9090<br/>Prometheus metrics (opt-in)"]
    Q["Span queue<br/>→ bulk inserter"]
  end
  APP -- OTLP --> GRPC
  APP -- OTLP --> HTTP
  COL -- OTLP --> HTTP
  TESTS -- REST --> HTTP
  HTTP --> Q
  GRPC --> Q
  Q --> DB[("SQLite (~/.phoenix)<br/>or PostgreSQL ≥ 14")]
```

| Port | Protocol | Purpose |
|------|----------|---------|
| `6006` | HTTP | UI, REST API (`/v1/...`), GraphQL, OTLP HTTP at `/v1/traces` |
| `4317` | gRPC | OTLP gRPC collector |
| `9090` | HTTP | Prometheus metrics, only with `PHOENIX_ENABLE_PROMETHEUS=true` |

## Running Locally

```bash
uv add --dev arize-phoenix
uv run phoenix serve                                    # UI: http://localhost:6006

# Isolated instance: own SQLite file, custom ports, no product telemetry
PHOENIX_WORKING_DIR=/tmp/phx-run-42 \
PHOENIX_PORT=16006 PHOENIX_GRPC_PORT=14317 \
PHOENIX_TELEMETRY_ENABLED=false \
uv run phoenix serve
```

- Default storage: SQLite in `PHOENIX_WORKING_DIR` (defaults to `~/.phoenix`). Delete the directory to reset.
- `phoenix serve --with-trace-fixtures <names>` loads demo traces — useful to explore the UI without an app.
- Readiness probe: `GET /healthz` returns `OK`.

## Docker

```bash
docker run --rm -p 6006:6006 -p 4317:4317 arizephoenix/phoenix:latest

# Persistent SQLite in a volume
docker run -d --name phoenix \
  -p 6006:6006 -p 4317:4317 \
  -e PHOENIX_WORKING_DIR=/mnt/data \
  -v phoenix_data:/mnt/data \
  arizephoenix/phoenix:latest
```

!!! tip "Pin the tag"
    `latest` moves fast (major versions ship often). Pin `arizephoenix/phoenix:<version>` in CI and production and upgrade on purpose — the client packages check server capabilities and some methods require a minimum server version.

## Docker Compose with PostgreSQL

```yaml
# compose.yaml
services:
  phoenix:
    image: arizephoenix/phoenix:latest   # pin a version
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "6006:6006"   # UI + OTLP HTTP
      - "4317:4317"   # OTLP gRPC
    environment:
      PHOENIX_SQL_DATABASE_URL: postgresql://phoenix:phoenix@db:5432/phoenix
      PHOENIX_DEFAULT_RETENTION_POLICY_DAYS: "30"
      PHOENIX_TELEMETRY_ENABLED: "false"
  db:
    image: postgres:17
    environment:
      POSTGRES_USER: phoenix
      POSTGRES_PASSWORD: phoenix
      POSTGRES_DB: phoenix
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U phoenix"]
      interval: 5s
      retries: 10
    volumes:
      - pg_data:/var/lib/postgresql/data
volumes:
  pg_data:
```

| Storage | Use for | Notes |
|---------|---------|-------|
| SQLite | Local debugging, CI jobs, single user | Zero setup; mount a volume or it dies with the container |
| PostgreSQL | Shared team instance, production traces | Postgres ≥ 14; `PHOENIX_SQL_DATABASE_SCHEMA` for a dedicated schema |

Migrations run automatically on startup. Kubernetes deployments use the official Helm chart with the same env vars.

## Projects

A **project** groups traces (one app, one environment). Spans carry the project in the resource attribute `openinference.project.name`; unknown projects are created on the first span.

| How | Example |
|-----|---------|
| `register()` argument | `register(project_name="triage-ci")` |
| Environment | `PHOENIX_PROJECT_NAME=triage-ci` |
| Client API | `Client().projects.create(name="triage-ci", description="CI runs")` |
| Temporary switch (notebooks, evals) | `with dangerously_using_project("triage-evals"): ...` from `openinference.instrumentation` |

Naming convention for QA: `<app>-<env>` — `triage-dev`, `triage-ci`, `triage-staging`, `triage-prod`. Experiments get their own auto-created projects for task traces.

## Authentication

Auth is **off** by default — fine for localhost, never for a shared host.

```bash
PHOENIX_ENABLE_AUTH=true
PHOENIX_SECRET="a-32-plus-char-secret-with-digits-123456"   # signs JWTs; >= 32 chars, digit + lowercase
PHOENIX_DEFAULT_ADMIN_INITIAL_PASSWORD="change-me-now"       # first login: admin@localhost
PHOENIX_USE_SECURE_COOKIES=true                               # behind HTTPS
```

- Create **API keys** in the UI (Settings): system keys for CI and services, user keys for people.
- Clients send the key as a bearer token: `PHOENIX_API_KEY` is picked up by both `register()` and `Client()`.
- OAuth2/OIDC and LDAP are supported (`PHOENIX_OAUTH2_*`, `PHOENIX_LDAP_*`); roles: admin, member, viewer.

```python
import os
from phoenix.client import Client
from phoenix.otel import register

tracer_provider = register(project_name="triage-staging", batch=True)   # reads PHOENIX_API_KEY
client = Client(base_url=os.environ["PHOENIX_COLLECTOR_ENDPOINT"])      # same key, REST
```

## Server Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PHOENIX_HOST` / `PHOENIX_PORT` | `0.0.0.0` / `6006` | HTTP bind address |
| `PHOENIX_GRPC_PORT` | `4317` | OTLP gRPC port |
| `PHOENIX_WORKING_DIR` | `~/.phoenix` | SQLite file and exports |
| `PHOENIX_SQL_DATABASE_URL` | SQLite | `postgresql://user:pass@host/db` |
| `PHOENIX_HOST_ROOT_PATH` | — | Serve under a sub-path behind a reverse proxy |
| `PHOENIX_DEFAULT_RETENTION_POLICY_DAYS` | `0` (keep forever) | Default trace retention for new projects |
| `PHOENIX_ENABLE_PROMETHEUS` | `false` | Expose `:9090` metrics |
| `PHOENIX_MAX_SPANS_QUEUE_SIZE` | — | Reject ingest when the insert queue is full |
| `PHOENIX_TLS_ENABLED`, `PHOENIX_TLS_CERT_FILE`, `PHOENIX_TLS_KEY_FILE` | off | TLS on HTTP and gRPC |
| `PHOENIX_TELEMETRY_ENABLED` | `true` | Anonymous usage telemetry of the server |

## Client-Side Environment Variables

| Variable | Used by | Notes |
|----------|---------|-------|
| `PHOENIX_COLLECTOR_ENDPOINT` | `register()`, `Client()` | Base URL, e.g. `http://localhost:6006` |
| `PHOENIX_PROJECT_NAME` | `register()` | Default project |
| `PHOENIX_API_KEY` | both | Bearer token |
| `PHOENIX_CLIENT_HEADERS` | both | `key=value,key2=value2` |

!!! warning "Base URL means gRPC"
    With `PHOENIX_COLLECTOR_ENDPOINT=http://localhost:6006` and no `protocol`, `register()` exports over **gRPC to port 4317** of that host. If only 6006 is reachable (proxy, Kubernetes ingress, custom port), pass `protocol="http/protobuf"` or an explicit `endpoint=".../v1/traces"`.

## Deployment Checklist

- [ ] Server image version pinned, upgrades tested on staging
- [ ] PostgreSQL with backups for any shared instance
- [ ] Auth enabled, `PHOENIX_SECRET` from a secret store, admin password changed
- [ ] System API keys per consumer (CI, each service), rotated
- [ ] TLS terminated at Phoenix or the proxy
- [ ] Retention policy set; separate projects per environment
- [ ] `/healthz` wired into readiness probes

---
## See also
- [Arize Phoenix — LLM Tracing & Evaluation](./index.md)
- [Phoenix — Tracing & Instrumentation](./02-tracing-instrumentation.md)
- [Langfuse — LLM Tracing, Prompts & Evals](../langfuse/index.md)
- [OpenTelemetry — Python Observability](../../libs/opentelemetry/index.md)
