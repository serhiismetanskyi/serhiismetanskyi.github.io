---
date: 2026-10-21 12:00:00
tags:
  - aws
  - sns
  - testing
  - moto
  - ci
---

# Amazon SNS — moto Limits, Pitfalls & CI

moto is a re-implementation, not the service. This page lists what it does not do, the flakiness traps of SNS tests, a CI setup and a QA checklist.

## What moto Does Not Emulate

The AWS column is from the documentation. moto changes, so re-run your own probes when you upgrade.

| Area | AWS behaviour | moto |
|------|---------------|-----------|
| Queue policy | SNS cannot deliver without it | Delivered with no queue policy at all |
| Topic policy, IAM, KMS key policy | Enforced | A topic with an explicit `Deny` `sns:Publish` policy still accepted a publish; KMS settings are stored, nothing is encrypted |
| Filter operators | All documented operators | `equals-ignore-case`, `anything-but` with `suffix`, and `anything-but` with `wildcard` never match; `wildcard` and `cidr` are rejected at subscribe; `$or` in a **body-scope** policy raises a `TypeError` at publish; an attribute-less message matches `exists: false` (docs: it does not) ([matrix](./03-filtering-fanout.md#operators)) |
| Filter propagation | Up to 15 minutes | Instant |
| FIFO topic deduplication | SNS drops duplicates (5 minutes) | Not done at the topic: 3 publishes with one dedup ID reached a **standard** queue 3 times (an SQS FIFO queue deduplicated them); `SequenceNumber` is not returned |
| FIFO topic subscribers | Only SQS queues; others are rejected | `https` and `email` subscriptions to a FIFO topic were accepted |
| FIFO content-based dedup | Topic hashes the body | With `ContentBasedDeduplication` on the topic, the subscribed FIFO queue must also have it on, or `publish` fails |
| Subscription DLQ | Failed deliveries go to the DLQ | `RedrivePolicy` is stored (even invalid JSON), nothing is redriven. With a subscribed queue deleted, `publish` **raised `NonExistentQueue` to the publisher**, where AWS would accept it and fail the delivery |
| Retries and `DeliveryPolicy` | Retries per protocol | Stored only. An HTTP endpoint answering 500 was called once; an unreachable endpoint made `publish` raise `requests.ConnectionError` |
| Confirmation | HTTP/S and e-mail stay pending until confirmed | New `https` subscription had `PendingConfirmation: false` immediately; an unknown protocol (`bogus`) was accepted |
| Limits | `MaximumMessageSize`, 10 raw attributes, reserved `AWS.` names, non-empty message, batch `Id` rules, `EmptyBatchRequest` | `MaximumMessageSize` is ignored (stays 256 KiB, not stored); empty message, empty batch, `AWS.x` attribute and batch `Id` `"b!"` were accepted |
| Topic counters | `SubscriptionsConfirmed` etc. | Always `0` |
| Metrics, logging | `AWS/SNS` CloudWatch metrics, delivery status logs | No metrics (`list_metrics` empty); feedback-role attributes not stored |
| FIFO archive and replay, `FifoThroughputScope` | Supported | `ArchivePolicy` and `FifoThroughputScope` accepted but not stored; `ReplayPolicy` rejected |
| Binary attribute with raw delivery to SQS | Works | `receive_message` failed with `TypeError` inside moto |
| Invalid `FilterPolicyScope` | `InvalidParameter` | Bare `CheckException`, not a `ClientError` |
| Lambda subscribers | Real invocation | Needs Docker |
| Throttling and quotas | Per-Region request and account limits | No request throttling; no account-level quotas (topic count, publish rate) |

What moto **does** do well, as shown above: topic and queue creation, SQS delivery in both formats, message attribute mapping, most filter operators in both scopes, the 5-key and 150-combination limits, batch size, error codes for common mistakes, HTTP/S POSTs, tags, `add_permission`, pagination, and a clean slate per `mock_aws()` context (a client created before the context started was served by moto too).

## Flakiness Pitfalls

| Pitfall | Why | Fix |
|---------|-----|-----|
| `time.sleep(2)` then one `receive_message` | Too short on AWS, wasted time on moto | Poll with a deadline (`TestQueue.receive`) |
| Asserting a message did **not** arrive | Proves nothing unless the wait is meaningful | First wait for a message that must arrive, then check absence; on AWS accept that absence is best-effort |
| Changing a filter policy and publishing at once on a real account | Docs: propagation up to 15 minutes | Create the subscription with its policy before the test, use a fresh topic per run, give filter tests a long deadline, or keep them off the real-account job |
| Publishing before subscribing | SNS stores nothing | Subscribe first; on real AWS wait until the subscription is confirmed |
| Fixed `MessageDeduplicationId` across runs | Same ID inside 5 minutes is accepted and **silently not delivered** | Build IDs from the test's unique run ID |
| Comparing lists from a standard topic | No ordering guarantee, duplicates possible | Compare sorted values or sets, and de-duplicate by `event_id` |
| Shared topic or queue names | Leftover messages from earlier tests | `unique()` names, delete in the fixture teardown |
| `WaitTimeSeconds=5` on moto | moto really waits: an empty `receive_message` with `WaitTimeSeconds=2` takes 2 s | `wait=0` locally |
| `StringValue` as an int | `ParamValidationError` raised by botocore | Always `str(value)` (the builder does) |
| Testing only one delivery format | The other breaks consumers in production | Cover raw and envelope if both exist |
| Quota hits in load tests | Default publish limits are 300 messages/s in many Regions; `TopicLimitExceeded` after leaking topics | Check Service Quotas first; always clean up |

## Real-Account Smoke Test

```python
# imports: json, os, uuid, boto3, pytest
pytestmark = [
    pytest.mark.aws_smoke,
    pytest.mark.skipif(not os.environ.get("SNS_SMOKE"), reason="set SNS_SMOKE=1 and real credentials"),
]


def test_topic_to_queue_with_queue_policy():
    sns, sqs = boto3.client("sns"), boto3.client("sqs")
    suffix = uuid.uuid4().hex[:8]
    topic_arn = sns.create_topic(Name=f"smoke-{suffix}", Tags=[{"Key": "purpose", "Value": "ci-smoke"}])["TopicArn"]
    queue_url = sqs.create_queue(QueueName=f"smoke-{suffix}")["QueueUrl"]
    try:
        ...                                               # queue policy, subscribe, publish: as in the overview example
        for _ in range(6):                                # long polling, bounded: at most ~60 s
            got = sqs.receive_message(QueueUrl=queue_url, WaitTimeSeconds=10).get("Messages", [])
            if got:
                break
        assert got and got[0]["Body"] == "hello"         # proves the queue policy and the subscription work
    finally:
        sns.delete_topic(TopicArn=topic_arn)
        sqs.delete_queue(QueueUrl=queue_url)
```

The file is skipped without `SNS_SMOKE` and deselected by default through `addopts = -m "not aws_smoke"`. Run it in a dedicated account with an OIDC role limited to resources tagged `purpose=ci-smoke` (see the `aws-smoke.yml` example in [Foundations](../foundations/02-credentials-iam-local-testing.md#the-credential-provider-chain)). Candidates for the same job: encrypted-topic publish, DLQ redrive after deleting the queue policy, filter policy propagation, an HTTPS endpoint confirmation, FIFO dedup at topic level, a Lambda subscriber.

## CI with GitHub Actions

```yaml
# .github/workflows/test.yml
name: test
on:
  push:
  pull_request:
  schedule:
    - cron: "0 5 * * 1"
  workflow_dispatch:
jobs:
  sns-tests:                                      # moto only: this job has no AWS credentials at all
    if: github.event_name != 'schedule'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
      - run: uv sync
      - run: uv run pytest -q -n auto
  aws-smoke:                                      # scheduled or manual; real account through OIDC
    if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: arn:aws:iam::123456789012:role/ci-smoke-tests
          aws-region: eu-west-1
      - run: uv sync
      - run: SNS_SMOKE=1 uv run pytest -q -m aws_smoke
```

The unit job needs no secrets; keep it that way. The smoke job uses an OIDC role (see [Foundations](../foundations/02-credentials-iam-local-testing.md#the-credential-provider-chain)) and runs outside pull requests.

## QA Checklist

- [ ] Builder tested: attribute names and types, 10-attribute budget, subject under 100 characters.
- [ ] Payload model shared with consumers; invalid events rejected before publish.
- [ ] Every filter policy has a positive **and** a negative test; raw and envelope formats covered as used in production.
- [ ] `publish_batch` chunking and `Failed` handling tested.
- [ ] FIFO: order per group, duplicate dropped, IDs derived from business keys.
- [ ] Queue policy and topic policy reviewed (`aws:SourceArn`, least privilege); encrypted-topic key policies verified on a real account.
- [ ] Subscription DLQ configured (unit) and redrive verified on a real account; alarms on `NumberOfNotificationsFailed`, DLQ depth and `FailedToRedriveToDlq`.
- [ ] Unique names, cleanup in fixtures, autouse fake-credentials fixture; smoke job isolated and tagged.
- [ ] moto gaps above re-checked after each moto upgrade.

## Quick Rules

1. **Re-run your own moto probes after every upgrade**.
2. **Keep policy, KMS, retry, DLQ-redrive, quota and propagation checks in a small real-account job.**
3. **Poll with deadlines; assert absence only after a positive arrival.**
4. **Derive FIFO dedup IDs from a per-run unique ID.**
5. **Never give the unit-test job real credentials.**

---
## See also
- [Amazon SNS — Overview](./index.md)
- [Amazon SNS — Testing SNS-Based Systems](./04-testing.md)
- [Amazon SNS — Filtering & Fan-out Patterns](./03-filtering-fanout.md)
- [Amazon SNS — Core Concepts](./01-core-concepts.md)
- [AWS Foundations — Credentials, IAM & Local Testing](../foundations/02-credentials-iam-local-testing.md)
- [Amazon SQS](../sqs/index.md)
- [Mocking & Test Isolation](../../test-automation-framework/06-execution-reliability/03-mocking-isolation.md)
- [Testing Pyramid](../../testing-pyramid/index.md)
