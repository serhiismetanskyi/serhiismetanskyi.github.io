---
date: 2026-09-30
tags:
  - tools
  - kafka
  - testing
  - pytest
  - integration-testing
  - performance
  - load-testing
  - ci-cd
---

# Kafka — Testing Scenarios, Load & CI

The Kafka-specific behaviours that fakes cannot show: ordering per key, redelivery, poison messages, consumer lag under load. The tests reuse the fixtures and helpers from [05 Testing Kafka-Based Systems](./05-testing-kafka-systems.md): `bootstrap_servers`, `topic_factory`, `group_id`, `producer`, the `service` fixture that runs the consumer loop in a thread, `produce_json` and `consume_until`. The test functions without a file name below live in `tests/test_invoicing_integration.py`. Versions used: pytest 9.1.1, `confluent-kafka` 2.15.1, `testcontainers` 4.15.0, Kafka 4.3.1.

## Ordering by Key

```python
def test_order_per_key_is_preserved(bootstrap_servers, topics, producer, service):
    for order_id in ("ord-1", "ord-2", "ord-3"):
        for amount in (100, 200, 300):
            produce_json(producer, topics["in"], order_id, new_event(order_id, amount))

    messages = consume_until(bootstrap_servers, topics["out"], lambda ms: len(ms) >= 9)

    per_key = defaultdict(list)
    for m in messages:
        per_key[m.key()].append(json.loads(m.value())["total_cents"])
    assert all(amounts == [100, 200, 300] for amounts in per_key.values()), per_key
    assert all(len({m.partition() for m in messages if m.key() == k}) == 1 for k in per_key)
```

- Assert order **per key**, never globally: records of different keys in different partitions interleave in any order.
- Use a topic with more than one partition — on a single partition, bugs caused by key handling and partitioning cannot show up.
- The second assertion checks that each key stayed on one partition of the output topic.

## Duplicates and Idempotency

At-least-once delivery means the consumer *will* see some records twice: after a crash before commit, after a rebalance, after a producer retry without idempotence. Test both sides.

```python
def test_redelivered_event_is_not_invoiced_twice(bootstrap_servers, topics, producer, service):
    event = new_event("ord-7")
    produce_json(producer, topics["in"], "ord-7", event)
    produce_json(producer, topics["in"], "ord-7", event)               # same event_id: simulated redelivery
    produce_json(producer, topics["in"], "ord-7", new_event("ord-7"))  # marker: a later, different event

    messages = consume_until(bootstrap_servers, topics["out"], lambda ms: len(ms) >= 2)

    sources = [json.loads(m.value())["source_event"] for m in messages]
    assert sources.count(event["event_id"]) == 1
```

And that uncommitted work really is redelivered — the property the idempotency above relies on:

```python
# tests/test_redelivery.py
import pytest
from confluent_kafka import Consumer

from tests.kafka_helpers import new_event, produce_json

pytestmark = pytest.mark.integration


def read_one(bootstrap_servers: str, topic: str, group_id: str, commit: bool) -> int:
    consumer = Consumer({
        "bootstrap.servers": bootstrap_servers,
        "group.id": group_id,
        "auto.offset.reset": "earliest",
        "enable.auto.commit": False,
    })
    consumer.subscribe([topic])
    try:
        for _ in range(50):
            msg = consumer.poll(0.2)
            if msg is not None and not msg.error():
                if commit:
                    consumer.commit(message=msg, asynchronous=False)
                return msg.offset()
        raise AssertionError("no message")
    finally:
        consumer.close()


def test_uncommitted_message_is_redelivered(bootstrap_servers, topic_factory, producer, group_id):
    topic = topic_factory("orders", partitions=1)
    produce_json(producer, topic, "ord-1", new_event("ord-1"))

    first = read_one(bootstrap_servers, topic, group_id, commit=False)    # "crash" before commit
    second = read_one(bootstrap_servers, topic, group_id, commit=True)
    assert first == second == 0                                          # at-least-once: same record again

    produce_json(producer, topic, "ord-1", new_event("ord-1"))
    assert read_one(bootstrap_servers, topic, group_id, commit=True) == 1  # committed -> not redelivered
```

## Poison Messages and the DLQ

```python
def test_poison_message_goes_to_dlq_and_consumer_keeps_going(bootstrap_servers, topics, producer, service):
    produce_json(producer, topics["in"], "ord-9", b"{not json")
    produce_json(producer, topics["in"], "ord-9", new_event("ord-9"))

    [dead] = consume_until(bootstrap_servers, topics["dlq"], lambda ms: len(ms) >= 1)
    [invoice] = consume_until(bootstrap_servers, topics["out"], lambda ms: len(ms) >= 1)

    headers = dict(dead.headers())
    assert dead.value() == b"{not json"
    assert headers["error"].startswith(b"JSONDecodeError")
    assert json.loads(invoice.value())["order_id"] == "ord-9"
```

