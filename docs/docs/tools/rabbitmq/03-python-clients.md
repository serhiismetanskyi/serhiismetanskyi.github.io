---
date: 2026-09-30 21:00:00
tags:
  - tools
  - rabbitmq
  - python
---

# RabbitMQ — Python Clients

## Which Client

| Client | Style | Use for |
|--------|-------|---------|
| **pika** | Blocking (plus callback adapters) | Scripts, simple workers, test helpers |
| **aio-pika** | asyncio, with auto-reconnect (`connect_robust`) | Async services (FastAPI, async workers) |
| **Celery / Dramatiq / FastStream** | Frameworks on top of a broker | Task queues and event handlers without writing the consume loop — see [Celery](../../libs/celery/index.md) |

Examples below were tested with pika 1.4.4 and aio-pika 10.1.0 against RabbitMQ 4.3.6.

## Declaring the Topology

Declare exchanges, queues and bindings from code at startup. Declarations are idempotent while the properties match.

```python
import pika

params = pika.URLParameters("amqp://app:app-secret@localhost:5672/")
connection = pika.BlockingConnection(params)
channel = connection.channel()

channel.exchange_declare(exchange="orders", exchange_type="topic", durable=True)
channel.exchange_declare(exchange="orders.dlx", exchange_type="direct", durable=True)

channel.queue_declare(queue="billing.dlq", durable=True, arguments={"x-queue-type": "quorum"})
channel.queue_bind(queue="billing.dlq", exchange="orders.dlx", routing_key="billing")

channel.queue_declare(
    queue="billing",
    durable=True,
    arguments={
        "x-queue-type": "quorum",
        "x-dead-letter-exchange": "orders.dlx",
        "x-dead-letter-routing-key": "billing",
        "x-delivery-limit": 5,                # quorum queues: dead-letter after 5 redeliveries
    },
)
channel.queue_bind(queue="billing", exchange="orders", routing_key="order.*")
```

## Publishing Reliably (pika)

```python
import json
import uuid

import pika
from pika.exceptions import NackError, UnroutableError

channel.confirm_delivery()                    # every publish now waits for the broker's confirm

def publish_order_event(event: dict, routing_key: str) -> None:
    try:
        channel.basic_publish(
            exchange="orders",
            routing_key=routing_key,
            body=json.dumps(event).encode(),
            properties=pika.BasicProperties(
                content_type="application/json",
                delivery_mode=pika.DeliveryMode.Persistent,       # survives a broker restart
                message_id=event.get("event_id") or str(uuid.uuid4()),   # used by consumers for deduplication
                headers={"schema": "order.v1"},
            ),
            mandatory=True,                   # no matching binding -> UnroutableError instead of silent drop
        )
    except UnroutableError:
        raise RuntimeError(f"no queue bound for {routing_key!r}") from None
    except NackError:
        raise RuntimeError("broker refused the message") from None
```

- `confirm_delivery()` makes `basic_publish` block until the confirm arrives — simple and safe, but one round trip per message. For bulk publishing use the async adapters or aio-pika.
- Set a **`message_id`** from the business event id so consumers can drop duplicates.

## Consuming with Manual Acks (pika)

```python
import json
import logging

log = logging.getLogger(__name__)

def handle(event: dict) -> None:
    ...                                       # business logic; raise on failure

def on_message(ch, method, properties, body):
    try:
        handle(json.loads(body))
    except (ValueError, KeyError):
        log.exception("bad message %s, dead-lettering", properties.message_id)
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)   # -> DLX, no retry
        return
    except Exception:
        log.exception("failed %s, redelivery=%s", properties.message_id, method.redelivered)
        ch.basic_reject(delivery_tag=method.delivery_tag, requeue=True)  # retried until x-delivery-limit
        return
    ch.basic_ack(delivery_tag=method.delivery_tag)                        # ack only after the work is done

channel.basic_qos(prefetch_count=10)
channel.basic_consume(queue="billing", on_message_callback=on_message, auto_ack=False)
try:
    channel.start_consuming()
except KeyboardInterrupt:
    channel.stop_consuming()
finally:
    connection.close()
```

- **Long tasks and heartbeats**: `BlockingConnection` answers heartbeats only while it processes I/O. A handler that runs longer than the heartbeat timeout gets its connection closed and the message redelivered. Run long work in a thread and ack back with `connection.add_callback_threadsafe(...)`, or use aio-pika.
- **`basic_reject`, not `basic_nack`, for the retry** — on RabbitMQ 4.3 `basic_nack(requeue=True)` doesn't increase the delivery count, so `x-delivery-limit` never triggers (see [Core Concepts](./01-core-concepts.md#acknowledgements-and-redelivery)).
- **Channels are not thread-safe** — never share one channel between threads.

## aio-pika: Publish and Consume

