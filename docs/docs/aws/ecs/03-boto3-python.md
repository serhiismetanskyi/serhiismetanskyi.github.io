---
date: 2026-10-21 12:00:00
tags:
  - aws
  - ecs
  - boto3
  - python
  - fargate
---

# Amazon ECS — boto3 in Python

ECS is a JSON-protocol API with **88 operations** in boto3 1.43.116 and no resource-style interface: use the **`ecs` client** (`boto3.client("ecs")`). Sessions, `Config`, retry modes, pagination basics and `ClientError` are explained in [AWS Foundations](../foundations/01-clients-config-errors.md); this page covers what is specific to ECS and the traps that make test code flaky.

```python
import boto3
from botocore.config import Config

ecs = boto3.client("ecs", config=Config(retries={"mode": "standard", "max_attempts": 5}, connect_timeout=5, read_timeout=30))
```

Modeled exceptions hang off the client: `ecs.exceptions.ClusterNotFoundException`, `ecs.exceptions.ServiceNotFoundException`, `ecs.exceptions.InvalidParameterException`.

## Operations You Will Use

| Task | Operation | Returns |
|------|-----------|---------|
| Define what to run | `register_task_definition`, `describe_task_definition`, `deregister_task_definition`, `delete_task_definitions`, `list_task_definitions` | Revision ARN, `status` |
| Create places to run | `create_cluster`, `put_cluster_capacity_providers`, `update_cluster_settings`, `delete_cluster` | Cluster |
| Run once | `run_task`, `describe_tasks`, `list_tasks`, `stop_task` | `tasks` **and** `failures` |
| Run continuously | `create_service`, `update_service`, `describe_services`, `list_services`, `delete_service` | Service with `deployments` |
| Wait | Waiters: `tasks_running`, `tasks_stopped`, `services_stable`, `services_inactive` | Nothing; raises `WaiterError` |
| Inspect a rollout | `describe_service_deployments`, `list_service_deployments`, `stop_service_deployment`, `continue_service_deployment` | Deployment state (newer API) |
| Debug | `execute_command` ([02](./02-services-deployments-networking.md#ecs-exec)), `list_tags_for_resource` | Session, tags |
| Protect | `update_task_protection`, `get_task_protection` | [04](./04-python-workload-patterns.md#task-scale-in-protection) |

## Task Definitions and Clusters

```python
from app.taskdef import build_task_definition                     # builder from 01

td = build_task_definition("orders-api", "123456789012.dkr.ecr.us-east-1.amazonaws.com/orders:1.4.2",
                           execution_role_arn=EXEC_ROLE, task_role_arn=TASK_ROLE, port=8000)
reg = ecs.register_task_definition(**td)["taskDefinition"]
print(reg["taskDefinitionArn"], reg["revision"], reg["status"])
```

```text
arn:aws:ecs:us-east-1:123456789012:task-definition/orders-api:1 1 ACTIVE
```

- Registering is not idempotent: **every call creates a new revision**, even for identical JSON. In CI, register once per image tag and pass the returned ARN on.
- Use the revision-qualified name (`orders-api:8`) or ARN when running or deploying. A bare family means "latest ACTIVE revision", which can change between your `describe` and your `run`.
- IAM policies that name task definitions use the ARN with a revision or `:*` for all revisions.

```python
ecs.create_cluster(
    clusterName="prod",
    capacityProviders=["FARGATE", "FARGATE_SPOT"],
    defaultCapacityProviderStrategy=[{"capacityProvider": "FARGATE", "weight": 1}],   # used when run_task names neither launchType nor strategy
    settings=[{"name": "containerInsights", "value": "enabled"}],
    tags=[{"key": "env", "value": "prod"}],
)
```

## Running a Task

`run_task` takes the cluster, a revision, and where and how to run it:

| Parameter | Notes |
|-----------|-------|
| `cluster`, `taskDefinition` | Name or ARN; use `family:revision` |
| `capacityProviderStrategy` **or** `launchType` | Not both. Strategy is preferred; up to 20 providers. Managed Instances needs a strategy |
| `networkConfiguration` | Required for `awsvpc`: `subnets`, `securityGroups`, `assignPublicIp` (`ENABLED` or `DISABLED`) |
| `count` | 1 to 10 per call (the API limit) |
| `overrides` | Per call: `containerOverrides[]` with `name`, `command`, `environment`, `cpu`, `memory`, `resourceRequirements`; also `cpu`, `memory`, `taskRoleArn`, `executionRoleArn`, `ephemeralStorage`. **8,192 characters in total** including JSON syntax |
| `startedBy` | Free label (up to 128 letters, digits, `-`, `/`, `_`) to find your tasks later with `list_tasks(startedBy=...)`; for service tasks it holds the deployment ID |
| `tags`, `propagateTags` | Tag the task; `TASK_DEFINITION` copies the definition's tags. Tags are deleted when a task is stopped |
| `clientToken` | Up to 64 characters (33 to 126 ASCII); makes the call idempotent so a retried request does not start a second task |
| `enableExecuteCommand` | Requires a task role |
| `platformVersion`, `group`, `volumeConfigurations`, `placement*` | Rarely needed on Fargate |

### One reusable function

`app/runner.py` is the heart of every test harness and CI job in this guide. It makes the four failure modes visible: placement `failures`, a task that never stops, a non-zero exit code, and a container that never started.

```python
class TaskStartError(RuntimeError):
    """run_task answered HTTP 200 but placed no task: the reasons are in `failures`."""
    def __init__(self, failures):
        self.failures = failures
        super().__init__("; ".join(f"{f.get('reason')} ({f.get('detail') or f.get('arn')})" for f in failures))

@dataclass
class TaskResult:
    task_arn: str; stop_code: str | None; stopped_reason: str | None
    exit_codes: dict[str, int | None]; container_reasons: dict[str, str | None]
    @property
    def ok(self) -> bool:
        return bool(self.exit_codes) and all(code == 0 for code in self.exit_codes.values())   # None is NOT success

def run_and_wait(ecs, *, cluster, task_definition, subnets, security_groups, command=None, environment=None, container="app",
                 started_by="qa-harness", tags=None, capacity_provider="FARGATE", assign_public_ip="DISABLED",
                 timeout_s=600, poll_s=6) -> TaskResult:
    overrides = {}
    if command or environment:
        override = {"name": container}
        if command:
            override["command"] = command
        if environment:
            override["environment"] = [{"name": k, "value": v} for k, v in environment.items()]
        overrides = {"containerOverrides": [override]}

    resp = ecs.run_task(
        cluster=cluster, taskDefinition=task_definition, count=1,
        capacityProviderStrategy=[{"capacityProvider": capacity_provider, "weight": 1}],
        networkConfiguration={"awsvpcConfiguration": {"subnets": subnets, "securityGroups": security_groups, "assignPublicIp": assign_public_ip}},
        overrides=overrides, startedBy=started_by, tags=[{"key": k, "value": v} for k, v in (tags or {}).items()],
        propagateTags="TASK_DEFINITION",
        clientToken=uuid.uuid4().hex,                                     # stays the same across botocore's own retries of this call
    )
    if resp["failures"] or not resp["tasks"]:                             # HTTP 200 does not mean "started"
        raise TaskStartError(resp["failures"])
    task_arn = resp["tasks"][0]["taskArn"]
    try:
        ecs.get_waiter("tasks_stopped").wait(cluster=cluster, tasks=[task_arn],
                                             WaiterConfig={"Delay": poll_s, "MaxAttempts": max(1, timeout_s // max(poll_s, 1))})
    except WaiterError:
        ecs.stop_task(cluster=cluster, task=task_arn, reason="harness timeout")      # never leave a billed task behind
        raise TimeoutError(f"task {task_arn} still running after {timeout_s}s; stop requested") from None

    task = ecs.describe_tasks(cluster=cluster, tasks=[task_arn])["tasks"][0]
    result = TaskResult(task_arn, task.get("stopCode"), task.get("stoppedReason"),
                        {c["name"]: c.get("exitCode") for c in task["containers"]},
                        {c["name"]: c.get("reason") for c in task["containers"]})
    if not result.ok:
        raise TaskFailedError(result)
    return result
```

(Excerpt: the real file also checks `failures` on the final `describe_tasks`, and `TaskFailedError` builds its message from the result.)

```python
result = run_and_wait(ecs, cluster="qa", task_definition="migrate:4", subnets=[subnet], security_groups=[group],
                      command=["python", "-m", "migrate", "--to", "head"], environment={"STAGE": "test"}, tags={"suite": "pytest"})
print(result.exit_codes)            # {'app': 0}
```

## Waiters

| Waiter | Polls | Succeeds when | Fails when | Default delay x attempts |
|--------|-------|---------------|------------|--------------------------|
| `tasks_running` | `describe_tasks` | **All** tasks `RUNNING` | Any task `STOPPED`, or a `MISSING` failure | 6 s x 100 (10 min) |
| `tasks_stopped` | `describe_tasks` | **All** tasks `STOPPED` | Never fails early: only "max attempts" | 6 s x 100 |
| `services_stable` | `describe_services` | Each service has **one** deployment and `runningCount == desiredCount` | Service `DRAINING`, `INACTIVE` or `MISSING` | 15 s x 40 (10 min) |
| `services_inactive` | `describe_services` | Service `INACTIVE` | `MISSING` | 15 s x 40 |

Always pass `WaiterConfig={"Delay": ..., "MaxAttempts": ...}`: the defaults are fine for a deploy and far too slow for a unit test (`Delay: 0` against moto). On timeout the waiter raises `botocore.exceptions.WaiterError`; a `tasks_running` wait on a task that crashes raises it **immediately** with the state in the message, which is useful: it fails fast instead of waiting 10 minutes. `tasks_stopped` does not tell you whether the stop was good; read the exit codes afterwards. `services_stable` is true after an automatic rollback too ([02](./02-services-deployments-networking.md#deployment-circuit-breaker)).

## Detecting Failure

No single field answers "did it work?". Read them together, in this order:

| Order | Field | Look for | Meaning |
|-------|-------|----------|---------|
| 1 | `run_task()["failures"]` | non-empty | Placement refused (`reason`, `detail`, `arn`): no task exists |
| 2 | `describe_tasks()["failures"]` | `reason: MISSING` | The task ID is unknown, or older than the visibility window (stopped tasks stay at least one hour) |
| 3 | `task["lastStatus"]` | `STOPPED` | It finished; the next fields say how |
| 4 | `task["stopCode"]` | `TaskFailedToStart`, `EssentialContainerExited`, `UserInitiated`, `ServiceSchedulerInitiated`, `SpotInterruption` | Why it stopped |
| 5 | `task["stoppedReason"]` | `Essential container in task exited`, `CannotPullContainerError: ...`, `ResourceInitializationError: ...`, `Task failed ELB health checks` | Human-readable cause |
| 6 | `containers[].exitCode` | `0`, `1`, `137`, `143`, **absent** | Your process's code. 137 = SIGKILL or out of memory, 143 = SIGTERM not handled. **Absent when the container never started** |
| 7 | `containers[].reason` | `OutOfMemoryError: Container killed due to memory usage` | Extra detail (up to 1,024 characters) |

Two traps: `exitCode` can be missing, so `all(c["exitCode"] == 0 ...)` is wrong where `c.get("exitCode") == 0` is right; and a task with several containers can have a zero-exit essential container and a failing sidecar, so check each container you care about.

`api_failures_messages` in the AWS guide lists the `failures[].reason` values: `MISSING`, and for `run_task` `RESOURCE:CPU`, `RESOURCE:MEMORY`, `RESOURCE:ENI`, `RESOURCE:GPU`, `AGENT`, `LOCATION`, `ATTRIBUTE` (mostly relevant to EC2 capacity).

### HTTP 200 with `failures`

```python
resp = ecs.describe_services(cluster="qa", services=["ghost"])
print(resp["ResponseMetadata"]["HTTPStatusCode"], resp["services"], [f["reason"] for f in resp["failures"]])
```

```text
200 [] ['MISSING']
```

`describe_*` and `run_task`/`start_task` report per-resource problems in `failures` and **do not raise**. Other operations raise: `update_service` on an unknown service raises `ServiceNotFoundException`, `list_tasks` on an unknown cluster raises `ClusterNotFoundException`. Wrap both styles in one helper, as `run_and_wait` does, and test both ([05](./05-testing.md#stubber-failures-and-exit-codes)).

## Services: Update, Roll Out, Stop

```python
ecs.update_service(cluster="prod", service="orders-api", taskDefinition="orders-api:9")                  # new revision: rolling deployment
ecs.update_service(cluster="prod", service="orders-api", forceNewDeployment=True)                        # same revision: replace tasks (new image behind the same tag, new secrets, new platform revision)
ecs.update_service(cluster="prod", service="orders-api", desiredCount=0)                                 # required before delete_service
ecs.delete_service(cluster="prod", service="orders-api")                                                  # service goes DRAINING, then INACTIVE
ecs.stop_task(cluster="prod", task=task_arn, reason="qa cleanup")                                         # SIGTERM, then SIGKILL after stopTimeout
```

- `update_service` with a task definition, desired count or network change starts a deployment; with no change it does nothing unless `forceNewDeployment=True`.
- The documented rule for `delete_service`: scale to 0 first (or pass `force=True`); the service then drains and becomes `INACTIVE`. Use the `services_inactive` waiter before re-creating a service of the same name.
- `stop_task` is **asynchronous**: it records `desiredStatus: STOPPED` and returns while the containers are still shutting down (SIGTERM, then SIGKILL after `stopTimeout`). Wait for `tasks_stopped` if the next step depends on it. A stopped service task is replaced by its service; stop the service's capacity instead (`desiredCount`) if you want it gone.

## Pagination and Batch Limits

| Operation | Paginator | Per-call limit |
|-----------|-----------|----------------|
| `list_clusters`, `list_services`, `list_tasks`, `list_task_definitions`, `list_task_definition_families`, `list_container_instances`, `list_attributes`, `list_services_by_namespace` | Yes (`get_paginator`) | `maxResults` 1 to 100; default page size 100, but **10 for `list_services`** |
| `describe_tasks` | No | **100** tasks |
| `describe_services` | No | **10** services |

```python
def chunks(items, size):
    for i in range(0, len(items), size):
        yield items[i:i + size]

task_arns = [a for page in ecs.get_paginator("list_tasks").paginate(cluster="qa", startedBy="qa-harness") for a in page["taskArns"]]
tasks = [t for batch in chunks(task_arns, 100) for t in ecs.describe_tasks(cluster="qa", tasks=batch)["tasks"]]
```

Without a paginator, a plain `list_services` call returns only 10 services and a `nextToken`. `list_tasks` shows only `RUNNING` tasks by default; pass `desiredStatus="STOPPED"` for finished ones. `list_*` return identifiers; call `describe_*` for details. moto ignores `maxResults` on `list_clusters`, `list_tasks` and `list_services` ([06](./06-moto-gaps-smoke-ci.md#what-moto-does-not-emulate)), so a pagination bug will not show in moto tests.

## Errors

| Exception | Raised when | Retry? |
|-----------|-------------|--------|
| `ClusterNotFoundException` | Unknown or deleted cluster (Regions matter) | No: fix the name |
| `ServiceNotFoundException`, `ServiceNotActiveException` | Update or delete of a missing or `INACTIVE` service | No |
| `InvalidParameterException` | Bad input: missing `networkConfiguration` for `awsvpc`, both `launchType` and a strategy, scaled service delete | No |
| `ClientException` | Client-side problem such as an unknown task definition (`Unable to describe task definition`) | No |
| `AccessDeniedException` | IAM denies the call, including `iam:PassRole` for the roles you pass | No: fix the policy |
| `ClusterContainsServicesException`, `ClusterContainsTasksException`, `ResourceInUseException` | Deleting something that is still used | After cleanup |
| `PlatformUnknownException`, `PlatformTaskDefinitionIncompatibilityException` | Bad `platformVersion` or a definition the platform cannot run | No |
| `LimitExceededException` | A resource limit was reached | After freeing quota |
| `TargetNotConnectedException` | `execute_command` cannot reach the agent: IAM, agent not running, no `ssmmessages` endpoint | After fixing the setup |
| `ServerException`, error code `ThrottlingException` | Service-side error, or API rate exceeded (HTTP 400, "Rate exceeded") | Yes: standard retry mode backs off |

Throttling is per account and Region, with a token bucket per operation category: `DescribeTasks` and `ListTasks` allow a burst of 100 and 20 per second sustained, `RunTask` and `StopTask` 100 burst and 40 per second, `UpdateService` 50 burst and 5 per second. A poll loop that describes many tasks every second across parallel tests hits it. Poll less often, batch IDs in one `describe_tasks`, use EventBridge events, and keep `retries.mode=standard`.

## Idempotency and Retries

- **`run_task(clientToken=...)`** (up to 64 characters) and **`create_service(clientToken=...)`** (up to 36) make a retried request safe. botocore resends the same parameters when it retries, so a token generated **before** the call protects against its automatic retries; generate one per logical job, not per attempt of your own loop.
- `register_task_definition` has no token: a retry can create an extra revision. Harmless, but do not use revision numbers as counters.
- `update_service` to the same state is a no-op; `stop_task` on a stopped task returns the task.
- Never loop `run_task` on `failures` blindly: `RESOURCE:*` and `AGENT` mean capacity is missing, and a loop turns that into a throttling problem. Back off, or fail the test.
- `stop_task` in a `finally` and a **janitor** for leftovers (list by `startedBy`/tag, stop, deregister) keep a failed test run from costing money.

## Running a Task from a pytest Harness

```python
# tests/smoke/test_job.py (shape; the real fixtures are in 05 and 06)
@pytest.mark.aws_smoke
def test_migration_exits_zero(ecs, cfg, taskdef):
    result = run_and_wait(ecs, cluster=cfg["cluster"], task_definition=taskdef, subnets=cfg["subnets"],
                          security_groups=cfg["security_groups"], command=["python", "-m", "migrate"], tags={"purpose": "smoke"})
    assert result.ok
```

Failures then read as `TaskFailedError: task 1f3a... failed: stopCode=EssentialContainerExited reason='Essential container in task exited' exit={'app': 3}` instead of a bare timeout.

## Quick Rules

1. **Use the `ecs` client**, qualify task definitions as `family:revision`, and register once per image tag.
2. **After `run_task`, check `failures` before reading `tasks`.** After `describe_*`, check `failures` for `MISSING`.
3. **Pass `WaiterConfig`** and decide per waiter what failure means; `tasks_stopped` never fails early.
4. **Treat a missing `exitCode` as failure** and read `stopCode`, `stoppedReason` and `containers[].reason` with it.
5. **Always stop what you start**: `stop_task` in `finally`, tags and `startedBy` for the janitor.
6. **Generate `clientToken` once per logical call** so botocore retries cannot duplicate tasks.
7. **Batch and page**: 100 tasks and 10 services per `describe`, paginators for `list_*`, and do not poll in a tight loop.
8. **Catch modeled exceptions** (`ecs.exceptions.ClusterNotFoundException`), and remember which operations return `failures` instead of raising.
9. **After `services_stable`, check which revision is live**; it also succeeds after a rollback.

---
## See also
- [Amazon ECS — Overview](./index.md)
- [Amazon ECS — Services, Deployments & Networking](./02-services-deployments-networking.md)
- [Amazon ECS — Testing ECS-Based Systems](./05-testing.md)
- [AWS Foundations — Clients, Config, Retries & Errors](../foundations/01-clients-config-errors.md)
- [AWS Foundations — Credentials, IAM & Local Testing](../foundations/02-credentials-iam-local-testing.md)
- [Pytest — Python Testing Framework](../../libs/pytest/index.md)