What this proves: the bad record is kept with its original bytes and the reason, and the **next record on the same key is still processed** — a consumer that crashes or retries forever on a poison message blocks its whole partition.

More cases worth a test:

| Case | Expected behaviour |
|------|--------------------|
| Invalid JSON / unknown schema ID | DLQ, no retry |
| Valid payload, business rule violated | DLQ or a domain "rejected" event — whatever the spec says |
| Transient failure (DB down, HTTP 503) | Retry with backoff, **no** DLQ, no commit until success |
| DLQ produce itself fails | Consumer does not commit the original offset |
| Header-only difference (`schema-version: 2`) | Routed to the right parser |

## Consumer Lag in Load Tests

For load tests, "requests per second" is the wrong main number for a consumer. Measure how fast the group **drains a backlog** and whether lag returns to zero after the load stops.

```python
# tests/lag.py
import time

from confluent_kafka import ConsumerGroupTopicPartitions, TopicPartition
from confluent_kafka.admin import AdminClient, OffsetSpec


def consumer_lag(admin: AdminClient, group: str, topic: str) -> dict[int, int]:
    """Lag per partition = log-end offset - committed offset of the group."""
    partitions = [TopicPartition(topic, p) for p in admin.list_topics(topic, timeout=5).topics[topic].partitions]
    committed = admin.list_consumer_group_offsets(
        [ConsumerGroupTopicPartitions(group, partitions)]
    )[group].result().topic_partitions
    ends = {tp.partition: f.result().offset for tp, f in admin.list_offsets(
        {tp: OffsetSpec.latest() for tp in partitions}
    ).items()}
    # offset < 0: the group never committed this partition -> count all of it (fine for fresh test topics)
    return {tp.partition: ends[tp.partition] - max(tp.offset, 0) for tp in committed}


def wait_for_zero_lag(admin: AdminClient, group: str, topic: str, timeout: float = 30.0) -> float:
    """Return how long the group needed to catch up; fail if it did not within `timeout`."""
    start = time.monotonic()
    while True:
        lag = consumer_lag(admin, group, topic)
        if sum(lag.values()) == 0:
            return time.monotonic() - start
        if time.monotonic() - start > timeout:
            raise AssertionError(f"group {group} still lags on {topic}: {lag}")
        time.sleep(0.5)
```

```python
def test_consumer_drains_a_burst(admin, bootstrap_servers, topics, producer, service, group_id):
    for i in range(500):
        producer.produce(topics["in"], key=f"ord-{i % 20}", value=json.dumps(new_event(f"ord-{i % 20}")).encode())
    assert producer.flush(10) == 0

    seconds = wait_for_zero_lag(admin, group_id, topics["in"], timeout=60)

    print(f"500 events drained in {seconds:.1f}s")
    assert seconds < 30
```

For raw broker throughput, use the bundled perf tools before blaming the service:

```bash
docker exec kafka /opt/kafka/bin/kafka-producer-perf-test.sh --bootstrap-server localhost:9092 \
  --topic perf --num-records 100000 --record-size 512 --throughput -1 --command-property acks=all
# 100000 records sent, 41893.6 records/sec (20.46 MB/sec), 602.63 ms avg latency, ...

docker exec kafka /opt/kafka/bin/kafka-consumer-perf-test.sh --bootstrap-server localhost:9092 \
  --topic perf --num-records 100000 --group perf-check
```

Load-test checklist for a consumer service:

- Pre-fill a backlog (N records), start the consumers, measure time to zero lag → drain rate per consumer.
- Scale consumers 1 → partition count and check the drain rate grows; beyond the partition count it must stay flat.
- Kill one consumer during the run: lag spikes during the rebalance and then drains; no records are lost (compare counts or IDs).
- Use realistic keys: a single hot key keeps one partition busy while the others idle.
- Drive HTTP load that produces events with [Locust](../../performance-testing/02-locust/index.md) and track lag as a separate metric next to response times.

