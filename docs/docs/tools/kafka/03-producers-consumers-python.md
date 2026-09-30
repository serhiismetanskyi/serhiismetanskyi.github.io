---
date: 2026-09-30
tags:
  - tools
  - kafka
  - python
---

# Kafka — Producers & Consumers in Python

All examples use `confluent-kafka` 2.15.1 (librdkafka 2.15.1) against a Kafka 4.3.1 broker from [02 Local Setup & CLI](./02-local-setup-cli.md).

## Python Clients

| Package | Version checked | What it is | When to use |
|---------|-----------------|------------|-------------|
| `confluent-kafka` | 2.15.1 | Wrapper over librdkafka (C), maintained by Confluent; wheels include librdkafka | Default choice: fastest, feature-complete (transactions, KIP-848, admin API), Schema Registry serializers, asyncio API in `confluent_kafka.aio` |
| `kafka-python` | 3.0.11 | Pure-Python client, releases resumed after a long pause | No native dependency allowed; simple scripts |
| `aiokafka` | 0.14.0 | Pure-Python asyncio client (aio-libs) | Existing asyncio code bases already built on it |

```bash
uv add confluent-kafka                              # producer, consumer, admin
uv add "confluent-kafka[avro,schemaregistry]"       # + Avro serializers and Schema Registry client
```

!!! note "Config keys are librdkafka keys"
    `confluent-kafka` takes a plain dict with the dotted names from librdkafka's `CONFIGURATION.md` (`bootstrap.servers`, `enable.idempotence`, …). Most match the Java client; some defaults do not — see the tables below.

## Admin: Creating Topics from Code

```python
from confluent_kafka.admin import AdminClient, NewTopic

admin = AdminClient({"bootstrap.servers": "localhost:9092"})

futures = admin.create_topics([
    NewTopic("orders", num_partitions=3, replication_factor=1, config={"retention.ms": "604800000"}),
    NewTopic("orders.dlq", num_partitions=1, replication_factor=1),
])
for topic, future in futures.items():
    try:
        future.result()          # raises KafkaException, e.g. TOPIC_ALREADY_EXISTS
        print(f"created {topic}")
    except Exception as exc:
        print(f"{topic}: {exc}")

print(sorted(t for t in admin.list_topics(timeout=5).topics if not t.startswith("__")))
```

Admin calls are asynchronous and return a dict of futures — always call `.result()`, or errors are silently lost.

## Producer Configuration

| Setting | librdkafka default | Recommended for business events | Notes |
|---------|--------------------|---------------------------------|-------|
| `acks` | `all` | `all` | `1` loses data if the leader dies before followers copy it |
| `enable.idempotence` | `false` | `true` | No duplicates or reordering on retries; forces `acks=all` and at most 5 in-flight requests. Java clients default to `true` |
| `retries` | `2147483647` | default | Retries are bounded by time, not count |
| `delivery.timeout.ms` | `300000` (5 min) | 30–120 s | Total time to deliver one message including retries; after it the delivery report fails |
| `linger.ms` | `5` | 5–50 | Wait to fill a batch: more throughput, a bit more latency |
| `batch.size` | `1000000` bytes | default | Max batch size in bytes |
| `compression.type` | `none` | `zstd` or `lz4` | Compresses whole batches; brokers store them compressed |
| `partitioner` | `consistent_random` (CRC32) | `murmur2_random` if Java producers write the same topic | Same key, same partition across languages |
| `client.id` | `rdkafka` | service name + host | Shows up in broker logs, quotas, metrics |

## Producing with Delivery Reports

```python
import json
import socket

from confluent_kafka import KafkaError, Message, Producer

producer = Producer({
    "bootstrap.servers": "localhost:9092",
    "client.id": f"orders-api-{socket.gethostname()}",
    "acks": "all",
    "enable.idempotence": True,
    "linger.ms": 5,
    "compression.type": "zstd",
    "delivery.timeout.ms": 30000,
})


def on_delivery(err: KafkaError | None, msg: Message) -> None:
    if err is not None:
        print(f"FAILED {msg.key()}: {err}")          # real code: log, metric, alert
    else:
        print(f"ok {msg.key().decode()} -> {msg.topic()}[{msg.partition()}]@{msg.offset()}")


for order_id, status in [("ord-1", "created"), ("ord-2", "created"), ("ord-1", "paid")]:
    producer.produce(
        "orders",
        key=order_id,                                  # str or bytes; str is UTF-8 encoded
        value=json.dumps({"order_id": order_id, "status": status}).encode(),
        headers={"event-type": "order-status-changed", "schema-version": "1"},
        on_delivery=on_delivery,
    )
    producer.poll(0)                                   # serve callbacks of earlier messages

remaining = producer.flush(10)                         # wait for all outstanding deliveries
assert remaining == 0, f"{remaining} messages not delivered"
```

How the producer works:

1. `produce()` only puts the message into a local queue and returns immediately. It does **not** mean the broker has the message.
2. A background thread batches and sends; the result arrives as a delivery report.
3. Delivery callbacks run only inside `poll()` or `flush()` — call `poll(0)` in the produce loop, `flush()` before exit.
4. `flush(timeout)` returns the number of messages still undelivered; a non-zero value means data can be lost on exit.

