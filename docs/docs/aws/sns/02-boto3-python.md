---
date: 2026-10-21 12:00:00
tags:
  - aws
  - sns
  - boto3
  - python
  - messaging
---

# Amazon SNS — boto3 in Python

Everything here uses the low-level **client** (`boto3.client("sns")`). Client creation, `Config`, retries, endpoint overrides and the credential chain are in [AWS Foundations](../foundations/01-clients-config-errors.md); this page is about the SNS calls themselves. The `boto3.resource("sns")` interface exists (`Topic.publish`, `Subscription`), but resource interfaces get no new features, so examples stick to the client.

Where moto and AWS differ, the text says so.

## Call Map

| Task | Call | Notes |
|------|------|-------|
| Create a topic | `create_topic(Name, Attributes, Tags)` | Idempotent; returns `TopicArn` |
| Delete a topic | `delete_topic(TopicArn)` | A FIFO topic with an active archive policy must first have the policy cleared |
| Read or change topic settings | `get_topic_attributes`, `set_topic_attributes(AttributeName, AttributeValue)` | One attribute per call; values are strings |
| Subscribe | `subscribe(TopicArn, Protocol, Endpoint, Attributes, ReturnSubscriptionArn)` | SQS, Lambda, HTTP/S, e-mail, ... |
| Confirm (HTTP/S, e-mail, cross-account) | `confirm_subscription(TopicArn, Token, AuthenticateOnUnsubscribe)` | Token valid two days |
| Read or change a subscription | `get_subscription_attributes`, `set_subscription_attributes` | Filter policy, raw delivery, DLQ |
| List | `list_topics`, `list_subscriptions`, `list_subscriptions_by_topic` | All three have paginators |
| Publish | `publish(TopicArn, Message, Subject, MessageAttributes, ...)` | One message |
| Publish up to 10 | `publish_batch(TopicArn, PublishBatchRequestEntries)` | Per-entry results |
| Tags | `tag_resource`, `untag_resource`, `list_tags_for_resource` | Topics only |
| Topic policy helpers | `add_permission`, `remove_permission` | Edit the `Policy` attribute |

## Topics

```python
import boto3

sns = boto3.client("sns", region_name="us-east-1")

std = sns.create_topic(
    Name="order-events",
    Tags=[{"Key": "env", "Value": "test"}],
    Attributes={"DisplayName": "Orders"},
)["TopicArn"]

fifo = sns.create_topic(
    Name="order-events.fifo",                                         # suffix is mandatory for FIFO
    Attributes={"FifoTopic": "true", "ContentBasedDeduplication": "true"},
)["TopicArn"]

print(std)     # arn:aws:sns:us-east-1:123456789012:order-events
print(fifo)    # arn:aws:sns:us-east-1:123456789012:order-events.fifo
print(sns.create_topic(Name="order-events")["TopicArn"] == std)       # True: create_topic is idempotent
print(sns.get_topic_attributes(TopicArn=fifo)["Attributes"]["FifoTopic"])   # true
print(sns.list_tags_for_resource(ResourceArn=std)["Tags"])            # [{'Key': 'env', 'Value': 'test'}]
```

Create the same topic again with **different attributes** and the behaviour is not documented on the `CreateTopic` page; do not depend on it. Create topics in infrastructure code (CloudFormation, Terraform, CDK) in real environments and let tests create their own with unique names (see [04 Testing](./04-testing.md)).

## Subscribing

```python
import json

sqs = boto3.client("sqs", region_name="us-east-1")
url = sqs.create_queue(QueueName="billing")["QueueUrl"]
queue_arn = sqs.get_queue_attributes(QueueUrl=url, AttributeNames=["QueueArn"])["Attributes"]["QueueArn"]
# (queue policy allowing the topic: see 01 Core Concepts or the minimal example in the overview)

subscription_arn = sns.subscribe(
    TopicArn=std,
    Protocol="sqs",
    Endpoint=queue_arn,
    ReturnSubscriptionArn=True,                                       # real ARN even while pending
    Attributes={
        "RawMessageDelivery": "true",
        "FilterPolicy": json.dumps({"event_type": ["created"]}),      # must be a JSON *string*
        "FilterPolicyScope": "MessageAttributes",                     # or "MessageBody"
    },
)["SubscriptionArn"]

sns.set_subscription_attributes(                                      # change one attribute later
    SubscriptionArn=subscription_arn,
    AttributeName="FilterPolicy",
    AttributeValue=json.dumps({"event_type": ["created", "paid"]}),
)
print(sns.get_subscription_attributes(SubscriptionArn=subscription_arn)["Attributes"]["FilterPolicy"])
# {"event_type": ["created", "paid"]}
```

