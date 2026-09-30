---
date: 2026-09-30 18:20:00
tags:
  - tools
  - kafka
  - testing
  - pytest
  - integration-testing
  - unit-testing
  - docker
---

# Kafka — Testing Kafka-Based Systems

What makes Kafka systems hard to test:

1. **Asynchrony** — `produce()` returns before the broker has the record, and the consumer processes it some time later. Fixed sleeps make tests slow *and* flaky.
2. **State in the broker** — committed offsets, topics and old records outlive a test and leak into the next one.
3. **At-least-once by default** — duplicates, redelivery after crashes and poison messages are normal behaviour that must be tested, not avoided.

Everything on this page was run with pytest 9.1.1, `confluent-kafka` 2.15.1, `testcontainers` 4.15.0 and Kafka 4.3.1 (`apache/kafka` and `apache/kafka-native`).

## What to Test Where

| Level | Kafka | What it catches | Speed |
|-------|-------|-----------------|-------|
| Unit | None — fake message and producer | Business logic, validation, DLQ decisions, idempotency | ms |
| Contract / schema | None or Schema Registry | Producer and consumer disagree on the payload | ms |
| Integration | Real broker in Docker | Serialization, keys and partitions, commits, redelivery, DLQ wiring, ordering | seconds |
| End-to-end | Full environment | The whole flow across services | minutes |
| Load | Real cluster | Throughput, consumer lag, rebalance behaviour under load | minutes |

Most tests belong in the first two rows; integration tests cover the Kafka-specific behaviour that fakes cannot. The general split is in [Testing Pyramid](../../testing-pyramid/index.md).

## Design for Testability: Thin Loop, Pure Handler

Keep the Kafka loop small and put the decisions in a handler that only needs a "message-like" and a "producer-like" object:

```python
# app/invoicing.py
import json
import logging
import threading
from typing import Protocol

logger = logging.getLogger(__name__)


class InvalidEvent(Exception):
    """Permanent error: the message can never be processed -> DLQ."""


def build_invoice(event: dict) -> dict:
    """Pure business logic: no Kafka, easy to unit-test."""
    if event.get("amount_cents", 0) <= 0:
        raise InvalidEvent(f"bad amount in {event.get('event_id')}")
    return {"order_id": event["order_id"], "total_cents": event["amount_cents"], "source_event": event["event_id"]}


class MessageLike(Protocol):
    def key(self) -> bytes | None: ...
    def value(self) -> bytes | None: ...
    def topic(self) -> str | None: ...
    def partition(self) -> int | None: ...
    def offset(self) -> int | None: ...


class ProducerLike(Protocol):
    def produce(self, topic: str, value=None, key=None, headers=None, **kwargs) -> None: ...


class InvoiceHandler:
    """One order event -> one invoice; idempotent by event_id; poison messages go to the DLQ."""

    def __init__(self, producer: ProducerLike, out_topic: str, dlq_topic: str) -> None:
        self.producer = producer
        self.out_topic = out_topic
        self.dlq_topic = dlq_topic
        self.seen: set[str] = set()      # real service: a DB table with a unique constraint

    def handle(self, msg: MessageLike) -> None:
        try:
            event = json.loads(msg.value())
            if event["event_id"] in self.seen:
                logger.info("duplicate %s skipped", event["event_id"])
                return
            invoice = build_invoice(event)
        except (ValueError, KeyError, TypeError, InvalidEvent) as exc:   # JSONDecodeError is a ValueError
            self.producer.produce(
                self.dlq_topic,
                key=msg.key(),
                value=msg.value(),                                      # original bytes, for replay
                headers={
                    "error": f"{type(exc).__name__}: {exc}",
                    "source": f"{msg.topic()}/{msg.partition()}/{msg.offset()}",
                },
            )
            return
        self.producer.produce(self.out_topic, key=msg.key(), value=json.dumps(invoice).encode())
        self.seen.add(event["event_id"])


def run(consumer, producer, handler: InvoiceHandler, in_topic: str, stop: threading.Event) -> None:
    """Thin Kafka loop: poll -> handle -> flush -> commit (at-least-once)."""
    consumer.subscribe([in_topic])
    try:
        while not stop.is_set():
            msg = consumer.poll(0.5)
            if msg is None or msg.error():
                continue
            handler.handle(msg)
            producer.flush(10)                                 # output is durable before the commit
            consumer.commit(message=msg, asynchronous=False)
    finally:
        consumer.close()
```

