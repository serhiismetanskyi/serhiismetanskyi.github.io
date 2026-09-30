---
date: 2026-09-30
tags:
  - tools
  - kafka
  - python
  - observability
  - opentelemetry
  - metrics
---

# Kafka — Schemas & Observability

Kafka stores bytes and does not validate them. Keeping producers and consumers compatible is a schema problem; noticing that a consumer fell behind is a monitoring problem. Both are also test targets.

## Payload Formats

| Format | Schema | Size and speed | Evolution checks | Good for |
|--------|--------|----------------|------------------|----------|
| JSON (no schema) | Implicit, in the code | Large, slow to parse | None — breaking changes are found in production | Prototypes, low-volume internal topics |
| JSON Schema | `.json` schema in Schema Registry | Large | Registry compatibility rules | Teams that want readable payloads plus checks |
| Avro | `.avsc`, required to read and write | Compact binary, no field names on the wire | Registry compatibility rules; reader/writer schema resolution | Data platforms, CDC, most Kafka ecosystems |
| Protobuf | `.proto` | Compact binary | Registry rules plus field numbers | Organisations already using gRPC/Protobuf |

With JSON and no registry, a contract test in CI is the only guard (see [05 Testing — Contract and Schema Tests](./05-testing-kafka-systems.md#contract-and-schema-tests)).

## Schema Registry

A separate service (Confluent Schema Registry here, `confluentinc/cp-schema-registry:8.3.2`) that stores schema versions per **subject** and checks every new version against the old ones. It keeps its data in the `_schemas` topic of the same Kafka cluster.

```yaml
# compose.sr.yaml — use with the compose.yaml from 02 Local Setup
services:
  schema-registry:
    image: confluentinc/cp-schema-registry:8.3.2
    depends_on:
      kafka:
        condition: service_healthy
    ports:
      - "8081:8081"
    environment:
      SCHEMA_REGISTRY_HOST_NAME: schema-registry
      SCHEMA_REGISTRY_LISTENERS: http://0.0.0.0:8081
      SCHEMA_REGISTRY_KAFKASTORE_BOOTSTRAP_SERVERS: PLAINTEXT://kafka:29092
```

```bash
docker compose -f compose.yaml -f compose.sr.yaml up -d --wait
curl -s localhost:8081/subjects            # []
curl -s localhost:8081/config              # {"compatibilityLevel":"BACKWARD"}
```

- **Subject name**: by default `<topic>-key` and `<topic>-value` (topic name strategy).
- **Wire format**: every serialized value starts with a magic byte `0` and the 4-byte schema ID, then the payload — `b'\x00\x00\x00\x00\x01...'` for schema ID 1. Consumers look the schema up by that ID.

### Avro Producer and Consumer

```python
# uv add "confluent-kafka[avro,schemaregistry]"
from confluent_kafka import Consumer, Producer
from confluent_kafka.schema_registry import SchemaRegistryClient
from confluent_kafka.schema_registry.avro import AvroDeserializer, AvroSerializer
from confluent_kafka.serialization import MessageField, SerializationContext, StringSerializer

ORDER_V1 = """
{
  "type": "record", "name": "OrderCreated", "namespace": "shop.orders",
  "fields": [
    {"name": "order_id", "type": "string"},
    {"name": "amount_cents", "type": "long"}
  ]
}
"""

registry = SchemaRegistryClient({"url": "http://localhost:8081"})
serialize_value = AvroSerializer(registry, ORDER_V1)      # registers under "orders-avro-value" on first use
serialize_key = StringSerializer("utf_8")

topic = "orders-avro"
producer = Producer({"bootstrap.servers": "localhost:9092"})
producer.produce(
    topic,
    key=serialize_key("ord-1"),
    value=serialize_value({"order_id": "ord-1", "amount_cents": 4200}, SerializationContext(topic, MessageField.VALUE)),
)
assert producer.flush(10) == 0

deserialize_value = AvroDeserializer(registry)            # writer schema fetched by the ID in the message
consumer = Consumer({"bootstrap.servers": "localhost:9092", "group.id": "avro-demo", "auto.offset.reset": "earliest"})
consumer.subscribe([topic])
msg = None
while msg is None or msg.error():
    msg = consumer.poll(1.0)
print(deserialize_value(msg.value(), SerializationContext(topic, MessageField.VALUE)))
# {'order_id': 'ord-1', 'amount_cents': 4200}
consumer.close()
```

- A payload that does not match the schema fails in the serializer (`TypeError: must be string on field a`) — the bad event never reaches Kafka.
- By default the serializer **auto-registers** new schemas, even when serialization then fails. In production services and CI pipelines pass `conf={"auto.register.schemas": False}` and register schemas in a controlled step: an unknown schema then fails with `SchemaRegistryError ... Subject '...-value' not found (40401)`.
- Protobuf and JSON Schema have the same pair of classes in `confluent_kafka.schema_registry.protobuf` and `...json_schema`.

### Compatibility Levels

| Level | New schema must be readable… | Allowed changes (Avro) | Upgrade order |
|-------|------------------------------|-------------------------|---------------|
| `BACKWARD` (default) | by consumers using the new schema, reading data written with the previous one | Delete fields; add fields **with defaults** | Consumers first |
| `FORWARD` | by consumers still on the previous schema | Add fields; delete fields with defaults | Producers first |
| `FULL` | both ways | Add or delete fields with defaults only | Any order |
| `*_TRANSITIVE` | same, against **all** earlier versions, not just the last | Same as above | Same as above |
| `NONE` | not checked | Anything | Coordinate by hand |

```bash
# Is a candidate schema compatible with the latest version? (verbose shows why not)
curl -s -X POST -H 'Content-Type: application/vnd.schemaregistry.v1+json' \
  --data @candidate.json \
  'http://localhost:8081/compatibility/subjects/orders-avro-value/versions/latest?verbose=true'
# {"is_compatible":false,"messages":["{errorType:'READER_FIELD_MISSING_DEFAULT_VALUE', ... 'currency' ..."]}

# Per-subject level
curl -s -X PUT -H 'Content-Type: application/vnd.schemaregistry.v1+json' \
  --data '{"compatibility": "FULL"}' http://localhost:8081/config/orders-avro-value
```

`candidate.json` holds `{"schema": "<the Avro schema as an escaped JSON string>"}`. The same check from Python is `registry.test_compatibility(subject, Schema(schema_str, schema_type="AVRO"))` — used as a CI gate in [05 Testing](./05-testing-kafka-systems.md#contract-and-schema-tests).

## Consumer Lag

Lag is the number of records a group still has to process: `log-end offset − committed offset`, per partition. It is the single most useful Kafka health signal for a service.

| Lag pattern | Usual meaning |
|-------------|---------------|
| Near zero, flat | Healthy |
| Grows during peaks, drains afterwards | Capacity is fine on average; check the peak latency SLO |
| Grows steadily | Consumers slower than producers: scale out (up to the partition count) or speed up the handler |
| Stuck on one partition, others fine | Poison message, hot key, or a stuck consumer instance |
| Jumps to zero without processing | Someone reset offsets or `auto.offset.reset=latest` on a new group — data skipped |

Ways to read it:

- CLI: `kafka-consumer-groups.sh --describe --group billing` (see [02 Local Setup & CLI](./02-local-setup-cli.md#consumer-groups)).
- From code: `AdminClient.list_consumer_group_offsets()` + `list_offsets()` — the helper is in [06 Testing — Consumer Lag in Load Tests](./06-testing-scenarios-ci.md#consumer-lag-in-load-tests).
- Prometheus: a lag exporter (for example `kafka_exporter`) or the broker's JMX metrics through the Prometheus JMX exporter, graphed in Grafana.

### librdkafka Statistics

Every `confluent-kafka` client can emit a JSON snapshot of its internal metrics:

```python
import json

from confluent_kafka import Consumer


def on_stats(stats_json: str) -> None:
    stats = json.loads(stats_json)
    for topic, t in stats["topics"].items():
        for pid, p in t["partitions"].items():
            if pid != "-1":                          # "-1" is the internal UA partition
                print(f"{topic}[{pid}] hi={p['hi_offset']} lag={p['consumer_lag']} lag_stored={p['consumer_lag_stored']}")


consumer = Consumer({
    "bootstrap.servers": "localhost:9092",
    "group.id": "billing",
    "statistics.interval.ms": 1000,                  # emitted from poll() every second
    "stats_cb": on_stats,
})
consumer.subscribe(["orders"])
```

- `consumer_lag` is computed from the **committed** offset and stays `-1` until the group has committed on that partition; `consumer_lag_stored` uses the stored (not yet committed) offset.
- Producer snapshots include `msg_cnt` (messages waiting in the local queue), `txmsgs`, broker round-trip times (`brokers.*.rtt`) and per-broker error counters — push the ones you alert on to your metrics system.

## Key Metrics

| Side | Metric | Alert when |
|------|--------|------------|
| Consumer | Lag per group and partition | Grows for minutes, or exceeds the latency budget |
| Consumer | Rebalance rate | Frequent rebalances (crash loop, `max.poll.interval.ms` exceeded) |
| Consumer | Processing errors, DLQ produce rate | Any sustained DLQ traffic |
| Producer | Failed delivery reports | Any |
| Producer | Local queue size (`msg_cnt`), request latency | Queue keeps growing, latency spikes |
| Broker | Under-replicated partitions (`kafka.server:type=ReplicaManager,name=UnderReplicatedPartitions`) | Above 0 for more than a few minutes |
| Broker | Offline partitions (`kafka.controller:type=KafkaController,name=OfflinePartitionsCount`) | Above 0 |
| Broker | Active controller count (`kafka.controller:type=KafkaController,name=ActiveControllerCount`) | Sum across the cluster is not exactly 1 |
| Broker | Disk usage of log dirs | Retention will not fit the disk |
| Topic | Bytes in/out, messages in per second | Sudden drop to zero on a busy topic |

## OpenTelemetry Tracing

`opentelemetry-instrumentation-confluent-kafka` (0.66b0, supports `confluent-kafka >= 1.8.2, < 3.0.0`) wraps a producer and a consumer:

```python
# uv add opentelemetry-sdk opentelemetry-instrumentation-confluent-kafka
from confluent_kafka import Consumer, Producer
from opentelemetry.instrumentation.confluent_kafka import ConfluentKafkaInstrumentor

instrumentor = ConfluentKafkaInstrumentor()
producer = instrumentor.instrument_producer(Producer({"bootstrap.servers": "localhost:9092"}))
consumer = instrumentor.instrument_consumer(Consumer({
    "bootstrap.servers": "localhost:9092",
    "group.id": "billing",
    "auto.offset.reset": "earliest",
}))
# Tracer provider and exporter setup: see OpenTelemetry — Tracing
```

What it produces, checked with an in-memory exporter:

| Span | Kind | Trace | Notes |
|------|------|-------|-------|
| `orders send` | `PRODUCER` | Child of the current span (for example the HTTP request) | Injects a `traceparent` header into the Kafka message |
| `recv` | `CONSUMER` | New trace | One per `poll()` that returns a message |
| `orders process` | `CONSUMER` | Child of `recv`, with a **span link** to the producer span | Stays the current span until the next `poll()`, so spans created in the handler nest under it; attributes `messaging.system=kafka`, `messaging.destination`, `messaging.kafka.partition`, `messaging.message.id=<topic>.<partition>.<offset>` |

- The consumer side is **linked**, not parented: in Jaeger the producer's trace and the consumer's trace are separate, connected by the link. Asserting "one trace from HTTP request to consumer" fails by design.
- The attribute names follow an older messaging convention (`messaging.destination`, not `messaging.destination.name`) — match on what the library actually emits.
- `kafka-python` and `aiokafka` have their own instrumentation packages (`opentelemetry-instrumentation-kafka-python`, `-aiokafka`). The generic setup, exporters and in-memory span testing are in [OpenTelemetry — Python Observability](../../libs/opentelemetry/index.md); viewing traces in [Jaeger](../jaeger/index.md).

---
## See also
- [Apache Kafka — Overview](./index.md)
- [Kafka — Producers & Consumers in Python](./03-producers-consumers-python.md)
- [Kafka — Testing Kafka-Based Systems](./05-testing-kafka-systems.md)
- [OpenTelemetry — Auto-Instrumentation](../../libs/opentelemetry/04-auto-instrumentation.md)
- [OpenTelemetry — Testing with OpenTelemetry](../../libs/opentelemetry/06-testing.md)
- [Jaeger — Distributed Tracing for OpenTelemetry](../jaeger/index.md)
