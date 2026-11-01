---
date: 2026-10-21 12:00:00
tags:
  - aws
  - sqs
  - testing
  - moto
  - ci
---

# Amazon SQS — moto Gaps, Smoke Tests, Load & CI

[05 Testing SQS-Based Systems](./05-testing.md) shows what moto does well. This page is about its limits and what to use instead: the documented differences, other emulators, a real-account smoke test, CloudWatch metrics for load tests, CI, and a QA checklist.

## What moto Does Not Emulate

The "real SQS" column comes from the AWS documentation. If a difference disappears after a moto upgrade, moto improved: update your tests and expectations.

| Area | moto | Real SQS (documented) |
|------|------------|-----------------------|
| `StartMessageMoveTask`, `ListMessageMoveTasks`, `CancelMessageMoveTask` | `NotImplementedError` in-process; HTTP 500 in server mode | Implemented (DLQ redrive) |
| Control character in a body (`"a\x01b"`) | Accepted | `InvalidMessageContents` |
| 11 message attributes | Accepted | Maximum 10 |
| Queue attribute ranges: `VisibilityTimeout=99999`, `MessageRetentionPeriod=59`, `ReceiveMessageWaitTimeSeconds=21`; unknown attribute name | Accepted silently | Documented ranges; `InvalidAttributeName` |
| Re-create a queue right after deleting it | Allowed | `QueueDeletedRecently` for 60 seconds |
| Delete with a **stale** receipt handle (after redelivery) | Deletes the message | The most recent handle is required; an older one might not delete it |
| `ReceiveRequestAttemptId` retry | Returns nothing | Returns the same messages (5 minutes, FIFO) |
| `DeadLetterQueueSourceArn` system attribute | Not returned | Valid system attribute name |
| DLQ move | On the next receive of the source queue | Moved by the service according to the redrive policy |
| Fair queues | `MessageGroupId` accepted; arrival order unchanged | Noisy-neighbour prioritisation; `...InQuietGroups` metrics |
| Queue policy | Not enforced: SNS delivered to a queue with **no policy** | SNS needs `sqs:SendMessage` permission on the queue |
| `RedriveAllowPolicy` | Set accepted, `get_queue_attributes` raises `InvalidAttributeName` | Supported attribute |
| CloudWatch | No `AWS/SQS` metrics (`list_metrics` is empty) | Queue metrics with a delay |
| FIFO attributes on a standard queue, `.fifo` name without `FifoQueue` | Accepted | Rejected with a validation error |
| Exists-with-different-attributes error | `Code` is `QueueAlreadyExists`, `QueryErrorCode` is `QueueNameExists` | Modeled name is `QueueNameExists` |
| IAM, KMS calls, throughput limits, the 120,000 in-flight limit, retention expiry  | Not emulated: `KmsMasterKeyId` is stored but no KMS call is made, and moto's `OverLimit` exists only for `AddPermission` | Enforced |

What moto **does** match: visibility timeout and redelivery on the wall clock, `ApproximateReceiveCount`, long polling waits, delay queues and timers, batch limits (more than 10 entries, duplicate and invalid IDs, total size over 1 MiB), `MaxNumberOfMessages` and `WaitTimeSeconds` validation on receive, FIFO dedup (including content-based deduplication ignoring attributes), group blocking, per-message delay rejection on FIFO, the 60-second purge limit, redrive policy with `maxReceiveCount`, and SNS fan-out with and without raw delivery.

```python
# tests/test_moto_gaps.py (excerpt)
def test_queue_policy_is_not_enforced_for_sns(sqs, work_queue):
    sns = boto3.client("sns")
    url, _ = work_queue                                                   # no Policy attribute at all
    arn = sqs.get_queue_attributes(QueueUrl=url, AttributeNames=["QueueArn"])["Attributes"]["QueueArn"]
    topic = sns.create_topic(Name="t")["TopicArn"]
    sns.subscribe(TopicArn=topic, Protocol="sqs", Endpoint=arn, Attributes={"RawMessageDelivery": "true"})
    sns.publish(TopicArn=topic, Message=json.dumps({"x": 1}))
    assert receive_one(sqs, url)["Body"] == '{"x": 1}'                    # real: dropped without an SQS queue policy


@pytest.mark.slow
def test_a_stale_receipt_handle_still_deletes_the_message(sqs, work_queue):
    import time
    url, _ = work_queue                                                   # VisibilityTimeout = 1
    sqs.send_message(QueueUrl=url, MessageBody="x")
    first = receive_one(sqs, url)
    time.sleep(1.2)
    second = receive_one(sqs, url)                                        # redelivered with a new handle
    sqs.delete_message(QueueUrl=url, ReceiptHandle=first["ReceiptHandle"])          # real: might not delete
    with pytest.raises(sqs.exceptions.ReceiptHandleIsInvalid):
        sqs.change_message_visibility(QueueUrl=url, ReceiptHandle=second["ReceiptHandle"], VisibilityTimeout=10)
```

