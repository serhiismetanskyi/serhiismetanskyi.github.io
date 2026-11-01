---
date: 2026-10-21 12:00:00
tags:
  - aws
  - sqs
  - messaging
  - testing
  - pytest
  - moto
---

# Amazon SQS — Testing SQS-Based Systems

## What to Test Where

| Level | What | SQS |
|-------|------|-----|
| **Unit** | Handler logic, parsing, idempotency rules, backoff, Lambda batch responses | None — call the function with a body or an event dict |
| **Client contract** | The exact requests your code sends (parameters, FIFO IDs, batch shape) and its reaction to scripted errors and `Failed` entries | `botocore.stub.Stubber` ([Foundations](../foundations/02-credentials-iam-local-testing.md)) |
| **Integration** | Visibility timeout, redelivery, DLQ, FIFO, long polling, ack handling, SNS fan-out wiring | **moto**: `mock_aws` in-process, or the moto server for other processes |
| **Smoke** | IAM, queue policies, KMS, real redrive and throughput limits | A real account, one small marked test ([06](./06-moto-gaps-smoke-load-ci.md#real-account-smoke-test)) |
| **Load** | Backlog drain time, `ApproximateAgeOfOldestMessage`, scaling | A real account and CloudWatch ([06](./06-moto-gaps-smoke-load-ci.md#cloudwatch-metrics-for-load-tests)) |

Most queue bugs are about **time and acknowledgement** — a message redelivered because the job outlived the visibility timeout, a delete that never happened — and moto reproduces those faithfully (real seconds, real redelivery). What it cannot show is in [06 moto Gaps, Smoke Tests, Load & CI](./06-moto-gaps-smoke-load-ci.md#what-moto-does-not-emulate).

The project is the `app/` and `tests/` directories built in [03](./03-consumer-patterns.md) and [04](./04-lambda-scaling-integrations.md).

## Project Layout

```text
app/        handler.py  idempotency.py  worker.py  queues.py  producer.py  lambda_handler.py  payloads.py  scaling.py
tests/
  conftest.py  helpers.py                                      fixtures and deadline helpers
  test_handler.py            test_scaling.py          pure functions, no AWS
  test_queue_basics.py        test_lambda_batch.py     API behaviour, Stubber, event dicts
  test_visibility_and_dlq.py  test_fifo.py             redelivery, heartbeat, DLQ, worker, FIFO
  test_polling.py             test_payloads_and_fanout.py
  test_server_mode.py         test_moto_gaps.py       moto server, moto differences
```

The tests marked `slow` wait on timers.

## Fixtures: Fake Credentials, moto, Unique Queues

```python
# tests/conftest.py
import uuid

import boto3
import pytest
from moto import mock_aws

from app.queues import create_work_queue


@pytest.fixture(autouse=True)
def aws_env(monkeypatch):
    """Fake credentials and region so nothing can reach a real account by accident."""
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    monkeypatch.delenv("AWS_PROFILE", raising=False)


@pytest.fixture
def aws():
    with mock_aws():                      # every boto3 call in the test goes to moto's in-process backend
        yield


@pytest.fixture
def sqs(aws):
    return boto3.client("sqs")


@pytest.fixture
def unique():
    run = uuid.uuid4().hex[:8]
    return lambda base: f"{base}-{run}"


@pytest.fixture
def work_queue(sqs, unique):
    """(queue_url, dlq_url) with maxReceiveCount=3 and a 1 second visibility timeout."""
    return create_work_queue(sqs, unique("orders"), max_receive=3, visibility=1)


@pytest.fixture
def fifo_queue(sqs, unique):
    return sqs.create_queue(
        QueueName=unique("orders") + ".fifo",
        Attributes={"FifoQueue": "true", "VisibilityTimeout": "1"},
    )["QueueUrl"]
```

- `aws_env` sets fake credentials, a region and removes `AWS_PROFILE` for **every** test, so a typo can never reach a real account. The credential chain and a stricter `conftest.py` are in [Foundations](../foundations/02-credentials-iam-local-testing.md).
- `aws` wraps each test in its own `mock_aws()` — a fresh, empty backend per test. `sqs` creates the client inside the mock, after `aws_env` has set the region and credentials, so every test gets the same client configuration. (Do not rely on import order: create the client inside the mock.)
- `unique` makes names collision-free for the moto server, a real account or `pytest -n`: `orders-3f9a1c2b`.
- `work_queue` and `fifo_queue` use `VisibilityTimeout=1` so redelivery tests take a second instead of 30 seconds.
- The queue created by `create_work_queue` has `ReceiveMessageWaitTimeSeconds=20`. A `receive_message` call **without** `WaitTimeSeconds` on an empty queue then blocks for 20 seconds (one gap test did exactly that: 20.01 s). Always pass `WaitTimeSeconds` explicitly in tests.

## Assert with Deadlines, Not Sleeps

```python
# tests/helpers.py
import time
from collections.abc import Callable


def wait_until(predicate: Callable[[], object], timeout: float = 5.0, interval: float = 0.05, message: str = "condition"):
    """Poll until predicate() is truthy; return its value. Fail with a clear message at the deadline."""
    deadline = time.monotonic() + timeout
    while True:
        value = predicate()
        if value:
            return value
        if time.monotonic() >= deadline:
            raise AssertionError(f"{message} not met within {timeout}s")
        time.sleep(interval)


def receive_one(sqs, queue_url: str, timeout: float = 5.0, **kwargs) -> dict:
    """Long-poll in short slices until a message arrives or the deadline passes."""
    def attempt():
        msgs = sqs.receive_message(QueueUrl=queue_url, MaxNumberOfMessages=1, WaitTimeSeconds=1, **kwargs).get("Messages")
        return msgs[0] if msgs else None
    return wait_until(attempt, timeout=timeout, interval=0, message=f"a message in {queue_url.rsplit('/', 1)[-1]}")


def assert_empty(sqs, queue_url: str, window: float = 1.0) -> None:
    """Prove absence: one long poll of `window` seconds must return nothing."""
    msgs = sqs.receive_message(QueueUrl=queue_url, MaxNumberOfMessages=10, WaitTimeSeconds=int(window)).get("Messages", [])
    assert not msgs, f"unexpected messages: {[m['Body'] for m in msgs]}"
```

Messages become visible, hidden and moved on timers, so the only honest assertion is "within N seconds". `wait_until` returns as soon as the condition holds and fails with a message at the deadline; `receive_one` long-polls in 1-second slices. The single deliberate sleep-like call is `assert_empty`, because proving a message is **absent** needs a window; keep it short and use it last.

## Pure Handler and Scripted Client Tests

The handler tests (no AWS) cover every outcome. Stubber covers what moto never produces — a batch response with `Failed` entries:

```python
# tests/test_queue_basics.py (excerpt)
def make_failed(entry_id: str, *, sender_fault: bool) -> dict:
    return {"Id": entry_id, "SenderFault": sender_fault, "Code": "InternalError", "Message": "boom"}


def test_send_batch_retries_only_failed_entries(sqs):
    url = "https://sqs.us-east-1.amazonaws.com/123456789012/q"
    ok = lambda i: {"Id": i, "MessageId": f"m-{i}", "MD5OfMessageBody": "x"}   # noqa: E731
    with Stubber(sqs) as stub:
        stub.add_response("send_message_batch", {"Successful": [ok("0")], "Failed": [make_failed("1", sender_fault=False)]})
        stub.add_response("send_message_batch", {"Successful": [ok("1")], "Failed": []},
                          expected_params={"QueueUrl": url, "Entries": [{"Id": "1", "MessageBody": json.dumps({"n": 1})}]})
        assert send_batch(sqs, url, [{"n": 0}, {"n": 1}]) == ["m-0", "m-1"]
        stub.assert_no_pending_responses()


def test_send_batch_raises_on_sender_fault(sqs):
    url = "https://sqs.us-east-1.amazonaws.com/123456789012/q"
    with Stubber(sqs) as stub:
        stub.add_response("send_message_batch", {"Successful": [], "Failed": [make_failed("0", sender_fault=True)]})
        with pytest.raises(BatchSendError):
            send_batch(sqs, url, [{"n": 0}])
```

### Partial batch failures

Two behaviours matter: server-side failures are retried **for the failed entries only**, and a `SenderFault` is raised, not retried. `Stubber` checks that the second call carries only entry `"1"` through `expected_params`, and `assert_no_pending_responses()` checks that both scripted responses were used. The same approach tests `delete_message_batch` failures.

## Visibility Timeout, Redelivery and Idempotency

```python
# tests/test_visibility_and_dlq.py (excerpt)
def test_unacked_message_is_redelivered_after_the_visibility_timeout(sqs, work_queue):
    url, _ = work_queue                                    # VisibilityTimeout = 1
    sqs.send_message(QueueUrl=url, MessageBody=ORDER)
    first = receive_one(sqs, url, MessageSystemAttributeNames=["ApproximateReceiveCount"])
    assert_empty(sqs, url, window=0)                       # invisible while in flight
    second = receive_one(sqs, url, timeout=4, MessageSystemAttributeNames=["ApproximateReceiveCount"])
    assert second["MessageId"] == first["MessageId"]
    assert second["ReceiptHandle"] != first["ReceiptHandle"]    # every receive issues a new handle
    assert (count_of(first), count_of(second)) == (1, 2)


def test_heartbeat_keeps_a_slow_message_invisible(sqs, work_queue):
    url, _ = work_queue
    sqs.send_message(QueueUrl=url, MessageBody=ORDER)
    msg = receive_one(sqs, url)                            # 1 s visibility, the job takes 2.5 s
    with VisibilityHeartbeat(sqs, url, msg["ReceiptHandle"], extend_by=2, every=0.5):
        time.sleep(2.5)
        assert_empty(sqs, url, window=0)                   # nobody else got it
    sqs.delete_message(QueueUrl=url, ReceiptHandle=msg["ReceiptHandle"])
    wait_until(lambda: queue_depth(sqs, url)["in_flight"] == 0, message="queue drained")


def test_double_delivery_charges_once(sqs, work_queue, monkeypatch):
    from app import handler
    charges = []
    monkeypatch.setattr(handler, "charge", charges.append)
    url, _ = work_queue
    store = IdempotencyStore()
    sqs.send_message(QueueUrl=url, MessageBody=ORDER)
    sqs.send_message(QueueUrl=url, MessageBody=ORDER)      # producer retried: two messages, one business key
    worker = Worker(sqs, url, lambda body: handle(body, store), wait=1)
    wait_until(lambda: worker.poll_once() or queue_depth(sqs, url)["visible"] == 0, message="both messages handled")
    assert len(charges) == 1
    assert queue_depth(sqs, url) == {"visible": 0, "in_flight": 0, "delayed": 0}


def test_lost_ack_redelivery_is_absorbed_by_idempotency(sqs, work_queue, monkeypatch):
    from app import handler
    charges = []
    monkeypatch.setattr(handler, "charge", charges.append)
    url, _ = work_queue
    store = IdempotencyStore()
    sqs.send_message(QueueUrl=url, MessageBody=ORDER)
    msg = receive_one(sqs, url)
    handle(msg["Body"], store)                             # work done, but the consumer "crashes" before DeleteMessage
    worker = Worker(sqs, url, lambda body: handle(body, store), wait=2)
    wait_until(lambda: worker.poll_once(), timeout=5, message="redelivery")
    assert len(charges) == 1
```

| Test | Proves |
|------|--------|
| Unacked message is redelivered | Receive count goes 1 → 2, the receipt handle changes, the message ID does not |
| Heartbeat keeps a slow message invisible | A 2.5 s job on a 1 s queue is not delivered to a second consumer while `VisibilityHeartbeat` runs |
| Without heartbeat | The same job loses the message to a second consumer (`test_without_heartbeat_a_second_consumer_gets_the_same_message`) |
| Double delivery charges once | Two messages with one `order_id` call `charge` once; both are deleted |
| Lost ack | The work finished but `DeleteMessage` never ran; the redelivery is acknowledged without a second charge |

Delay and backoff are tested the same way: `test_delayed_message_is_hidden_until_the_delay_passes` and `test_retry_outcome_hides_the_message_for_the_backoff` (the backoff is monkeypatched to 3 s so the test is deterministic; the real function is jittered and unit-tested for its bounds).

## Poison Messages and the DLQ

```python
# tests/test_visibility_and_dlq.py (excerpt)
def test_poison_message_reaches_the_dlq_after_max_receive_count(sqs, work_queue):
    url, dlq = work_queue                                  # maxReceiveCount = 3
    sqs.send_message(QueueUrl=url, MessageBody="not json")
    worker = Worker(sqs, url, lambda body: handle(body, IdempotencyStore()), wait=1)
    for _ in range(3):
        wait_until(lambda: worker.poll_once(), message="poison message received")   # POISON -> visibility 0, no delete
    assert_empty(sqs, url, window=1)                       # the 4th receive finds the count exhausted (moto moves it here)
    dead = receive_one(sqs, dlq, timeout=5)
    assert dead["Body"] == "not json"
    assert sqs.list_dead_letter_source_queues(QueueUrl=dlq)["queueUrls"] == [url]
```

The worker answers `POISON` with `ChangeMessageVisibility(0)`, so three receives happen within milliseconds instead of three timeouts. Two details: moto moves the message to the DLQ **on the next receive** of the source (the fourth, in `assert_empty`), and then `list_dead_letter_source_queues` confirms the wiring. Real SQS timing is not asserted here; assert with a deadline on the DLQ, as the test does. The redrive APIs cannot be tested with moto — see [06](./06-moto-gaps-smoke-load-ci.md#what-moto-does-not-emulate).

## FIFO Tests

```python
# tests/test_fifo.py (excerpt)
def test_duplicate_deduplication_id_is_accepted_but_delivered_once(sqs, fifo_queue):
    send(sqs, fifo_queue, "payment-1", "customer-1", dedup="pay-1")
    send(sqs, fifo_queue, "payment-1", "customer-1", dedup="pay-1")      # producer retry inside the 5-minute window
    msgs = sqs.receive_message(QueueUrl=fifo_queue, MaxNumberOfMessages=10, WaitTimeSeconds=1)["Messages"]
    assert [m["Body"] for m in msgs] == ["payment-1"]


def test_order_is_kept_inside_a_group(sqs, fifo_queue):
    for i in range(5):
        send(sqs, fifo_queue, f"step-{i}", "customer-1")
    seen = []
    while len(seen) < 5:
        msg = receive_one(sqs, fifo_queue)
        seen.append(msg["Body"])
        sqs.delete_message(QueueUrl=fifo_queue, ReceiptHandle=msg["ReceiptHandle"])
    assert seen == [f"step-{i}" for i in range(5)]


def test_an_in_flight_message_blocks_its_group_but_not_other_groups(sqs, fifo_queue):
    send(sqs, fifo_queue, "a1", "A")
    send(sqs, fifo_queue, "a2", "A")
    send(sqs, fifo_queue, "b1", "B")
    first = sqs.receive_message(QueueUrl=fifo_queue, MaxNumberOfMessages=1, VisibilityTimeout=30,
                                MessageSystemAttributeNames=["MessageGroupId"])["Messages"][0]
    blocked_group = first["Attributes"]["MessageGroupId"]
    rest = sqs.receive_message(QueueUrl=fifo_queue, MaxNumberOfMessages=10, MessageSystemAttributeNames=["MessageGroupId"])
    groups = {m["Attributes"]["MessageGroupId"] for m in rest.get("Messages", [])}
    assert blocked_group not in groups                    # the group of the in-flight message is closed
    sqs.delete_message(QueueUrl=fifo_queue, ReceiptHandle=first["ReceiptHandle"])
```

Also covered: `MessageGroupId` is required, a `MessageDeduplicationId` is required when content-based deduplication is off, and per-message `DelaySeconds` is rejected. In the dedup test moto returns a **new `MessageId`** for the duplicate send but stores one message; assert on what gets delivered, not on the IDs. The 5-minute deduplication window cannot be tested in real time; test that your producer sends a **stable** deduplication ID for a retried event, with Stubber.

## Long-Polling Tests

```python
# tests/test_polling.py (excerpt)
def test_long_poll_returns_as_soon_as_a_message_arrives(sqs, work_queue):
    url, _ = work_queue
    threading.Timer(1.0, lambda: boto3.client("sqs").send_message(QueueUrl=url, MessageBody="late")).start()
    started = time.monotonic()
    resp = sqs.receive_message(QueueUrl=url, WaitTimeSeconds=10)
    elapsed = time.monotonic() - started
    assert [m["Body"] for m in resp["Messages"]] == ["late"]
    assert 0.8 <= elapsed < 5                              # woke up at ~1 s, not after the full 10 s


def test_empty_long_poll_waits_for_the_full_wait_time(sqs, work_queue):
    url, _ = work_queue
    started = time.monotonic()
    resp = sqs.receive_message(QueueUrl=url, WaitTimeSeconds=2)
    assert "Messages" not in resp                          # an empty response has no Messages key
    assert time.monotonic() - started >= 1.9
```

Timing assertions get a lower bound (it did wait) and a generous upper bound (it did not wait the whole 10 s). Never assert tight upper bounds on CI. `test_queue_level_wait_time_applies_when_the_call_sets_none` pins the queue-level default. moto honours long polling with a real wait, so these tests are meaningful; **short polling on real SQS can return empty on a non-empty queue**, which moto never does — do not copy a `WaitTimeSeconds=0` receive into a real-account test without a retry loop.

## Lambda Batch Handler Tests

`tests/test_lambda_batch.py` builds an event dict with the documented shape and checks the response: no failures gives `{"batchItemFailures": []}`; two bad records give both IDs; and for FIFO the first failure stops processing and reports itself and every later record (`processed == ["a"]`, failures `id2, id3, id4`). Nothing needs moto or Lambda.

## moto Server Mode

`mock_aws` patches boto3 inside the test process. A service in **another process** (a Celery worker, a Docker container) needs a real HTTP endpoint: `ThreadedMotoServer`, or `moto_server -p 5000` as a separate process.

```python
# tests/test_server_mode.py
import boto3
import pytest
from moto.server import ThreadedMotoServer

from tests.helpers import receive_one


@pytest.fixture(scope="session")
def moto_endpoint():
    server = ThreadedMotoServer(ip_address="127.0.0.1", port=0, verbose=False)
    server.start()
    host, port = server.get_host_and_port()
    yield f"http://{host}:{port}"
    server.stop()


def test_a_client_with_endpoint_url_talks_to_the_server(moto_endpoint, unique):
    sqs = boto3.client("sqs", endpoint_url=moto_endpoint)    # credentials come from the aws_env fixture
    url = sqs.create_queue(QueueName=unique("srv"))["QueueUrl"]
    sqs.send_message(QueueUrl=url, MessageBody="over http")
    assert receive_one(sqs, url)["Body"] == "over http"
```

Queue URLs from the server look like `http://127.0.0.1:<port>/123456789012/<name>`. Server mode keeps state across tests until `POST /moto-api/reset` (Foundations has the recipe), so use unique names there too. The SQS actions moto does not implement answer HTTP 500, which botocore retries — a missing action looks like a slow failure, not a clear error.

## Running the Suite

- **pytest-xdist**: `pytest -n 4` works because every test owns its moto backend (`mock_aws` is per process and per test) and unique names. The server-mode fixture is session-scoped per worker; unique names keep workers apart.
- **Markers**: `slow` marks tests that wait on timers; run `-m "not slow"` on every commit and the full suite before merging.
- **No sleeps for synchronisation**: the sleeps that remain wait for a timer the test *is* testing (a 1-second visibility timeout).


---
## See also
- [Amazon SQS — Overview](./index.md)
- [Amazon SQS — Consumer Patterns](./03-consumer-patterns.md)
- [Amazon SQS — Lambda, Scaling & Integrations](./04-lambda-scaling-integrations.md)
- [Amazon SQS — moto Gaps, Smoke Tests, Load & CI](./06-moto-gaps-smoke-load-ci.md)
- [AWS Foundations — Credentials, IAM & Local Testing](../foundations/02-credentials-iam-local-testing.md)
- [RabbitMQ — Testing RabbitMQ-Based Systems](../../tools/rabbitmq/04-testing.md)
- [Kafka — Testing Kafka-Based Systems](../../tools/kafka/05-testing-kafka-systems.md)
- [Pytest — Python Testing Framework](../../libs/pytest/index.md)