- Attribute **values are always strings**: `"true"`, not `True`; JSON documents go through `json.dumps`.
- A subscription for an HTTPS or e-mail endpoint (or any endpoint in another account) stays pending. The endpoint owner reads the `Token` from the confirmation message and calls `confirm_subscription(TopicArn=..., Token=token)`. With `ReturnSubscriptionArn=False` (the default) `subscribe` returns the text `pending confirmation` instead of an ARN.
- `get_subscription_attributes` returns `PendingConfirmation`, `Protocol`, `Endpoint`, `TopicArn`, `SubscriptionArn`, `Owner`, `RawMessageDelivery` and, where set, `FilterPolicy`, `FilterPolicyScope` and `RedrivePolicy` (moto; AWS adds more, for example `EffectiveDeliveryPolicy`).
- The filter policy is validated at `subscribe` and `set_subscription_attributes` time: more than 5 keys or more than 150 value combinations come back as `InvalidParameter` (AWS documents the same limits).

### Pagination

```python
for page in sns.get_paginator("list_subscriptions_by_topic").paginate(TopicArn=std):
    for sub in page["Subscriptions"]:
        print(sub["Protocol"], sub["Endpoint"])
# sqs arn:aws:sqs:us-east-1:123456789012:billing

topics = [t["TopicArn"] for page in sns.get_paginator("list_topics").paginate() for t in page["Topics"]]
```

`ListTopics` returns up to 100 topics per page; `ListSubscriptions*` has the same `NextToken` pattern. Do not use `list_topics()["Topics"]` in a test helper that must find a topic in a busy account.

## Publishing

```python
import json

response = sns.publish(
    TopicArn=std,
    Message=json.dumps({"order_id": "o1"}),               # the payload; SNS does not interpret it
    Subject="order created",                              # optional, < 100 chars; absent from raw deliveries
    MessageAttributes={
        "event_type":   {"DataType": "String",       "StringValue": "created"},
        "amount_cents": {"DataType": "Number",       "StringValue": "1250"},
        "channels":     {"DataType": "String.Array", "StringValue": json.dumps(["web", "mobile"])},
    },
)
print(sorted(k for k in response if k != "ResponseMetadata"))     # ['MessageId']
```

| `DataType` | Value key | Example |
|------------|-----------|---------|
| `String` | `StringValue` | `"created"` |
| `String.Array` | `StringValue` (JSON array text) | `'["web", "mobile"]'` |
| `Number` | `StringValue` (digits as text) | `"1250"` |
| `Binary` | `BinaryValue` (bytes) | `b"\x01"` |

Keep attribute building in one pure function (see `build_publish_kwargs` in [04 Testing](./04-testing.md)) so the types and names are tested once.

Rules enforced by the service (documented; moto enforces only some of them):

| Rule | AWS | moto |
|------|-----|------------|
| Message body not empty | Required | An empty string is accepted |
| Body plus attributes at most 262,144 bytes (default) | `InvalidParameter` | Rejects a body above 262,144 bytes, ignores `MaximumMessageSize` |
| Subject under 100 characters | Rejected | Rejected |
| `Number` value must be numeric | Rejected | Rejected |
| Attribute names starting with `AWS.` or `Amazon.` | Reserved | Accepted |
| Unknown `DataType` | Rejected | Rejected (`InvalidParameter`) |

### Batches

`publish_batch` takes up to **10** entries, each with a batch-unique `Id` and the same fields as `publish` (`Message`, `Subject`, `MessageAttributes`, `MessageStructure`, and the FIFO IDs). The total size of the batch counts against the topic's `MaximumMessageSize`.

```python
response = sns.publish_batch(
    TopicArn=std,
    PublishBatchRequestEntries=[
        {"Id": "a", "Message": "1", "MessageAttributes": {"event_type": {"DataType": "String", "StringValue": "created"}}},
        {"Id": "b", "Message": "2"},
    ],
)
print([x["Id"] for x in response["Successful"]], response["Failed"])      # ['a', 'b'] []
```

The call returns HTTP 200 even when some entries failed. Each item in `Failed` has `Id`, `Code`, `SenderFault` and usually `Message`; `SenderFault=True` means retrying the same entry will fail again.

```python
# app/publisher.py: chunks of 10, raises when anything failed (itertools.batched needs Python 3.12+)
from itertools import batched

for chunk in batched(events, 10):
    entries = [{"Id": str(i), **build_publish_kwargs(e)} for i, e in enumerate(chunk)]
    response = sns.publish_batch(TopicArn=topic_arn, PublishBatchRequestEntries=entries)
    if response["Failed"]:
        raise PublishError(response["Failed"])
```

