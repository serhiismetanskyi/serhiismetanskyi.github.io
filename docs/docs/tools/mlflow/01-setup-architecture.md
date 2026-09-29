---
date: 2026-09-29
tags:
  - tools
  - observability
  - mlflow
  - docker
---

# MLflow — Setup & Architecture

The MLflow tracking server is one Python process (uvicorn with several workers) that serves the UI and the REST API. It keeps metadata in a **backend store** (a SQL database) and files in an **artifact store** (a directory or object storage). Clients never talk to the database directly — only to the server.

## Architecture

```mermaid
flowchart LR
  C["SDK / CLI / UI<br/>tests, apps, CI jobs"] -- "REST /api/2.0/mlflow/...<br/>OTLP /v1/traces" --> S["mlflow server :5000"]
  S --> B[("Backend store<br/>experiments, runs, params, metrics,<br/>traces, registry, prompts")]
  S -- "artifact proxy<br/>mlflow-artifacts:/" --> A[("Artifact store<br/>./mlartifacts, S3, GCS, Azure Blob")]
```

| Part | What it holds | Configured by |
|------|---------------|---------------|
| Tracking server | UI, REST API, OTLP trace endpoint | `mlflow server --host --port --workers` |
| Backend store | Experiments, runs, params, metrics, tags, traces, datasets, registered models, prompts | `--backend-store-uri` |
| Registry store | Model registry, if kept apart from tracking data | `--registry-store-uri` (defaults to the backend store) |
| Artifact store | Files: reports, models, tables, images | `--artifacts-destination` (proxied) or `--default-artifact-root` (direct) |

## Running Locally

```bash
uv add --dev mlflow
uv run mlflow server --port 5000
# Default: backend sqlite:///mlflow.db, artifacts in ./mlartifacts, bound to 127.0.0.1

until curl -sf http://localhost:5000/health > /dev/null; do sleep 1; done
```

- `mlflow ui` starts the same server with the same options; `mlflow server` is the name to use in scripts.
- Everything lives in the current directory: start the server from a fixed folder (or pass absolute paths), otherwise every start creates a new empty database.
- Port 5000 is taken by the AirPlay Receiver on macOS — use `--port 5001` or turn AirPlay Receiver off.

!!! note "No server at all"
    Without `MLFLOW_TRACKING_URI` the SDK writes straight to `sqlite:///mlflow.db` (plus `./mlruns` for artifacts) in the working directory. Fine for a quick script; in tests and CI it silently scatters databases around the repo. Always set the URI explicitly.

## Backend Store

| URI | Use for | Notes |
|-----|---------|-------|
| `sqlite:///mlflow.db` | Local runs, single-user, CI jobs | Default; one file, no concurrency across hosts |
| `postgresql://user:pass@host:5432/mlflow` | Shared team server | Needs `psycopg2-binary` in the server environment |
| `mysql+pymysql://user:pass@host:3306/mlflow` | Shared server on MySQL | Needs `pymysql` |
| `./mlruns` (file store) | Legacy | Old default; convert with `mlflow migrate-filestore --source . --target sqlite:///mlflow.db` |

The schema is created on first start. After upgrading MLflow on an existing database run `mlflow db upgrade <backend-store-uri>` (back up first) — a newer server refuses to start on an old schema.

## Artifact Store

| Mode | Server flags | Client needs | Use for |
|------|--------------|--------------|---------|
| Proxied (default) | `--artifacts-destination ./mlartifacts` or `s3://bucket/path` | Only the server URL | Almost always: credentials stay on the server |
| Direct | `--no-serve-artifacts --default-artifact-root s3://bucket/path` | Its own cloud credentials | Very large files, when the server must not stream them |

- With proxying, experiments get `mlflow-artifacts:/<id>` as artifact location, and uploads go through the server.
- For S3-compatible storage (MinIO, Ceph) set `MLFLOW_S3_ENDPOINT_URL` and the usual `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` for the server; S3 needs `boto3`.
- `--default-artifact-root` affects only experiments created afterwards — existing experiments keep their old location.

## Docker Compose: MLflow with PostgreSQL

The official image `ghcr.io/mlflow/mlflow` contains MLflow only — no `psycopg2` and no `boto3`. Build a thin image on top:

```dockerfile
# Dockerfile.mlflow
FROM ghcr.io/mlflow/mlflow:v3.16.1
RUN pip install --no-cache-dir psycopg2-binary boto3
```