Whatever in that table matters to you (redrive, queue policies, IAM, KMS, throughput) belongs in the smoke test or in reviews of infrastructure code.

## Alternatives to moto

| Tool | Use | Notes |
|------|-----|-------|
| `Stubber` | Scripted responses and errors, exact request checks | No behaviour, no state |
| **ElasticMQ** | An SQS-compatible server in a container (`softwaremill/elasticmq-native`, REST on port 9324) | README lists FIFO queues and DLQ (`maxReceiveCount`); API coverage and FIFO details differ from SQS |
| **Testcontainers** | Start such a container from pytest and pass its URL as `endpoint_url` | Same fixture shape as the moto server above |
| **Real account** | The only way to validate IAM, policies, KMS, redrive and limits | Dedicated sandbox account, unique prefix, cleanup |

## Real-Account Smoke Test

One small, marked test that creates a queue with a unique name, runs a message through a DLQ-enabled queue, and always deletes it. It is skipped unless explicitly enabled.

```python
# tests/smoke/test_sqs_smoke.py
import os
import uuid

import boto3
import pytest

from app.queues import create_work_queue

pytestmark = pytest.mark.skipif(os.environ.get("RUN_AWS_SMOKE") != "1", reason="set RUN_AWS_SMOKE=1 in the sandbox account")


@pytest.fixture
def real_sqs():
    return boto3.client("sqs")                      # credentials from the environment, e.g. an OIDC role in CI


def test_roundtrip_and_dlq_wiring(real_sqs):
    name = f"smoke-{uuid.uuid4().hex[:8]}"
    queue_url, dlq_url = create_work_queue(real_sqs, name, max_receive=2, visibility=5)
    try:
        real_sqs.send_message(QueueUrl=queue_url, MessageBody="ping")
        msg = real_sqs.receive_message(QueueUrl=queue_url, WaitTimeSeconds=10, MaxNumberOfMessages=1)["Messages"][0]
        real_sqs.delete_message(QueueUrl=queue_url, ReceiptHandle=msg["ReceiptHandle"])
        assert real_sqs.list_dead_letter_source_queues(QueueUrl=dlq_url)["queueUrls"] == [queue_url]
    finally:
        real_sqs.delete_queue(QueueUrl=queue_url)
        real_sqs.delete_queue(QueueUrl=dlq_url)     # names are blocked for 60 s afterwards: never reuse a fixed name
```

Extend it with the checks moto cannot make: the queue policy lets SNS publish into the queue, a consumer role can receive but not purge, and a `StartMessageMoveTask` on a DLQ with one message reaches `COMPLETED`. Create queues a second after `create_queue` returns, as AWS advises, and delete them in `finally`.

## CloudWatch Metrics for Load Tests

moto emits no SQS metrics, so load tests run against a real queue. For quick assertions in a test use `get_queue_attributes` (visible, in flight, delayed); for latency and history use CloudWatch (namespace `AWS/SQS`, dimension `QueueName`):

```python
import datetime

import boto3

cw = boto3.client("cloudwatch")
now = datetime.datetime.now(datetime.timezone.utc)
stats = cw.get_metric_statistics(
    Namespace="AWS/SQS",
    MetricName="ApproximateAgeOfOldestMessage",
    Dimensions=[{"Name": "QueueName", "Value": "orders"}],
    StartTime=now - datetime.timedelta(minutes=10),
    EndTime=now,
    Period=60,
    Statistics=["Maximum"],
)
print(max((p["Maximum"] for p in stats["Datapoints"]), default=0))      # seconds the oldest message has waited
```

| Metric | Use in a load test |
|--------|--------------------|
| `ApproximateNumberOfMessagesVisible` | Backlog: should rise under load and return to 0 |
| `ApproximateAgeOfOldestMessage` | Your latency SLO: assert it stays under a limit while consumers run |
| `ApproximateNumberOfMessagesNotVisible` | In flight; near consumer capacity means saturation |
| `NumberOfMessagesSent`, `NumberOfMessagesReceived`, `NumberOfMessagesDeleted` | Throughput; `Received` above `Sent` means redeliveries; `Deleted` dropping to 0 means acks are failing |
| `NumberOfEmptyReceives` | Polling waste |
| `ApproximateNumberOfGroupsWithInflightMessages` | FIFO parallelism |
| DLQ `ApproximateNumberOfMessagesVisible` | Must stay 0 for a healthy run |