| Batch error | Meaning |
|-------------|---------|
| `TooManyEntriesInBatchRequest` | More than 10 entries (moto raises it for 11) |
| `BatchEntryIdsNotDistinct` | Two entries share an `Id` (moto raises it) |
| `EmptyBatchRequest` | No entries (moto returns an empty success instead) |
| `InvalidBatchEntryId` | `Id` breaks the rules (moto accepted `"b!"`) |
| `BatchRequestTooLong` | Combined size over the topic limit |

### FIFO Publishing

```python
r = sns.publish(
    TopicArn=fifo,
    Message="order paid",
    MessageGroupId="order-1",                  # ordering key: one group per order, customer, device...
    # MessageDeduplicationId="order-1-paid",   # required unless ContentBasedDeduplication is on (it is, above)
)
```

| Rule | Detail |
|------|--------|
| Group ID | Always required on FIFO topics; up to 128 characters |
| Dedup ID | Explicit ID, or the SHA-256 of the body when `ContentBasedDeduplication=true`; an explicit ID wins. Same ID within 5 minutes: accepted, not delivered |
| Choose IDs deliberately | A business key (`order-1-paid`) makes a retried publish harmless. A random UUID per call defeats deduplication |
| Batch | Each entry carries its own `MessageGroupId` and `MessageDeduplicationId`; order inside the batch is kept |
| Response | `SequenceNumber` on real FIFO topics (moto does not return it) |

### Different Text per Protocol

```python
sns.publish(
    TopicArn=std,
    MessageStructure="json",
    Message=json.dumps({"default": "order o1 created", "sqs": json.dumps({"order_id": "o1"}), "email": "Your order o1 is confirmed"}),
)
```

`default` is mandatory; other keys name protocols and must hold strings. On moto, a raw SQS subscription received the value of the `sqs` key (`{"order_id": "o1"}`), not the `default` text.

## Topic Settings and Policies

```python
sns.set_topic_attributes(TopicArn=std, AttributeName="DisplayName", AttributeValue="Orders")
sns.set_topic_attributes(TopicArn=std, AttributeName="KmsMasterKeyId", AttributeValue="alias/aws/sns")   # SSE
sns.set_topic_attributes(TopicArn=std, AttributeName="MaximumMessageSize", AttributeValue="1048576")    # up to 1 MiB, SQS/Lambda/Firehose only

sns.add_permission(                                                   # adds a statement to the topic policy
    TopicArn=std, Label="partner-publish", AWSAccountId=["111122223333"], ActionName=["Publish"],
)
```

`add_permission` produced `{"Sid": "partner-publish", "Effect": "Allow", "Principal": {"AWS": "arn:aws:iam::111122223333:root"}, "Action": "SNS:Publish", ...}` on moto. For conditions (`aws:SourceArn`, `aws:PrincipalOrgID`) write the whole policy and set the `Policy` attribute with `json.dumps`.

## Errors

