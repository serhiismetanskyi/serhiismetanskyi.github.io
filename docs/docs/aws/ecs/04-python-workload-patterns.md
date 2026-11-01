---
date: 2026-10-21 12:00:00
tags:
  - aws
  - ecs
  - fargate
  - python
  - docker
  - fastapi
---

# Amazon ECS — Patterns for Python Workloads

How to package a Python service and a queue worker so they behave on ECS: the image, shutdown, configuration, one-off jobs and observability. Docker mechanics (layers, caching, Compose) are in the [Docker guide](../../tools/docker/index.md); the FastAPI application side is in the [FastAPI guide](../../libs/fastapi/index.md); the SQS worker loop itself is in [SQS: Consumer Patterns](../sqs/03-consumer-patterns.md).

## One Image, Several Task Definitions

A single image can run the API, the worker and one-off jobs; the **task definition's `command`** picks the process. That keeps what you test identical to what you deploy.

| Task definition | `command` | Port / load balancer | Stop behaviour |
|-----------------|-----------|----------------------|----------------|
| `orders-api` | image default: `uvicorn app.api:app ...` | 8000, behind an ALB | Finish requests, exit 0 |
| `orders-worker` | `["python", "-m", "app.worker"]` | None | Finish the message in hand, exit 0 |
| `orders-migrate` | `["python", "-m", "alembic", "upgrade", "head"]` (override at `run_task` time) | None | Runs to completion |

## The Image

```dockerfile
# syntax=docker/dockerfile:1
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS build
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev --no-install-project   # dependencies only: cached layer
COPY app ./app

FROM python:3.13-slim-bookworm
RUN groupadd --gid 10001 app && useradd --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app
WORKDIR /app
COPY --from=build --chown=10001:10001 /app /app
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1             # unbuffered: log lines reach CloudWatch immediately
USER 10001                                                     # numeric non-root user
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import urllib.request as u; u.urlopen('http://127.0.0.1:8000/health', timeout=2)"]
CMD ["uvicorn", "app.api:app", "--host", "0.0.0.0", "--port", "8000"]
```

Why each line is there:

