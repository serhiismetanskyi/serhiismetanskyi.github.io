---
date: 2026-10-21 12:00:00
tags:
  - aws
  - sqs
  - lambda
  - messaging
  - python
---

# Amazon SQS — Lambda, Scaling & Integrations

The worker loop and its failure handling are in [03 Consumer Patterns](./03-consumer-patterns.md). This page covers the managed consumer (Lambda), scaling a consumer fleet, payloads above the message limit, SNS fan-out as seen from the queue, and other consumers such as Celery. The same project (`app/`) and moto test suite continue here ([05 Testing](./05-testing.md)).

## Partial Batch Failures with Lambda

With an SQS event source mapping Lambda polls for you and invokes the function with a batch. By default, if the function raises, **all** messages in the batch return to the queue, including the ones that succeeded. Enable `ReportBatchItemFailures` and return the IDs of only the failed messages.

The event the function receives (standard queue; note the camelCase keys, unlike `receive_message`):

```json
{
  "Records": [
    {
      "messageId": "059f36b4-87a3-44ab-83d2-661975830a7d",
      "receiptHandle": "AQEBwJnKyrHigUMZj6rYigCgxlaS3SLy0a...",
      "body": "{\"order_id\": \"o-1\", \"amount\": 10}",
      "attributes": {
        "ApproximateReceiveCount": "1",
        "SentTimestamp": "1545082649183",
        "SenderId": "AIDAIENQZJOLO23YVJ4VO",
        "ApproximateFirstReceiveTimestamp": "1545082649185"
      },
      "messageAttributes": {
        "myAttribute": {"stringValue": "myValue", "stringListValues": [], "binaryListValues": [], "dataType": "String"}
      },
      "md5OfBody": "e4e68fb7bd0e697a0ae8f1bb342846b3",
      "eventSource": "aws:sqs",
      "eventSourceARN": "arn:aws:sqs:us-east-2:123456789012:my-queue",
      "awsRegion": "us-east-2"
    }
  ]
}
```

On FIFO queues each record's `attributes` also holds `MessageGroupId`, `MessageDeduplicationId` and `SequenceNumber`.

```python
# app/lambda_handler.py
from collections.abc import Callable


def process_batch(event: dict, process_one: Callable[[dict], None], *, fifo: bool = False) -> dict:
    """SQS event source mapping handler with ReportBatchItemFailures enabled."""
    failures: list[dict] = []
    records = event["Records"]
    for index, record in enumerate(records):
        try:
            process_one(record)
        except Exception:
            failures.append({"itemIdentifier": record["messageId"]})
            if fifo:
                # keep order: report this record and every later one, process nothing after the first failure
                failures += [{"itemIdentifier": r["messageId"]} for r in records[index + 1:]]
                break
    return {"batchItemFailures": failures}
```

| Rule | Detail |
|------|--------|
| Response | `{"batchItemFailures": [{"itemIdentifier": "<messageId>"}]}`; messages not listed are deleted by Lambda |
| Treated as full success | Empty or null `batchItemFailures`, empty or null response |
| Treated as full failure | Invalid JSON, empty or null `itemIdentifier`, wrong key name, an ID that is not in the batch, or an exception from the function |
| FIFO | Stop at the first failure and report it **and every later record** (the function above does), or ordering is lost |
| Powertools | The Batch Processor utility of Powertools for AWS Lambda implements this logic for you |
| Monitoring | `NumberOfMessagesDeleted` dropping to 0, or `ApproximateAgeOfOldestMessage` climbing, shows the response is not reporting failures correctly |

Create the mapping:

```python
lambda_client = boto3.client("lambda")
lambda_client.create_event_source_mapping(
    EventSourceArn="arn:aws:sqs:us-east-1:123456789012:orders",
    FunctionName="process-orders",
    BatchSize=10,                                   # standard queues: up to 10,000 (needs a batch window >= 1 s); FIFO: 10
    MaximumBatchingWindowInSeconds=5,               # standard queues only
    FunctionResponseTypes=["ReportBatchItemFailures"],
    ScalingConfig={"MaximumConcurrency": 10},       # caps concurrent invocations; not combinable with provisioned mode
)
```

Settings that bite:

- **Queue visibility timeout at least six times the function timeout** (plus `MaximumBatchingWindowInSeconds`); the function timeout cannot exceed the queue's visibility timeout.
- **`maxReceiveCount` of at least 5** on the source queue, so throttled invocations do not send messages to the DLQ.
- Put the **DLQ on the SQS queue**, not on the function: Lambda's own DLQ and destinations apply to asynchronous invocations and do not see SQS failures.
- Lambda scales polling by itself: it starts with five concurrent batches and adds up to 300 concurrent invokes per minute, to a maximum of 1,250 for standard queues. **Provisioned mode** (dedicated pollers, minimum 2 to 200) scales faster at extra cost. If you set reserved concurrency on the function, use at least 5 to reduce throttling errors.
- Batch size over 10 needs a batch window of at least 1 second. A large batch plus a long job risks hitting the function timeout, which fails the whole batch.

The handler is a plain function over a dict, so a unit test needs no AWS at all ([05](./05-testing.md#lambda-batch-handler-tests)).

## Scaling Consumers

Scale on **work waiting per consumer**, not on queue length alone. The AWS Auto Scaling guidance is a *backlog per instance* target: divide the visible backlog by the number of running consumers, and pick the target from the latency you can accept.

```python
# app/scaling.py
import math


def desired_consumers(
    backlog: int,
    seconds_per_message: float,
    max_latency: float,
    *,
    min_consumers: int = 1,
    max_consumers: int = 50,
) -> int:
    """Consumers needed to drain `backlog` (ApproximateNumberOfMessages) within `max_latency` seconds."""
    acceptable_backlog_per_consumer = max_latency / seconds_per_message
    wanted = math.ceil(backlog / acceptable_backlog_per_consumer)
    return max(min_consumers, min(max_consumers, wanted))
```

AWS's own worked example: 1,500 visible messages, 0.1 s per message and 10 s acceptable latency give 100 messages per consumer, so the 10 current instances must grow to 15. That is a test in the demo project (`test_aws_documented_example`).

| Signal | Metric | Notes |
|--------|--------|-------|
| Backlog | `ApproximateNumberOfMessagesVisible` (CloudWatch) or `ApproximateNumberOfMessages` (`get_queue_attributes`) | Approximate; fine for scaling |
| Latency | `ApproximateAgeOfOldestMessage` | Alarm when it exceeds your SLO; poison messages are excluded until they succeed |
| In flight | `ApproximateNumberOfMessagesNotVisible` | Close to your consumer capacity means the fleet is saturated |
| Wasted polls | `NumberOfEmptyReceives` | High with idle consumers; use long polling |
| FIFO parallelism | `ApproximateNumberOfGroupsWithInflightMessages` | A large backlog with a low value means too few message groups, not too few consumers |

- **FIFO**: extra consumers beyond the number of active message groups do nothing. Increase group cardinality first.
- **Scale in safely**: a consumer stopped mid-job returns its messages after the visibility timeout. Handle SIGTERM (above) and protect long-running workers from scale-in if jobs are long.
- Other autoscalers (KEDA, ECS target tracking on a custom metric, Lambda `MaximumConcurrency`) use the same attributes.

## Large Payloads Through S3

The message limit is 1 MiB, but big messages are slow and billed per 64 KB chunk. The usual pattern, called the *claim check*, stores the payload in S3 and sends a small pointer. The AWS Extended Client Library for Python (`amazon-sqs-extended-client` on PyPI, synchronous clients only, payloads up to 2 GB) wraps this, and its README documents a default size threshold of 256 KB. A hand-rolled version is short and easy to test:

```python
# app/payloads.py
import json
import uuid

POINTER_ATTRIBUTE = "payload-pointer"


def send_large(sqs, s3, queue_url: str, bucket: str, payload: bytes, *, threshold: int = 256 * 1024) -> str:
    if len(payload) <= threshold:
        return sqs.send_message(QueueUrl=queue_url, MessageBody=payload.decode())["MessageId"]
    key = f"sqs-payloads/{uuid.uuid4()}"
    s3.put_object(Bucket=bucket, Key=key, Body=payload)
    return sqs.send_message(
        QueueUrl=queue_url,
        MessageBody=json.dumps({"bucket": bucket, "key": key, "size": len(payload)}),
        MessageAttributes={POINTER_ATTRIBUTE: {"DataType": "String", "StringValue": "s3"}},
    )["MessageId"]


def load_body(s3, message: dict) -> bytes:
    if POINTER_ATTRIBUTE not in message.get("MessageAttributes", {}):
        return message["Body"].encode()
    ref = json.loads(message["Body"])
    return s3.get_object(Bucket=ref["bucket"], Key=ref["key"])["Body"].read()
```

Practical notes: give the S3 bucket a **lifecycle rule** that expires the payload prefix after the queue retention plus the DLQ window (the consumer never deletes the object in this version, since a redelivery still needs it); grant consumers `s3:GetObject` and producers `s3:PutObject` on that prefix only; and never put secrets in the pointer message. A moto test sends 300,000 bytes through the pointer and gets the same bytes back.

## SNS to SQS from the Queue Side

For fan-out, an SNS topic delivers to several queues, one per consumer group, each with its own DLQ and scaling. The topic side (subscriptions, filter policies, delivery retries) is in [Amazon SNS](../sns/index.md). The queue side has two jobs:

1. **A queue policy that lets the topic send.** Scope it with `aws:SourceArn` so only that topic can write.
2. **Decide on raw message delivery.** Without it the body is an SNS envelope (`Type`, `MessageId`, `TopicArn`, `Message`, `Timestamp`, `Signature`, ...) and the real payload is a JSON string inside `Message`. With `RawMessageDelivery=true` the body is exactly what was published and message attributes arrive as SQS message attributes.

```python
import json


def queue_policy(queue_arn: str, topic_arn: str) -> str:
    return json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "sns.amazonaws.com"},
            "Action": "sqs:SendMessage",
            "Resource": queue_arn,
            "Condition": {"ArnEquals": {"aws:SourceArn": topic_arn}},      # only this topic, not any topic
        }],
    })


sqs.set_queue_attributes(QueueUrl=url, Attributes={"Policy": queue_policy(queue_arn, topic_arn)})
sns.subscribe(TopicArn=topic_arn, Protocol="sqs", Endpoint=queue_arn, Attributes={"RawMessageDelivery": "true"})
```

With raw delivery the body is the published JSON; without it the body is an SNS envelope with `Type == "Notification"`, and `json.loads(envelope["Message"])` is needed. A consumer written for raw delivery breaks if someone later turns it off, so keep the setting in infrastructure code and test the body shape. **moto does not enforce the queue policy**: a message is delivered to a queue that has no policy, so a missing policy is only caught on a real account ([05](./06-moto-gaps-smoke-load-ci.md#what-moto-does-not-emulate)). A FIFO subscription needs a FIFO topic and a FIFO queue.

## Celery and Other Consumers

- **Celery** can use SQS as a broker: `pip install "celery[sqs]"`, `broker_url = "sqs://"` with credentials from the usual chain, and `broker_transport_options` such as `visibility_timeout` (default 30 minutes, maximum 43,200 s), `wait_time_seconds` (long polling, default 10), `polling_interval` and `predefined_queues` (Celery never lists or creates queues). Limits: no remote control, no events, no SQS result backend, and ETA or countdown tasks longer than the visibility timeout are redelivered repeatedly. For FIFO queues pass `MessageGroupId` and `MessageDeduplicationId` to `apply_async()`. See [Celery](../../libs/celery/index.md) for the rest.
- **EventBridge Pipes** can connect a queue to many targets with filtering and enrichment, without code.
- **Your own service** (ECS, EKS, EC2): the worker loop above, one process per core or a thread pool, scaled on backlog per consumer.
- **Kafka or RabbitMQ migrations**: the semantics differ (no replay, no routing keys); read [Queues vs Streams](../../software-design-patterns/05-composition-architectural/04-queues-streams-messaging.md), [RabbitMQ](../../tools/rabbitmq/index.md) and [Kafka](../../tools/kafka/index.md).

## Quick Rules

1. **Lambda: `ReportBatchItemFailures` on**, return only failed `messageId`s; on FIFO stop at the first failure and report the rest.
2. **Visibility timeout at least six times the function timeout** plus the batch window; `maxReceiveCount` at least 5; the DLQ on the queue, not on the function.
3. **Scale on backlog per consumer** (visible messages divided by consumers), not on queue length alone; check `ApproximateAgeOfOldestMessage` against your latency target.
4. **FIFO parallelism is the number of active message groups**; more consumers cannot beat it.
5. **Payloads above a few hundred KB go through S3**; expire the objects with a lifecycle rule.
6. **SNS to SQS needs a queue policy** scoped with `aws:SourceArn`; pick raw delivery on purpose and test the body shape.
7. **moto will not catch a missing queue policy**; keep one real-account smoke test for the wiring.

---
## See also
- [Amazon SQS — Overview](./index.md)
- [Amazon SQS — Consumer Patterns](./03-consumer-patterns.md)
- [Amazon SQS — Testing SQS-Based Systems](./05-testing.md)
- [Amazon SNS — Topics, Subscriptions & Fan-out](../sns/index.md)
- [Celery — Distributed Task Queue for Python](../../libs/celery/index.md)
- [RabbitMQ — Message Broker, Routing & Queues](../../tools/rabbitmq/index.md)
- [Apache Kafka — Event Streaming, Producers & Consumers](../../tools/kafka/index.md)
