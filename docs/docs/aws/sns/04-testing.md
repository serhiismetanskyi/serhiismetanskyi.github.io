---
date: 2026-10-21 12:00:00
tags:
  - aws
  - sns
  - testing
  - pytest
  - moto
  - integration-testing
---

# Amazon SNS — Testing SNS-Based Systems

What makes SNS hard to test:

1. **No storage.** A message published before a subscription exists, or while it is misconfigured, is gone. The only way to see what SNS did is to subscribe something that records it, usually an SQS queue.
2. **Fan-out and filtering.** One publish becomes zero to many deliveries. A filter that matches everything looks fine in a happy-path test.
3. **Asynchrony and at-least-once.** Deliveries arrive later, possibly twice, on standard topics possibly out of order.
4. **Config that only the real service enforces.** Queue policies, IAM, KMS, quotas, retries and DLQ redrive.

Fake credentials, `mock_aws` and `Stubber` basics are in [AWS Foundations](../foundations/02-credentials-iam-local-testing.md#three-ways-to-test-aws-code); this page adds what is specific to SNS.

## What to Test Where

| Level | What | AWS |
|-------|------|-----|
| **Unit** | Message builders (attribute names and types, subject length, size budget), envelope parsing, consumer handlers | None: plain dicts |
| **Contract** | The payload model shared by publisher and consumers; filter policies versus that model | None: Pydantic |
| **Request shape** | "Did the code call `publish` with these parameters?" and error handling for `NotFound`, `Throttled` | `Stubber` |
| **Behaviour (in-process)** | Publish, subscribe a test queue, raw vs envelope, per-consumer filters, FIFO order and dedup, batch limits, validation errors | moto `mock_aws` |
| **Behaviour (other process)** | A service in Docker or a worker process publishes or consumes | moto server, `endpoint_url` |
| **Real account (smoke)** | Queue policies, KMS, quotas, real retries, DLQ redrive, filter propagation, Lambda and HTTP/S delivery | Small tagged job, see [05](./05-moto-gaps-ci.md#real-account-smoke-test) |

Most tests belong in the first four rows. Mocking `boto3` with `MagicMock` only proves a method was called; moto proves the message **arrived at the right queue**.

## Design for Testability

Keep "what do we publish" separate from "how do we call SNS". The builder is a pure function; the model is the contract shared with consumers.

```python
# app/events.py
import json
from typing import Literal

from pydantic import BaseModel, Field


class OrderEvent(BaseModel):
    """The contract of the `order-events` topic. Producer and consumers share this model."""

    event_id: str
    order_id: str
    event_type: Literal["created", "paid", "cancelled"]
    amount_cents: int = Field(ge=0)
    country: str = Field(min_length=2, max_length=2)


def string_attr(value: str) -> dict:
    return {"DataType": "String", "StringValue": value}


def number_attr(value: int | float) -> dict:
    return {"DataType": "Number", "StringValue": str(value)}


def build_publish_kwargs(event: OrderEvent) -> dict:
    """Pure function: everything `sns.publish` needs, except the topic ARN."""
    return {
        "Message": event.model_dump_json(),
        "Subject": f"order {event.event_type}",
        "MessageAttributes": {
            "event_type": string_attr(event.event_type),
            "country": string_attr(event.country),
            "amount_cents": number_attr(event.amount_cents),
        },
    }


def parse_envelope(body: str) -> OrderEvent:
    """Consumer side, non-raw delivery: SQS body is the SNS JSON envelope."""
    envelope = json.loads(body)
    if envelope.get("Type") != "Notification":
        raise ValueError(f"unexpected SNS message type: {envelope.get('Type')!r}")
    return OrderEvent.model_validate_json(envelope["Message"])
```

## Fixtures

```python
# tests/conftest.py
import json
import time
import uuid

import boto3
import pytest
from moto import mock_aws


@pytest.fixture(autouse=True)
def aws_env(request, monkeypatch):
    """Fake credentials: a forgotten mock can never reach a real account (see AWS Foundations)."""
    if request.node.get_closest_marker("aws_smoke"):
        return                                           # the smoke job uses real credentials on purpose
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    monkeypatch.setenv("AWS_CONFIG_FILE", "/dev/null")
    monkeypatch.setenv("AWS_SHARED_CREDENTIALS_FILE", "/dev/null")
    monkeypatch.delenv("AWS_PROFILE", raising=False)
    monkeypatch.delenv("AWS_ENDPOINT_URL", raising=False)


@pytest.fixture
def aws():
    with mock_aws():
        yield


@pytest.fixture
def sns(aws):
    return boto3.client("sns")


@pytest.fixture
def sqs(aws):
    return boto3.client("sqs")


def unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"            # unique per test: safe under pytest-xdist


@pytest.fixture
def topic_arn(sns):
    arn = sns.create_topic(Name=unique("order-events"))["TopicArn"]
    yield arn
    sns.delete_topic(TopicArn=arn)                       # real accounts: delete what you create


class TestQueue:
    __test__ = False                                     # not a pytest class

    def __init__(self, sqs, url: str, arn: str, subscription_arn: str) -> None:
        self.sqs, self.url, self.arn, self.subscription_arn = sqs, url, arn, subscription_arn

    def receive(self, expected: int | None = None, timeout: float = 3.0, wait: int = 0) -> list[dict]:
        """Poll until `expected` messages arrived or the deadline passes (real AWS: wait=1..5).
        expected=None means "nothing should arrive": one empty poll is enough on moto."""
        deadline = time.monotonic() + timeout
        got: list[dict] = []
        while time.monotonic() < deadline:
            resp = self.sqs.receive_message(QueueUrl=self.url, MaxNumberOfMessages=10,
                                            WaitTimeSeconds=wait, MessageAttributeNames=["All"])
            for message in resp.get("Messages", []):
                got.append(message)
                self.sqs.delete_message(QueueUrl=self.url, ReceiptHandle=message["ReceiptHandle"])
            if (expected is not None and len(got) >= expected) or (expected is None and not resp.get("Messages")):
                break
        return got


@pytest.fixture
def subscribe_queue(sns, sqs, topic_arn):
    """Factory: a fresh SQS queue subscribed to a topic, with the queue policy real AWS needs."""

    def _make(name: str, *, topic: str | None = None, raw: bool = True, filter_policy: dict | None = None,
              scope: str = "MessageAttributes", fifo: bool = False) -> TestQueue:
        topic = topic or topic_arn
        attrs = {"FifoQueue": "true", "ContentBasedDeduplication": "true"} if fifo else {}
        url = sqs.create_queue(QueueName=unique(name) + (".fifo" if fifo else ""), Attributes=attrs)["QueueUrl"]
        arn = sqs.get_queue_attributes(QueueUrl=url, AttributeNames=["QueueArn"])["Attributes"]["QueueArn"]
        sqs.set_queue_attributes(QueueUrl=url, Attributes={"Policy": json.dumps({
            "Version": "2012-10-17",
            "Statement": [{"Effect": "Allow", "Principal": {"Service": "sns.amazonaws.com"},
                           "Action": "sqs:SendMessage", "Resource": arn,
                           "Condition": {"ArnEquals": {"aws:SourceArn": topic}}}],
        })})
        sub_attrs = {"RawMessageDelivery": str(raw).lower()}
        if filter_policy is not None:
            sub_attrs.update(FilterPolicy=json.dumps(filter_policy), FilterPolicyScope=scope)
        sub = sns.subscribe(TopicArn=topic, Protocol="sqs", Endpoint=arn, Attributes=sub_attrs)
        return TestQueue(sqs, url, arn, sub["SubscriptionArn"])

    return _make
```

- **`aws_env`** (autouse) blocks real credentials and files; the marker check lets the smoke job use real ones.
- **`topic_arn`** gives each test a fresh topic with a unique name and deletes it afterwards, so tests are independent under `pytest -n`.
- **`subscribe_queue`** is a factory: a new queue per consumer, the **queue policy** real AWS needs (moto ignores it, but the test stays portable), raw or envelope delivery, an optional filter policy and scope, FIFO optional.
- **`TestQueue.receive`** polls until the expected count arrives **or a deadline passes**; no `sleep`. With `expected=None` it asserts "nothing arrived". On moto `wait=0` is instant; against AWS use `wait=1` to `5` (long polling).

## Delivery and Filter Tests

```python
# tests/test_delivery.py  -- moto in-process, real boto3 calls
import json

from app.events import OrderEvent, build_publish_kwargs, parse_envelope


def make(i: int = 1, event_type: str = "created", country: str = "DE", amount: int = 1000) -> OrderEvent:
    return OrderEvent(event_id=f"e{i}", order_id=f"o{i}", event_type=event_type, amount_cents=amount, country=country)


def publish(sns, topic_arn: str, event: OrderEvent) -> str:
    return sns.publish(TopicArn=topic_arn, **build_publish_kwargs(event))["MessageId"]


def test_envelope_delivery_round_trip(sns, topic_arn, subscribe_queue):
    queue = subscribe_queue("audit", raw=False)
    publish(sns, topic_arn, make())
    [message] = queue.receive(expected=1)
    envelope = json.loads(message["Body"])
    assert envelope["Type"] == "Notification" and envelope["TopicArn"] == topic_arn
    assert envelope["MessageAttributes"]["event_type"] == {"Type": "String", "Value": "created"}
    assert parse_envelope(message["Body"]) == make()


def test_raw_delivery_keeps_body_and_maps_attributes(sns, topic_arn, subscribe_queue):
    queue = subscribe_queue("billing", raw=True)
    publish(sns, topic_arn, make(amount=4200))
    [message] = queue.receive(expected=1)
    assert OrderEvent.model_validate_json(message["Body"]).amount_cents == 4200
    assert message["MessageAttributes"]["amount_cents"] == {"StringValue": "4200", "DataType": "Number"}


def test_each_consumer_gets_only_its_events(sns, topic_arn, subscribe_queue):
    billing = subscribe_queue("billing", filter_policy={"event_type": ["created", "paid"]})
    mails = subscribe_queue("mails", filter_policy={"event_type": ["cancelled"], "country": [{"prefix": "D"}]})
    audit = subscribe_queue("audit")                                   # no filter: everything
    for i, (kind, country) in enumerate([("created", "DE"), ("paid", "FR"), ("cancelled", "DE"), ("cancelled", "FR")]):
        publish(sns, topic_arn, make(i, kind, country))
    order_ids = lambda queue, n: sorted(OrderEvent.model_validate_json(m["Body"]).order_id for m in queue.receive(expected=n))
    assert order_ids(billing, 2) == ["o0", "o1"]
    assert order_ids(mails, 1) == ["o2"]                               # AND of both keys: FR cancelled is dropped
    assert len(audit.receive(expected=4)) == 4


def test_body_scope_filter_uses_message_content(sns, topic_arn, subscribe_queue):
    big = subscribe_queue("big", filter_policy={"amount_cents": [{"numeric": [">=", 10000]}]}, scope="MessageBody")
    publish(sns, topic_arn, make(1, amount=9999))
    publish(sns, topic_arn, make(2, amount=10000))
    assert [OrderEvent.model_validate_json(m["Body"]).order_id for m in big.receive(expected=1)] == ["o2"]
    assert big.receive() == []                                         # nothing else arrives
```

- Every filter test has a **positive and a negative case**: `FR` cancelled must be dropped by the `mails` consumer, and the `big` consumer must see only the 10,000 event.
- Standard topics promise no order, so the tests compare sorted IDs, not lists.
- Both delivery formats are tested because production code usually uses one of them and the other fails in a different way: the raw consumer reads `Body` directly, the envelope consumer needs `json.loads(body)["Message"]`.

## FIFO Tests

```python
# tests/test_fifo_dlq.py
import json

import pytest
from botocore.exceptions import ClientError

from tests.conftest import unique


@pytest.fixture
def fifo_topic_arn(sns):
    return sns.create_topic(Name=unique("order-events") + ".fifo", Attributes={"FifoTopic": "true"})["TopicArn"]


def test_fifo_publish_needs_group_and_dedup_id(sns, fifo_topic_arn):
    with pytest.raises(ClientError) as exc:
        sns.publish(TopicArn=fifo_topic_arn, Message="m")                        # no MessageGroupId
    assert exc.value.response["ResponseMetadata"]["HTTPStatusCode"] == 400       # moto: code MissingParameter
    with pytest.raises(ClientError) as exc:
        sns.publish(TopicArn=fifo_topic_arn, Message="m", MessageGroupId="o1")   # no dedup id, CBD is off
    assert exc.value.response["Error"]["Code"] == "InvalidParameter"


def test_fifo_keeps_order_per_group_and_drops_duplicates(sns, fifo_topic_arn, subscribe_queue):
    queue = subscribe_queue("orders", topic=fifo_topic_arn, fifo=True)
    for step in ["created", "paid", "shipped", "paid"]:                          # "paid" again = a retried publish
        sns.publish(TopicArn=fifo_topic_arn, Message=step, MessageGroupId="order-1",
                    MessageDeduplicationId=f"order-1-{step}")
    assert [m["Body"] for m in queue.receive(expected=3)] == ["created", "paid", "shipped"]
    assert queue.receive() == []


def test_subscription_dlq_is_configured(sns, sqs, topic_arn, subscribe_queue):
    queue = subscribe_queue("billing")
    dlq_url = sqs.create_queue(QueueName=unique("billing-sns-dlq"))["QueueUrl"]
    dlq_arn = sqs.get_queue_attributes(QueueUrl=dlq_url, AttributeNames=["QueueArn"])["Attributes"]["QueueArn"]

    sns.set_subscription_attributes(SubscriptionArn=queue.subscription_arn, AttributeName="RedrivePolicy",
                                    AttributeValue=json.dumps({"deadLetterTargetArn": dlq_arn}))

    attrs = sns.get_subscription_attributes(SubscriptionArn=queue.subscription_arn)["Attributes"]
    assert json.loads(attrs["RedrivePolicy"]) == {"deadLetterTargetArn": dlq_arn}
    # What moto cannot show: that a failed delivery really lands in the DLQ. That needs a real account.
```

- The FIFO tests pass on moto and on AWS for different reasons: on **AWS the topic** drops the duplicate dedup ID, on **moto the SQS FIFO queue** does (moto's topic delivered all three copies to a standard queue; see below). Subscribing a FIFO queue keeps the test valid in both.
- `test_subscription_dlq_is_configured` checks configuration only. That a failed delivery lands in the DLQ is a real-account test.

## Contract Tests

```python
# tests/test_events_unit.py  -- no AWS, no moto
import json

import pytest
from pydantic import ValidationError

from app.events import OrderEvent, build_publish_kwargs, parse_envelope


def make(**over) -> OrderEvent:
    base = dict(event_id="e1", order_id="o1", event_type="created", amount_cents=1250, country="DE")
    return OrderEvent(**{**base, **over})


def test_builder_sets_attributes_for_filtering():
    kwargs = build_publish_kwargs(make())
    assert kwargs["MessageAttributes"] == {
        "event_type": {"DataType": "String", "StringValue": "created"},
        "country": {"DataType": "String", "StringValue": "DE"},
        "amount_cents": {"DataType": "Number", "StringValue": "1250"},
    }
    assert json.loads(kwargs["Message"])["order_id"] == "o1"
    assert len(kwargs["Subject"]) < 100                     # SNS limit: subject must be shorter than 100 characters


def test_attribute_budget():
    # a raw-delivery SQS subscription accepts at most 10 attributes; keep a margin
    assert len(build_publish_kwargs(make())["MessageAttributes"]) <= 10


@pytest.mark.parametrize("bad", [{"event_type": "refunded"}, {"amount_cents": -1}, {"country": "DEU"}])
def test_contract_rejects_invalid_events(bad):
    with pytest.raises(ValidationError):
        make(**bad)


def test_parse_envelope_rejects_subscription_confirmation():
    with pytest.raises(ValueError, match="SubscriptionConfirmation"):
        parse_envelope(json.dumps({"Type": "SubscriptionConfirmation"}))
```

Pydantic rejects invalid events **before** they reach SNS. The same model should be imported by the consumers, so a change to `event_type` values fails in both repositories' tests. For body-scope filter policies, add a test that builds one valid event per consumer and evaluates the policy against it; the policy dict lives next to the model, not in infrastructure code only.

## Negative Tests

```python
# tests/test_negative.py
import json

import pytest
from botocore.exceptions import ClientError


def code(exc: pytest.ExceptionInfo) -> str:
    return exc.value.response["Error"]["Code"]


def test_publish_to_missing_topic_is_not_found(sns, topic_arn):
    with pytest.raises(sns.exceptions.NotFoundException) as exc:
        sns.publish(TopicArn=topic_arn + "-gone", Message="x")
    assert code(exc) == "NotFound" and exc.value.response["ResponseMetadata"]["HTTPStatusCode"] == 404


def test_oversized_message_is_invalid_parameter(sns, topic_arn):
    with pytest.raises(ClientError) as exc:
        sns.publish(TopicArn=topic_arn, Message="x" * (256 * 1024 + 1))
    assert code(exc) == "InvalidParameter"


def test_batch_of_eleven_is_rejected(sns, topic_arn):
    entries = [{"Id": str(i), "Message": "x"} for i in range(11)]
    with pytest.raises(ClientError) as exc:
        sns.publish_batch(TopicArn=topic_arn, PublishBatchRequestEntries=entries)
    assert code(exc) == "TooManyEntriesInBatchRequest"
```

The file also holds `test_filter_policy_with_six_keys_is_rejected` (6 keys fail at `subscribe` with `InvalidParameter`) and `test_missing_message_never_leaves_the_client` (`ParamValidationError`, raised by botocore before any HTTP call). Where the real code could differ (the FIFO missing-group error is `MissingParameter` on moto), assert the HTTP status or confirm the code on a real account first.

## moto Server Mode

In-process `mock_aws` cannot be seen by a Celery worker or a Docker container. Run moto as a server and point the clients at it (`endpoint_url`, or `AWS_ENDPOINT_URL` for the other process):

```python
# imports: boto3, pytest, requests, moto.server.ThreadedMotoServer
@pytest.fixture(scope="session")
def moto_endpoint():
    server = ThreadedMotoServer(ip_address="127.0.0.1", port=0, verbose=False)   # port 0: any free port
    server.start()
    host, port = server.get_host_and_port()
    yield f"http://{host}:{port}"
    server.stop()


@pytest.fixture
def server_clients(moto_endpoint):
    requests.post(f"{moto_endpoint}/moto-api/reset").raise_for_status()           # clean state per test
    kw = dict(endpoint_url=moto_endpoint, region_name="us-east-1")
    return boto3.client("sns", **kw), boto3.client("sqs", **kw)
```

A topic and queue created through the server work with `RawMessageDelivery`; an HTTP subscription receives a real POST from moto (a plain `Content-Type` header, no `x-amz-sns-*` headers and no confirmation handshake); `POST /moto-api/reset` empties the state. With `pytest -n 4` each worker starts its own server on its own port.

## Running It

```text
$ pytest -q
$ pytest -q -n 4
```

Mutation checks show that the tests can fail: renaming the `event_type` attribute in the builder breaks `test_envelope_delivery_round_trip` with a `KeyError`, and changing the `mails` filter prefix from `D` to `F` breaks `test_each_consumer_gets_only_its_events`.

## Quick Rules

1. **Subscribe a queue to see what SNS did**; assert on the queue, not on mocks.
2. **Give every test its own topic and queue names** and clean up.
3. **Poll with deadlines**; never sleep a fixed time.
4. **One positive and one negative message per filter policy.**
5. **Test the builder and the model with no AWS at all.**
6. **Use FIFO queues behind FIFO topics in tests** so dedup and order checks are valid on moto and AWS.
7. **Treat moto as an emulator with known holes**: see [05 moto Limits, Pitfalls & CI](./05-moto-gaps-ci.md).

The gaps in moto, flakiness pitfalls, CI and the QA checklist continue in [05 moto Limits, Pitfalls & CI](./05-moto-gaps-ci.md).

---
## See also
- [Amazon SNS — Overview](./index.md)
- [Amazon SNS — moto Limits, Pitfalls & CI](./05-moto-gaps-ci.md)
- [Amazon SNS — boto3 in Python](./02-boto3-python.md)
- [Amazon SNS — Filtering & Fan-out Patterns](./03-filtering-fanout.md)
- [AWS Foundations — Credentials, IAM & Local Testing](../foundations/02-credentials-iam-local-testing.md)
- [Amazon SQS](../sqs/index.md)
- [Pytest — Python Testing Framework](../../libs/pytest/index.md)
- [Pydantic — Data Validation & Settings](../../libs/pydantic/index.md)