```yaml
# compose.yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: mlflow
      POSTGRES_PASSWORD: mlflow
      POSTGRES_DB: mlflow
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mlflow -d mlflow"]
      interval: 5s
      retries: 10

  mlflow:
    build:
      context: .
      dockerfile: Dockerfile.mlflow
    command:
      - mlflow
      - server
      - --backend-store-uri=postgresql://mlflow:mlflow@postgres:5432/mlflow
      - --artifacts-destination=/mlartifacts
      - --host=0.0.0.0                                   # listen outside the container
      - --port=5000
      - --allowed-hosts=localhost:*,127.0.0.1:*,mlflow:5000
    ports:
      - "5000:5000"
    volumes:
      - mlflow_artifacts:/mlartifacts
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:5000/health')"]
      interval: 10s
      start_period: 30s
      retries: 10

  tests:
    build: .
    environment:
      MLFLOW_TRACKING_URI: http://mlflow:5000            # service name, not localhost
      MLFLOW_EXPERIMENT_NAME: llm-regression
    depends_on:
      mlflow:
        condition: service_healthy

volumes:
  pg_data:
  mlflow_artifacts:
```

```bash
docker compose up -d --wait mlflow
```

!!! warning "403 Invalid Host header"
    The server checks the `Host` header against `--allowed-hosts`. The default list covers `localhost`, `127.0.0.1` and private IP ranges, but **not** Compose or Kubernetes service names. A container calling `http://mlflow:5000` gets `403 Invalid Host header - possible DNS rebinding attack detected` until `mlflow:5000` is in `--allowed-hosts`. Browser apps on other origins need `--cors-allowed-origins` as well.

## Authentication

The server has no login by default — anyone who reaches the port can read and delete everything. Options:

| Option | How | Notes |
|--------|-----|-------|
| Reverse proxy | nginx / Traefik / cloud IAP in front of MLflow, SSO there | Most common in companies; clients send `MLFLOW_TRACKING_TOKEN` or basic auth to the proxy |
| Built-in basic auth | `mlflow server --app-name basic-auth` | Users and per-experiment permissions in its own database (`basic_auth.db`) |
| Managed MLflow | Databricks, AWS SageMaker, Azure ML, Nebius | Auth handled by the platform |

Built-in basic auth needs the `auth` extra and two secrets:

```bash
uv add "mlflow[auth]"
export MLFLOW_FLASK_SERVER_SECRET_KEY="$(openssl rand -hex 32)"   # CSRF protection, required
export MLFLOW_AUTH_ADMIN_PASSWORD='change-me-long-password'       # used once, to create the admin user
uv run mlflow server --app-name basic-auth --port 5000
```

Clients then set `MLFLOW_TRACKING_USERNAME` and `MLFLOW_TRACKING_PASSWORD`; a request without them gets `401`. There is no default admin password — without `MLFLOW_AUTH_ADMIN_PASSWORD` (or `admin_password` in the auth config file) the server refuses to start on an empty user store.

## Server Environment and Flags

| Setting | Example | Purpose |
|---------|---------|---------|
| `--host` | `0.0.0.0` | Bind interface (default `127.0.0.1`); not a security control |
| `--workers` | `4` | Worker processes (default 4) |
| `--allowed-hosts` | `mlflow.company.com,mlflow:5000` | Accepted `Host` headers (DNS-rebinding protection) |
| `--cors-allowed-origins` | `https://app.company.com` | Origins allowed to call the API from a browser |
| `--expose-prometheus` | `/tmp/metrics` | Serve server metrics on `/metrics` |
| `MLFLOW_S3_ENDPOINT_URL` | `http://minio:9000` | S3-compatible artifact storage |
| `MLFLOW_FLASK_SERVER_SECRET_KEY` | 64 hex chars | Required with `--app-name basic-auth` |

## Setup Checklist

- [ ] Server version pinned (`mlflow==3.x.y` or `ghcr.io/mlflow/mlflow:v3.x.y`), same minor version on clients
- [ ] Backend store chosen deliberately: SQLite only for local and CI, Postgres/MySQL for shared use
- [ ] Artifact store is proxied and persistent (volume or object storage), and backed up with the database
- [ ] `--allowed-hosts` includes every host name clients use (DNS name, Compose service name)
- [ ] Authentication in front of any shared server; CI uses its own technical user
- [ ] Readiness check on `/health` before tests start
- [ ] `mlflow db upgrade` is part of the upgrade procedure, with a database backup before it

---
## See also
- [MLflow — Experiment Tracking, LLM Tracing & Evaluation](./index.md)
- [MLflow — Experiment Tracking](./02-experiment-tracking.md)
- [Docker Compose](../docker/03-docker-compose.md)
- [PostgreSQL — Overview](../../databases/postgresql/index.md)
- [Phoenix — Setup & Architecture](../phoenix/01-setup-architecture.md)
- [Langfuse — Setup & Architecture](../langfuse/01-setup-architecture.md)
