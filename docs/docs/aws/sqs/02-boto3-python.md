---
date: 2026-10-21 12:00:00
tags:
  - aws
  - sqs
  - boto3
  - python
---

# Amazon SQS — boto3 in Python

Sessions, credential lookup, `Config`, retries and `ClientError` basics are in [AWS Foundations](../foundations/01-clients-config-errors.md) and not repeated here. All examples use the low-level **client** (`boto3.client("sqs")`), which maps one-to-one to the API. Snippets can run against moto (`with mock_aws():`).

```python
import boto3

sqs = boto3.client("sqs", region_name="us-east-1")
print(sqs.meta.service_model.protocol)        # json
```

## The JSON Protocol and Error Codes

Since boto3 1.28.82 / botocore 1.31.82 the SQS client speaks the **AWS JSON protocol** (the query protocol is still supported by the service for older SDKs). The application code is identical. One visible difference: botocore keeps the legacy query-style name in `Error.Code` and puts the modeled name in `Error.QueryErrorCode`.

```python
try:
    sqs.get_queue_url(QueueName="missing")
except sqs.exceptions.QueueDoesNotExist as e:
    print(e.response["Error"])
# {'Message': 'The specified queue does not exist.', 'Code': 'AWS.SimpleQueueService.NonExistentQueue',
#  'QueryErrorCode': 'QueueDoesNotExist', 'Type': 'Sender'}
```

Catch `sqs.exceptions.<Name>`; do not compare `Code` with a string copied from an old tutorial. botocore translates the `x-amzn-query-error` header into `QueryErrorCode`, and the parser code is the same for moto and real SQS.

## Creating Queues

Every attribute value is a **string**, including numbers and JSON documents.

```python
std = sqs.create_queue(
    QueueName="orders",
    Attributes={
        "VisibilityTimeout": "60",
        "MessageRetentionPeriod": "86400",          # 1 day
        "ReceiveMessageWaitTimeSeconds": "20",      # long polling by default
    },
    tags={"team": "billing"},                       # note: lowercase "tags" in this call, "Tags" elsewhere
)["QueueUrl"]

fifo = sqs.create_queue(
    QueueName="orders.fifo",                        # the suffix is mandatory
    Attributes={
        "FifoQueue": "true",
        "ContentBasedDeduplication": "false",
        "DeduplicationScope": "messageGroup",       # with the next line: high-throughput FIFO
        "FifoThroughputLimit": "perMessageGroupId",
    },
)["QueueUrl"]
print(std)    # https://sqs.us-east-1.amazonaws.com/123456789012/orders      (moto's fake account)
print(fifo)   # https://sqs.us-east-1.amazonaws.com/123456789012/orders.fifo
```

