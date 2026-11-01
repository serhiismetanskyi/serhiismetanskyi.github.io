---
date: 2026-10-21 12:00:00
tags:
  - aws
  - ec2
  - testing
  - moto
  - ci
  - github-actions
---

# Amazon EC2 — moto Gaps, Smoke Tests & CI

[05](./05-testing.md) and [06](./06-compliance-imds-scaling-tests.md) show what moto does well. This page is about its limits and what to use instead: the documented differences, a real-account smoke test, GitHub Actions with OIDC, a janitor job, pitfalls and a QA checklist.

## What moto Does Not Emulate

An EC2 emulator stores API objects; **it cannot run an instance**. If one of these behaviours changes after a moto upgrade, moto improved: update your tests and expectations. The "real EC2" column comes from the AWS documentation.

| Area | moto | Real EC2 (documented) |
|------|------------|-----------------------|
| Unknown AMI ID, instance type (`t99.huge`), key pair name | Accepted | `InvalidAMIID.NotFound`, `InvalidKeyPair.NotFound`, a parameter error |
| `ImageId="resolve:ssm:..."` | Stored literally (`Architecture` stays `x86_64` even for an arm64 alias) | Resolved to an AMI ID at launch |
| Malformed ID (`"bogus"`) | `InvalidInstanceID.NotFound` | `InvalidInstanceID.Malformed` |
| vCPU quota | 20 x `m5.24xlarge` (1,920 vCPUs) launched | `VcpuLimitExceeded` (new accounts start at 5 vCPUs) |
| `MinCount=1, MaxCount=20` | Launches **1** | Launches as many as fit, up to `MaxCount` |
| `ClientToken` | Ignored: two launches, different IDs; no `IdempotentParameterMismatch` | Idempotent; mismatch error |
| IAM and `DryRun` | `DryRunOperation` always, `UnauthorizedOperation` never | Permissions evaluated |
| Instance state | `pending` only in the `run_instances` response, `running` at once | Tens of seconds in `pending` |
| Status checks and waiters | `ok` immediately; `instance_status_ok` passes on the first poll | `initializing` for minutes |
| Terminated instance | `start_instances` succeeds (`pending`) | `IncorrectInstanceState` |
| User data, boot, processes | Never runs; `get_console_output` is a canned 2006 kernel banner | The OS boots and runs cloud-init |
| Launch template `MetadataOptions` | **Not applied**: instance has `HttpTokens=optional`, hop limit 1 | Applied |
| `get/modify_instance_metadata_defaults` | `NotImplementedError` | Account-level IMDS defaults |
| `modify_instance_metadata_options` | Options you did not pass are **reset** (send the complete set) | See the AWS documentation |
| Spot | `InstanceLifecycle: spot`, but **no Spot request record**; price history is canned (`0.00001`, year 2006); no interruption notice | Spot request, real prices, two-minute notice |
| Auto Scaling | `MinSize > MaxSize` and `DesiredCapacity > MaxSize` accepted (group grows to 9); `set_instance_health(Unhealthy)` does not replace the instance; target-tracking `put_scaling_policy` returns no `PolicyARN`; `start_instance_refresh` `NotImplementedError`; policies never evaluated | Validation errors; replacement; alarms; refresh |
| Target groups | Targets `healthy` immediately | `initial`, then health checks decide |
| Systems Manager | `send_command` is `Success` instantly (even `exit 1`); `describe_instance_information`, `start_session` `NotImplementedError` | Commands run and report |
| CloudWatch | No `AWS/EC2` metrics; alarms stay `OK` | Metrics every 1 or 5 minutes; alarms evaluate |
| IAM managed policies | `attach_role_policy("arn:aws:iam::aws:policy/...")` fails unless `MOTO_IAM_LOAD_MANAGED_POLICIES=true` | Always available |
| Security group enforcement, routing, public reachability | Rules are stored and returned; no packet ever flows; IPs are random | Enforced by the network |
| IMDS (`169.254.169.254`), instance credentials, `RequestLimitExceeded`, billing | Absent | Present |

What moto **does** match: tags at creation (instances and volumes), filters and pagination, `DryRun` returning `DryRunOperation`, security-group duplicate errors and `describe_security_group_rules`, `InvalidInstanceID.NotFound`, stop/start/terminate state transitions, termination protection (`OperationNotPermitted`), instance profile lookup (`NoSuchEntity` for a missing profile), launch template defaults for type, security groups and tags, ASG capacity, tag propagation and replacement of an instance terminated behind the group's back, default VPC with one subnet per AZ, and `describe_instance_types` data.