## Flakiness Pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| Test sometimes sees no messages | Consumer started with `auto.offset.reset=latest` (the default) after the event was produced | `earliest` for assertion consumers and test groups |
| Test sees messages from earlier runs | Reused topic or `group.id` with committed offsets | Unique topic and group per test (`uuid`) |
| `UNKNOWN_TOPIC_OR_PART` right after creating a topic | Topic metadata not propagated yet | Wait until `list_topics` shows all partitions with leaders |
| First test is slow or logs `Coordinator load in progress` | `__consumer_offsets` is created on first group use | Accept it, or warm up with a throwaway consumer in the session fixture |
| Every test waits about 3 s before consuming | `group.initial.rebalance.delay.ms` default 3000 | `KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS=0` in test brokers |
| Test passes locally, times out in CI | `time.sleep(2)` instead of a condition | Poll with a deadline (`consume_until`) |
| Last events missing | Producer not flushed before assertion or exit | `produce_json` waits for the delivery report; `flush()` in teardown |
| Next test waits for a rebalance | Consumer from the previous test not closed | `close()` in `finally` / fixture teardown |
| Ordering test is always green | Topic has one partition, or all test keys hash to one partition | 3+ partitions and several keys |
| Assert on offsets or counts is off by one | Transaction markers take offsets; compaction leaves gaps | Assert on record contents, not on offset arithmetic |
| New topic created by a typo | Broker auto-creates topics | `KAFKA_AUTO_CREATE_TOPICS_ENABLE=false` |
| Tests interfere under `pytest-xdist` | Shared topic names or group IDs | Unique names per test; each worker gets its own session broker (or share one via `KAFKA_BOOTSTRAP_SERVERS`) |
| Works on host, fails from a container | Advertised listener is `localhost` | Second listener for the Docker network ([02 Local Setup](./02-local-setup-cli.md#listeners-host-vs-container-network)) |

General techniques against flaky tests: [Reliability & Flakiness](../../test-automation-framework/06-execution-reliability/02-flakiness.md).

## CI

Option 1: Testcontainers — nothing to configure, the GitHub-hosted Ubuntu runners have Docker. Option 2: a service container, shared by all tests of the job:

```yaml
# .github/workflows/kafka-tests.yml (fragment)
jobs:
  tests:
    runs-on: ubuntu-latest
    services:
      kafka:
        image: apache/kafka:4.3.1
        ports:
          - 9092:9092
        env:
          KAFKA_NODE_ID: "1"
          KAFKA_PROCESS_ROLES: broker,controller
          KAFKA_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
          KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
          KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT
          KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
          KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093
          KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: "1"
          KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: "1"
          KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: "1"
          KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: "0"
          KAFKA_AUTO_CREATE_TOPICS_ENABLE: "false"
        options: >-
          --health-cmd "/opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092"
          --health-interval 5s --health-timeout 10s --health-retries 20
    env:
      KAFKA_BOOTSTRAP_SERVERS: localhost:9092
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v6
      - name: Unit and contract tests
        run: uv run pytest -m "not integration"
      - name: Integration tests
        run: uv run pytest -m integration --junitxml=report.xml
      - name: Broker logs on failure
        if: failure()
        run: docker logs "${{ job.services.kafka.id }}" | tail -200
```

- Run unit and contract tests first: they fail in seconds and need no broker.
- The advertised `localhost:9092` works because steps run on the runner host; a job that runs *inside* a container needs the service name (`kafka:9092`) as the advertised address.
- Pin the broker image and the client versions; upgrade both in a dedicated PR.

## QA Checklist

- [ ] Handler logic is unit-tested without Kafka: valid, invalid, duplicate, poison
- [ ] Producer sample events are validated against the consumer contract, or schema compatibility is checked against the registry in CI
- [ ] Integration tests use a real broker (Testcontainers or a service container), with pinned image versions
- [ ] Every test creates its own topics and consumer group and deletes the topics afterwards
- [ ] No fixed sleeps: every wait is a condition with a deadline
- [ ] Producers in tests wait for delivery reports; consumers are always closed
- [ ] Ordering is asserted per key on a multi-partition topic
- [ ] Redelivery of uncommitted records and idempotent handling of duplicates are tested
- [ ] Poison messages land in the DLQ with the original payload and error details, and the partition keeps flowing
- [ ] Load tests report drain rate and time-to-zero lag, including a consumer restart during the run
- [ ] CI prints broker logs on failure

---
## See also
- [Kafka — Testing Kafka-Based Systems](./05-testing-kafka-systems.md)
- [Apache Kafka — Overview](./index.md)
- [Kafka — Schemas & Observability](./04-schemas-observability.md)
- [Reliability & Flakiness](../../test-automation-framework/06-execution-reliability/02-flakiness.md)
- [Locust](../../performance-testing/02-locust/index.md)
- [Performance Testing](../../performance-testing/index.md)
- [CI/CD](../../ci-cd-approaches/index.md)