- **Multi-stage with uv**: the build stage resolves and installs from `uv.lock` (`--locked` fails if the lock is stale), the final stage carries only the virtual environment and the code. `python:3.13-slim-bookworm` has no compilers, so wheels must be available or built in the first stage.
- **Non-root, numeric user**: a numeric UID is easy for scanners and policy tools to verify; note that ECS Exec runs commands as root regardless of `USER`.
- **`HEALTHCHECK` uses Python**, because a slim image has no `curl`. ECS does not monitor a health check that exists only in the image: the agent reports on the task definition's `healthCheck`, which overrides the image's, so repeat the command there (`health_cmd` in the builder). The Dockerfile line keeps `docker run` and Compose honest.
- **Exec-form `CMD`** (a JSON array): Python or uvicorn becomes PID 1 and receives signals ([next section](#graceful-shutdown)).
- `PYTHONUNBUFFERED=1` and logging to stdout: the `awslogs` driver ships stdout and stderr; a file inside the container is lost with the task.

`app/api.py` is the whole application for these tests: `GET /health` returns `{"status": "ok", "version": <APP_VERSION>}` and `GET /orders/{id}` echoes the order ID and the `STAGE`. Build and run it locally with Docker:

```bash
docker build -t orders-api:test .
docker run -d --name orders-api-t -p 18000:8000 -e APP_VERSION=1.4.2 -e STAGE=test orders-api:test
curl -s localhost:18000/health          # {"status":"ok","version":"1.4.2"}
curl -s localhost:18000/orders/o-1      # {"order_id":"o-1","stage":"test"}
docker inspect -f '{{.State.Health.Status}} user={{.Config.User}}' orders-api-t     # healthy user=10001 (after the start period)
```

The final image was 163 MB. A worker uses the same image with a different command, for example `docker run --rm orders-api:test python -m app.worker`.

## Graceful Shutdown

On a stop (scale-in, deployment, `stop_task`, Spot interruption) ECS does the following to **every container**: send `STOPSIGNAL` (SIGTERM by default), wait `stopTimeout` seconds, send SIGKILL. `stopTimeout` defaults to 30 and is at most 120 on Fargate. Your process has exactly that long.

```python
# app/graceful.py: a worker that finishes the job in progress on SIGTERM
def main(job_seconds: float = 1.0) -> int:
    stopping = threading.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stopping.set())              # only set a flag; do the cleanup in the main flow
    print("ready", flush=True)
    jobs = 0
    while not stopping.is_set():
        time.sleep(job_seconds)                                    # the "job"; pretend it cannot be interrupted
        jobs += 1
        print(f"job {jobs} done", flush=True)
    print("shutdown clean", flush=True)
    return 0                                                       # exit code 0 tells ECS the stop was orderly
```

### Exec form vs shell form

The signal reaches your code only if your code is **PID 1**. The same program, started three ways in Docker (`docker run -d`, then `docker stop -t 8` after 1.5 s, with a 5-second job):

| `CMD` form | What PID 1 is | `docker stop` took | Exit code | Result |
|------------|---------------|--------------------|-----------|--------|
| `["python", "-m", "app.graceful", "5"]` (exec form) | python | **about 4 s** (the rest of the job) | **0** | Job finished, `shutdown clean` logged |
| `python -m app.graceful 5` (shell form) | `/bin/sh -c ...` | 8 s (the full timeout) | **137** | SIGTERM never reached Python; SIGKILL |
| `sh -c "python -m app.graceful 5; echo exited"` | sh | 8 s | **137** | The wrapper swallowed SIGTERM |

The stop semantics are the same as ECS's SIGTERM, wait, SIGKILL sequence, so the same mistake costs you the full `stopTimeout` on every deployment and a 137 exit code in `describe_tasks`. The suite pins this with two tests (`test_docker_stop_signal_delivery`, marked `docker`, skipped without Docker), and a third test sends a real SIGTERM to the Python process to check the exit code and the finished job ([05](./05-testing.md#sigterm-tests)).

### Match the timers

| Timer | Rule |
|-------|------|
| ECS `stopTimeout` | At least the longest in-flight unit of work plus clean-up: for an SQS worker `WaitTimeSeconds` plus one handler run, because the loop ends after the poll in progress ([SQS consumer patterns](../sqs/03-consumer-patterns.md)). Use `WaitTimeSeconds` of 20 only if `stopTimeout` allows it, or poll with a shorter wait |
| SQS visibility timeout | Longer than the longest job, plus heartbeats for jobs that run longer. A task killed at SIGKILL leaves its messages in flight until the timeout expires, then another task gets them |
| Fargate Spot | A two-minute warning arrives as SIGTERM, so `stopTimeout` of 120 is the useful ceiling |
| Load balancer | The task is deregistered from the target group before the containers get SIGTERM, but requests already in flight must finish: keep serving until your own shutdown completes. uvicorn does this by default |
| Rollout time | A large `stopTimeout` on a service that ignores SIGTERM makes every rollout wait for the old tasks until the timeout ends |
| `exit` code | Return 0 after a clean shutdown; an uncaught signal gives 143 and a kill gives 137, both of which dashboards treat as errors |

uvicorn handles SIGTERM itself. In the test run `docker stop -t 30` on the API container returned in **0.45 s** with exit code 0 and the log lines `Shutting down`, `Waiting for application shutdown.` and `Application shutdown complete.`

## Configuration and Secrets

Configuration reaches the container as **environment variables**: plain values from `environment`, secrets from `secrets` (the agent resolves them from Secrets Manager or SSM at task start and sets the same kind of variable). The code does not care where a variable came from, so local runs, tests and ECS use one code path:

```python
# app/settings.py
@dataclass(frozen=True)
class Settings:
    stage: str
    queue_url: str
    db_password: str = field(repr=False)                 # never printed in logs or tracebacks
    log_level: str = "INFO"

    @classmethod
    def from_env(cls, env=os.environ) -> "Settings":
        missing = [k for k in ("STAGE", "QUEUE_URL", "DB_PASSWORD") if not env.get(k)]
        if missing:                                      # fail at start-up with names, not at the first request with a KeyError
            raise ConfigError(f"missing environment variables: {', '.join(missing)}")
        return cls(stage=env["STAGE"], queue_url=env["QUEUE_URL"], db_password=env["DB_PASSWORD"], log_level=env.get("LOG_LEVEL", "INFO"))
```

```python
# in the task definition, via the builder from 01
build_task_definition(..., environment={"STAGE": "staging", "QUEUE_URL": QUEUE_URL},
                      secrets={"DB_PASSWORD": "arn:aws:secretsmanager:us-east-1:123456789012:secret:orders/db-AbCdEf:password::"})
```

| Practice | Why |
|----------|-----|
| Validate settings at start-up and list **all** missing names | A task that exits in a second with a clear message is cheaper to debug than a half-working service; the circuit breaker then rolls back |
| Grant the **execution role** `secretsmanager:GetSecretValue` on `arn:aws:secretsmanager:us-east-1:123456789012:secret:orders/db-*` (and `kms:Decrypt` for a customer managed key) | A missing grant gives `ResourceInitializationError` before your code runs |
| Secrets are read **once at start** | Rotation needs a new deployment (`forceNewDeployment`), or read the secret in code with the task role |
| Prefer IAM roles over stored credentials | The task role reaches SQS, S3 and DynamoDB with no secret at all; reserve `secrets` for third-party credentials and database passwords |
| Do not bake configuration into the image | One image per commit, many environments |
| Locally | `docker run --env-file .env.local ...` or Compose `environment:`; the same variable names |

The `repr=False` and the missing-variable error are covered by two unit tests; the whole class takes a plain dict, so tests never touch `os.environ`.

## One-off Tasks: Migrations and Batch Jobs

`run_task` with a `command` override runs the service's image to completion; the exit code is the result. Deploy order in CI: **migrate, then roll out**.

```python
result = run_and_wait(ecs, cluster="prod", task_definition="orders-api:8",           # the revision about to be deployed
                      subnets=SUBNETS, security_groups=[DB_CLIENT_SG],
                      command=["python", "-m", "alembic", "upgrade", "head"], tags={"purpose": "migration", "git-sha": SHA})
```

- **Same image and revision** as the service about to be deployed, so the code and the schema agree; use the overrides only for `command` and `environment`.
- **Network**: the task needs the database's security group and subnets; build `security_groups` for the job, not for the load balancer.
- **Backward-compatible migrations.** During a rolling update the old revision still runs against the migrated schema. Add columns first, remove them in a later release.
- **Idempotent**: a retried or doubled run must be harmless. Take the migration tool's lock, and use `clientToken` for the `run_task` call.
- **Timeouts and `finally`**: `run_and_wait` stops the task at the deadline; its log group (`/ecs/orders-api`, stream `app/app/<task-id>`) holds the output. Print the last log lines when `TaskFailedError` is raised.
- Longer batch work with retries belongs in a queue and a worker, or in Step Functions, not in a long single task.

## Task Scale-in Protection

A queue worker that is stopped by a scale-in loses the job in hand (the message returns after the visibility timeout). **Task scale-in protection** keeps a task of a **service** alive while it works: the default protection lasts 2 hours, configurable from 1 minute to 2,880 minutes (48 hours). A worker sets it through the container agent endpoint (the task role needs `ecs:GetTaskProtection` and `ecs:UpdateTaskProtection`; the endpoint is `$ECS_AGENT_URI/task-protection/v1/state`), or an external controller uses `update_task_protection`.

```python
# app/protection.py (excerpt): protect while one message is processed, always clear it
@contextmanager
def protected(minutes: int = 60, env=os.environ):
    set_protection(True, minutes, env)       # PUT {ECS_AGENT_URI}/task-protection/v1/state with {"ProtectionEnabled": true, "ExpiresInMinutes": N}
    try:
        yield
    finally:
        set_protection(False, env=env)

# in the worker loop: with protected(30): handle(message); then delete the message
```

The helper is tested against a local HTTP server (set, clear after an exception, no-op outside ECS); the real endpoint exists only inside ECS service tasks. Protected tasks also delay deployments: a rolling update keeps them until protection ends, so keep the period short. `UpdateTaskProtection` returns `DEPLOYMENT_BLOCKED` when more tasks are protected than the desired count.

## Sidecars

A second container in the task shares the network namespace (`localhost`) and the lifecycle. Common sidecars: an OpenTelemetry collector, a log router, a proxy.

```python
# Shape only: the app sends OTLP to localhost:4317; the collector must be up first, but its crash must not kill the app.
containers = [
    {"name": "app", "image": APP_IMAGE, "essential": True,
     "dependsOn": [{"containerName": "otel", "condition": "START"}], "environment": [{"name": "OTEL_EXPORTER_OTLP_ENDPOINT", "value": "http://localhost:4317"}]},
    {"name": "otel", "image": "public.ecr.aws/aws-observability/aws-otel-collector:<pinned-version>", "essential": False},
]
```

| Setting | Why |
|---------|-----|
| `essential: false` on the sidecar | Its failure does not stop the task; mark it `true` only when the app is useless without it (a mandatory proxy) |
| `dependsOn` with `START` or `HEALTHY` | Start order; `HEALTHY` needs a `healthCheck` on the dependency; stop order is the reverse |
| Task CPU and memory | The sidecar's share counts against the task size; undersizing shows up as OOM kills |
| Logs | Give each container its own `logConfiguration` stream prefix |
| Service Connect and ECS Exec | Both run as additional containers: name the container when you exec |

`validate_task_definition` accepts this shape as long as the sidecar image is pinned and every container logs ([05](./05-testing.md#validating-task-definitions)).

## Observability

| Need | Pattern |
|------|---------|
| Logs you can search | One JSON object per line to stdout, with `level`, `message`, request ID, and the task context below. Set `retentionInDays` on the log group |
| Know which task wrote a line | Read the **task metadata endpoint v4** once at start (`ECS_CONTAINER_METADATA_URI_V4`, injected on Fargate platform 1.4.0+) and attach `TaskARN`, `Cluster`, `Family`, `Revision` to the logger context |
| Know the deployed version | Put the Git SHA in `APP_VERSION`, return it from `/health`, and let the deploy job wait for it ([06](./06-moto-gaps-smoke-ci.md#deploy-then-verify)) |
| Metrics | `AWS/ECS` CPU and memory per service; Container Insights for task counts; application metrics through the OTel sidecar or CloudWatch embedded metric format |
| Alerts | Alarm on `SERVICE_DEPLOYMENT_FAILED` events, on the ALB's 5xx and `UnHealthyHostCount`, on the DLQ depth for workers |

```python
# app/metadata.py
def task_metadata(env=os.environ, timeout: float = 1.0) -> dict:
    base = env.get("ECS_CONTAINER_METADATA_URI_V4")
    if not base:
        return {}                                        # local run or unit test
    with urllib.request.urlopen(f"{base}/task", timeout=timeout) as resp:
        return json.load(resp)

def log_context(meta: dict) -> dict:
    return {k: meta[k] for k in ("TaskARN", "Cluster", "Family", "Revision", "AvailabilityZone") if k in meta}
```

The task metadata endpoint is also the cheap way to get task information without calling `DescribeTasks` from every task, which AWS recommends to stay under the API throttling limits.

## Quick Rules

1. **One image, many task definitions**: select the process with `command`.
2. **Use exec-form `CMD`** and verify with `docker stop`: exit 0 and a quick stop, not 137 after the timeout.
3. **Run as a numeric non-root user** and give the task definition its own `healthCheck`; slim images have no `curl`.
4. **Set `stopTimeout` from the work**, then align the SQS visibility timeout and the worker's long-poll wait with it.
5. **Read configuration from the environment in one `Settings` class**; fail fast, list every missing name, hide secrets in `repr`.
6. **Use `secrets` for passwords and tokens**, IAM roles for AWS access, and grant the execution role only the exact secret ARNs.
7. **Run migrations as a one-off task with the new revision before the rollout**, keep them backward compatible, and stop the task on timeout.
8. **Protect long jobs from scale-in** with a short, always-cleared protection window.
9. **Mark sidecars `essential: false`** unless the app cannot work without them, and pin their images.
10. **Log JSON to stdout with task context and a version**, and verify the version after every deploy.

---
## See also
- [Amazon ECS — Overview](./index.md)
- [Amazon ECS — Services, Deployments & Networking](./02-services-deployments-networking.md)
- [Amazon ECS — Testing ECS-Based Systems](./05-testing.md)
- [Amazon SQS — Consumer Patterns](../sqs/03-consumer-patterns.md)
- [Docker & Docker Compose](../../tools/docker/index.md)
- [Docker — Dockerfile Best Practices](../../tools/docker/02-dockerfile-best-practices.md)
- [FastAPI](../../libs/fastapi/index.md)
