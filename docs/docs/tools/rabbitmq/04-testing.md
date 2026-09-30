---
date: 2026-09-30 21:00:00
tags:
  - tools
  - rabbitmq
  - testing
  - pytest
  - integration-testing
---

# RabbitMQ — Testing RabbitMQ-Based Systems

## What to Test Where

| Level | What | Broker |
|-------|------|--------|
| **Unit** | Message handler logic, parsing, validation, idempotency rules | None — call the handler with a body and properties |
| **Contract** | Message schema and headers between producer and consumer | None — validate payloads against a model |
| **Integration** | Topology (exchanges, bindings, DLX), acks, redelivery, dead lettering, confirms | Real RabbitMQ in Docker |
| **End-to-end** | A service consumes, does the work and publishes the result | Real broker plus the service |

Most bugs with RabbitMQ are in **routing and ack handling**, which only a real broker shows — mocking `pika` checks that you called a method, not that the message arrived.

## Keep the Handler Pure

Split "take a message from RabbitMQ" from "do the work". The handler gets plain data and returns a decision; the thin consume loop maps the decision to ack / nack.

```python
# app/billing.py
import json
from enum import Enum

from pydantic import BaseModel, ValidationError


class OrderCreated(BaseModel):
    order_id: str
    amount: float


class Outcome(Enum):
    ACK = "ack"
    RETRY = "retry"          # nack, requeue / delayed retry
    DEAD = "dead"            # nack, requeue=False -> DLX


def charge(event: OrderCreated) -> None:
    ...                      # calls the payment service; replaced in unit tests


def handle(body: bytes, processed_ids: set[str], message_id: str | None) -> Outcome:
    if message_id and message_id in processed_ids:
        return Outcome.ACK                         # duplicate: already done
    try:
        event = OrderCreated.model_validate(json.loads(body))
    except (ValueError, ValidationError):
        return Outcome.DEAD                        # poison message, retrying won't help
    if event.amount <= 0:
        return Outcome.DEAD
    charge(event)                                  # may raise a temporary error -> caller returns RETRY
    if message_id:
        processed_ids.add(message_id)
    return Outcome.ACK
```

```python
# tests/unit/test_billing.py
from app import billing
from app.billing import Outcome


def test_valid_event_is_acked(monkeypatch):
    monkeypatch.setattr(billing, "charge", lambda event: None)
    assert billing.handle(b'{"order_id": "o1", "amount": 10}', set(), "m1") is Outcome.ACK


def test_invalid_json_goes_to_dlq():
    assert billing.handle(b"not json", set(), "m2") is Outcome.DEAD


def test_duplicate_is_acked_without_charging(monkeypatch):
    calls = []
    monkeypatch.setattr(billing, "charge", calls.append)
    assert billing.handle(b'{"order_id": "o1", "amount": 10}', {"m3"}, "m3") is Outcome.ACK
    assert calls == []
```

## A Broker Fixture

Start RabbitMQ once per session with Testcontainers, or reuse an external broker (CI service, local Compose) when `AMQP_URL` is set:

```python
# tests/conftest.py
import os

import pika
import pytest


@pytest.fixture(scope="session")
def amqp_url():
    if url := os.environ.get("AMQP_URL"):
        yield url
        return
    from testcontainers.community.rabbitmq import RabbitMqContainer     # testcontainers 4.x; older: testcontainers.rabbitmq

    with RabbitMqContainer("rabbitmq:4-management", username="test", password="test") as rabbit:
        host = rabbit.get_container_host_ip()
        port = rabbit.get_exposed_port(5672)
        yield f"amqp://test:test@{host}:{port}/"


@pytest.fixture
def channel(amqp_url):
    connection = pika.BlockingConnection(pika.URLParameters(amqp_url))
    ch = connection.channel()
    yield ch
    connection.close()
```

`RabbitMqContainer.get_connection_params()` returns ready `pika.ConnectionParameters` if you only use pika; the URL form above also works for aio-pika and for the service under test.

## Isolated Names per Test

Tests that share queue names see each other's messages and fail in random order, especially under `pytest -n`. Give every test its own names and remove them afterwards:

```python
# tests/conftest.py (continued)
import uuid


@pytest.fixture
def topology(channel):
    suffix = uuid.uuid4().hex[:8]
    names = {
        "exchange": f"orders.{suffix}",
        "dlx": f"orders.dlx.{suffix}",
        "queue": f"billing.{suffix}",
        "dlq": f"billing.dlq.{suffix}",
    }
    channel.exchange_declare(names["exchange"], exchange_type="topic")
    channel.exchange_declare(names["dlx"], exchange_type="direct")
    channel.queue_declare(names["dlq"], durable=True, arguments={"x-queue-type": "quorum"})
    channel.queue_bind(names["dlq"], names["dlx"], routing_key="billing")
    channel.queue_declare(
        names["queue"],
        durable=True,                                  # non-durable, non-exclusive queues are refused in 4.x
        arguments={
            "x-queue-type": "quorum",
            "x-dead-letter-exchange": names["dlx"],
            "x-dead-letter-routing-key": "billing",
            "x-delivery-limit": 2,
        },
    )
    channel.queue_bind(names["queue"], names["exchange"], routing_key="order.*")
    yield names
    for queue in (names["queue"], names["dlq"]):
        channel.queue_delete(queue)
    for exchange in (names["exchange"], names["dlx"]):
        channel.exchange_delete(exchange)
```

For throwaway queues that only the test reads, `queue_declare("", exclusive=True)` lets the broker pick a unique name and deletes the queue when the connection closes — no cleanup needed.

## Assert with a Deadline, Not a Sleep

Delivery is asynchronous. Poll until the expected message arrives or a deadline passes; never `time.sleep(2)` and hope:

```python
# tests/helpers.py
import time


def get_message(channel, queue: str, timeout: float = 5.0, ack: bool = True):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        method, properties, body = channel.basic_get(queue=queue, auto_ack=ack)
        if method is not None:
            return method, properties, body
        time.sleep(0.05)
    raise AssertionError(f"no message in {queue!r} within {timeout}s")


def assert_empty(channel, queue: str, wait: float = 0.5) -> None:
    time.sleep(wait)                                   # the only sleep: proving absence needs a window
    method, _, _ = channel.basic_get(queue=queue, auto_ack=False)
    assert method is None, f"unexpected message in {queue!r}"
```

## Integration Tests

```python
# tests/integration/test_topology.py
import json

import pika
import pytest

from tests.helpers import assert_empty, get_message

pytestmark = pytest.mark.integration


def publish(channel, exchange, routing_key, body, **props):
    channel.basic_publish(exchange, routing_key, json.dumps(body).encode(), pika.BasicProperties(**props))


def test_routing_key_reaches_bound_queue(channel, topology):
    publish(channel, topology["exchange"], "order.created", {"order_id": "o1"}, message_id="m1")
    _, properties, body = get_message(channel, topology["queue"])
    assert json.loads(body) == {"order_id": "o1"}
    assert properties.message_id == "m1"


def test_unbound_routing_key_is_not_delivered(channel, topology):
    publish(channel, topology["exchange"], "user.created", {"id": "u1"})
    assert_empty(channel, topology["queue"])


def test_unroutable_message_is_returned_with_mandatory(channel, topology):
    channel.confirm_delivery()
    with pytest.raises(pika.exceptions.UnroutableError):
        channel.basic_publish(topology["exchange"], "user.created", b"{}", mandatory=True)


def test_rejected_message_goes_to_dlq(channel, topology):
    publish(channel, topology["exchange"], "order.created", {"order_id": "bad"})
    method, _, _ = get_message(channel, topology["queue"], ack=False)
    channel.basic_nack(method.delivery_tag, requeue=False)
    _, properties, body = get_message(channel, topology["dlq"])
    assert json.loads(body) == {"order_id": "bad"}
    assert properties.headers["x-death"][0]["reason"] == "rejected"


def test_unacked_message_is_redelivered(amqp_url, topology, channel):
    publish(channel, topology["exchange"], "order.created", {"order_id": "o2"})
    consumer = pika.BlockingConnection(pika.URLParameters(amqp_url))
    ch = consumer.channel()
    get_message(ch, topology["queue"], ack=False)
    consumer.close()                                   # crash before ack
    method, _, _ = get_message(channel, topology["queue"])
    assert method.redelivered is True
```

The same pattern tests a running service: publish an input event, then `get_message` on the queue where the service writes its result (bind a per-test exclusive queue to the output exchange **before** publishing, or the result is routed nowhere).

## Queue Depth via the HTTP API

When the check is "N messages are waiting" rather than "this message arrived", ask the management API. Its counters refresh every few seconds, so poll:

```python
import time
from urllib.parse import quote

import requests


def wait_for_depth(api: str, auth: tuple[str, str], queue: str, expected: int, vhost: str = "/", timeout: float = 15):
    url = f"{api}/api/queues/{quote(vhost, safe='')}/{quote(queue, safe='')}"
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        data = requests.get(url, auth=auth, timeout=5).json()
        if data.get("messages") == expected:
            return
        time.sleep(0.5)
    raise AssertionError(f"{queue}: expected {expected} messages, got {data.get('messages')}")
```

A cheaper exact count without the API: `channel.queue_declare(queue, passive=True).method.message_count` — it counts only **ready** messages, not unacked ones.

## Parallel Runs and CI

- **pytest-xdist**: unique names per test (as above) are enough; one broker serves all workers. For stronger isolation create a vhost per worker from `worker_id`.
- **Mark integration tests** (`-m integration`) so the unit suite runs without Docker.
- **GitHub Actions** — a service container with a healthcheck, and `AMQP_URL` so the fixture reuses it instead of starting Testcontainers:

```yaml
jobs:
  integration:
    runs-on: ubuntu-latest
    services:
      rabbitmq:
        image: rabbitmq:4-management
        env:
          RABBITMQ_DEFAULT_USER: test
          RABBITMQ_DEFAULT_PASS: test
        ports:
          - 5672:5672
          - 15672:15672
        options: >-
          --health-cmd "rabbitmq-diagnostics -q ping"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 12
    env:
      AMQP_URL: amqp://test:test@localhost:5672/
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v4
      - run: uv sync --locked
      - run: uv run pytest -m integration -n 4
```

## Flakiness Pitfalls

| Pitfall | Why tests flake | Fix |
|---------|-----------------|-----|
| Shared queue names | Tests read each other's messages | Unique names per test, exclusive queues |
| `time.sleep` before asserting | Too short on a slow runner, wasteful on a fast one | Poll with a deadline |
| Result queue bound after publishing | Result routed nowhere, test waits forever | Declare and bind before triggering the flow |
| Leftover messages from an earlier failed run | First assertion reads a stale message | Per-test names; purge or delete in teardown |
| Reading counters from the HTTP API once | Counters lag by seconds | Poll, or use `queue_declare(passive=True)` |
| Consumer from the previous test still running | It steals messages from the next test | Stop consumers in fixture teardown; one consumer per test queue |
| `guest` user on a non-Docker broker | `ACCESS_REFUSED` from any host but localhost | Own user via `RABBITMQ_DEFAULT_USER` or `add_user` |
| Test queue declared without `durable=True` or `exclusive=True` | `INTERNAL_ERROR` (`transient_nonexcl_queues`), connection closed | `durable=True`, or `exclusive=True` for throwaway queues |
| Retry test uses `basic_nack(requeue=True)` | Delivery limit never reached, message loops | `basic_reject(requeue=True)` counts toward `x-delivery-limit` |
| Declaring an existing queue with other arguments | `PRECONDITION_FAILED` after a topology change | Unique names in tests; fresh broker per CI run |
| Broker "healthy" before listeners accept connections | First connect fails at start | Healthcheck plus connection retry in the fixture |

## QA Checklist

- [ ] Handlers are pure functions with unit tests for ack, retry, dead-letter and duplicate cases
- [ ] Message schemas validated in contract tests on both sides
- [ ] Integration tests run against a real broker, not a mocked client
- [ ] Every test has its own exchanges and queues, cleaned up afterwards
- [ ] Assertions poll with a deadline; no fixed sleeps except to prove absence
- [ ] Routing covered: bound keys delivered, unbound keys not, `mandatory` returns unroutable messages
- [ ] Failure paths covered: reject → DLQ, `x-death` present, crash before ack → redelivered
- [ ] Delivery limit or delayed retry proven — a poison message never loops forever
- [ ] Idempotency tested with the same `message_id` delivered twice
- [ ] CI uses a pinned image with a healthcheck; integration tests marked and run separately

---
## See also
- [RabbitMQ — Overview](./index.md)
- [RabbitMQ — Python Clients](./03-python-clients.md)
- [Kafka — Testing Kafka-Based Systems](../kafka/05-testing-kafka-systems.md)
- [Redis — Testing Setup & Isolation](../../databases/redis/06-testing-setup-isolation.md)
- [Celery — Integration Tests & Flakiness](../../libs/celery/06-integration-testing.md)
- [Pytest — Python Testing Framework](../../libs/pytest/index.md)