| Attribute | Values | Notes |
|-----------|--------|-------|
| `VisibilityTimeout` | 0–43,200 s, default 30 | Per-queue default |
| `MessageRetentionPeriod` | 60–1,209,600 s, default 345,600 | |
| `DelaySeconds` | 0–900 | Delay queue |
| `ReceiveMessageWaitTimeSeconds` | 0–20 | Non-zero = long polling by default |
| `MaximumMessageSize` | 1,024–1,048,576 | Default 1 MiB |
| `RedrivePolicy` | JSON string: `deadLetterTargetArn`, `maxReceiveCount` | On the source queue |
| `RedriveAllowPolicy` | JSON string: `redrivePermission`, `sourceQueueArns` | On the DLQ |
| `Policy` | JSON string | Queue (resource) policy |
| `SqsManagedSseEnabled` / `KmsMasterKeyId` / `KmsDataKeyReusePeriodSeconds` | `"true"` / key ID / 60–86,400 | Encryption |
| `FifoQueue`, `ContentBasedDeduplication`, `DeduplicationScope`, `FifoThroughputLimit` | see [01](./01-core-concepts.md#fifo-details) | FIFO only; `FifoQueue` only at creation |

### `create_queue` vs `get_queue_url`

| Call | When | Behaviour |
|------|------|-----------|
| `create_queue` | Infrastructure code, test fixtures | **Idempotent** if the name and every attribute match an existing queue: returns its URL. If the name exists with **different** attribute values: `QueueNameExists`. After `delete_queue`, creating the same name within 60 seconds fails with `QueueDeletedRecently` |
| `get_queue_url` | Application code | Looks up by name; `QueueDoesNotExist` if missing. `QueueOwnerAWSAccountId` reaches a queue of another account (needs a queue policy) |

Application services should **not** create their own queues: it needs `sqs:CreateQueue`, hides misconfiguration and races with infrastructure-as-code. Resolve the URL once at start-up (`get_queue_url`) or inject it as configuration. Cache it; queue URLs do not change.

```python
url = sqs.get_queue_url(QueueName="orders")["QueueUrl"]
arn = sqs.get_queue_attributes(QueueUrl=url, AttributeNames=["QueueArn"])["Attributes"]["QueueArn"]
print(arn)    # arn:aws:sqs:us-east-1:123456789012:orders
```

`get_queue_attributes(AttributeNames=["All"])` returns the configuration plus the approximate counters `ApproximateNumberOfMessages` (visible), `ApproximateNumberOfMessagesNotVisible` (in flight) and `ApproximateNumberOfMessagesDelayed`. Counters are eventually consistent: use them for dashboards and scaling, not for exact assertions on a real queue. `set_queue_attributes` changes a mutable attribute; most changes take up to 60 seconds to propagate, retention up to 15 minutes.

### Tags

```python
sqs.tag_queue(QueueUrl=url, Tags={"env": "test", "owner": "qa"})
sqs.untag_queue(QueueUrl=url, TagKeys=["owner"])
print(sqs.list_queue_tags(QueueUrl=url)["Tags"])      # {'env': 'test', 'team': 'billing'}
```

Tag calls are limited to 30 requests per second per account, and AWS does not recommend more than 50 tags per queue. A tag key cannot start with `aws:`.

## Sending

```python
import json

resp = sqs.send_message(
    QueueUrl=url,
    MessageBody=json.dumps({"order_id": "o-1", "amount": 9.5}),    # a string; at most 1 MiB
    MessageAttributes={
        "tenant":   {"DataType": "String", "StringValue": "acme"},
        "priority": {"DataType": "Number", "StringValue": "3"},
        "blob":     {"DataType": "Binary", "BinaryValue": b"\x00\x01"},
    },
    DelaySeconds=0,                                                 # per-message timer; not allowed on FIFO
)
print(sorted(k for k in resp if k != "ResponseMetadata"))
# ['MD5OfMessageAttributes', 'MD5OfMessageBody', 'MessageId']
```

- A message body must be text. Send binary data base64-encoded, or in a `Binary` attribute (counts toward the size).
- Maximum 10 message attributes; names are case-sensitive and cannot start with `AWS.` or `Amazon.`.
- `MessageSystemAttributes={"AWSTraceHeader": {"DataType": "String", "StringValue": "<X-Ray trace header>"}}` propagates an X-Ray trace; it is the only system attribute you can send.
- A successful `send_message` returns a `MessageId`. If the call times out you cannot tell whether it was stored: retry, and let the consumer deduplicate (or use a stable `MessageDeduplicationId` on FIFO).

### FIFO

```python
resp = sqs.send_message(
    QueueUrl=fifo,
    MessageBody=json.dumps({"order_id": "o-1", "event": "created"}),
    MessageGroupId="customer-42",                    # required: ordering lane
    MessageDeduplicationId="order-o-1-created",      # required unless ContentBasedDeduplication is on
)
print(sorted(k for k in resp if k != "ResponseMetadata"))
# ['MD5OfMessageBody', 'MessageId', 'SequenceNumber']
```

Derive the deduplication ID from the business event (`order-o-1-created`), not from a random UUID: a random ID defeats the purpose, because a retry then looks like a new message.

### Batch sending and partial failure

`send_message_batch` takes up to 10 entries, each with a unique `Id` (up to 80 characters of `A-Za-z0-9_-`), and the **sum of the bodies must not exceed 1 MiB**. The call returns HTTP 200 even when some entries failed, so the response must always be checked:

```python
resp = sqs.send_message_batch(QueueUrl=url, Entries=[
    {"Id": "0", "MessageBody": "a"},
    {"Id": "1", "MessageBody": "b", "DelaySeconds": 30},
])
resp["Successful"]   # [{'Id': '0', 'MessageId': '...', 'MD5OfMessageBody': '...'}, ...]
resp["Failed"]       # [{'Id': '1', 'SenderFault': False, 'Code': 'InternalError', 'Message': '...'}]
```

`SenderFault=True` means the entry itself is wrong (retrying changes nothing); `False` means a server-side problem worth retrying — **only the failed entries**, not the whole batch. The helper from the demo project does exactly that:

```python
# app/producer.py
import json


class BatchSendError(Exception):
    def __init__(self, failed: list[dict]):
        super().__init__(f"{len(failed)} entries failed: {failed}")
        self.failed = failed


def send_batch(sqs, queue_url: str, bodies: list[dict], *, attempts: int = 3) -> list[str]:
    """Send any number of messages in batches of 10. Retries server-side failures, raises on sender faults."""
    message_ids: list[str] = []
    for start in range(0, len(bodies), 10):
        entries = [{"Id": str(i), "MessageBody": json.dumps(b)} for i, b in enumerate(bodies[start:start + 10])]
        for _ in range(attempts):
            resp = sqs.send_message_batch(QueueUrl=queue_url, Entries=entries)   # HTTP 200 even if entries failed
            message_ids += [ok["MessageId"] for ok in resp["Successful"]]
            failed = resp.get("Failed", [])
            if not failed:
                break
            if any(f["SenderFault"] for f in failed):                           # retrying cannot fix our own mistake
                raise BatchSendError(failed)
            retry_ids = {f["Id"] for f in failed}
            entries = [e for e in entries if e["Id"] in retry_ids]
        else:
            raise BatchSendError(failed)
    return message_ids
```

Whole-request errors are exceptions, not `Failed` entries: `TooManyEntriesInBatchRequest` (more than 10), `BatchEntryIdsNotDistinct`, `EmptyBatchRequest`, `InvalidBatchEntryId`, `BatchRequestTooLong`. moto never returns `Failed` entries for sends, so the partial-failure path is tested with botocore's `Stubber` ([04](./05-testing.md#partial-batch-failures)).

## Receiving

```python
resp = sqs.receive_message(
    QueueUrl=url,
    MaxNumberOfMessages=10,                    # 1-10, default 1: always ask for 10 in a worker
    WaitTimeSeconds=20,                        # long polling; 0 = short polling
    VisibilityTimeout=120,                     # optional: overrides the queue default for these messages
    MessageAttributeNames=["tenant"],          # custom attributes are returned only when requested: names, "All", or "prefix.*"
    MessageSystemAttributeNames=["ApproximateReceiveCount", "SentTimestamp"],
)
for msg in resp.get("Messages", []):           # the key is absent, not an empty list, when nothing arrived
    print(msg["MessageId"], msg["Body"], msg["Attributes"], msg.get("MessageAttributes"))
    # ReceiptHandle is the only handle for DeleteMessage / ChangeMessageVisibility
```

```text
['Attributes', 'Body', 'MD5OfBody', 'MD5OfMessageAttributes', 'MessageAttributes', 'MessageId', 'ReceiptHandle']
{'SentTimestamp': '1792586957156', 'ApproximateReceiveCount': '1'}
{'tenant': {'StringValue': 'acme', 'DataType': 'String'}, 'priority': {'StringValue': '3', 'DataType': 'Number'}}
```

| Parameter | Notes |
|-----------|-------|
| `MaxNumberOfMessages` | Upper bound, not a promise: you can get fewer, even one, from a busy queue |
| `WaitTimeSeconds` | 0–20; overrides the queue's `ReceiveMessageWaitTimeSeconds` |
| `VisibilityTimeout` | Applies only to the returned messages |
| `MessageAttributeNames` | Names, `"All"`, or a prefix like `"app.*"`; unrequested attributes are not returned |
| `MessageSystemAttributeNames` | `ApproximateReceiveCount`, `ApproximateFirstReceiveTimestamp`, `SentTimestamp`, `SenderId`, `AWSTraceHeader`, `MessageGroupId`, `MessageDeduplicationId`, `SequenceNumber`, `DeadLetterQueueSourceArn`, `All`. Use this instead of the deprecated `AttributeNames` |
| `ReceiveRequestAttemptId` | FIFO only: retry a `ReceiveMessage` whose response got lost and get the same messages back (5 minutes, messages untouched) |

Receive in a loop, not once: a single call may return nothing even if the queue has messages (short polling), and a `MaxNumberOfMessages=10` call may return 3.

### Deleting and acknowledging

```python
sqs.delete_message(QueueUrl=url, ReceiptHandle=msg["ReceiptHandle"])
```

`delete_message` is idempotent for a valid handle. Use the batch call for throughput, and check `Failed`:

```python
def delete_batch(sqs, queue_url: str, messages: list[dict]) -> list[dict]:
    """Delete received messages 10 at a time. Returns the entries that failed."""
    failed = []
    for i in range(0, len(messages), 10):
        entries = [{"Id": str(n), "ReceiptHandle": m["ReceiptHandle"]} for n, m in enumerate(messages[i:i + 10])]
        failed += sqs.delete_message_batch(QueueUrl=queue_url, Entries=entries).get("Failed", [])
    return failed                                          # a failed delete means the message will be redelivered
```

Run against 12 real messages plus one bogus handle it returned only the bogus one: `[{'Id': '2', 'SenderFault': True, 'Code': 'ReceiptHandleIsInvalid', 'Message': 'The input receipt handle "bogus" is not a valid receipt handle.'}]`.

### Changing visibility

```python
sqs.change_message_visibility(QueueUrl=url, ReceiptHandle=handle, VisibilityTimeout=120)   # 120 s from now
sqs.change_message_visibility(QueueUrl=url, ReceiptHandle=handle, VisibilityTimeout=0)     # give it back immediately
sqs.change_message_visibility_batch(QueueUrl=url, Entries=[
    {"Id": "0", "ReceiptHandle": handle, "VisibilityTimeout": 60},
])
```

The timeout is counted from the call, cannot push the total past 12 hours from the first receive, and applies once: the next receive uses the queue default again. A handle that is no longer valid raises `ReceiptHandleIsInvalid`; a message that is not in flight raises `MessageNotInflight`.

### Receive loop with a generator

```python
def drain(sqs, queue_url: str):
    """Generator over received messages; stops at the first empty long poll."""
    while True:
        resp = sqs.receive_message(QueueUrl=queue_url, MaxNumberOfMessages=10, WaitTimeSeconds=1)
        if not (messages := resp.get("Messages")):
            return
        yield from messages
```

A production consumer never stops at an empty poll; it keeps polling. The full worker is in [03](./03-consumer-patterns.md#worker-loop-with-graceful-shutdown).

## Purge and Delete

```python
sqs.purge_queue(QueueUrl=url)      # removes every message, including in-flight ones; takes up to 60 s
sqs.delete_queue(QueueUrl=url)     # the name is blocked for creation for 60 s
```

`purge_queue` is allowed once per queue per 60 seconds (`PurgeQueueInProgress` otherwise), and messages sent while it runs may be deleted too. In tests, prefer **a new queue per test** over purging a shared one.

## Pagination

`list_queues` returns up to 1,000 queue URLs per page; `QueueNamePrefix` filters by name. boto3 has paginators for `list_queues` and `list_dead_letter_source_queues`:

```python
pages = sqs.get_paginator("list_queues").paginate(QueueNamePrefix="jobs-", PaginationConfig={"PageSize": 2})
urls = [u for page in pages for u in page.get("QueueUrls", [])]      # a page without queues has no "QueueUrls" key
# page sizes [2, 1] for three queues; ['jobs-0', 'jobs-1', 'jobs-2']
```

`ReceiveMessage` has no pagination: there is no way to browse a queue without receiving (and thereby hiding) its messages. To "peek", receive with a short `VisibilityTimeout` and let the messages reappear, remembering that each peek increments `ApproximateReceiveCount`.

## Errors

| Exception (`sqs.exceptions.`) | Raised when | Typical handling |
|-------------------------------|-------------|------------------|
| `QueueDoesNotExist` | Wrong name, Region or account; queue deleted | Configuration bug; fail fast |
| `QueueNameExists` | `create_queue` with different attributes for an existing name | Compare attributes or use `set_queue_attributes` |
| `QueueDeletedRecently` | Re-creating a queue within 60 seconds of deleting it | Wait, or use a new name in tests |
| `ReceiptHandleIsInvalid` | Malformed or unknown handle | Usually a stale or corrupted handle; skip |
| `MessageNotInflight` | `change_message_visibility` on a message that is not in flight | The visibility timeout already expired; treat the message as redelivered |
| `OverLimit` | Too many in-flight messages on a short-polling receive (about 120,000 on standard queues) | Delete finished messages, add consumers or queues, use long polling |
| `PurgeQueueInProgress` | Second purge within 60 seconds | Wait |
| `InvalidMessageContents` | Body has characters outside the allowed set | Encode the payload (base64, JSON escaping) |
| `BatchRequestTooLong`, `BatchEntryIdsNotDistinct`, `EmptyBatchRequest`, `TooManyEntriesInBatchRequest`, `InvalidBatchEntryId` | Malformed batch | Fix the batch builder |
| `RequestThrottled` | Request rate exceeded | botocore retries first; then back off |
| `KmsAccessDenied`, `KmsThrottled`, `KmsNotFound`, `KmsDisabled`, ... | SSE-KMS key problems | Fix the key policy or state; `KmsThrottled` is retryable |
| `InvalidAttributeName`, `InvalidAttributeValue` | Bad queue attribute | Fix the call |
| `UnsupportedOperation` | Operation not supported for this queue or source | Check the API notes |

Other validation failures (for example a missing `MessageGroupId`) come back as a generic `ClientError` whose `Error.Code` you read yourself (for example `MissingParameter` and `InvalidParameterValue` for the FIFO cases in [04](./05-testing.md)). The service also returns `AccessDenied` when IAM or the queue policy refuses the call.

## Timeouts and Retries for Consumers

The default 60 s connect and read timeouts suit SQS: the 20-second maximum long poll fits inside the read timeout. Lower `read_timeout` only together with `WaitTimeSeconds`, and keep the read timeout at least a few seconds above it. Retry mode, `max_attempts` and `Config` are explained in [Foundations](../foundations/01-clients-config-errors.md#retries).

---
## See also
- [Amazon SQS — Overview](./index.md)
- [Amazon SQS — Core Concepts](./01-core-concepts.md)
- [Amazon SQS — Consumer Patterns](./03-consumer-patterns.md)
- [Amazon SQS — Testing SQS-Based Systems](./05-testing.md)
- [AWS Foundations — Clients, Config, Retries & Errors](../foundations/01-clients-config-errors.md)
- [AWS Foundations — Credentials, IAM & Local Testing](../foundations/02-credentials-iam-local-testing.md)
