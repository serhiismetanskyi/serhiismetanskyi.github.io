---
date: 2026-10-21 12:00:00
tags:
  - aws
  - ec2
  - testing
  - compliance
  - imds
  - auto-scaling
---

# Amazon EC2 — Compliance, Credential-Path & Scaling Tests

Tests built on the helpers from [05 Testing EC2-Based Systems](./05-testing.md): compliance rules over `describe_*` output, a fake metadata service for the credential path, Auto Scaling and target-group checks, and moto server mode.

## Compliance Checks on Describe Output

The rules take plain dictionaries from `describe_security_groups` and `describe_instances`, so the same code runs on moto output in the test suite and on real output in a scheduled audit.

```python
"""Compliance checks over `describe_*` output. They take plain dicts, so the same code runs on
moto output in tests and on real output in a scheduled audit job."""
from collections.abc import Iterable, Iterator

REQUIRED_TAGS = ("owner", "env")
WORLD_V4, WORLD_V6 = "0.0.0.0/0", "::/0"
SENSITIVE_PORTS = (22, 3389)


def iter_instances(describe_instances_response: dict) -> Iterator[dict]:
    for reservation in describe_instances_response["Reservations"]:
        yield from reservation["Instances"]


def _covers_port(perm: dict, port: int) -> bool:
    if perm["IpProtocol"] == "-1":                       # "all traffic": no FromPort/ToPort in the response
        return True
    return perm["IpProtocol"] == "tcp" and perm.get("FromPort", 0) <= port <= perm.get("ToPort", 65535)


def open_to_world(security_groups: Iterable[dict], ports: Iterable[int] = SENSITIVE_PORTS) -> list[str]:
    """Return 'sg-id:port' for every ingress rule that exposes a sensitive port to the whole internet."""
    findings = []
    for sg in security_groups:
        for perm in sg["IpPermissions"]:
            world = any(r["CidrIp"] == WORLD_V4 for r in perm.get("IpRanges", [])) or any(
                r["CidrIpv6"] == WORLD_V6 for r in perm.get("Ipv6Ranges", [])
            )
            if not world:
                continue
            findings.extend(f"{sg['GroupId']}:{p}" for p in ports if _covers_port(perm, p))
    return sorted(set(findings))


def missing_tags(instance: dict, required: Iterable[str] = REQUIRED_TAGS) -> list[str]:
    present = {t["Key"] for t in instance.get("Tags", []) if t["Value"].strip()}
    return [k for k in required if k not in present]


def imdsv1_enabled(instances: Iterable[dict]) -> list[str]:
    """Instances that still accept IMDSv1 (HttpTokens=optional) while the metadata endpoint is on."""
    return [
        i["InstanceId"] for i in instances
        if i["MetadataOptions"]["HttpEndpoint"] == "enabled" and i["MetadataOptions"]["HttpTokens"] != "required"
    ]
```

