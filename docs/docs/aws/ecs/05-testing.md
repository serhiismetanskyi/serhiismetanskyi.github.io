---
date: 2026-10-21 12:00:00
tags:
  - aws
  - ecs
  - testing
  - pytest
  - moto
  - docker
---

# Amazon ECS — Testing ECS-Based Systems

## What to Test Where

| Level | What | ECS |
|-------|------|-----|
| **Unit** | Task-definition builders and validators, config parsing, shutdown logic, result classification | None: plain functions and dicts |
| **Container** | The image: starts as non-root, answers `/health`, exits 0 on SIGTERM, honours its environment | Docker locally ([Docker guide](../../tools/docker/index.md)); no AWS |
| **Client contract** | The exact `run_task` / `update_service` requests and your reaction to `failures`, exit codes, throttling, waiter timeouts | `botocore.stub.Stubber` ([Foundations](../foundations/02-credentials-iam-local-testing.md)) |
| **Integration (control plane)** | Cluster, task definition and service CRUD, `run_task` happy path, tags, waiters, error types | **moto** `mock_aws`, or the moto server for other processes |
| **Smoke** | A real Fargate task: image pull, roles, networking, exit codes, a deploy | A real account, one small marked job ([06](./06-moto-gaps-smoke-ci.md#real-account-smoke-test)) |

Most ECS bugs are **configuration bugs** (wrong size pair, missing role, plaintext secret, shell-form `CMD`) and **result-handling bugs** (ignored `failures`, missing `exitCode`). The first kind is caught by validating the task definition and testing the container; the second by Stubber. moto adds the control-plane flow, but it never runs a container and it is lenient where AWS is strict ([06](./06-moto-gaps-smoke-ci.md#what-moto-does-not-emulate)).

## Project Layout

```text
app/        taskdef.py  runner.py  deploy.py  verify.py  settings.py  metadata.py  protection.py  graceful.py  api.py  tfplan.py  janitor.py
tests/
  conftest.py                                                   fixtures: fake credentials, moto, cluster, task definition, network
  test_taskdef.py   test_tfplan.py                     builder, validator, botocore shape checks, Terraform plan values
  test_settings_metadata.py   test_verify.py            config, task metadata, scale-in protection, version polling
  test_janitor.py                                           leftover tasks and smoke task definitions
  test_runner_stubber.py   test_deploy_stubber.py       failures, exit codes, rollback logic: scripted responses
  test_runner_moto.py   test_moto_ecs.py               run_and_wait and control-plane behaviour on moto
  test_server_mode.py   test_sigterm.py                 moto server over HTTP; real SIGTERM, Docker stop
  test_moto_gaps.py                                        moto differences
  smoke/test_ecs_smoke.py                                   real account, skipped by default
```

The smoke tests are skipped unless `RUN_AWS_SMOKE=1`.

## Fixtures: Fake Credentials, moto, a Cluster, a Task Definition

```python
# tests/conftest.py (excerpt)
@pytest.fixture(autouse=True)
def aws_env(monkeypatch):
    """Fake credentials, a fixed region and no access to ~/.aws: nothing can reach a real account."""
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_SESSION_TOKEN", "testing")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    monkeypatch.delenv("AWS_PROFILE", raising=False)
    monkeypatch.setenv("AWS_CONFIG_FILE", "/dev/null")
    monkeypatch.setenv("AWS_SHARED_CREDENTIALS_FILE", "/dev/null")
    monkeypatch.delenv("AWS_ENDPOINT_URL", raising=False)


@pytest.fixture
def aws():
    with mock_aws():                                  # fresh, empty backend for every test
        yield
    state_manager.unset_transition("ecs::task")       # undo any progression override: this state is process-global


@pytest.fixture
def ecs(aws):
    return boto3.client("ecs", config=ECS_CONFIG)


@pytest.fixture
def network(ec2):
    """Subnet and security group of moto's default VPC."""
    return {"subnets": [ec2.describe_subnets()["Subnets"][0]["SubnetId"]],
            "security_groups": [ec2.describe_security_groups()["SecurityGroups"][0]["GroupId"]]}


@pytest.fixture
def cluster(ecs, unique):
    name = unique("qa")
    ecs.create_cluster(clusterName=name, tags=[{"key": "purpose", "value": "tests"}])
    return name


@pytest.fixture
def taskdef(ecs, unique):
    """Register a Fargate task definition and return family:revision."""
    td = build_task_definition(unique("job"), "public.ecr.aws/docker/library/busybox:1.37", execution_role_arn=EXEC, task_role_arn=TASK)
    td["containerDefinitions"][0]["memory"] = 256     # moto run_task needs container-level memory (see 06)
    return ecs.register_task_definition(**td)["taskDefinition"]["taskDefinitionArn"].rsplit("/", 1)[-1]
```

- `aws_env` is the same autouse guard as in [Foundations](../foundations/02-credentials-iam-local-testing.md#a-safe-conftestpy). A forgotten `mock_aws` then fails with an authentication error instead of calling AWS.
- `moto` gives every test its own backend. The **one piece of global state** is the task state-machine override (`state_manager`), which is why the fixture clears it afterwards.
- `unique` (a per-run suffix) keeps names collision-free for `pytest -n`, the moto server and a real account.
- moto ships a default VPC, so `describe_subnets` and `describe_security_groups` return something usable. On a real account pass your sandbox network through environment variables.

## Validating Task Definitions

A task definition is data, so check it like data, **before** AWS sees it. `validate_task_definition` returns a list of violations; the tests parametrize over one mutation per rule.

| Rule | Why |
|------|-----|
| `family` matches `[A-Za-z0-9_-]{1,255}` | The documented naming rule |
| Fargate: `networkMode` is `awsvpc`, `cpu` and `memory` present, and the pair is in the size table | Wrong pairs are rejected by real ECS but **accepted by moto** |
| 1 to 10 containers, unique names, at least one essential | Documented limits |
| `executionRoleArn` and `taskRoleArn` set | Missing execution role: no image pull, no logs. Missing task role: no AWS permissions for the app (a team policy here, not an API rule) |
| Image pinned: no `:latest`, no untagged image | Team policy: a revision should mean one image |
| `awslogs` with `awslogs-group`, `awslogs-region`, `awslogs-stream-prefix` | Logs must land somewhere you can read |
| No secret-looking name in `environment` (`PASSWORD`, `SECRET`, `TOKEN`, `API_KEY`, ...) | Plaintext secrets end up in task definition revisions and the console |
| `secrets[].valueFrom` is a Secrets Manager or SSM ARN | A plain string would fail at start |
| `stopTimeout` at most 120; `healthCheck` starts with `CMD` or `CMD-SHELL`; `dependsOn` names exist | Documented parameter rules |

```python
# tests/test_taskdef.py (excerpt)
@pytest.mark.parametrize("cpu,memory", [(256, 4096), (512, 512), (1024, 1500), (300, 512), (2048, 2048)])
def test_invalid_cpu_memory_combinations_are_rejected(cpu, memory):
    assert any("not a valid Fargate size" in p for p in validate_task_definition(good(cpu=cpu, memory=memory)))

@pytest.mark.parametrize("name,change,expected", [
    ("latest tag", lambda t: t["containerDefinitions"][0].update(image="repo/orders:latest"), "not latest"),
    ("no execution role", lambda t: t.pop("executionRoleArn"), "executionRoleArn is required"),
    ("plaintext secret", lambda t: t["containerDefinitions"][0].update(environment=[{"name": "DB_PASSWORD", "value": "hunter2"}]), "looks like a secret"),
    ("stopTimeout 300", lambda t: t["containerDefinitions"][0].update(stopTimeout=300), "120"),
    # ... 13 mutations in total
])
def test_each_rule_catches_its_violation(name, change, expected):
    td = good(); change(td)
    assert any(expected in p for p in validate_task_definition(td)), (name, validate_task_definition(td))

def test_every_documented_size_is_accepted():              # all 74 pairs of the size table pass
    for cpu, memories in FARGATE_SIZES.items():
        for memory in memories:
            assert validate_task_definition(good(cpu=cpu, memory=memory)) == []
```

**Shape errors** (a typo in a key, a string where an integer belongs) are caught by botocore's own validator, offline, with no client call and no credentials:

```python
from botocore.validate import validate_parameters

shape = boto3.client("ecs", region_name="us-east-1").meta.service_model.operation_model("RegisterTaskDefinition").input_shape
validate_parameters(good(), shape)                                         # raises ParamValidationError on any mismatch

td = good(); td["containerDefinitions"][0]["essentail"] = True            # typo
validate_parameters(td, shape)                                             # ParamValidationError: Unknown parameter in containerDefinitions[0]: "essentail"
```

Four parametrized tests cover a typo, `stopTimeout="30"`, `cpu=256` (integer) and a string `containerPort`. The same two checks run in CI over **every task-definition file in the repository**:

```python
def test_files_in_the_repository_are_validated():
    for f in sorted((pathlib.Path(__file__).parent / "taskdefs").glob("*.json")):
        assert validate_task_definition(json.loads(f.read_text())) == [], f.name
```

Where the JSON comes from depends on your tooling: hand-written files, `cdk synth` output, or `terraform show -json plan`. `app/tfplan.py` converts the snake_case values of an `aws_ecs_task_definition` resource (`container_definitions` is a JSON string) into the camelCase arguments, including resources in child modules; two tests run it on a **hand-written** plan fragment. In a real plan, role ARNs that refer to resources created in the same apply are "known after apply" and absent, so run the role rules on the applied definition (`aws ecs describe-task-definition`) too.

## Stubber: Failures and Exit Codes

Stubber replaces the HTTP layer with a queue of responses, so it can produce what moto cannot: `failures` on `run_task`, non-zero exit codes, `OutOfMemoryError`, a container that never started, a task that never stops, and throttling.

```python
# tests/test_runner_stubber.py (excerpt)
def stopped_task(*, exit_code=0, stop_code="EssentialContainerExited", stopped_reason="Essential container in task exited", reason=None):
    container = {"name": "app", "exitCode": exit_code}
    if reason:
        container["reason"] = reason
    return {"taskArn": ARN, "lastStatus": "STOPPED", "stopCode": stop_code, "stoppedReason": stopped_reason, "containers": [container]}


def test_http_200_with_failures_raises_taskstarterror(ecs):
    failure = {"arn": "arn:aws:ecs:us-east-1:123456789012:container-instance/x", "reason": "RESOURCE:ENI", "detail": "no ENI attachment point"}
    with Stubber(ecs) as stub:
        stub.add_response("run_task", {"tasks": [], "failures": [failure]})
        with pytest.raises(TaskStartError) as ei:
            run_and_wait(ecs, **KW)
    assert ei.value.failures == [failure] and "RESOURCE:ENI" in str(ei.value)


def test_oom_kill_shows_exit_137_and_a_container_reason(ecs):
    with Stubber(ecs) as stub:
        script_run(stub, stopped_task(exit_code=137, reason="OutOfMemoryError: Container killed due to memory usage"))
        with pytest.raises(TaskFailedError) as ei:
            run_and_wait(ecs, **KW)
    assert ei.value.result.exit_codes["app"] == 137 and "OutOfMemoryError" in ei.value.result.container_reasons["app"]


def test_image_pull_failure_has_no_exit_code(ecs):
    """A container that never started has no exitCode; None must not be mistaken for success."""
    task = {"taskArn": ARN, "lastStatus": "STOPPED", "stopCode": "TaskFailedToStart", "stoppedReason": "CannotPullContainerError: pull access denied",
            "containers": [{"name": "app", "reason": "CannotPullContainerError: pull access denied"}]}
    with Stubber(ecs) as stub:
        script_run(stub, task)
        with pytest.raises(TaskFailedError) as ei:
            run_and_wait(ecs, **KW)
    assert ei.value.result.exit_codes == {"app": None} and ei.value.result.stop_code == "TaskFailedToStart"
```

| Test | Proves |
|------|--------|
| Request shape | `run_task` sends the strategy, `awsvpcConfiguration`, overrides, `startedBy`, tags, `propagateTags` and a `clientToken` (`expected_params` with `ANY` for the token) |
| `failures` | HTTP 200 with a `RESOURCE:ENI` failure raises `TaskStartError` carrying the failures |
| Non-zero exit | Exit 1 raises `TaskFailedError` with the stop code and exit codes |
| Out of memory | Exit 137 and a container `reason` are surfaced |
| No exit code | `exitCode` absent plus `TaskFailedToStart` is a failure, not success |
| Never stops | The waiter times out, the harness calls `stop_task` with a reason and raises `TimeoutError` |
| Throttling | `ThrottlingException` reaches the caller as a `ClientError` with its code |
| Task protection | `update_task_protection` request shape |

A Stubber test module does the same for [deploy-then-verify](./06-moto-gaps-smoke-ci.md#deploy-then-verify): success, **rollback by the circuit breaker detected through the live revision**, health-check failure with a manual rollback, a service that never stabilises, and a missing service reported as a `MISSING` failure. Stubber note from Foundations applies: it bypasses botocore's retry handler, so it cannot prove how many retries happen.

## moto: Control-Plane Behaviour

```python
# tests/test_runner_moto.py (excerpt)
def test_one_off_task_runs_to_completion(ecs, cluster, taskdef, network):
    # moto advances a task one lifecycle state per describe_tasks call: RUNNING -> ... -> STOPPED
    result = run_and_wait(ecs, cluster=cluster, task_definition=taskdef, poll_s=0, timeout_s=10, **network,
                          command=["echo", "migrated"], environment={"STAGE": "test"}, tags={"suite": "pytest"})
    assert result.ok and result.exit_codes == {"app": 0}


def test_unknown_cluster_raises_the_modeled_exception(ecs, taskdef, network):
    with pytest.raises(ecs.exceptions.ClusterNotFoundException):
        run_and_wait(ecs, cluster="does-not-exist", task_definition=taskdef, **network)
```

A moto test module covers what moto does well:

| Area | Behaviour |
|------|--------------------|
| Clusters | Create, describe, tags, settings (`containerInsights`), same name returns the same ARN |
| Task definitions | Revisions increase `1, 2, 3`; `deregister` marks `INACTIVE`; `list_task_definitions(status=...)` filters; the registered JSON comes back unchanged |
| Services | `create_service` returns `ACTIVE`, `PRIMARY` deployment with `rolloutState: IN_PROGRESS`; scale to 0, then delete; delete above 0 raises `InvalidParameterException` ("scaled above 0") |
| Errors | `describe_services` of a missing service: HTTP 200 with a `MISSING` failure; `update_service` raises `ServiceNotFoundException`; unknown cluster raises `ClusterNotFoundException` |
| `run_task` validation | `awsvpc` without `networkConfiguration`, and `launchType` together with a strategy, raise `InvalidParameterException`; a `FARGATE_SPOT` strategy is accepted |
| Tags, `startedBy`, overrides | Stored and returned; `list_tasks(startedBy=...)` filters |
| `stop_task` | Records the reason; `tasks_stopped` then succeeds; `list_tasks(desiredStatus="STOPPED")` finds it |

### The task state machine

moto moves a task one lifecycle state **per `describe_tasks` call** (the model name is `ecs::task`, default `manual` progression with `times: 1`). It starts at `RUNNING` and then follows the real names:

```text
describe_tasks #1 DEACTIVATING  #2 STOPPING  #3 DEPROVISIONING  #4 STOPPED  #5+ STOPPED
```

Consequences you will hit in your own tests:

- A `tasks_running` waiter **fails** ("matched expected path: STOPPED") after a few polls, because the task "runs" for zero describes. The test `test_tasks_running_waiter_needs_a_slower_state_machine` pins this.
- A one-off job test that waits for `tasks_stopped` works with no setup, as above.
- To keep a task `RUNNING` (a service-like test, a timeout test), slow the machine down:

```python
from moto.moto_api import state_manager
state_manager.set_transition("ecs::task", {"progression": "manual", "times": 1000})     # stays RUNNING for 1000 describes
# ... test ...
state_manager.unset_transition("ecs::task")                                            # global state: always undo it
```

Over HTTP use `POST /moto-api/state-manager/set-transition` with `{"model_name": "ecs::task", "transition": {...}}` (HTTP 201) and `/unset-transition`. `POST /moto-api/reset` wipes resources but **not** the transition override, so the server fixture resets both.

## Services Under moto

A service created in moto is a **record, not a scheduler**: it never starts tasks, so `runningCount` stays 0, `list_tasks` is empty and `services_stable` can never succeed. Test the code that **builds** the call (parameters, tags, network) with moto or Stubber, and the code that **reacts** to rollout states with Stubber scripts as in the deploy tests. Rollout behaviour (circuit breaker, health checks, ALB) can only be proved on a real cluster ([06](./06-moto-gaps-smoke-ci.md#real-account-smoke-test)).

## SIGTERM Tests

The shutdown path is behaviour of your process, so test it with a real signal. The first two tests need nothing but Python:

```python
# tests/test_sigterm.py (excerpt)
def test_sigterm_mid_job_lets_the_job_finish_and_exits_zero():
    proc = start_worker(job_seconds=1.0)                               # waits for the "ready" line
    time.sleep(0.3)                                                    # in the middle of job 1
    started = time.monotonic()
    proc.send_signal(signal.SIGTERM)                                   # what ECS sends first on stop
    out, _ = proc.communicate(timeout=5)
    assert proc.returncode == 0                                        # orderly stop: not 143, not 137
    assert out.splitlines() == ["job 1 done", "shutdown clean"]
    assert 0.5 < time.monotonic() - started < 2                        # waited for the job, did not run a second one
```

Two more run **Docker** (marked `docker`, skipped when Docker or the `python:3.13-slim-bookworm` image is missing). They mount `app/` into the image and compare the exec form with a shell wrapper under `docker stop -t 8`, the same SIGTERM, wait, SIGKILL sequence ECS applies with `stopTimeout=8`:

```python
@pytest.mark.docker
@pytest.mark.parametrize("command,expected_code", [
    (["python", "-m", "app.graceful", "5"], 0),                       # exec form: python is PID 1 and receives SIGTERM
    (["sh", "-c", "python -m app.graceful 5; echo exited"], 137),     # shell wrapper is PID 1 and swallows it: SIGKILL after the timeout
])
def test_docker_stop_signal_delivery(command, expected_code, tmp_path):
    ...  # docker run -d, sleep 1.5, docker stop -t 8, inspect ExitCode; assert (elapsed < 7) == (expected_code == 0)
```

Also test the image itself in CI before it is pushed: `docker build`, `docker run -d`, poll `/health`, `docker inspect` for `Health.Status` `healthy`, `docker stop` for exit code 0, and `docker exec <container> id -u` for a non-zero user. These are the checks run by hand in [04](./04-python-workload-patterns.md#the-image) (health `{"status":"ok","version":"1.4.2"}`, user 10001, stop in 0.45 s with exit 0). With Compose, put the API and a moto server in one network ([Docker Compose](../../tools/docker/03-docker-compose.md)) and point the container's `AWS_ENDPOINT_URL` at it.

## moto Server Mode

`mock_aws` patches boto3 inside the test process. A container, a Celery worker or another process needs a real endpoint: `ThreadedMotoServer` in a fixture, or `moto_server -p 5000`. Create the client with `endpoint_url`; the fake credentials come from `aws_env`.

```python
# tests/test_server_mode.py (excerpt)
@pytest.fixture(scope="module")
def moto_url():
    server = ThreadedMotoServer(ip_address="127.0.0.1", port=0, verbose=False)
    server.start()
    host, port = server.get_host_and_port()
    yield f"http://{host}:{port}"
    server.stop()

@pytest.fixture
def server_ecs(moto_url):
    requests.post(f"{moto_url}/moto-api/reset")                                                              # wipe resources...
    requests.post(f"{moto_url}/moto-api/state-manager/unset-transition", json={"model_name": "ecs::task"})   # ...and the state machine override
    cfg = Config(retries={"mode": "standard", "max_attempts": 1})        # a moto 500 should fail fast, not retry
    return boto3.client("ecs", endpoint_url=moto_url, config=cfg), boto3.client("ec2", endpoint_url=moto_url)
```

Three tests: a one-off task through `run_and_wait` over HTTP, the **HTTP 500** that moto returns for unsupported input (an in-process `TypeError` becomes `ClientError` with status 500 on the server, and standard retry mode would retry it), and slowing the state machine over HTTP. An action moto does not implement (`execute_command`, say) also answers HTTP 500 over HTTP, so server-mode failures can look like slow, retried errors; set `max_attempts` low in tests.

## Running the Suite

- **Markers** (`pytest.ini`): `docker` (needs a daemon), `aws_smoke` (real account); run `-m "not docker"` on machines without Docker.
- **pytest-xdist**: `-n 4` works because each test has its own moto backend and unique names; the global state-machine override is per process and is reset in the fixture.
- **No sleeps for synchronisation**: waiters run with `Delay: 0` against moto; the sleeps that remain wait for a signal or a timer being tested.


The two Docker tests dominate the run time, mostly waiting for the stop timeout.

---
## See also
- [Amazon ECS — Overview](./index.md)
- [Amazon ECS — boto3 in Python](./03-boto3-python.md)
- [Amazon ECS — Patterns for Python Workloads](./04-python-workload-patterns.md)
- [Amazon ECS — moto Gaps, Smoke Tests & CI](./06-moto-gaps-smoke-ci.md)
- [AWS Foundations — Credentials, IAM & Local Testing](../foundations/02-credentials-iam-local-testing.md)
- [Amazon SQS — Testing SQS-Based Systems](../sqs/05-testing.md)
- [Docker & Docker Compose](../../tools/docker/index.md)
- [Pytest — Python Testing Framework](../../libs/pytest/index.md)
