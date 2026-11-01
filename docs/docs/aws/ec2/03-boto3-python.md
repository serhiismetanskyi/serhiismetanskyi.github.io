---
date: 2026-10-21 12:00:00
tags:
  - aws
  - ec2
  - boto3
  - python
  - spot
---

# Amazon EC2 — boto3 in Python

Launching, waiting for, finding and cleaning up instances from Python. Clients, `Config`, retries and `ClientError` basics are in [Foundations](../foundations/01-clients-config-errors.md).

## Client vs Resource

| | `boto3.client("ec2")` | `boto3.resource("ec2")` |
|---|-----------------------|-------------------------|
| Shape | One method per API action, dict in, dict out | Objects (`Instance`, `SecurityGroup`) with attributes and actions |
| New features | Always | **None**: the boto3 docs say the resources interface gets no new features (existing ones keep working) |
| Pagination | `get_paginator` | Collections paginate for you (`res.instances.filter(...)`) |
| Waiting | `get_waiter(...).wait(...)` | `instance.wait_until_running()` |
| Use for | Application and test code | Quick scripts |

New code uses the **client**. The EC2 client has **no modeled exception classes** (`client.exceptions` only exposes `ClientError`): always catch `ClientError` and read `Error.Code`.

```python
CFG = Config(retries={"mode": "standard", "max_attempts": 5}, connect_timeout=5, read_timeout=30)
ec2 = boto3.client("ec2", config=CFG)                # one client per Region, reuse it; EC2 clients are thread-safe
```

## Resolving an AMI

```python
# 1. Let EC2 resolve the alias at launch (needs ssm:GetParameters on the parameter)
ALIAS = "resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
# 2. Or resolve it yourself, to log the exact AMI ID the test used
ssm = boto3.client("ssm", config=CFG)
ami_id = ssm.get_parameter(Name="/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64")["Parameter"]["Value"]
# 3. Your own golden images: newest first by CreationDate
mine = ec2.describe_images(Owners=["self"], Filters=[{"Name": "tag:app", "Values": ["web"]}, {"Name": "state", "Values": ["available"]}])["Images"]
newest = max(mine, key=lambda i: i["CreationDate"], default=None)
```

`resolve:ssm:` is resolved by EC2 at launch, so the AMI ID never appears in your code or launch template and **new instances pick up new images**; log the resolved ID (`instance["ImageId"]`) in test output. Auto Scaling launch templates support the alias too. **moto does not resolve the alias** ([07](./07-moto-gaps-smoke-ci.md)): in tests it is stored literally, so also unit-test the request shape.

## `run_instances` Anatomy