| Situation | What happens | Handle it |
|-----------|--------------|-----------|
| Local queue full (`queue.buffering.max.messages`, default 100000) | `produce()` raises `BufferError: Local: Queue full` | `producer.poll(1)` to drain, then retry the same `produce()` |
| Topic does not exist and auto-creation is off | Message waits in the queue; after `delivery.timeout.ms` the report fails with `_MSG_TIMED_OUT`, and a shorter `flush()` returns > 0 | Create topics in setup; check the `flush()` result and delivery reports |
| Broker down | librdkafka retries and reconnects until `delivery.timeout.ms` | Alert on failed delivery reports |
| Message larger than `message.max.bytes` (1000000) | `produce()` raises `KafkaException` with `MSG_SIZE_TOO_LARGE` | Store the payload elsewhere, send a reference |

### Headers

- Send as a dict or a list of `(key, value)` tuples; values can be `str` or `bytes`.
- A consumer gets `msg.headers()` as a list of `(str, bytes)` tuples, or `None` when there are no headers.
- Typical uses: `event-type`, `schema-version`, `correlation-id`, `traceparent` (added by OpenTelemetry instrumentation), error details on DLQ messages.

## Consumer Configuration

| Setting | librdkafka default | Notes |
|---------|--------------------|-------|
| `group.id` | — (required for `subscribe`) | One group per logical consumer service |
| `auto.offset.reset` | `latest` | Where to start when the group has **no committed offset** (or it is out of range). `earliest` reads the backlog; `latest` only new records |
| `enable.auto.commit` | `true` | Commits stored offsets in the background every `auto.commit.interval.ms` (5000) |
| `enable.auto.offset.store` | `true` | Marks a message as done as soon as `poll()` returns it |
| `isolation.level` | `read_committed` | Skips records of aborted transactions |
| `max.poll.interval.ms` | `300000` | Max time between `poll()` calls before the member is kicked out of the group |
| `session.timeout.ms` | `45000` | Heartbeat timeout (classic protocol) |
| `group.protocol` | `classic` | `consumer` = KIP-848 protocol |
| `group.instance.id` | — | Static membership: a restarted pod with the same ID gets its partitions back without a rebalance |

!!! warning "`auto.offset.reset` only applies to a group without offsets"
    Once a group has committed, it resumes from there and `auto.offset.reset` is ignored. A test that reuses `group.id="tests"` and "sometimes sees nothing" is usually reading from an old committed offset — use a new group per test.

## Commit Strategies

| Strategy | Config | Guarantee | Throughput |
|----------|--------|-----------|------------|
| Auto commit, auto store (defaults) | — | A crash after `poll()` but before processing finishes can **skip** messages | High |
| Auto commit, manual store | `enable.auto.offset.store=false`, `store_offsets(msg)` after processing | At-least-once | High |
| Sync commit per message | `enable.auto.commit=false`, `commit(message=msg, asynchronous=False)` | At-least-once, smallest duplicate window | Low: one round trip per message |
| Commit every N messages / T seconds | `enable.auto.commit=false`, periodic `commit(asynchronous=False)` | At-least-once, up to N duplicates after a crash | High |
| Transactions | `transactional.id` on the producer | Exactly-once for Kafka-to-Kafka | Medium |

### At-Least-Once Consumer Loop

```python
import json
import signal

from confluent_kafka import Consumer, KafkaException

running = True


def stop(signum, frame):
    global running
    running = False


signal.signal(signal.SIGTERM, stop)                 # Kubernetes / docker stop

consumer = Consumer({
    "bootstrap.servers": "localhost:9092",
    "group.id": "billing",
    "auto.offset.reset": "earliest",
    "enable.auto.commit": True,
    "enable.auto.offset.store": False,              # we decide what is done
})
consumer.subscribe(["orders"])


def handle(event: dict) -> None:
    print("processing", event)


try:
    while running:
        msg = consumer.poll(1.0)
        if msg is None:
            continue
        if msg.error():
            raise KafkaException(msg.error())
        handle(json.loads(msg.value()))
        consumer.store_offsets(message=msg)         # committed by the next auto commit
finally:
    consumer.close()                                # commits stored offsets and leaves the group
```

- `close()` matters: it commits what was stored and leaves the group, so its partitions are reassigned at once instead of after `session.timeout.ms`.
- A handler that can take longer than `max.poll.interval.ms` gets the consumer kicked out mid-work. Split the work, raise the limit, or `pause()` the partitions and keep calling `poll()`.
- The consumer is meant to be used from one thread. The producer is thread-safe and can be shared.

## Rebalancing