```python
import pytest

from app.compliance import REQUIRED_TAGS, imdsv1_enabled, iter_instances, missing_tags, open_to_world
from app.launch import build_run_params
from tests.conftest import AMI


def sg(group_id, *perms):
    return {"GroupId": group_id, "IpPermissions": list(perms)}


def tcp(lo, hi, v4=(), v6=()):
    return {"IpProtocol": "tcp", "FromPort": lo, "ToPort": hi,
            "IpRanges": [{"CidrIp": c} for c in v4], "Ipv6Ranges": [{"CidrIpv6": c} for c in v6]}


ALL_TRAFFIC = {"IpProtocol": "-1", "IpRanges": [{"CidrIp": "0.0.0.0/0"}], "Ipv6Ranges": []}   # no FromPort/ToPort at all


@pytest.mark.parametrize("groups, expected", [
    ([sg("sg-1", tcp(22, 22, v4=["10.0.0.0/8"]))], []),                              # private CIDR is fine
    ([sg("sg-1", tcp(22, 22, v4=["0.0.0.0/0"]))], ["sg-1:22"]),                      # the classic
    ([sg("sg-1", tcp(22, 22, v6=["::/0"]))], ["sg-1:22"]),                           # IPv6 world is world too
    ([sg("sg-1", tcp(0, 65535, v4=["0.0.0.0/0"]))], ["sg-1:22", "sg-1:3389"]),       # a range that covers the ports
    ([sg("sg-1", tcp(443, 443, v4=["0.0.0.0/0"]))], []),                             # public HTTPS is allowed
    ([sg("sg-1", ALL_TRAFFIC)], ["sg-1:22", "sg-1:3389"]),                           # protocol -1 means every port
    ([sg("sg-1", tcp(22, 22, v4=["0.0.0.0/0"])), sg("sg-2", tcp(3389, 3389, v4=["0.0.0.0/0"]))], ["sg-1:22", "sg-2:3389"]),
])
def test_open_to_world_cases(groups, expected):
    assert open_to_world(groups) == expected


def test_missing_tags_ignores_blank_values():
    inst = {"Tags": [{"Key": "owner", "Value": "qa"}, {"Key": "env", "Value": "  "}]}
    assert missing_tags(inst) == ["env"]
    assert missing_tags({}) == list(REQUIRED_TAGS)


def test_ssh_rule_check_against_moto_output(ec2, net):
    ec2.authorize_security_group_ingress(GroupId=net["sg"], IpPermissions=[
        {"IpProtocol": "tcp", "FromPort": 22, "ToPort": 22, "IpRanges": [{"CidrIp": "0.0.0.0/0"}]}])
    groups = ec2.describe_security_groups(GroupIds=[net["sg"]])["SecurityGroups"]
    assert open_to_world(groups) == [f"{net['sg']}:22"]
    ec2.revoke_security_group_ingress(GroupId=net["sg"], IpPermissions=[
        {"IpProtocol": "tcp", "FromPort": 22, "ToPort": 22, "IpRanges": [{"CidrIp": "0.0.0.0/0"}]}])
    groups = ec2.describe_security_groups(GroupIds=[net["sg"]])["SecurityGroups"]
    assert open_to_world(groups) == []


def test_every_security_group_in_the_account_passes(ec2, net):
    """The audit shape: page through ALL groups. The default group has no world-open ingress."""
    groups = [g for p in ec2.get_paginator("describe_security_groups").paginate() for g in p["SecurityGroups"]]
    assert len(groups) >= 2                                              # moto's default group + ours
    assert open_to_world(groups) == []


def test_tag_and_imds_policy_over_describe_output(ec2, net, run_id):
    good = build_run_params(ami_id=AMI, instance_type="t3.micro", subnet_id=net["subnet"], security_group_ids=[net["sg"]],
                            tags={"owner": "qa", "env": "test"}, run_id=run_id, name="good")
    ec2.run_instances(**good)
    bad = ec2.run_instances(ImageId=AMI, MinCount=1, MaxCount=1, SubnetId=net["subnet"],
                            TagSpecifications=[{"ResourceType": "instance", "Tags": [{"Key": "run-id", "Value": run_id}]}])
    bad_id = bad["Instances"][0]["InstanceId"]
    insts = list(iter_instances(ec2.describe_instances(Filters=[{"Name": "tag:run-id", "Values": [run_id]}])))
    assert len(insts) == 2
    offenders = {i["InstanceId"]: missing_tags(i) for i in insts if missing_tags(i)}
    assert offenders == {bad_id: ["owner", "env"]}
    assert imdsv1_enabled(insts) == [bad_id]                             # launched without MetadataOptions
```

The cases that matter in the parametrized test: IPv6 `::/0` counts as "the world", a **port range** that merely *covers* 22 counts, and protocol `-1` (all traffic) has no ports at all in the response, so a naive `FromPort == 22` check misses it. Against a real account, run the audit as a paginated sweep over **all** groups (`test_every_security_group_in_the_account_passes` shows the shape) and fail the build on any finding.

## Testing the Credential Path with a Fake IMDS