Counters are **approximate** and lag, so assert on trends and on end states ("the queue drained and the DLQ is empty within N minutes"), not on exact numbers at a moment. Messages moved by a redrive policy are not counted in the DLQ's `NumberOfMessagesSent`.

A load-test recipe: create an isolated queue and DLQ with the production attributes; send N messages with `send_batch`; start the consumers; poll `queue_depth` with a deadline until visible and in-flight are 0; assert the DLQ is empty, the oldest-message age stayed under the target and the handler was called N times per business key.

## GitHub Actions

Moto needs no service container. The smoke job runs only on `main` with short-lived credentials (the OIDC pattern is in [Foundations](../foundations/02-credentials-iam-local-testing.md)).

```yaml
# .github/workflows/sqs-tests.yml
name: sqs-tests
on: [push, pull_request]

jobs:
  moto:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v4
      - run: uv sync --locked
      - run: uv run pytest -n 4                      # unit, Stubber and moto tests, no AWS credentials needed

  smoke:
    if: github.ref == 'refs/heads/main'
    needs: moto
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/sqs-smoke      # placeholder: a sandbox account role
          aws-region: us-east-1
      - run: uv sync --locked
      - run: RUN_AWS_SMOKE=1 uv run pytest tests/smoke
```

## Pitfalls

| Pitfall | Why tests flake or mislead | Fix |
|---------|---------------------------|-----|
| Receive without `WaitTimeSeconds` on a queue with long polling set | Blocks for the queue's wait (20 s) when empty | Pass `WaitTimeSeconds` in every test call |
| Short-poll receive on a real queue | Samples a subset of servers; empty although messages exist | Long poll with a deadline loop |
| `time.sleep(2)` then assert | Slow on a busy runner, wasteful on a fast one | `wait_until` / `receive_one` |
| Shared queue name across tests | Tests consume each other's messages | `unique()` per test; one backend per test with `mock_aws` |
| Asserting exact `ApproximateNumberOf...` on a real queue | Counters are eventually consistent | Poll with a deadline; assert end states |
| Visibility timeout of 30 s in a redelivery test | A 30-second test | A 1-second queue in the fixture |
| Trusting moto for queue policies, IAM, KMS, redrive | Passes locally, fails in production | Smoke test and policy review |
| Reusing a fixed queue name on a real account | `QueueDeletedRecently` for 60 seconds after delete | Unique names |
| Asserting on `MessageId` equality for FIFO duplicates | moto returns a new ID for a duplicate send | Assert on delivered messages |
| Tight upper bounds on timing | Fails on loaded CI | Lower bound exact, upper bound generous |
| Idempotency tested with one message | Duplicates are never produced | Send two messages with one business key, and redeliver one |

## QA Checklist

- [ ] Handlers are pure functions with unit tests for ack, retry, poison and duplicate outcomes
- [ ] Every batch API call is tested with a scripted `Failed` entry (Stubber), for sender fault and server fault
- [ ] Integration tests use moto with a fresh backend and unique queue names per test; no shared queues
- [ ] Fake credentials are set for every test; no test can reach a real account by accident
- [ ] Redelivery after visibility timeout, lost ack and heartbeat are covered; assertions use deadlines
- [ ] A poison message reaches the DLQ after `maxReceiveCount`; the DLQ has an alarm and a longer retention than the source queue
- [ ] FIFO: group ordering, group blocking, stable deduplication IDs for retried events
- [ ] Idempotency proven by delivering the same business key twice
- [ ] Lambda handlers return `batchItemFailures` correctly (FIFO: stop at the first failure)
- [ ] The moto gaps that matter are covered by a real-account smoke test: queue policy for SNS, IAM, KMS, redrive
- [ ] Load test checks drain time, `ApproximateAgeOfOldestMessage` and an empty DLQ
- [ ] Slow tests are marked; CI runs `-n 4`; boto3 and moto versions are pinned and upgraded on purpose

---
## See also
- [Amazon SQS — Overview](./index.md)
- [Amazon SQS — Testing SQS-Based Systems](./05-testing.md)
- [Amazon SQS — Consumer Patterns](./03-consumer-patterns.md)
- [Amazon SQS — Lambda, Scaling & Integrations](./04-lambda-scaling-integrations.md)
- [AWS Foundations — Credentials, IAM & Local Testing](../foundations/02-credentials-iam-local-testing.md)
- [Docker & Docker Compose](../../tools/docker/index.md)
