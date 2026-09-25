---
date: 2026-08-28
tags:
  - ci-cd
  - devops
  - deployment
---

# Infrastructure & Infrastructure as Code

## Containers — Docker

Docker packages an application and all its dependencies into an immutable image.
The same image runs identically on a developer laptop, CI runner, and production server.

### Production-Ready Dockerfile

```dockerfile
# Stage 1: build dependencies
FROM python:3.12-slim AS builder
WORKDIR /app
COPY uv.lock pyproject.toml ./
RUN pip install uv && uv sync --frozen --no-dev

# Stage 2: minimal runtime image
FROM python:3.12-slim AS runtime
WORKDIR /app

COPY --from=builder /app/.venv /app/.venv
COPY src/ ./src/

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

USER nobody
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Key practices:
- Multi-stage build — build tools not in production image
- Non-root user — limits blast radius of container escape
- Health check — orchestrator knows when service is ready
- `PYTHONUNBUFFERED=1` — logs appear immediately in CI

---

## Container Orchestration — Kubernetes

Kubernetes manages containers at scale: scheduling, scaling, health, networking.

### Minimal Deployment Manifest

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-service
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: api-service
    spec:
      containers:
        - name: api
          image: ghcr.io/org/api:v1.4.2  # always pin, never :latest
          ports:
            - containerPort: 8000
          env:
            - name: DB_HOST
              valueFrom:
                secretKeyRef:
                  name: api-secrets
                  key: db-host
          resources:
            requests:
              cpu: "100m"
              memory: "256Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
          livenessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /ready
              port: 8000
            initialDelaySeconds: 5
            periodSeconds: 10
```

---

## Infrastructure as Code (IaC)

Infrastructure defined in code: version-controlled, reviewed, reproducible.

### Terraform

```hcl
# Provision a managed Postgres on GCP
resource "google_sql_database_instance" "main" {
  name             = "api-db-${var.environment}"
  database_version = "POSTGRES_16"
  region           = "europe-west1"

  settings {
    tier = var.environment == "prod" ? "db-n1-standard-4" : "db-f1-micro"

    backup_configuration {
      enabled    = true
      start_time = "02:00"
    }

    ip_configuration {
      ipv4_enabled = false
      private_network = google_compute_network.vpc.id
    }
  }
}
```

IaC principles:
- **Idempotent** — run the same plan twice, second run changes nothing
- **Declarative** — describe the desired state, not the steps
- **Version-controlled** — infra changes go through pull requests
- **Environment parity** — staging mirrors production in config, not just code

### CloudFormation (AWS)


```yaml
Resources:
  ApiDatabase:
    Type: AWS::RDS::DBInstance
    Properties:
      DBInstanceClass: !If [IsProd, db.t3.medium, db.t3.micro]
      Engine: postgres
      EngineVersion: "16.0"
      MasterUsername: !Sub "{{resolve:secretsmanager:db-credentials:username}}"
      MasterUserPassword: !Sub "{{resolve:secretsmanager:db-credentials:password}}"
      MultiAZ: !If [IsProd, true, false]
```


---

## IaC in CI/CD Pipeline

```yaml
# Terraform plan on PR, apply on merge
- name: Terraform plan
  if: github.event_name == 'pull_request'
  run: terraform plan -out=tfplan

- name: Terraform apply
  if: github.ref == 'refs/heads/main'
  run: terraform apply -auto-approve tfplan
```

Never run `terraform apply` without a preceding `plan` in the same pipeline run.