```python
from confluent_kafka import Consumer


def on_assign(consumer, partitions):
    print("assigned", [(p.topic, p.partition) for p in partitions])


def on_revoke(consumer, partitions):
    print("revoked", [(p.topic, p.partition) for p in partitions])
    # manual commits: commit processed offsets here, before another member takes over


consumer = Consumer({
    "bootstrap.servers": "localhost:9092",
    "group.id": "billing",
    "group.protocol": "consumer",        # KIP-848: broker-side, incremental assignment
    "auto.offset.reset": "earliest",
    "enable.auto.commit": False,
})
consumer.subscribe(["orders"], on_assign=on_assign, on_revoke=on_revoke)
```

- With `group.protocol=consumer`, `session.timeout.ms`, `heartbeat.interval.ms` and `partition.assignment.strategy` are rejected by the client (`_INVALID_ARG ... It is defined broker side`); use `group.remote.assignor` to pick the server-side assignor.
- On the classic protocol set `partition.assignment.strategy=cooperative-sticky` to avoid stop-the-world rebalances.
- `kafka-groups.sh --list` shows each group's type (`Classic` or `Consumer`).

## Exactly-Once: Consume-Transform-Produce

```python
import json

from confluent_kafka import Consumer, KafkaException, Producer

consumer = Consumer({
    "bootstrap.servers": "localhost:9092",
    "group.id": "invoicer",
    "auto.offset.reset": "earliest",
    "enable.auto.commit": False,
    "isolation.level": "read_committed",
})
producer = Producer({
    "bootstrap.servers": "localhost:9092",
    "transactional.id": "invoicer-1",          # stable per instance; enables idempotence
})
producer.init_transactions()
consumer.subscribe(["orders"])

while True:
    msgs = consumer.consume(num_messages=100, timeout=1.0)
    if not msgs:
        continue
    producer.begin_transaction()
    try:
        for msg in msgs:
            if msg.error():
                raise KafkaException(msg.error())
            order = json.loads(msg.value())
            producer.produce("invoices", key=msg.key(), value=json.dumps({"invoice_for": order["order_id"]}).encode())
        producer.send_offsets_to_transaction(            # input offsets commit together with the output
            consumer.position(consumer.assignment()),
            consumer.consumer_group_metadata(),
        )
        producer.commit_transaction()
    except Exception:
        producer.abort_transaction()
        raise                                            # real code: seek back to the committed offsets and retry
```

- Output records and input offsets are committed atomically: after a crash, either both are visible or neither is.
- Downstream consumers must use `read_committed` (the librdkafka default) or they will see aborted records.
- Every transaction writes a commit marker into each partition it touched, which takes an offset. In a check run, 3 messages in one transaction moved the log-end offset to 4 — do not assert `log-end offset == message count` on transactional topics.
- It does not cover external side effects: a DB write inside the loop can still happen twice.

## asyncio: `confluent_kafka.aio`

```python
import asyncio

from confluent_kafka.aio import AIOConsumer, AIOProducer


async def main() -> None:
    producer = AIOProducer({"bootstrap.servers": "localhost:9092"})
    try:
        delivery = await producer.produce("orders", key="ord-9", value=b'{"order_id": "ord-9"}')
        msg = await delivery                        # resolves on the delivery report
        print("delivered", msg.partition(), msg.offset())
    finally:
        await producer.flush()
        await producer.close()

    consumer = AIOConsumer({
        "bootstrap.servers": "localhost:9092",
        "group.id": "aio-demo",
        "auto.offset.reset": "earliest",
    })
    try:
        await consumer.subscribe(["orders"])
        for _ in range(10):
            msg = await consumer.poll(1.0)
            if msg is not None and not msg.error():
                print("consumed", msg.key(), msg.offset())
    finally:
        await consumer.close()


asyncio.run(main())
```

`AIOProducer` / `AIOConsumer` run the blocking librdkafka calls in a thread pool and expose the same methods as coroutines — handy inside FastAPI or other asyncio services.

## Common Mistakes

| Mistake | Effect | Fix |
|---------|--------|-----|
| No `flush()` before a script or test exits | Last messages never sent | `assert producer.flush(10) == 0` |
| Ignoring delivery reports | Failed writes go unnoticed | `on_delivery` callback that logs and counts errors |
| Relying on defaults for business events | No idempotence: retries can duplicate or reorder | `enable.idempotence=True` |
| Auto commit + auto store with slow handlers | Offsets committed before processing ends; a crash skips messages | Manual store or manual commit after processing |
| Consumer not closed | Partitions blocked until the session times out; stored offsets not committed | `try/finally: consumer.close()` |
| Long blocking work between polls | Member kicked out, rebalance loop, duplicates | Keep work under `max.poll.interval.ms`, or `pause()` / `resume()` |
| New producer per message | Connection setup per call, very slow | One long-lived producer per process |

---
## See also
- [Apache Kafka — Overview](./index.md)
- [Kafka — Core Concepts](./01-core-concepts.md)
- [Kafka — Schemas & Observability](./04-schemas-observability.md)
- [Kafka — Testing Kafka-Based Systems](./05-testing-kafka-systems.md)
- [Queues vs Streams: Message Delivery, Ordering & Reliability](../../software-design-patterns/05-composition-architectural/04-queues-streams-messaging.md)
- [FastAPI — Modern Async Web Framework](../../libs/fastapi/index.md)