All service errors are `botocore.exceptions.ClientError`; the code is in `exc.response["Error"]["Code"]`, the HTTP status in `exc.response["ResponseMetadata"]["HTTPStatusCode"]`. The client also exposes one subclass per code (`sns.exceptions.NotFoundException`). General handling, retry modes and `Stubber` are in [Foundations](../foundations/01-clients-config-errors.md#errors).

| Code (exception) | HTTP | Typical cause | What to do |
|------------------|------|---------------|-----------|
| `NotFound` (`NotFoundException`) | 404 | Topic or subscription does not exist or was deleted | Check ARN, Region and account; treat as a configuration bug |
| `InvalidParameter` (`InvalidParameterException`) | 400 | Message too large, bad attribute, bad filter policy, bad topic name, wrong FIFO parameters | Fix the request; never retry |
| `ParameterValueInvalid` (`InvalidParameterValueException`) | 400 | A parameter of a batch entry or publish is invalid | Fix the request |
| `AuthorizationError` (`AuthorizationErrorException`) | 403 | IAM or topic policy denies the call | Read the message: it names the principal, action and resource |
| `Throttled` (`ThrottledException`) | 429 | Request rate over the Region quota | Retry with backoff. **Not retried by botocore in `standard` or `adaptive` mode**; see below |
| `InternalError` (`InternalErrorException`) | 500 | SNS side | Retry |
| `KMS*` (`KMSAccessDenied`, `KMSDisabled`, `KMSNotFound`, `KMSThrottling`, ...) | 400 | Encrypted topic and the key or its policy is wrong | Check the key state and policy; `KMSThrottling` can be retried |
| `FilterPolicyLimitExceeded` | 403 | More than 200 filter policies on a topic or 10,000 per account | Remove unused subscriptions or request a quota increase |
| `SubscriptionLimitExceeded`, `TopicLimitExceeded` | 403 | Account quotas | Clean up leaked test resources first |
| `ReplayLimitExceeded` | 403 | Too many concurrent replays | Wait for a replay to finish |
| `TagLimitExceeded`, `StaleTag`, `ConcurrentAccess`, `TagPolicy` | 400 | Tagging problems | Fix tags; retry sequentially |
| `InvalidSecurity` | 403 | Encrypted topic called without HTTPS and Signature Version 4 | Use the normal client |
| `TooManyEntriesInBatchRequest`, `BatchEntryIdsNotDistinct`, `EmptyBatchRequest`, `InvalidBatchEntryId`, `BatchRequestTooLong` | 400 | Batch shape | Fix the batch |

Parameter mistakes caught before the request is sent (missing `Message`, wrong type) are `botocore.exceptions.ParamValidationError`, not `ClientError`.

```python
from botocore.exceptions import ClientError


def publish_or_none(sns, topic_arn: str, **kwargs) -> str | None:
    """None when the topic is gone; everything else is raised."""
    try:
        return sns.publish(TopicArn=topic_arn, **kwargs)["MessageId"]
    except sns.exceptions.NotFoundException:
        return None
    except ClientError as exc:
        if exc.response["Error"]["Code"] in {"Throttled", "InternalError"}:
            raise RuntimeError("SNS is busy; retry later") from exc
        raise
```

On moto, a missing topic gives `NotFound` / 404 / `NotFoundException`; an invalid `DataType` gives `InvalidParameter` / 400; `publish` without a message raises `ParamValidationError`. moto cannot throttle, so test `Throttled` with `Stubber.add_client_error("publish", service_error_code="Throttled", http_status_code=429)`, which surfaces as `ThrottledException`.

### Throttling Is Not Retried in `standard` Mode

SNS reports throttling as the wire code `Throttled` with HTTP 429. When every response is exactly that, boto3 makes:

| Retry mode | HTTP calls before the exception | `RetryAttempts` |
|------------|--------------------------------|-----------------|
| default (`legacy`) | 5 | 4 |
| `standard` | 1 | 0 |
| `adaptive` | 1 | 0 |

`Throttled` is not in botocore's list of throttling codes (`ThrottledException` is, but that is the shape name, not the wire code) and 429 is not one of the transient status codes. If you switch a service to `standard` mode, (see [Foundations](../foundations/01-clients-config-errors.md#retries) for the modes), add a small retry around high-rate publishers:

```python
import random
import time

from botocore.exceptions import ClientError

RETRYABLE = {"Throttled", "InternalError", "KMSThrottling"}


def call_with_retry(fn, *, attempts: int = 5, base: float = 0.2, sleep=time.sleep):
    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except ClientError as exc:
            if exc.response["Error"]["Code"] not in RETRYABLE or attempt == attempts:
                raise
            sleep(random.uniform(0, base * 2 ** attempt))          # full jitter


call_with_retry(lambda: sns.publish(TopicArn=std, Message="m"))
```

Retrying `publish` can deliver a message twice if the first attempt succeeded but its response was lost; on a standard topic consumers must tolerate that anyway, on a FIFO topic the dedup ID makes the retry harmless.

## Quick Rules

1. **Pass attribute values as strings**, and JSON policies through `json.dumps`.
2. **Build `MessageAttributes` in one function** and unit-test it.
3. **Check `Failed` after every `publish_batch`** and chunk by 10.
4. **Use `ReturnSubscriptionArn=True`** when you need the ARN of a subscription that may be pending.
5. **Paginate** `list_topics` and `list_subscriptions*`.
6. **Catch the specific exception** (`sns.exceptions.NotFoundException`) for expected cases and let the rest propagate.
7. **Choose FIFO group and dedup IDs from business keys**, not random values.
8. **Never put secrets or personal data into topic names, subjects or message attributes**: SSE does not encrypt them.

---
## See also
- [Amazon SNS — Overview](./index.md)
- [Amazon SNS — Core Concepts](./01-core-concepts.md)
- [Amazon SNS — Filtering & Fan-out Patterns](./03-filtering-fanout.md)
- [Amazon SNS — Testing SNS-Based Systems](./04-testing.md)
- [AWS Foundations — Clients, Config, Retries & Errors](../foundations/01-clients-config-errors.md)
- [Amazon SQS](../sqs/index.md)
