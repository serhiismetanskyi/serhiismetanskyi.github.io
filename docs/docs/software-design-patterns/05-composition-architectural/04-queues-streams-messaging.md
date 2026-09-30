---
date: 2026-06-20
tags:
  - design-patterns
  - architecture
---

# Queues vs Streams: Message Delivery, Ordering & Reliability

## Core Distinction

The fundamental split is about **message lifecycle**.

| Concept | Queue (RabbitMQ, SQS) | Stream (Kafka, Kinesis) |
|---|---|---|
| Message is | A **command** — do this task | An **event** — this fact happened |
| After processing | Deleted | Persisted (retention window) |
| Multiple consumers | Compete — each message to one | Independent — each reads at own offset |
| Replay | Not possible | Possible (rewind offset) |
| Ordering | Per-queue, limited | Per-partition, strict |
| Throughput | Thousands/sec | Millions/sec |

**Rule of thumb:** tasks demand queues; immutable facts demand streams.

---

## Message Delivery Semantics

Three guarantees exist, each with trade-offs:

| Guarantee | Description | Risk | Where used |
|---|---|---|---|
| **At-most-once** | Fire-and-forget, no retry | Data loss possible | Metrics, logs where loss is acceptable |
| **At-least-once** | Retry until ACK | Duplicates possible | Default for queues/streams |
| **Exactly-once** | Idempotent + transactions | Highest latency/complexity | Financial, inventory systems |

**Exactly-once in Kafka:** requires `enable.idempotence=true` on producer +
transactional API + idempotent consumers (check processed event IDs).

```python
# Producer-side idempotency (Kafka)
producer_config = {
    "enable.idempotence": True,
    "acks": "all",
    "retries": 5,
    "max.in.flight.requests.per.connection": 1,
}
```

---

## Ordering Guarantees

**Kafka:** strict ordering within a **partition**, not across partitions.
Partition key determines which partition a message lands in.

```python
# Same document_id → same partition → strict order guaranteed
producer.produce(
    topic="document-edits",
    key=document_id,   # partition key
    value=event_payload,
)
```

**SQS Standard:** no ordering guarantee; occasional duplicates.  
**SQS FIFO:** strict ordering, exactly-once, but max 3 000 TPS per queue.  
**RabbitMQ:** per-queue order if single consumer; breaks with competing consumers.

---

## Retries & Backoff

Never retry immediately — use **exponential backoff with jitter**.

```python
import time
import random
import logging

logger = logging.getLogger(__name__)

MAX_RETRIES = 5
BASE_DELAY = 1.0   # seconds

def process_with_retry(message: dict, handler) -> bool:
    for attempt in range(MAX_RETRIES):
        try:
            handler(message)
            return True
        except TransientError as exc:
            delay = BASE_DELAY * (2 ** attempt) + random.uniform(0, 0.5)
            logger.warning(
                "attempt=%d failed, retrying in %.2fs: %s",
                attempt + 1,
                delay,
                exc,
            )
            time.sleep(delay)
        except PermanentError as exc:
            logger.error("permanent failure, sending to DLQ: %s", exc)
            send_to_dlq(message, exc)
            return False
    send_to_dlq(message, "max retries exceeded")
    return False
```

**Transient errors** (network timeout, DB overload) → retry.  
**Permanent errors** (schema mismatch, validation failure) → skip retries, send to DLQ.

---

## Dead-Letter Queues (DLQ)

A DLQ is a dedicated topic/queue that captures messages that **cannot be processed**.
It isolates failures from the main pipeline, preserving throughput.

### What to store in DLQ

```python
import json
import traceback

def send_to_dlq(original: dict, error: Exception, producer) -> None:
    dlq_record = {
        "original_payload": original,
        "error_type": type(error).__name__,
        "error_message": str(error),
        "stack_trace": traceback.format_exc(),
        "failed_at": "2026-03-30T12:00:00Z",
        "source_topic": original.get("_topic"),
        "source_partition": original.get("_partition"),
        "source_offset": original.get("_offset"),
    }
    logger.error("dlq send | error=%s | payload=%s", error, original)
    producer.produce("orders.dlq", value=json.dumps(dlq_record))
```

### DLQ recovery patterns

| Pattern | When to use |
|---|---|
| **Replay** | Fix the bug, rewind offset, reprocess |
| **Parking-lot** | Move to retry topic, process later |
| **Circuit breaker** | Pause all retries during outage |
| **Manual review** | Schema / business-logic errors |

---

## Tools Comparison

| | Kafka | RabbitMQ | SQS |
|---|---|---|---|
| **Model** | Stream (log) | Queue (AMQP) | Queue (HTTP) |
| **Ordering** | Per partition | Per queue | FIFO variant |
| **Replay** | Yes | No | No |
| **DLQ** | App-level topic | Built-in (`x-dead-letter-exchange`) | Built-in (`RedrivePolicy`) |
| **Routing** | Topic + consumer groups | Exchange + bindings | Filter policies |
| **Ops overhead** | High | Medium | Zero (managed) |
| **Best for** | Event sourcing, audit log, multi-consumer | Task queues, priority routing | Simple decoupling, AWS ecosystem |

---

## Decision Guide

```
Need replay / multiple independent consumers?
  └─ YES → Kafka / Kinesis (stream)
  └─ NO  →
        Need complex routing / priority?
          └─ YES → RabbitMQ
          └─ NO  →
                In AWS and want zero ops?
                  └─ YES → SQS
                  └─ NO  → RabbitMQ or Redis Streams
```

Most mature systems combine both: **Kafka** as the central event bus,
individual services fan out to **SQS/RabbitMQ** for their own task workers.

---
## See also
- [Apache Kafka](../../tools/kafka/index.md)
- [Redis — Patterns](../../databases/redis/03-patterns.md)
- [Celery](../../libs/celery/index.md)
- [RabbitMQ](../../tools/rabbitmq/index.md)