```python
def test_client_token_is_not_honoured(ec2):
    a = run(ec2, ClientToken="same")["Instances"][0]["InstanceId"]
    b = run(ec2, ClientToken="same")["Instances"][0]["InstanceId"]
    assert a != b                                                                      # real: the retry returns the first instance
    run(ec2, ClientToken="same", InstanceType="m5.large")                              # real: IdempotentParameterMismatch


def test_dry_run_always_reports_permission_granted(ec2, net):
    p = build_run_params(ami_id=AMI, instance_type="t3.micro", subnet_id=net["subnet"], security_group_ids=[net["sg"]],
                         tags={"owner": "qa", "env": "test"}, run_id="t", name="n")
    assert can_launch(ec2, **p) is True                                                # IAM is not evaluated: UnauthorizedOperation never happens


# --- time and state ------------------------------------------------------------------------------------------
def test_instances_are_running_and_healthy_immediately(ec2):
    r = run(ec2)["Instances"][0]
    assert r["State"]["Name"] == "pending"                                             # only the run_instances response says pending
    iid = r["InstanceId"]
    assert ec2.describe_instances(InstanceIds=[iid])["Reservations"][0]["Instances"][0]["State"]["Name"] == "running"
    status = ec2.describe_instance_status(InstanceIds=[iid])["InstanceStatuses"][0]
    assert status["InstanceStatus"]["Status"] == status["SystemStatus"]["Status"] == "ok"      # real: "initializing" first
    ec2.get_waiter("instance_status_ok").wait(InstanceIds=[iid], WaiterConfig={"Delay": 1, "MaxAttempts": 1})   # first poll passes


def test_a_terminated_instance_can_be_started(ec2):
    iid = run(ec2)["Instances"][0]["InstanceId"]
    ec2.terminate_instances(InstanceIds=[iid])
    out = ec2.start_instances(InstanceIds=[iid])["StartingInstances"][0]["CurrentState"]["Name"]
    assert out == "pending"                                                            # real: IncorrectInstanceState


```

Whatever in that table matters to you (idempotency, quotas, IAM, boot, user data, IMDS, health checks) belongs in the smoke test or in infrastructure review.

## Alternatives to moto