| Parameter | Use |
|-----------|-----|
| `ImageId`, `InstanceType`, `MinCount`, `MaxCount` | Required (`MinCount=MaxCount=1` for one). If capacity is short, `MinCount` fails the call and `MaxCount` launches "as many as fit" |
| `SubnetId`, `SecurityGroupIds` | Network placement (use together; do not mix with `NetworkInterfaces`) |
| `IamInstanceProfile` | `{"Name": ...}` or `{"Arn": ...}` |
| `MetadataOptions` | `HttpTokens="required"` and friends ([02](./02-networking-security-iam.md#imdsv2-and-how-boto3-gets-credentials-on-ec2)) |
| `BlockDeviceMappings` | Root and extra volumes: size, `gp3`, `Encrypted`, `DeleteOnTermination` |
| `TagSpecifications` | Tags at creation, per `ResourceType` (`instance`, `volume`, `network-interface`) |
| `UserData` | Plain text; **botocore base64-encodes it** for `run_instances` |
| `LaunchTemplate` | Take defaults from a template; request fields override it |
| `InstanceMarketOptions` | Spot |
| `InstanceInitiatedShutdownBehavior` | `stop` (default) or `terminate` |
| `DisableApiTermination` | Termination protection |
| `ClientToken` | Idempotency, up to 64 ASCII characters |
| `DryRun` | Check permissions and parameters only |

The request our tests and smoke job use is one **pure function**, so policy (IMDSv2, encryption, tags, shutdown behaviour, token) is unit-testable:

```python
"""Build and run EC2 launch requests. boto3 calls are kept thin; the request shape is a pure function."""
import hashlib
from collections.abc import Mapping, Sequence

from botocore.exceptions import ClientError

AL2023_PARAM = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-{arch}"   # arch: x86_64 | arm64


def latest_al2023_ami(ssm, arch: str = "x86_64") -> str:
    """Resolve the current AMI ID from the public SSM parameter (never hard-code AMI IDs)."""
    return ssm.get_parameter(Name=AL2023_PARAM.format(arch=arch))["Parameter"]["Value"]


def tag_list(tags: Mapping[str, str]) -> list[dict]:
    return [{"Key": k, "Value": v} for k, v in sorted(tags.items())]


def client_token(run_id: str, name: str) -> str:
    """Deterministic token: a retried launch of the same logical instance cannot create a second one."""
    return hashlib.sha256(f"{run_id}:{name}".encode()).hexdigest()[:32]       # <= 64 ASCII characters


def build_run_params(
    *, ami_id: str, instance_type: str, subnet_id: str, security_group_ids: Sequence[str],
    tags: Mapping[str, str], run_id: str, name: str, user_data: str | None = None,
    profile_name: str | None = None, root_gb: int = 20,
) -> dict:
    """The exact RunInstances request. Pure, so the policy (IMDSv2, tags, encryption) is unit-testable."""
    params: dict = {
        "ImageId": ami_id,
        "InstanceType": instance_type,
        "MinCount": 1,
        "MaxCount": 1,
        "SubnetId": subnet_id,
        "SecurityGroupIds": list(security_group_ids),
        "MetadataOptions": {"HttpTokens": "required", "HttpEndpoint": "enabled", "HttpPutResponseHopLimit": 1},
        "BlockDeviceMappings": [{
            "DeviceName": "/dev/xvda",
            "Ebs": {"VolumeSize": root_gb, "VolumeType": "gp3", "Encrypted": True, "DeleteOnTermination": True},
        }],
        "TagSpecifications": [                      # tag at creation: no window where the resource is untagged
            {"ResourceType": rt, "Tags": tag_list({**tags, "Name": name, "run-id": run_id})}
            for rt in ("instance", "volume")
        ],
        "InstanceInitiatedShutdownBehavior": "terminate",   # `shutdown -h` inside the guest ends billing
        "ClientToken": client_token(run_id, name),
    }
    if user_data is not None:
        params["UserData"] = user_data              # plain text: botocore base64-encodes it for RunInstances
    if profile_name:
        params["IamInstanceProfile"] = {"Name": profile_name}
    return params


def is_error(exc: ClientError, *codes: str) -> bool:
    return exc.response.get("Error", {}).get("Code") in codes


def can_launch(ec2, **params) -> bool:
    """DryRun: True if IAM and parameters would allow the launch. Nothing is created and nothing is billed."""
    try:
        ec2.run_instances(DryRun=True, **params)
    except ClientError as exc:
        if is_error(exc, "DryRunOperation"):         # the "success" outcome of a dry run
            return True
        if is_error(exc, "UnauthorizedOperation"):
            return False
        raise
    raise AssertionError("DryRun call returned without an error")      # cannot happen on real EC2


def launch_with_fallback(ec2, params: dict, instance_types: Sequence[str]) -> dict:
    """Try instance types in order when the Region/AZ has no capacity for the first choice."""
    last: ClientError | None = None
    for itype in instance_types:
        try:
            return ec2.run_instances(**{**params, "InstanceType": itype})["Instances"][0]
        except ClientError as exc:
            if not is_error(exc, "InsufficientInstanceCapacity"):
                raise
            last = exc
    assert last is not None
    raise last


```

## Launch Templates and User Data

A **launch template** is a versioned set of launch parameters shared by humans, scripts and Auto Scaling groups.

```python
user_data = "#!/bin/bash\necho hello > /tmp/hello\n"
ec2.create_launch_template(
    LaunchTemplateName="web",
    LaunchTemplateData={
        "ImageId": ALIAS,
        "InstanceType": "t4g.nano",
        "UserData": base64.b64encode(user_data.encode()).decode(),     # launch templates do NOT base64-encode for you
        "MetadataOptions": {"HttpTokens": "required", "HttpPutResponseHopLimit": 2, "HttpEndpoint": "enabled"},
        "TagSpecifications": [{"ResourceType": "instance", "Tags": [{"Key": "app", "Value": "web"}]}],
    },
)
resp = ec2.run_instances(
    LaunchTemplate={"LaunchTemplateName": "web", "Version": "$Latest"},    # or LaunchTemplateId + a pinned Version
    MinCount=1, MaxCount=1,
    TagSpecifications=[{"ResourceType": "instance", "Tags": [{"Key": "run-id", "Value": "r-1"}]}],   # merged with the template's tags
)
```

| Encoding rule | Detail |
|---------------|--------|
| `run_instances(UserData=...)` | Pass text or bytes; botocore base64-encodes it (a pre-encoded string would be encoded **twice**) |
| `create_launch_template(LaunchTemplateData={"UserData": ...})` | **You** must base64-encode; the botocore handler only covers `RunInstances` (and `CreateLaunchConfiguration`) |
| `describe_instance_attribute(Attribute="userData")` | Returns base64; decode it to compare |
| Limit | 16 KB raw |

## Waiters, Describe and Pagination

| Waiter | Done when | Default (delay x attempts) |
|--------|-----------|----------------------------|
| `instance_exists` | Describe stops returning `NotFound` | 5 s x 40 |
| `instance_running` | State `running` | 15 s x 40 |
| `instance_status_ok` | Both status checks `ok` (the OS answers) | 15 s x 40 |
| `instance_stopped` / `instance_terminated` | State reached | 15 s x 40 |
| `system_status_ok` | The hypervisor-level check is `ok` | 15 s x 40 |

`WaiterError` ("Max attempts exceeded") is the timeout; tune `WaiterConfig` per environment. Immediately after `run_instances`, a `describe_instances` can still return `InvalidInstanceID.NotFound` because the EC2 API is **eventually consistent**: wait with `instance_exists` first, or retry that one code.

```python
pages = ec2.get_paginator("describe_instances").paginate(
    Filters=[{"Name": "tag:app", "Values": ["web"]}, {"Name": "instance-state-name", "Values": ["pending", "running"]}],
    PaginationConfig={"PageSize": 100},
)
ids = [i["InstanceId"] for page in pages for reservation in page["Reservations"] for i in reservation["Instances"]]
```

| Describe rule | Detail |
|---------------|--------|
| Result shape | `Reservations[].Instances[]`: flatten both levels |
| Filters | `tag:<key>`, `instance-state-name`, `instance-type`, `vpc-id`, `subnet-id`, ... `*` wildcards work in values |
| Pagination | `MaxResults` (page size) **cannot be combined with `InstanceIds`**; the paginator's `PageSize` avoids that mistake |
| States | `terminated` instances stay listed for a short time: always filter on `instance-state-name` |
| Cost | Filtered and paginated calls use the larger throttle bucket ([01](./01-core-concepts.md#api-throttling)) |

```python
waiter_cfg = {"Delay": 5, "MaxAttempts": 60}         # 5 s x 60 = 5 minutes; the defaults are 15 s x 40
ec2.get_waiter("instance_running").wait(InstanceIds=ids, WaiterConfig=waiter_cfg)
print(ec2.stop_instances(InstanceIds=ids)["StoppingInstances"][0]["CurrentState"]["Name"])
ec2.get_waiter("instance_stopped").wait(InstanceIds=ids, WaiterConfig=waiter_cfg)
print(ec2.start_instances(InstanceIds=ids)["StartingInstances"][0]["CurrentState"]["Name"])
print(ec2.terminate_instances(InstanceIds=ids)["TerminatingInstances"][0]["CurrentState"]["Name"])
```

```python
def launch_and_wait(ec2, params: dict, timeout_s: int = 300) -> str:
    instance_id = ec2.run_instances(**params)["Instances"][0]["InstanceId"]
    ec2.get_waiter("instance_running").wait(
        InstanceIds=[instance_id], WaiterConfig={"Delay": 5, "MaxAttempts": max(1, timeout_s // 5)}
    )
    return instance_id


def instances_by_run_id(ec2, run_id: str, states: Sequence[str] = ("pending", "running", "stopping", "stopped")) -> list[dict]:
    """Paginated, filtered describe: cheap on API quota and never returns terminated leftovers."""
    found = []
    pages = ec2.get_paginator("describe_instances").paginate(
        Filters=[{"Name": "tag:run-id", "Values": [run_id]}, {"Name": "instance-state-name", "Values": list(states)}]
    )
    for page in pages:
        for reservation in page["Reservations"]:
            found.extend(reservation["Instances"])
    return found


def terminate_run(ec2, run_id: str) -> list[str]:
    """Sweeper used in fixture teardown and by the scheduled janitor job."""
    ids = [i["InstanceId"] for i in instances_by_run_id(ec2, run_id)]
    if ids:
        ec2.terminate_instances(InstanceIds=ids)
    return ids
```

`terminate_run` is the sweeper used by fixtures and janitor jobs; it filters on the `run-id` tag and is idempotent. Terminate by **IDs**, not by tag: EC2 cannot act on tags alone.

## Security Groups

```python
vpc_id = ec2.describe_vpcs(Filters=[{"Name": "isDefault", "Values": ["true"]}])["Vpcs"][0]["VpcId"]
web_sg = ec2.create_security_group(
    GroupName="app-web", Description="web tier", VpcId=vpc_id,
    TagSpecifications=[{"ResourceType": "security-group", "Tags": [{"Key": "Name", "Value": "app-web"}]}],
)["GroupId"]
ec2.authorize_security_group_ingress(GroupId=web_sg, IpPermissions=[
    {"IpProtocol": "tcp", "FromPort": 443, "ToPort": 443, "IpRanges": [{"CidrIp": "10.0.0.0/8", "Description": "corp network"}]},
])
db_sg = ec2.create_security_group(GroupName="app-db", Description="db tier", VpcId=vpc_id)["GroupId"]
ec2.authorize_security_group_ingress(GroupId=db_sg, IpPermissions=[
    {"IpProtocol": "tcp", "FromPort": 5432, "ToPort": 5432, "UserIdGroupPairs": [{"GroupId": web_sg}]},   # a group, not a CIDR
])
```

| Error | Cause |
|-------|-------|
| `InvalidGroup.Duplicate` | Same name already exists in the VPC |
| `InvalidPermission.Duplicate` | The rule exists: treat as success when ensuring a rule |
| `DependencyViolation` | Deleting a group an instance or a rule still uses |
| `InvalidGroup.NotFound` | Wrong Region or VPC |

`authorize_security_group_ingress` returns the created `SecurityGroupRules` (with IDs) on current API versions, so you can revoke by rule ID later.

## Tags

```python
ec2.create_tags(Resources=[web_sg], Tags=[{"Key": "owner", "Value": "qa"}])     # overwrites the value if the key exists
ec2.delete_tags(Resources=[web_sg], Tags=[{"Key": "owner"}])                    # no Value: delete the key whatever its value
```

Prefer `TagSpecifications` at creation. `create_tags` accepts many resource IDs in one call (instances, volumes, ENIs, images) and is a good way to tag AMIs and snapshots after the fact. Deleting a tag without a `Value` removes the key whatever its value.

## Spot Instances

Spot capacity is spare capacity at a lower price that EC2 can reclaim. You pay the current Spot price; setting a maximum price is optional and makes interruptions **more** likely.

```python
spot = ec2.run_instances(
    ImageId=ALIAS, InstanceType="t4g.nano", MinCount=1, MaxCount=1,
    InstanceMarketOptions={"MarketType": "spot",
                           "SpotOptions": {"SpotInstanceType": "one-time", "InstanceInterruptionBehavior": "terminate"}},
)["Instances"][0]
print("lifecycle:", spot["InstanceLifecycle"])                                  # "spot"; On-Demand instances have no such key
```

| Fact | Detail |
|------|--------|
| Interruption notice | **Two minutes** before reclaim, as an EventBridge event and at `spot/instance-action` in IMDS |
| Rebalance recommendation | An earlier, best-effort signal at `events/recommendations/rebalance` (404 until it exists) and an EventBridge event |
| Behaviour | `terminate` (default for one-time), `stop` or `hibernate` for persistent requests |
| Quota | Separate vCPU quota (`L-34B43A08` for Standard) |
| Fit | Restartable CI workers, load generators, batch tests. Not for the only copy of anything |

Handle the notice by polling IMDS (IMDSv2 token required) and finishing or checkpointing within the two minutes; in an Auto Scaling group enable **Capacity Rebalancing**. **moto never interrupts anything and records no Spot request** ([07](./07-moto-gaps-smoke-ci.md)).

## Errors, DryRun and Idempotency

```python
try:
    ec2.describe_instances(InstanceIds=["i-0123456789abcdef0"])
except ClientError as exc:                           # EC2 has NO modeled exception classes: always ClientError + Error.Code
    print("code:", exc.response["Error"]["Code"], "| http:", exc.response["ResponseMetadata"]["HTTPStatusCode"])
print("exception classes on the client:", [n for n in dir(ec2.exceptions) if not n.startswith("_")])
```

| Code | Meaning | Reaction |
|------|---------|----------|
| `InvalidInstanceID.NotFound` | No such instance in this Region, or not yet propagated | Right after launch: wait for `instance_exists`. Otherwise: wrong Region or already gone |
| `InvalidInstanceID.Malformed` | The ID is not in the `i-...` form | Fix the caller (moto reports `NotFound` here) |
| `InsufficientInstanceCapacity` | EC2 has no capacity for the type in the AZ | Retry later, **try another type or AZ** (`launch_with_fallback`) |
| `VcpuLimitExceeded`, `InstanceLimitExceeded`, `MaxSpotInstanceCountExceeded` | Quota | Fail with a clear message; request an increase |
| `UnauthorizedOperation` | IAM denies the action (the message may be encoded: `sts.decode_authorization_message`) | Fix the role; never retry |
| `DryRunOperation` | `DryRun=True` and you **would** have succeeded | The expected "success" of a dry run |
| `RequestLimitExceeded` | API throttling | Backoff (boto3 `standard` mode does this); reduce polling |
| `InvalidParameterValue`, `InvalidParameterCombination` | Bad argument | Fix the caller |
| `IncorrectInstanceState` | The instance is in a state that does not allow the action (for example editing user data while running) | Wait for the state, then retry |
| `IdempotentParameterMismatch` | Same `ClientToken`, different parameters | Use a new token for a new request |
| `InvalidAMIID.NotFound`, `InvalidKeyPair.NotFound` | Wrong Region or deleted | moto accepts both ([07](./07-moto-gaps-smoke-ci.md)) |
| `InvalidPermission.Duplicate`, `InvalidGroup.Duplicate` | The rule or group already exists | Usually success |

Rule of thumb from the EC2 docs: **do not retry 4xx** (fix the request), retry 5xx and throttling with backoff.

### DryRun

`DryRun=True` asks EC2 to check permissions and parameter validity **without doing anything or billing**. Because a dry run always raises, the *error code* is the answer: `DryRunOperation` means "allowed", `UnauthorizedOperation` means "denied" (`can_launch` above). Use it at the start of a smoke test to separate IAM problems from everything else; it does not prove capacity or quota.

### ClientToken

`RunInstances` is idempotent when you pass a `ClientToken`: a retry with the same token **and the same parameters** returns the original instance instead of launching another, and different parameters with the same token fail with `IdempotentParameterMismatch`. A token is unique per Region, or per AZ when the request names a subnet or AZ. Derive it from the logical request (`client_token(run_id, name)`), never from a timestamp. This is what makes "launch timed out, call again" safe. **moto ignores `ClientToken`** ([07](./07-moto-gaps-smoke-ci.md)): do not test idempotency on moto.

### Capacity fallback and throttling

`launch_with_fallback` (shown above) tries a list of instance types only for `InsufficientInstanceCapacity`. The throttling buckets and the `standard` retry mode are in [01](./01-core-concepts.md#api-throttling); `RunInstances` has a small request bucket (5 burst, 2 per second) so a test fleet should launch with one call and `MaxCount=N` rather than N parallel calls.

## Resource Interface

```python
ec2r = boto3.resource("ec2", config=CFG)             # feature-frozen: fine for quick scripts, not for new features
inst = ec2r.create_instances(ImageId=ALIAS, InstanceType="t4g.nano", MinCount=1, MaxCount=1)[0]
inst.wait_until_running()
inst.reload()                                        # attributes are lazy: reload() refreshes them
print("resource:", inst.state["Name"], inst.instance_type)
inst.terminate()
```

```text
own images found: 0 | SSM value looks like an AMI id: True
tags: ['app', 'run-id']
matching instances: 1
stopping
pending
shutting-down
db group allows the web group: True
lifecycle: spot
code: InvalidInstanceID.NotFound | http: 400
exception classes on the client: ['ClientError', 'from_code']
resource: running t4g.nano
```

## Quick Rules

1. **One pure function builds the request**; unit-test IMDSv2, tags, encryption and shutdown behaviour without AWS.
2. **Resolve AMIs** with `resolve:ssm:` or the SSM parameter; log the resolved ID.
3. **Tag instances and volumes at creation**; filter on a `run-id` tag for cleanup.
4. **Do not base64-encode `UserData` for `run_instances`**, do encode it in launch templates.
5. **Filter and paginate `describe_instances`**, flatten `Reservations`, and always filter on state.
6. **Use waiters with explicit `WaiterConfig`**; `instance_status_ok` for "the OS is up", an application check for "my service is up".
7. **Catch `ClientError` and switch on `Error.Code`**; there are no EC2 exception classes.
8. **Pass a deterministic `ClientToken`**; treat `InvalidPermission.Duplicate` as success.
9. **Fall back across types for `InsufficientInstanceCapacity` only**; never retry 4xx.
10. **Use `DryRun` for permission checks**; the error code is the answer.
11. **Prefer the client** over the feature-frozen resource interface.

---
## See also
- [Amazon EC2 — Instances, Networking & Testing](./index.md)
- [Amazon EC2 — Core Concepts](./01-core-concepts.md)
- [Amazon EC2 — Networking, Security & IAM](./02-networking-security-iam.md)
- [Amazon EC2 — Scaling, Load Balancing & Operations](./04-scaling-load-balancing-operations.md)
- [AWS Foundations — Clients, Config, Retries & Errors](../foundations/01-clients-config-errors.md)
- [Pytest — Python Testing Framework](../../libs/pytest/index.md)