The DLQ record keeps the original bytes and the source `topic/partition/offset`, so it can be inspected and replayed later. DLQ and retry patterns in general: [Queues vs Streams — Dead-Letter Queues](../../software-design-patterns/05-composition-architectural/04-queues-streams-messaging.md#dead-letter-queues-dlq).

## Unit Tests Without Kafka

```python
# tests/test_invoice_unit.py
import json

import pytest

from app.invoicing import InvalidEvent, InvoiceHandler, build_invoice


class FakeMessage:
    def __init__(self, value: bytes, key: bytes | None = b"ord-1", offset: int = 0) -> None:
        self._value, self._key, self._offset = value, key, offset

    def key(self): return self._key
    def value(self): return self._value
    def topic(self): return "orders"
    def partition(self): return 0
    def offset(self): return self._offset


class FakeProducer:
    def __init__(self) -> None:
        self.sent: list[dict] = []

    def produce(self, topic, value=None, key=None, headers=None, **kwargs):
        self.sent.append({"topic": topic, "key": key, "value": value, "headers": headers or {}})


def event(event_id="e-1", amount=4200) -> bytes:
    return json.dumps({"event_id": event_id, "order_id": "ord-1", "amount_cents": amount}).encode()


def test_build_invoice():
    invoice = build_invoice(json.loads(event()))
    assert invoice == {"order_id": "ord-1", "total_cents": 4200, "source_event": "e-1"}


def test_zero_amount_is_invalid():
    with pytest.raises(InvalidEvent):
        build_invoice(json.loads(event(amount=0)))


@pytest.fixture
def producer() -> FakeProducer:
    return FakeProducer()


@pytest.fixture
def handler(producer) -> InvoiceHandler:
    return InvoiceHandler(producer, out_topic="invoices", dlq_topic="orders.dlq")


def test_valid_event_produces_invoice_with_same_key(handler, producer):
    handler.handle(FakeMessage(event()))
    assert [(m["topic"], m["key"]) for m in producer.sent] == [("invoices", b"ord-1")]


def test_duplicate_event_is_processed_once(handler, producer):
    handler.handle(FakeMessage(event("e-1"), offset=0))
    handler.handle(FakeMessage(event("e-1"), offset=1))       # redelivery after a crash
    assert len(producer.sent) == 1


@pytest.mark.parametrize("raw", [b"not json", b'{"order_id": "ord-1"}', event(amount=-5)])
def test_poison_message_goes_to_dlq(handler, producer, raw):
    handler.handle(FakeMessage(raw, offset=7))
    [dlq] = producer.sent
    assert dlq["topic"] == "orders.dlq"
    assert dlq["value"] == raw                                   # original bytes kept for replay
    assert dlq["headers"]["source"] == "orders/0/7"
```

- The fakes are tiny because the handler depends on two methods, not on `confluent_kafka` classes. Do not mock `confluent_kafka.Consumer` itself — a mocked `poll()` that returns what the test wants proves nothing about commits or rebalances. More on the boundary: [Mocking & Test Isolation](../../test-automation-framework/06-execution-reliability/03-mocking-isolation.md).
- The key is part of the contract: assert that the output keeps the input key, or ordering downstream breaks silently.

## Contract and Schema Tests

The producer and the consumer are usually owned by different teams. Check the payload contract without a broker.

**JSON without a registry** — the consumer owns a model, the producer publishes sample events (checked into the repo or taken from its CI artifact):

```python
# contracts/order_events.py
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class OrderCreatedV1(BaseModel):
    """Consumer-side contract for `orders` values."""

    model_config = ConfigDict(extra="ignore")      # new producer fields must not break consumers

    event_id: str
    event_type: Literal["order-created"] = "order-created"
    order_id: str
    amount_cents: int = Field(gt=0)
```

**Avro with Schema Registry** — fail the build when a schema change breaks the compatibility level of the subject:

```python
# tests/test_contracts.py
import json
import os
from pathlib import Path

import pytest
from confluent_kafka.schema_registry import Schema, SchemaRegistryClient

from contracts.order_events import OrderCreatedV1

PRODUCER_SAMPLES = [
    {"event_id": "e-1", "event_type": "order-created", "order_id": "ord-1", "amount_cents": 4200},
    {"event_id": "e-2", "event_type": "order-created", "order_id": "ord-2", "amount_cents": 1, "coupon": "X1"},
]


@pytest.mark.parametrize("sample", PRODUCER_SAMPLES, ids=lambda s: s["event_id"])
def test_producer_samples_match_consumer_contract(sample):
    OrderCreatedV1.model_validate_json(json.dumps(sample))


def test_contract_rejects_missing_order_id():
    with pytest.raises(ValueError):                  # pydantic.ValidationError is a ValueError
        OrderCreatedV1.model_validate({"event_id": "e-3", "amount_cents": 5})


REGISTRY_URL = os.getenv("SCHEMA_REGISTRY_URL")


@pytest.mark.skipif(not REGISTRY_URL, reason="SCHEMA_REGISTRY_URL not set")
def test_new_avro_schema_is_compatible_with_registry():
    registry = SchemaRegistryClient({"url": REGISTRY_URL})
    candidate = Path("schemas/order_created.avsc").read_text()
    assert registry.test_compatibility("orders-avro-value", Schema(candidate, schema_type="AVRO")), (
        "breaking change for orders-avro-value: add defaults or bump the topic"
    )
```

With the subject on `BACKWARD`, adding `{"name": "currency", "type": "string", "default": "EUR"}` passes; the same field without `default` fails the test. Compatibility levels are explained in [04 Schemas & Observability](./04-schemas-observability.md#compatibility-levels).

## Integration Tests with a Real Broker

### Broker Fixture

The `bootstrap_servers` fixture either starts a broker with Testcontainers or reuses one given by `KAFKA_BOOTSTRAP_SERVERS` (a Compose broker locally, a service container in CI):

```python
# tests/conftest.py
import os
import socket
import time
import uuid
from collections.abc import Iterator

import pytest
from confluent_kafka import Producer
from confluent_kafka.admin import AdminClient, NewTopic
from testcontainers.core.container import DockerContainer
from testcontainers.core.wait_strategies import LogMessageWaitStrategy

KAFKA_IMAGE = os.getenv("KAFKA_IMAGE", "apache/kafka:4.3.1")   # apache/kafka-native starts faster


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="session")
def bootstrap_servers() -> Iterator[str]:
    """One broker per test session; KAFKA_BOOTSTRAP_SERVERS reuses an existing one."""
    if external := os.getenv("KAFKA_BOOTSTRAP_SERVERS"):
        yield external
        return
    port = free_port()   # the advertised listener must match the host port -> fix it before start
    container = (
        DockerContainer(KAFKA_IMAGE)
        .with_bind_ports(9092, port)
        .with_envs(
            KAFKA_NODE_ID="1",
            KAFKA_PROCESS_ROLES="broker,controller",
            KAFKA_LISTENERS="PLAINTEXT://:9092,CONTROLLER://:9093",
            KAFKA_ADVERTISED_LISTENERS=f"PLAINTEXT://localhost:{port}",
            KAFKA_LISTENER_SECURITY_PROTOCOL_MAP="PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT",
            KAFKA_CONTROLLER_LISTENER_NAMES="CONTROLLER",
            KAFKA_CONTROLLER_QUORUM_VOTERS="1@localhost:9093",
            KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR="1",
            KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR="1",
            KAFKA_TRANSACTION_STATE_LOG_MIN_ISR="1",
            KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS="0",
            KAFKA_AUTO_CREATE_TOPICS_ENABLE="false",
        )
        .waiting_for(LogMessageWaitStrategy("Kafka Server started").with_startup_timeout(60))
    )
    with container:
        yield f"localhost:{port}"


@pytest.fixture(scope="session")
def admin(bootstrap_servers: str) -> AdminClient:
    return AdminClient({"bootstrap.servers": bootstrap_servers})


def wait_for_topic(admin: AdminClient, name: str, partitions: int, timeout: float = 10.0) -> None:
    """create_topics() can return before the topic is usable: wait until metadata shows all leaders."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        topic = admin.list_topics(name, timeout=5).topics.get(name)
        ready = (
            topic is not None
            and topic.error is None
            and len(topic.partitions) == partitions
            and all(p.leader >= 0 for p in topic.partitions.values())
        )
        if ready:
            return
        time.sleep(0.1)
    raise AssertionError(f"topic {name} not ready after {timeout}s")


@pytest.fixture
def topic_factory(admin: AdminClient) -> Iterator:
    """Create uniquely named topics for one test and delete them afterwards."""
    created: list[str] = []

    def create(prefix: str, partitions: int = 3) -> str:
        name = f"{prefix}.{uuid.uuid4().hex[:8]}"
        admin.create_topics([NewTopic(name, num_partitions=partitions, replication_factor=1)])[name].result(10)
        created.append(name)
        wait_for_topic(admin, name, partitions)
        return name

    yield create
    if created:
        for future in admin.delete_topics(created).values():
            future.result(10)


@pytest.fixture
def group_id() -> str:
    return f"test-{uuid.uuid4().hex[:8]}"


@pytest.fixture
def producer(bootstrap_servers: str) -> Iterator[Producer]:
    p = Producer({"bootstrap.servers": bootstrap_servers, "enable.idempotence": True})
    yield p
    assert p.flush(10) == 0, "test producer has undelivered messages"
```

```toml
# pyproject.toml
[tool.pytest.ini_options]
pythonpath = ["."]
markers = ["integration: needs a Kafka broker (Docker)"]
```

- **Why a fixed host port:** the broker tells clients the advertised address. With a random mapped port the advertised `localhost:9092` would point to nothing, so the fixture picks a free port first and advertises exactly that.
- **`apache/kafka-native`** started in under a second in local runs, `apache/kafka` in about four. Set `KAFKA_IMAGE=apache/kafka-native:4.3.1` for fast local loops; keep the JVM image in at least one CI job, since production runs the JVM broker.
- **`wait_for_topic` is not optional.** Without it the native-image runs failed intermittently with `UNKNOWN_TOPIC_OR_PART: Subscribed topic not available` right after `create_topics()` had succeeded.

!!! note "Testcontainers `KafkaContainer`"
    `testcontainers` also ships a ready-made class, imported from `testcontainers.community.kafka` in 4.15 (`testcontainers.kafka` still works but is deprecated). It is built for Confluent images and defaults to the ZooKeeper-based `confluentinc/cp-kafka:7.6.0`, so pass a KRaft image explicitly:

    ```python
    from testcontainers.community.kafka import KafkaContainer

    with KafkaContainer("confluentinc/cp-kafka:8.3.2").with_kraft() as kafka:
        bootstrap = kafka.get_bootstrap_server()      # e.g. localhost:32780
    ```

    In 4.15.0 the import needs the `packaging` package; it is present whenever pytest is installed.

### Produce and Assert with a Deadline

```python
# tests/kafka_helpers.py
import json
import time
import uuid
from collections.abc import Callable

from confluent_kafka import Consumer, Message, Producer


def produce_json(producer: Producer, topic: str, key: str, value: dict | bytes) -> None:
    """Produce and wait for the delivery report: the event is in the log when this returns."""
    errors: list = []
    payload = value if isinstance(value, bytes) else json.dumps(value).encode()
    producer.produce(topic, key=key, value=payload, on_delivery=lambda err, _msg: err and errors.append(err))
    assert producer.flush(10) == 0 and not errors, f"delivery failed: {errors}"


def consume_until(
    bootstrap_servers: str,
    topic: str,
    done: Callable[[list[Message]], bool],
    timeout: float = 15.0,
) -> list[Message]:
    """Read `topic` from the beginning with a fresh group until done(messages) or the deadline."""
    consumer = Consumer({
        "bootstrap.servers": bootstrap_servers,
        "group.id": f"assert-{uuid.uuid4().hex[:8]}",
        "auto.offset.reset": "earliest",
        "enable.auto.commit": False,
    })
    consumer.subscribe([topic])
    messages: list[Message] = []
    deadline = time.monotonic() + timeout
    try:
        while time.monotonic() < deadline:
            msg = consumer.poll(0.2)
            if msg is None:
                continue
            if msg.error():
                raise AssertionError(f"consumer error: {msg.error()}")
            messages.append(msg)
            if done(messages):
                return messages
    finally:
        consumer.close()
    raise AssertionError(f"timeout after {timeout}s on {topic}: got {len(messages)} messages")


def new_event(order_id: str, amount_cents: int = 1000) -> dict:
    return {"event_id": uuid.uuid4().hex, "order_id": order_id, "amount_cents": amount_cents}
```

- The test returns as soon as the condition holds; the timeout only matters when something is broken, and then the error says how many messages arrived.
- The assertion consumer uses its own fresh group with `earliest`, so it sees everything written to the (fresh) topic regardless of timing.
- "Nothing else arrives" cannot be proven by waiting. Produce a **marker** event after the one that must be ignored, wait for the marker's output, then assert on what came before it — see the duplicate test in [06 Testing Scenarios](./06-testing-scenarios-ci.md#duplicates-and-idempotency).

### The System Under Test in a Thread

```python
# tests/test_invoicing_integration.py
import json
import threading
from collections import defaultdict

import pytest
from confluent_kafka import Consumer, Producer

from app.invoicing import InvoiceHandler, run
from tests.kafka_helpers import consume_until, new_event, produce_json
from tests.lag import wait_for_zero_lag

pytestmark = pytest.mark.integration


@pytest.fixture
def topics(topic_factory) -> dict[str, str]:
    return {"in": topic_factory("orders"), "out": topic_factory("invoices"), "dlq": topic_factory("orders.dlq", 1)}


@pytest.fixture
def service(bootstrap_servers, topics, group_id):
    """Run the real consumer loop in a background thread for one test."""
    consumer = Consumer({
        "bootstrap.servers": bootstrap_servers,
        "group.id": group_id,
        "auto.offset.reset": "earliest",
        "enable.auto.commit": False,
    })
    producer = Producer({"bootstrap.servers": bootstrap_servers, "enable.idempotence": True})
    handler = InvoiceHandler(producer, topics["out"], topics["dlq"])
    stop = threading.Event()
    thread = threading.Thread(target=run, args=(consumer, producer, handler, topics["in"], stop), daemon=True)
    thread.start()
    yield handler
    stop.set()
    thread.join(timeout=10)
    assert not thread.is_alive(), "consumer loop did not stop"


def test_order_event_produces_invoice(bootstrap_servers, topics, producer, service):
    event = new_event("ord-1", 4200)
    produce_json(producer, topics["in"], "ord-1", event)

    [msg] = consume_until(bootstrap_servers, topics["out"], lambda ms: len(ms) >= 1)

    assert msg.key() == b"ord-1"
    assert json.loads(msg.value()) == {"order_id": "ord-1", "total_cents": 4200, "source_event": event["event_id"]}
```

When the service is a separate process or container (Compose, a deployed test environment), the tests stay the same: drop the `service` fixture, point `KAFKA_BOOTSTRAP_SERVERS` at the environment, and use the topic names the service is configured with — then unique topics are not possible, so filter by unique keys or event IDs instead.

The scenario tests — ordering, duplicates, poison messages, lag under load — plus flakiness pitfalls, CI and the checklist continue in [06 Testing Scenarios, Load & CI](./06-testing-scenarios-ci.md).

---
## See also
- [Apache Kafka — Overview](./index.md)
- [Kafka — Testing Scenarios, Load & CI](./06-testing-scenarios-ci.md)
- [Kafka — Producers & Consumers in Python](./03-producers-consumers-python.md)
- [Kafka — Schemas & Observability](./04-schemas-observability.md)
- [Pytest — Python Testing Framework](../../libs/pytest/index.md)
- [Mocking & Test Isolation](../../test-automation-framework/06-execution-reliability/03-mocking-isolation.md)
- [Testing Pyramid](../../testing-pyramid/index.md)