| Tool | Use | Notes |
|------|-----|-------|
| `Stubber` | Scripted responses and errors, exact request checks | No behaviour; the right tool for `InsufficientInstanceCapacity`, `RequestLimitExceeded`, instance refresh |
| Fake IMDS (this guide) | Credential path on "instances" | ~60 lines of stdlib ([06](./06-compliance-imds-scaling-tests.md#testing-the-credential-path-with-a-fake-imds)) |
| **Docker / a local VM** | Run user data or an image for real | Not EC2, but real boot behaviour: [Docker](../../tools/docker/index.md) |
| Other AWS emulators | Broader API coverage | Check licence, account requirements and what "instance" means in the **current** version before using them |
| **Real account** | Boot, IAM, networking, quotas, Spot, health checks | Sandbox account, tags, cleanup, budget |

## Real-Account Smoke Test

One test that does what moto cannot: `DryRun` the launch (IAM), start a tiny instance from the latest AL2023 AMI with the real request builder, wait for **both status checks**, and assert the real service applied the settings (tags present, IMDSv1 off). It is skipped unless enabled, **replaces the fake-credential fixture on purpose**, refuses to run in the wrong account, and terminates in `finally`.

```python
"""Real-account smoke test. Skipped unless RUN_AWS_SMOKE=1.
IMPORTANT: the autouse `aws_env` fixture in tests/conftest.py sets FAKE credentials. This module overrides it."""
import os
import uuid

import boto3
import pytest
from botocore.config import Config

from app.compliance import imdsv1_enabled, iter_instances, missing_tags
from app.launch import build_run_params, can_launch, latest_al2023_ami, launch_and_wait, terminate_run
from app.userdata import TEMPLATE, render_user_data

pytestmark = [
    pytest.mark.aws_smoke,
    pytest.mark.skipif(os.environ.get("RUN_AWS_SMOKE") != "1", reason="set RUN_AWS_SMOKE=1 in the sandbox account"),
]
REAL = Config(retries={"mode": "standard", "max_attempts": 5}, connect_timeout=5, read_timeout=30)


@pytest.fixture(autouse=True)
def aws_env(monkeypatch):                              # same name as the root fixture: pytest uses the closest one
    """Do NOT set fake credentials here. Take the real ones (OIDC role in CI) but pin region and refuse a wrong account."""
    monkeypatch.setenv("AWS_DEFAULT_REGION", os.environ.get("SMOKE_REGION", "eu-west-1"))


@pytest.fixture(scope="module")
def clients():
    sts = boto3.client("sts", config=REAL)
    account = sts.get_caller_identity()["Account"]
    assert account == os.environ["SMOKE_ACCOUNT_ID"], f"refusing to run in account {account}"
    return {"ec2": boto3.client("ec2", config=REAL), "ssm": boto3.client("ssm", config=REAL)}


@pytest.fixture
def smoke_run(clients):
    rid = f"smoke-{uuid.uuid4().hex[:8]}"
    try:
        yield rid
    finally:
        terminate_run(clients["ec2"], rid)             # runs even when the test body fails


def test_launch_ssm_agent_boot_and_iam(clients, smoke_run):
    ec2, ssm = clients["ec2"], clients["ssm"]
    params = build_run_params(
        ami_id=latest_al2023_ami(ssm, "arm64"), instance_type="t4g.nano",           # a tiny Graviton type: very low hourly cost
        subnet_id=os.environ["SMOKE_SUBNET_ID"], security_group_ids=[os.environ["SMOKE_SG_ID"]],
        tags={"owner": "qa-smoke", "env": "test"}, run_id=smoke_run, name=smoke_run,
        user_data=render_user_data(TEMPLATE, role="smoke", packages="jq", service="amazon-ssm-agent"),
        profile_name=os.environ["SMOKE_PROFILE"],
    )
    assert can_launch(ec2, **params), "the smoke role may not launch instances: fix IAM before debugging anything else"
    iid = launch_and_wait(ec2, params, timeout_s=300)
    ec2.get_waiter("instance_status_ok").wait(InstanceIds=[iid], WaiterConfig={"Delay": 15, "MaxAttempts": 40})
    inst = next(iter_instances(ec2.describe_instances(InstanceIds=[iid])))
    assert missing_tags(inst) == [] and imdsv1_enabled([inst]) == []           # IMDSv2 really applied by the real service
```

Extend it with what only a real instance can show: user data wrote its marker (read it through an SSM command, [04](./04-scaling-load-balancing-operations.md#run-command-and-patch-manager)), the instance appears in `describe_instance_information`, the role can read **only** its S3 prefix, IMDSv1 requests are rejected, and the private subnet has no route to the internet.

To check the helper wiring and the account guard (not AWS behaviour), the same test can be pointed at a local moto server with `AWS_ENDPOINT_URL=http://127.0.0.1:5055`, after creating a subnet, security group and instance profile there.

## Janitor Job

Tests leak. A scheduled job terminates in-scope instances older than N hours, is **dry-run by default**, never touches anything without `env=test`, and honours `keep=true`:

```python
"""Scheduled cleanup: terminate test instances that outlived their welcome. Safe by default (dry run)."""
import datetime as dt

SCOPE_TAG = ("env", "test")                    # only ever touch instances that carry env=test


def expired(instances, now, max_age=dt.timedelta(hours=8), keep_tag="keep"):
    """Instance IDs older than max_age, unless tagged keep=true. Pure: feed it describe_instances output."""
    out = []
    for inst in instances:
        tags = {t["Key"]: t["Value"] for t in inst.get("Tags", [])}
        if tags.get(keep_tag) != "true" and now - inst["LaunchTime"] > max_age:
            out.append(inst["InstanceId"])
    return out


def janitor(ec2, now, max_age=dt.timedelta(hours=8), dry_run=True):
    """Find (and, with dry_run=False, terminate) expired instances in scope. Returns the IDs."""
    pages = ec2.get_paginator("describe_instances").paginate(Filters=[
        {"Name": f"tag:{SCOPE_TAG[0]}", "Values": [SCOPE_TAG[1]]},
        {"Name": "instance-state-name", "Values": ["pending", "running", "stopping", "stopped"]},
    ])
    candidates = [i for p in pages for r in p["Reservations"] for i in r["Instances"]]
    ids = expired(candidates, now, max_age)
    if ids and not dry_run:
        ec2.terminate_instances(InstanceIds=ids)
    return ids


if __name__ == "__main__":                      # python -m app.janitor [--delete]
    import sys

    import boto3

    delete = "--delete" in sys.argv
    found = janitor(boto3.client("ec2"), dt.datetime.now(dt.timezone.utc), dry_run=not delete)
    print(("terminated" if delete else "would terminate"), found)
```

```python
import datetime as dt

from app.janitor import expired, janitor
from tests.conftest import AMI

HOURS = dt.timedelta(hours=1)


def launch(ec2, net, name, tags):
    resp = ec2.run_instances(ImageId=AMI, MinCount=1, MaxCount=1, SubnetId=net["subnet"], TagSpecifications=[
        {"ResourceType": "instance", "Tags": [{"Key": "Name", "Value": name}] + [{"Key": k, "Value": v} for k, v in tags.items()]}])
    return resp["Instances"][0]["InstanceId"]


def test_expired_is_a_pure_function_of_age_and_keep_tag():
    now = dt.datetime(2026, 10, 21, 12, tzinfo=dt.timezone.utc)
    sample = [
        {"InstanceId": "i-old", "LaunchTime": now - 20 * HOURS},
        {"InstanceId": "i-new", "LaunchTime": now - 1 * HOURS},
        {"InstanceId": "i-keep", "LaunchTime": now - 99 * HOURS, "Tags": [{"Key": "keep", "Value": "true"}]},
    ]
    assert expired(sample, now) == ["i-old"]


def test_janitor_is_scoped_dry_by_default_and_terminates_on_request(ec2, net):
    mine = launch(ec2, net, "mine", {"env": "test"})
    protected = launch(ec2, net, "protected", {"env": "test", "keep": "true"})
    prod = launch(ec2, net, "prod", {"env": "prod"})                      # out of scope: never touched
    later = dt.datetime.now(dt.timezone.utc) + 10 * HOURS                 # pretend ten hours have passed
    assert janitor(ec2, later) == [mine]                                  # dry run: reports only
    state = lambda i: ec2.describe_instances(InstanceIds=[i])["Reservations"][0]["Instances"][0]["State"]["Name"]   # noqa: E731
    assert state(mine) == "running"
    assert janitor(ec2, later, dry_run=False) == [mine]
    assert (state(mine), state(protected), state(prod)) == ("terminated", "running", "running")
    assert janitor(ec2, later, dry_run=False) == []                       # idempotent
```

Give the janitor its own role: `ec2:Describe*` plus `ec2:TerminateInstances` with `aws:ResourceTag/env = test`. Alarm if it ever terminates more than a handful of instances in one run.

## GitHub Actions with OIDC

No stored keys: the job exchanges its OIDC token for a short-lived role session ([Foundations](../foundations/02-credentials-iam-local-testing.md#the-credential-provider-chain)). The role's trust policy decides which repository and branch may assume it:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Federated": "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"},
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {"token.actions.githubusercontent.com:aud": "sts.amazonaws.com"},
      "StringLike": {"token.actions.githubusercontent.com:sub": "repo:acme/app:ref:refs/heads/main"}
    }
  }]
}
```

```yaml
# .github/workflows/aws-ec2-smoke.yml  (needs an IAM role that trusts GitHub's OIDC provider)
name: aws-ec2-smoke
on:
  schedule: [{cron: "0 5 * * 1"}]               # weekly; never on every push
  workflow_dispatch: {}
permissions:
  id-token: write                               # lets the job request an OIDC token
  contents: read
concurrency:
  group: aws-ec2-smoke                          # one smoke run at a time: no quota races, no double bills
  cancel-in-progress: false

jobs:
  smoke:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      RUN_AWS_SMOKE: "1"
      SMOKE_REGION: eu-west-1
      SMOKE_ACCOUNT_ID: ${{ vars.SMOKE_ACCOUNT_ID }}       # the test refuses to run in any other account
      SMOKE_SUBNET_ID: ${{ vars.SMOKE_SUBNET_ID }}
      SMOKE_SG_ID: ${{ vars.SMOKE_SG_ID }}                 # a group with no inbound rules: Session Manager only
      SMOKE_PROFILE: smoke-instance-profile
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v4
      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: arn:aws:iam::123456789012:role/ci-ec2-smoke     # placeholder account ID
          aws-region: eu-west-1
      - run: uv sync --locked
      - run: uv run pytest -m aws_smoke -q
      - name: Sweep leftovers even if the test crashed
        if: always()
        run: uv run python -m app.janitor --delete
```

```yaml
# .github/workflows/aws-ec2-janitor.yml
name: aws-ec2-janitor
on:
  schedule: [{cron: "17 * * * *"}]              # hourly
permissions:
  id-token: write
  contents: read
jobs:
  janitor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v4
      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: arn:aws:iam::123456789012:role/ci-ec2-janitor   # may only terminate instances tagged env=test
          aws-region: eu-west-1
      - run: uv sync --locked
      - run: uv run python -m app.janitor --delete
```

Pin a role per purpose (smoke, janitor), scope the smoke role with the tag conditions from [02](./02-networking-security-iam.md#least-privilege-policies), and keep the unit and moto suites in a **separate** job without `id-token: write`, so ordinary pull requests never get AWS access. See [CI/CD](../../ci-cd-approaches/index.md) for pipeline structure.

## Cloud Metrics for Load Tests

moto emits no `AWS/EC2` metrics, so load tests run on real instances. CloudWatch EC2 metrics are 5-minute data by default (1 minute with detailed monitoring), arrive with a delay, and exclude memory, so for a load generator:

| Need | Use |
|------|-----|
| Saturation of the generator | `CPUUtilization` (and `CPUCreditBalance` on `T` types: do not use `T` for this); `NetworkOut` |
| Memory, disk, process counters | CloudWatch agent or the load tool's own metrics ([Performance Testing](../../performance-testing/index.md)) |
| Throttling | `RequestLimitExceeded` in your own logs; vCPU `AWS/Usage` `ResourceCount` against the quota |
| Assertions | Poll with a deadline of several periods; never assert on one datapoint |

## Pitfalls

| Pitfall | Why tests flake or mislead | Fix |
|---------|---------------------------|-----|
| Trusting `running` as "ready" | The OS and your service need minutes | `instance_status_ok`, then an application check |
| Testing idempotency, quota, IAM on moto | moto ignores them | Stubber for the error path, smoke for the real one |
| Hard-coded AMI ID | Wrong Region, deprecated | SSM parameter |
| Using the Region's default VPC in smoke tests | Public subnets, shared state | A dedicated subnet and a no-inbound security group |
| No cleanup on test crash | Instances bill for days | `finally`, `terminate` on shutdown, janitor |
| `T` instance as a load generator | Credits run out, results drift | `C` or `M` type |
| Asserting immediately after `run_instances` | `InvalidInstanceID.NotFound` (eventual consistency) | `instance_exists` waiter |
| Fixed `sleep(60)` for boot | Slow when it is fast, flaky when it is slow | Waiters and deadlines |
| `AWS_PROFILE` or SSO leaking into tests | Real calls | Autouse fixture, `AWS_CONFIG_FILE=/dev/null` |
| IMDS lookups on a laptop or CI runner | 1 s stalls while botocore probes the metadata IP | `AWS_EC2_METADATA_DISABLED=true` (only when you are *not* on EC2) |
| Shared smoke account without tags | Nobody knows whose instances are whose | `owner` and `run-id` tags, per-run unique names |
| Upgrading moto blindly | Behaviour changes | Pin boto3 and moto; the gap tests tell you what improved |

## QA Checklist

- [ ] Launch requests come from one pure builder; tests assert IMDSv2, encrypted volumes, tags on instance **and** volume, `terminate` on shutdown, a deterministic `ClientToken`
- [ ] User data is rendered strictly, validated (shebang, 16 KB) and covered by a smoke assertion that it ran
- [ ] `DryRun`, `InsufficientInstanceCapacity` and quota errors are covered with Stubber
- [ ] Every test has a unique `run-id` and terminates in `finally`; a janitor runs on a schedule
- [ ] Compliance checks (no `0.0.0.0/0` on 22 and 3389, required tags, no IMDSv1) run on moto output in CI and on real output in a scheduled audit
- [ ] The credential path is tested with a fake IMDS, including the v1 fallback
- [ ] Security groups reference groups; instances live in private subnets; access is by Session Manager
- [ ] The smoke test is opt-in, checks the account ID, uses a tiny instance and runs weekly under an OIDC role
- [ ] Load tests use `C`/`M` instances, check CloudWatch with deadlines and clean up by tag
- [ ] boto3 and moto are pinned; gap tests are re-run on upgrade
- [ ] A budget alarm and a low vCPU quota protect the sandbox account

---
## See also
- [Amazon EC2 — Instances, Networking & Testing](./index.md)
- [Amazon EC2 — Testing EC2-Based Systems](./05-testing.md)
- [Amazon EC2 — Compliance, Credential-Path & Scaling Tests](./06-compliance-imds-scaling-tests.md)
- [Amazon EC2 — Scaling, Load Balancing & Operations](./04-scaling-load-balancing-operations.md)
- [AWS Foundations — Credentials, IAM & Local Testing](../foundations/02-credentials-iam-local-testing.md)
- [Amazon SQS — moto Gaps, Smoke Tests, Load & CI](../sqs/06-moto-gaps-smoke-load-ci.md)
- [CI/CD](../../ci-cd-approaches/index.md)
- [Performance Testing](../../performance-testing/index.md)
- [Docker & Docker Compose — Overview](../../tools/docker/index.md)