Code that runs on EC2 gets credentials from IMDS ([02](./02-networking-security-iam.md#imdsv2-and-how-boto3-gets-credentials-on-ec2)). You can test that path anywhere by pointing botocore at a fake metadata server with `AWS_EC2_METADATA_SERVICE_ENDPOINT`:

```python
"""A tiny fake Instance Metadata Service (IMDS) for testing how code obtains credentials on EC2."""
import json
import threading
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = "fake-session-token"
ROLE = "app-instance-role"


class FakeImds:
    def __init__(self, *, require_token: bool = True, issue_token: bool = True):
        self.require_token, self.issue_token = require_token, issue_token
        self.requests: list[tuple[str, str, bool]] = []          # (method, path, had_token)
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):                        # keep pytest output quiet
                pass

            def _send(self, code, body="", ctype="text/plain"):
                data = body.encode()
                self.send_response(code)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def do_PUT(self):
                outer.requests.append(("PUT", self.path, False))
                if self.path == "/latest/api/token" and outer.issue_token:
                    self._send(200, TOKEN)
                else:
                    self._send(404)

            def do_GET(self):
                has_token = self.headers.get("X-aws-ec2-metadata-token") == TOKEN
                outer.requests.append(("GET", self.path, has_token))
                if outer.require_token and not has_token:
                    return self._send(401)                       # what a real instance answers when HttpTokens=required
                if self.path == "/latest/meta-data/iam/security-credentials/":
                    return self._send(200, ROLE)
                if self.path == f"/latest/meta-data/iam/security-credentials/{ROLE}":
                    exp = (datetime.now(timezone.utc) + timedelta(hours=6)).strftime("%Y-%m-%dT%H:%M:%SZ")
                    return self._send(200, json.dumps({
                        "Code": "Success", "Type": "AWS-HMAC", "AccessKeyId": "ASIAFAKEFAKEFAKE0000",
                        "SecretAccessKey": "fake-secret", "Token": "fake-session", "Expiration": exp}), "application/json")
                self._send(404)

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}"

    def __enter__(self):
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        return self

    def __exit__(self, *exc):
        self.server.shutdown()
        self.server.server_close()
```

```python
"""How boto3 gets credentials on EC2, tested without EC2: point botocore at a fake IMDS."""
import boto3
import pytest
from botocore.exceptions import MetadataRetrievalError

from tests.fake_imds import ROLE, FakeImds


@pytest.fixture
def no_other_credentials(monkeypatch):
    for var in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"):      # the autouse fixture set fakes
        monkeypatch.delenv(var)                                                          # remove them: only IMDS may answer
    monkeypatch.setenv("AWS_METADATA_SERVICE_TIMEOUT", "1")
    monkeypatch.setenv("AWS_METADATA_SERVICE_NUM_ATTEMPTS", "1")


def resolve(imds_url, monkeypatch):
    monkeypatch.setenv("AWS_EC2_METADATA_SERVICE_ENDPOINT", imds_url)
    return boto3.Session().get_credentials()


def test_credentials_come_from_the_instance_profile_with_imdsv2(no_other_credentials, monkeypatch):
    with FakeImds(require_token=True) as imds:
        creds = resolve(imds.url, monkeypatch)
        frozen = creds.get_frozen_credentials()                  # triggers the refresh against the fake IMDS
    assert (creds.method, frozen.access_key) == ("iam-role", "ASIAFAKEFAKEFAKE0000")
    assert imds.requests[0][:2] == ("PUT", "/latest/api/token")  # token first, always
    assert all(had_token for method, _, had_token in imds.requests if method == "GET")      # every GET carried it


def test_imdsv1_only_clients_get_nothing_when_tokens_are_required(no_other_credentials, monkeypatch):
    """Simulates a hop-limit or proxy problem: the token PUT fails, botocore falls back to v1, the instance answers 401."""
    with FakeImds(require_token=True, issue_token=False) as imds:
        assert resolve(imds.url, monkeypatch) is None
    assert ("GET", "/latest/meta-data/iam/security-credentials/", False) in imds.requests   # the doomed v1 fallback


def test_disabling_v1_fallback_makes_the_failure_explicit(no_other_credentials, monkeypatch):
    monkeypatch.setenv("AWS_EC2_METADATA_V1_DISABLED", "true")
    with FakeImds(require_token=False, issue_token=False) as imds:       # a permissive v1 server: would work without the flag
        with pytest.raises(MetadataRetrievalError, match="IMDSv1 has been disabled"):
            resolve(imds.url, monkeypatch)
    assert not [r for r in imds.requests if r[0] == "GET"]               # botocore never even tried v1


def test_role_name_is_discovered_not_configured(no_other_credentials, monkeypatch):
    with FakeImds() as imds:
        resolve(imds.url, monkeypatch).get_frozen_credentials()
    assert ("GET", f"/latest/meta-data/iam/security-credentials/{ROLE}", True) in imds.requests
```

The second test reproduces the classic production failure (a token request that fails, then a v1 fallback the instance rejects) and the third shows `AWS_EC2_METADATA_V1_DISABLED=true` turning it into an explicit `MetadataRetrievalError`.

## Auto Scaling and Load Balancer Tests

```python
import boto3
import pytest

from tests.conftest import AMI


@pytest.fixture
def stack(ec2, net):
    asg, elb = boto3.client("autoscaling"), boto3.client("elbv2")
    subnets = [s["SubnetId"] for s in ec2.describe_subnets(Filters=[{"Name": "vpc-id", "Values": [net["vpc"]]}])["Subnets"][:2]]
    ec2.create_launch_template(LaunchTemplateName="web", LaunchTemplateData={"ImageId": AMI, "InstanceType": "t3.micro"})
    tg = elb.create_target_group(Name="web-tg", Protocol="HTTP", Port=80, VpcId=net["vpc"], HealthCheckPath="/health")["TargetGroups"][0]
    asg.create_auto_scaling_group(
        AutoScalingGroupName="web", LaunchTemplate={"LaunchTemplateName": "web", "Version": "$Latest"},
        MinSize=1, MaxSize=3, DesiredCapacity=2, VPCZoneIdentifier=",".join(subnets), TargetGroupARNs=[tg["TargetGroupArn"]],
        HealthCheckType="ELB", HealthCheckGracePeriod=120,
        Tags=[{"Key": "owner", "Value": "qa", "PropagateAtLaunch": True}],
    )
    return {"asg": asg, "elb": elb, "tg": tg["TargetGroupArn"]}


def group(asg):
    return asg.describe_auto_scaling_groups(AutoScalingGroupNames=["web"])["AutoScalingGroups"][0]


def test_group_launches_desired_capacity_with_propagated_tags(ec2, stack):
    g = group(stack["asg"])
    assert (g["MinSize"], g["MaxSize"], g["DesiredCapacity"], g["HealthCheckType"]) == (1, 3, 2, "ELB")
    ids = [i["InstanceId"] for i in g["Instances"]]
    assert len(ids) == 2
    for inst in (r["Instances"][0] for r in ec2.describe_instances(InstanceIds=ids)["Reservations"]):
        tags = {t["Key"]: t["Value"] for t in inst["Tags"]}
        assert tags["owner"] == "qa" and tags["aws:autoscaling:groupName"] == "web"


def test_instances_are_registered_with_the_target_group(stack):
    health = stack["elb"].describe_target_health(TargetGroupArn=stack["tg"])["TargetHealthDescriptions"]
    assert len(health) == 2 and {h["Target"]["Port"] for h in health} == {80}


def test_scale_out_within_limits(stack):
    stack["asg"].set_desired_capacity(AutoScalingGroupName="web", DesiredCapacity=3)
    assert len(group(stack["asg"])["Instances"]) == 3


def test_group_replaces_an_instance_killed_outside_the_group(ec2, stack):
    victim = group(stack["asg"])["Instances"][0]["InstanceId"]
    ec2.terminate_instances(InstanceIds=[victim])
    ids = [i["InstanceId"] for i in group(stack["asg"])["Instances"]]
    assert victim not in ids and len(ids) == 2


def test_policy_and_lifecycle_hook_are_stored(stack):
    asg = stack["asg"]
    asg.put_scaling_policy(AutoScalingGroupName="web", PolicyName="cpu50", PolicyType="TargetTrackingScaling",
                           TargetTrackingConfiguration={"PredefinedMetricSpecification": {"PredefinedMetricType": "ASGAverageCPUUtilization"}, "TargetValue": 50.0})
    asg.put_lifecycle_hook(AutoScalingGroupName="web", LifecycleHookName="drain", LifecycleTransition="autoscaling:EC2_INSTANCE_TERMINATING",
                           HeartbeatTimeout=300, DefaultResult="CONTINUE")
    pol = asg.describe_policies(AutoScalingGroupName="web")["ScalingPolicies"][0]
    assert pol["PolicyName"] == "cpu50" and pol["TargetTrackingConfiguration"]["TargetValue"] == 50.0
    hook = asg.describe_lifecycle_hooks(AutoScalingGroupName="web")["LifecycleHooks"][0]
    assert (hook["LifecycleHookName"], hook["HeartbeatTimeout"], hook["DefaultResult"]) == ("drain", 300, "CONTINUE")
    # moto stores the policy but nothing ever evaluates it: load will not change capacity (see 06)
```

moto launches real moto instances for the group, registers them with the target group, replaces an instance you terminate behind the group's back, and stores policies and hooks. It does not evaluate policies, run health checks, or implement instance refresh; those belong in Stubber request tests and a staging environment ([07](./07-moto-gaps-smoke-ci.md#what-moto-does-not-emulate)).

## moto Server Mode

`mock_aws` patches the current process. For another process or a container, run moto as an HTTP server and point `AWS_ENDPOINT_URL` (or `endpoint_url`) at it ([Foundations](../foundations/02-credentials-iam-local-testing.md#moto-server-for-other-processes)). `ThreadedMotoServer` does that inside pytest, on a free port, so it is safe with `pytest-xdist`:

```python
"""moto as a real HTTP server: another process (or a Docker container) can see the same EC2 state."""
import boto3
import pytest
import requests
from moto.server import ThreadedMotoServer

from tests.conftest import AMI


@pytest.fixture(scope="module")
def server():
    srv = ThreadedMotoServer(port=0, verbose=False)               # port 0: the OS picks a free port (xdist-safe)
    srv.start()
    host, port = srv.get_host_and_port()
    yield f"http://{host}:{port}"
    srv.stop()


@pytest.fixture
def ec2_http(server):
    requests.post(f"{server}/moto-api/reset", timeout=5)          # wipe all state between tests
    return boto3.client("ec2", endpoint_url=server)


def test_state_is_shared_between_two_clients(server, ec2_http):
    iid = ec2_http.run_instances(ImageId=AMI, MinCount=1, MaxCount=1)["Instances"][0]["InstanceId"]
    other = boto3.client("ec2", endpoint_url=server)             # a second client (a stand-in for a second process)
    assert other.describe_instances(InstanceIds=[iid])["Reservations"][0]["Instances"][0]["State"]["Name"] == "running"


def test_reset_clears_everything(ec2_http):
    assert ec2_http.describe_instances()["Reservations"] == []


def test_raw_http_request_works_for_non_python_clients(server):
    resp = requests.post(server, data={"Action": "DescribeRegions", "Version": "2016-11-15"},
                         headers={"Authorization": "AWS4-HMAC-SHA256 Credential=testing/20261021/us-east-1/ec2/aws4_request, SignedHeaders=host, Signature=x"}, timeout=5)
    assert resp.status_code == 200 and "<regionName>us-east-1</regionName>" in resp.text
```

## Quick Rules

1. **Write compliance rules over plain dicts** so tests and real audits share code; test the edge cases (IPv6, port ranges, protocol `-1`).
2. **Test the credential path with a fake IMDS**, including the v1 fallback and `AWS_EC2_METADATA_V1_DISABLED`.
3. **Assert on ASG capacity and target registration with moto**, and script refresh and policy requests with Stubber.
4. **Use moto server mode** when another process must see the same instances; reset between tests.
5. **Do not expect moto to evaluate policies, health checks or alarms** ([07](./07-moto-gaps-smoke-ci.md)).

---
## See also
- [Amazon EC2 — Instances, Networking & Testing](./index.md)
- [Amazon EC2 — Testing EC2-Based Systems](./05-testing.md)
- [Amazon EC2 — moto Gaps, Smoke Tests & CI](./07-moto-gaps-smoke-ci.md)
- [Amazon EC2 — Networking, Security & IAM](./02-networking-security-iam.md)
- [AWS Foundations — Credentials, IAM & Local Testing](../foundations/02-credentials-iam-local-testing.md)
- [Pytest — Python Testing Framework](../../libs/pytest/index.md)