```python
import asyncio
import json

import aio_pika

async def main() -> None:
    connection = await aio_pika.connect_robust("amqp://app:app-secret@localhost/")   # reconnects and re-declares
    async with connection:
        channel = await connection.channel()             # publisher confirms are on by default
        await channel.set_qos(prefetch_count=10)

        exchange = await channel.declare_exchange("orders", aio_pika.ExchangeType.TOPIC, durable=True)
        queue = await channel.declare_queue(
            "billing",
            durable=True,
            arguments={                                  # must match the existing declaration exactly
                "x-queue-type": "quorum",
                "x-dead-letter-exchange": "orders.dlx",
                "x-dead-letter-routing-key": "billing",
                "x-delivery-limit": 5,
            },
        )
        await queue.bind(exchange, routing_key="order.*")

        await exchange.publish(
            aio_pika.Message(
                body=json.dumps({"id": "ord-1"}).encode(),
                content_type="application/json",
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                message_id="ord-1-created",
            ),
            routing_key="order.created",
        )

        async with queue.iterator() as messages:
            async for message in messages:
                async with message.process(requeue=False):     # ack on success, reject (-> DLX) on exception
                    event = json.loads(message.body)
                    print(event, message.redelivered)
                    break

asyncio.run(main())
```

`message.process()` acks when the block exits normally and rejects when it raises; `requeue=False` sends failures to the DLX instead of straight back to the queue.

## Retries with Delay through a DLX

Requeueing immediately retries a failing message in a tight loop. A delayed retry keeps it out of the way for a while:

```mermaid
flowchart LR
  X{{"orders (topic)"}} --> Q["billing"]
  Q -- "reject, requeue=False" --> R{{"billing.retry (direct)"}}
  R --> W["billing.wait<br/>x-message-ttl=30000"]
  W -- "TTL expired" --> X
  Q -- "attempts >= 3: publish" --> DLQ["billing.dlq"]
```

```python
channel.exchange_declare(exchange="billing.retry", exchange_type="direct", durable=True)
channel.queue_declare(
    queue="billing.wait",
    durable=True,
    arguments={
        "x-message-ttl": 30_000,                 # wait 30 s
        "x-dead-letter-exchange": "orders",      # then route back to the work exchange
    },
)
channel.queue_bind(queue="billing.wait", exchange="billing.retry", routing_key="order.created")
# queue "billing" declared with "x-dead-letter-exchange": "billing.retry"

def attempts(properties) -> int:
    deaths = (properties.headers or {}).get("x-death", [])
    return sum(d.get("count", 0) for d in deaths if d.get("queue") == "billing")
```

In the consumer, check `attempts(properties)`: below the limit, `basic_nack(requeue=False)` sends the message to the wait queue; at the limit, publish it to `billing.dlq` with the error in a header and `basic_ack` the original.

The dead-lettered message keeps its original routing key unless `x-dead-letter-routing-key` is set — that is why the wait queue is bound with the same key the message was first published with.

## Idempotent Consumers

At-least-once delivery means the same `message_id` can arrive twice. Store processed ids and skip repeats:

```python
def on_message(ch, method, properties, body):
    if already_processed(properties.message_id):          # e.g. INSERT ... ON CONFLICT DO NOTHING, or Redis SET NX
        ch.basic_ack(delivery_tag=method.delivery_tag)
        return
    handle(json.loads(body))
    mark_processed(properties.message_id)                 # same transaction as the side effect, when possible
    ch.basic_ack(delivery_tag=method.delivery_tag)
```

## Common Mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| `auto_ack=True` in a worker | Messages lost when a worker crashes | Manual ack after processing |
| No prefetch | One consumer busy, others idle; memory spikes | `basic_qos(prefetch_count=...)` |
| Requeue on every error | Same message loops, CPU at 100 % | `requeue=False` + DLX, delivery limit, delayed retry |
| Publishing to an exchange with no binding | Messages vanish | `mandatory=True`, or an alternate exchange |
| Non-persistent messages on a durable queue | Queue survives a restart, messages don't | `delivery_mode=2` + confirms |
| Declaring a queue with different arguments than existing | `PRECONDITION_FAILED`, channel closed | One place that owns declarations; change via a new queue or policy |
| New connection per message | Slow publishing, connection churn | One long-lived connection, reuse channels |
| Sharing a channel between threads | Random protocol errors | A channel per thread, or asyncio with aio-pika |

---
## See also
- [RabbitMQ — Overview](./index.md)
- [RabbitMQ — Core Concepts](./01-core-concepts.md)
- [RabbitMQ — Testing RabbitMQ-Based Systems](./04-testing.md)
- [Celery — Distributed Task Queue for Python](../../libs/celery/index.md)
- [Queues vs Streams: Message Delivery, Ordering & Reliability](../../software-design-patterns/05-composition-architectural/04-queues-streams-messaging.md)
- [Resilience — Retries, Fallbacks, Semaphores & Race Conditions](../../libs/resilience/index.md)
